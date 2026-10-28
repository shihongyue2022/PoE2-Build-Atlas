import { uiText } from './uiLocale';
import { Fragment, useEffect, useRef, useState } from 'react';
import { corePriceAxes, jointCorePriceQuery, listingCoreMatch, type CorePriceSelection } from './corePricing';
import { buildEquipmentTrade, type EquipmentTradeOptions } from './genericEquipmentTrade';
import { estimateCurrencyName, estimateNumber, estimateSummary, fetchMarketEstimate, type MarketEstimateResult } from './marketEstimate';
import { PriceEstimate, type PriceEstimateProps } from './PriceEstimate';
import { equipmentDisplayName, type Equipment } from './genericEquipment';
import { equipmentFromListing } from './upgradeRanking';
import { canonicalQuoteCurrency } from './loadoutQuotes';
import { rememberTrade } from './tradeMemory';
import Icon, { IconButton } from './WorkbenchIcon';
import type { UpgradeMarketQuote } from './upgradeWorkflow';
import { HOSTED_WORKBENCH } from './workbenchRuntime';

export default function CorePriceEstimate({ options, auto, onEstimate, onRecordQuote, onCompare, reviewCandidate, initialSelection }: {
  options: EquipmentTradeOptions; auto?: boolean;
  onEstimate?: PriceEstimateProps['onEstimate']; onRecordQuote?: PriceEstimateProps['onRecordQuote']; onCompare?: (item: Equipment, quote?: UpgradeMarketQuote) => void;
  reviewCandidate?: (item: Equipment) => { eligible: boolean; status: 'met' | 'unmet' | 'unknown'; label: string; detail?: string };
  initialSelection?: { key: string; preset: string };
}) {
  const axes = corePriceAxes(options.equipment, options.rows);
  const identityPricing = !axes.some((row) => row.equipmentFilter !== 'ilvl') && !!options.equipment.baseNameEnglish;
  const [keys, setKeys] = useState<string[]>(initialSelection ? [initialSelection.key] : axes[0] ? [axes[0].key] : []);
  const [sortKey, setSortKey] = useState(initialSelection?.key ?? axes[0]?.key ?? ''), [scopes, setScopes] = useState<Record<string, string>>(initialSelection ? { [initialSelection.key]: initialSelection.preset } : {});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [retry, setRetry] = useState(0);
  const optionKey = JSON.stringify(options);
  const [storedResult, setResult] = useState<{ data: MarketEstimateResult; band: ReturnType<typeof jointCorePriceQuery>; optionKey: string }>();
  const result = storedResult?.optionKey === optionKey ? storedResult : undefined;
  const [requestKey, setRequestKey] = useState('');
  const request = useRef<AbortController | null>(null), latest = useRef<() => void>(() => {});
  const loading = busy && requestKey === optionKey;
  const selected = keys.flatMap((key) => { const row = axes.find((entry) => entry.key === key); return row ? [row] : []; });
  const primary = selected.find((row) => row.key === sortKey && row.filterGroup !== 'misc_filters') ?? selected.find((row) => row.filterGroup !== 'misc_filters');
  const relative = (row: typeof axes[number]) => !row.suggested && (row.actualValue ?? 0) > 0 && row.filterGroup !== 'misc_filters';
  const scopeFor = (row: typeof axes[number]) => scopes[row.key] ?? (relative(row) ? 'at-least' : row.searchPresets?.[0]?.id ?? 'at-least');
  const selections: CorePriceSelection[] = selected.map((row) => {
    const scope = scopeFor(row);
    return { row, ...(row.searchPresets?.some((entry) => entry.id === scope) ? { preset: scope } : { mode: scope === 'same' ? 'same' as const : 'at-least' as const, gain: ['1', '3', '5'].includes(scope) ? Number(scope) : 0 }) };
  });
  let band: ReturnType<typeof jointCorePriceQuery> | undefined, overviewBand: ReturnType<typeof jointCorePriceQuery> | undefined, invalid = '';
  try { band = jointCorePriceQuery(options, selections, primary?.key); if (primary) overviewBand = jointCorePriceQuery(options, selections, primary.key, true); }
  catch (error) { invalid = error instanceof Error ? error.message : String(error); }
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => request.current?.abort(), [optionKey]);
  useEffect(() => { if (!retry) return; const timer = setInterval(() => setRetry((old) => Math.max(0, old - 1)), 1000); return () => clearInterval(timer); }, [retry]);
  async function read(overview: boolean) {
    if (identityPricing || !selected.length || overview && !primary || loading || retry) return;
    let chosen: ReturnType<typeof jointCorePriceQuery>;
    try { chosen = jointCorePriceQuery(options, selections, primary?.key, overview); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return; }
    const task = new AbortController(); request.current?.abort(); request.current = task; setRequestKey(optionKey);
    setBusy(true); setMessage(''); setResult(undefined);
    try {
      const data = await fetchMarketEstimate(chosen.query, options.league, task.signal);
      if (task.signal.aborted) return;
      setResult({ data, band: chosen, optionKey }); setRetry(data.ok ? 15 : data.error.retryAfterSeconds ?? 0);
      if (!data.ok) { setMessage(data.error.message); onEstimate?.({ status: 'error', message: data.error.message, detail: '查询失败，不代表没有符合联合条件的物品。', url: chosen.url }); }
      else {
        const description = `${chosen.constraints.length} 项核心属性同时满足 · ${overview ? '核心属性降序市场参考' : '挂牌参考'}`;
        rememberTrade({ query: chosen.query, league: options.league, raw: options.equipment.raw, title: equipmentDisplayName(options.equipment) }, { observation: { at: data.sampledAt, message: description, detail: `${chosen.summary} · ${data.total} 个匹配`, failed: false } });
        const summary = estimateSummary(data, chosen.url);
        onEstimate?.({ ...summary, detail: `${chosen.summary}。每项要求必须同时满足。\n${summary.detail}`.slice(0, 4000) });
      }
    } catch (error) { if (!task.signal.aborted) {
      const message = error instanceof Error ? error.message : '查询失败。';
      setMessage(message); onEstimate?.({ status: 'error', message, detail: '网络请求未成功，不代表没有挂单。', url: chosen.url });
    } }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  useEffect(() => { latest.current = () => { void read(false); }; });
  useEffect(() => { if (HOSTED_WORKBENCH || !auto) return; const timer = setTimeout(() => latest.current(), 700); return () => clearTimeout(timer); }, [auto]);
  function reset() { request.current?.abort(); setBusy(false); setResult(undefined); setMessage(''); }
  const data = result?.data.ok ? result.data : undefined;
  const samples = data?.listings?.map((listing) => {
    const item = equipmentFromListing(listing);
    return { listing, item, review: item && reviewCandidate ? reviewCandidate(item) : undefined, ...listingCoreMatch(listing, result!.band.constraints) };
  }) ?? [];
  const comparable = samples.filter((row) => row.matches && (!reviewCandidate || !!row.item && row.review?.eligible));
  const currencies = [...new Set(comparable.map(({ listing }) => listing.price.currency))];
  if (identityPricing && options.league.trim()) {
    const fallback = buildEquipmentTrade({ ...options, exactBase: true, exactUnique: true, ranking: false,
      rows: options.rows.map((row) => ({ ...row, enabled: row.enabled && !!row.presenceOnly })) });
    return <><div className="wb-actions"><a className="wb-button" href={fallback.url} target="_blank" rel="noreferrer">{uiText("打开官方交易搜索")}</a></div>
      {fallback.warnings.map((warning) => <p key={warning} className="wb-fine">{uiText(warning)}</p>)}
      <PriceEstimate query={fallback.query} url={fallback.url} league={options.league} auto={auto} onEstimate={onEstimate} itemRaw={options.equipment.raw} onRecordQuote={onRecordQuote} /></>;
  }
  return <section className="wb-price-estimate wb-core-price" aria-label={uiText("核心属性档位估价")}>
    <div className="wb-section-head"><h3>{uiText("核心属性")}</h3><span className="wb-tag">{uiText("已选 ")}{uiText(selected.length)}{uiText(" 项 · 同时满足")}</span></div>
    {!axes.length ? <p>{uiText("暂无能核对数值的核心属性。请先识别词缀，或按同名／底座查看官方挂牌。")}</p> : <>
      <fieldset className="wb-core-axis-list"><legend>{uiText("属性与提升幅度")}</legend>{selected.map((row, index) => <div key={row.key} className="wb-core-axis">
        <select className="wb-core-axis-property" aria-label={uiText(`核心属性 ${index + 1}`)} value={row.key} onChange={(event) => {
          const key = event.target.value; reset(); setKeys((old) => old.map((value) => value === row.key ? key : value));
          setScopes((old) => { const next = { ...old }; delete next[key]; return next; });
          if (primary?.key === row.key) setSortKey(key);
        }}>{axes.map((axis) => <option key={axis.key} value={axis.key} disabled={axis.key !== row.key && keys.includes(axis.key)}>{uiText(axis.label)}{uiText(axis.affixType ? ` · ${axis.affixType === 'prefix' ? '前缀' : '后缀'}` : '')}{uiText(axis.actualValue === undefined ? ' · 可新增' : ` · 当前 ${axis.actualValue}`)}</option>)}</select>
        <select className="wb-core-axis-scope" aria-label={uiText(`核心属性要求：${row.label}`)} value={scopeFor(row)} title={uiText(row.targetRange ? `T1 范围 ${row.targetRange.min}–${row.targetRange.max} · 规则 ${row.targetPatch}` : undefined)} onChange={(event) => { reset(); setScopes((old) => ({ ...old, [row.key]: event.target.value })); }}>{relative(row) && <><option value="at-least">{uiText("≥ 当前（0%）")}</option><option value="same">{uiText("相同数值（0%）")}</option>{[1, 3, 5].map((number) => <option key={number} value={number}>+{uiText(number)}{uiText("% 及以上")}</option>)}</>}{row.searchPresets?.map((entry) => <option key={entry.id} value={entry.id}>{uiText(entry.label)}</option>)}</select>
        <button type="button" className="wb-icon-button wb-core-axis-sort" disabled={row.filterGroup === 'misc_filters'} title={uiText(row.filterGroup === 'misc_filters' ? '基本条件只作筛选' : primary?.key === row.key ? '当前按此属性降序' : '设为降序优先属性')} aria-label={uiText(`优先降序：${row.label}`)} aria-pressed={primary?.key === row.key} onClick={() => { reset(); setSortKey(row.key); }}>↓</button>
        <IconButton icon="close" label={uiText(`移除核心属性：${row.label}`)} onClick={() => { reset(); setKeys((old) => old.filter((key) => key !== row.key)); }} />
      </div>)}<button type="button" className="wb-text-button wb-core-axis-add" disabled={selected.length === axes.length} onClick={() => { const next = axes.find((row) => !keys.includes(row.key)); if (next) { reset(); setKeys((old) => [...old, next.key]); } }}><Icon name="plus" size={15} />{uiText("添加属性")}</button></fieldset>
      {band && <p className="wb-fine wb-core-conditions" aria-label={uiText("联合检索要求")}>{band.constraints.map(({ row, rangeLabel }, index) => <Fragment key={row.key}>{index > 0 ? '； ' : ''}{uiText(row.label)}{' '}{uiText(rangeLabel)}</Fragment>)}</p>}
      <p className="wb-fine">{uiText("全部条件同时满足；↓ 选择降序优先属性。")}</p>
      {!band && <p role="status" className="wb-inline-warning">{uiText(invalid)}</p>}
      <div className="wb-actions">{HOSTED_WORKBENCH ? <>{overviewBand && <a className="wb-button" href={overviewBand.url} target="_blank" rel="noreferrer">{uiText("核心属性降序 ↗")}</a>}{band && <a className="wb-button primary" href={band.url} target="_blank" rel="noreferrer">{uiText("官网检索提升候选 ↗")}</a>}</> : <><button type="button" className="wb-button" disabled={!overviewBand || loading || retry > 0} onClick={() => { void read(true); }}>{uiText("核心属性降序")}</button><button type="button" className="wb-button primary" disabled={!band || loading || retry > 0} onClick={() => { void read(false); }}>{uiText(loading ? '正在读取…' : retry ? `${retry} 秒后可查询` : '检索提升候选')}</button>{band && <a className="wb-link" href={band.url} target="_blank" rel="noreferrer">{uiText("官网核对联合条件 ↗")}</a>}{overviewBand && <a className="wb-link" href={overviewBand.url} target="_blank" rel="noreferrer">{uiText("官网按核心属性降序 ↗")}</a>}</>}</div>
      {HOSTED_WORKBENCH && <p className="wb-fine">{uiText("联合条件在浏览器生成，点击后去官网读取挂牌；复制候选物品回角色页即可比较。本站不提供后台挂牌抓取。")}</p>}
      {message && requestKey === optionKey && <p role="alert" className="wb-inline-warning">{uiText(message)}</p>}
      {data && result && <div aria-live="polite"><p>{uiText(result.band.constraints.length)}{uiText(" 项核心属性同时满足")}{uiText(result.band.overview ? ' · 降序样本（不作为当前装备估价）' : '')}{uiText(" · 匹配 ")}{uiText(data.total)}{uiText(" 件 · 已取 ")}{uiText(data.fetched)}{uiText(" 件 · ")}{uiText(new Date(data.sampledAt).toLocaleString('zh-CN'))}</p>
        {!comparable.length && <p className="wb-inline-warning">{uiText("没有能核对到同时满足所有要求的挂牌，请在官网核对；不会自动放宽任一门槛。")}</p>}
        {!result.band.overview && currencies.map((currency) => {
          const values = comparable.filter(({ listing }) => listing.price.currency === currency).map(({ listing }) => listing.price.amount).sort((a, b) => a - b);
          return <div className="wb-card" key={currency}>
            <strong>{uiText("符合要求的挂牌 ")}{uiText(estimateNumber(values[0]!))}–{uiText(estimateNumber(values.at(-1)!))} {uiText(estimateCurrencyName(currency))}</strong>
            <p className="wb-fine">{uiText(values.length)}{uiText(" 个卖家的已取样本；价格升序前 20 件内的范围，不是全市场分布或成交价。逐件核心值见下表。")}</p>
            {onRecordQuote && <><button type="button" className="wb-button" title={uiText("将本组符合联合条件的最低挂牌参考记录到当前角色装备，供套装汇总复用")}
              disabled={!canonicalQuoteCurrency(currency) || values.length < 3} onClick={() => {
                const unit = canonicalQuoteCurrency(currency); if (unit) onRecordQuote({ league: options.league, amount: values[0]!, currency: unit, at: data.sampledAt, url: result.band.url,
                  conditions: `${result.band.summary} · ${values.length} 卖家 · 联合条件最低挂牌参考`.slice(0, 1000) });
              }}>{uiText("记录到套装汇总（")}{uiText(estimateCurrencyName(currency))}）</button>
              {values.length < 3 && <p className="wb-fine">{uiText("至少需要 3 个卖家的可比样本才能记录。")}</p>}
              {!canonicalQuoteCurrency(currency) && <p className="wb-fine">{uiText("此计价通货暂未接入套装汇总。")}</p>}
            </>}
          </div>;
        })}
        {reviewCandidate && <p className="wb-fine">{uiText("价格区间只对应核心条件。整套四抗缺口逐件列出，待补抗或待核对不代表整套已经达标。")}</p>}
        <div className="lo-table-scroll"><table className="lo-deltas" style={{ minWidth: Math.max(460, result.band.constraints.length * 130 + 300 + (reviewCandidate ? 240 : 0)) }}><thead><tr>{result.band.constraints.map(({ row }) => <th key={row.key}>{uiText(row.label)}</th>)}<th>{uiText("挂牌价")}</th><th>{uiText("物品")}</th>{reviewCandidate && <th>{uiText("换入后的整套四抗")}</th>}<th>{uiText("操作")}</th></tr></thead><tbody>{comparable.map(({ listing, item, review, values }) => <tr key={listing.id}>{values.map((value, index) => <td key={result.band.constraints[index]!.row.key}>{uiText(value)}</td>)}<td>{uiText(estimateNumber(listing.price.amount))} {uiText(estimateCurrencyName(listing.price.currency))}</td><td>{uiText(item ? equipmentDisplayName(item) : listing.name || listing.base)}</td>{reviewCandidate && <td className="wb-core-candidate-review"><strong className={review?.status === 'met' ? 'positive' : 'wb-inline-warning'}>{uiText(review?.label)}</strong>{review?.detail && <p className="wb-fine">{uiText(review.detail)}</p>}</td>}<td>{onCompare && item && <button type="button" className="wb-text-button" onClick={() => onCompare(item, { id: listing.id, amount: listing.price.amount, currency: listing.price.currency, sampledAt: data.sampledAt })}>{uiText("比较这件")}</button>} <a className="wb-link" href={result.band.url} target="_blank" rel="noreferrer">{uiText("官网")}</a></td></tr>)}</tbody></table></div>
        {samples.length > comparable.length && <p className="wb-fine">{uiText("已排除 ")}{uiText(samples.length - comparable.length)}{uiText(" 件核心值不符、抗性未达标或未能核对的物品。")}</p>}
        <p className="wb-fine">{uiText("各币种独立比较；核心属性达标后，点击「比较这件」核对整套配装与特殊机制。")}</p></div>}
    </>}
  </section>;
}
