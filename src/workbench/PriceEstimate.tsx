import { uiText } from './uiLocale';
import { useEffect, useRef, useState } from 'react';
import { HOSTED_WORKBENCH } from './workbenchRuntime';
import type { FlexibleTradeDocument } from './tradeSearch';
import { localizeEquipmentName, localizeEquipmentProperty, localizeEquipmentStat, parseEquipment } from './genericEquipment';
import { TradeMemoryActions } from './TradeMemoryActions';
import { rememberTrade } from './tradeMemory';
import { canonicalQuoteCurrency, type LoadoutQuote } from './loadoutQuotes';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import './priceEstimate.css';
import {
  estimateCurrencyName, estimateNumber, estimateSummary, fetchMarketEstimate,
  type MarketEstimateResult,
} from './marketEstimate';

export interface PriceEstimateProps {
  query: FlexibleTradeDocument;
  url: string;
  league: string;
  auto?: boolean;
  buttonLabel?: string;
  emptyMessage?: string;
  itemRaw?: string;
  memoryTitle?: string;
  onRecordQuote?: (quote: Omit<LoadoutQuote, 'itemText'>) => void;
  onEstimate?: (summary: { message: string; detail: string; url?: string; status?: 'ready' | 'error' }) => void;
}

/** A changed search owns fresh state, so an old item's prices cannot leak into its replacement. */
export function PriceEstimate(props: PriceEstimateProps) {
  const key = `${props.league}:${JSON.stringify(props.query)}`;
  return <PriceEstimateRequest key={key} {...props} />;
}

function PriceEstimateRequest({ query, url, league, auto = false, onEstimate, buttonLabel, emptyMessage, itemRaw, memoryTitle, onRecordQuote }: PriceEstimateProps) {
  const [result, setResult] = useState<MarketEstimateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [memoryError, setMemoryError] = useState('');
  const parsed = itemRaw ? parseEquipment(itemRaw) : null;
  const memory = { query, league, raw: itemRaw, title: memoryTitle || (parsed ? localizeEquipmentName(parsed.name) : undefined) };
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const callback = useRef(onEstimate);
  const currentRequest = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    callback.current = onEstimate;
    currentRequest.current = async () => {
      if (busy || Date.now() < cooldownUntil) return;
      const requestId = ++sequence.current;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      setBusy(true); setError(''); setResult(null);
      try {
        const next = await fetchMarketEstimate(query, league, request.signal);
        if (request.signal.aborted || requestId !== sequence.current) return;
        setResult(next);
        if (!next.ok && next.error.retryAfterSeconds) {
          setCooldownUntil(Date.now() + next.error.retryAfterSeconds * 1000);
          setRemaining(next.error.retryAfterSeconds);
        }
        const summary = estimateSummary(next, url);
        if (next.ok && next.total === 0 && emptyMessage) summary.message = emptyMessage;
        setMemoryError(rememberTrade(memory, { observation: { at: next.ok ? next.sampledAt : new Date().toISOString(),
          message: summary.message, detail: summary.detail, failed: !next.ok } }));
        callback.current?.(summary);
      } catch (failure) {
        if (request.signal.aborted || requestId !== sequence.current) return;
        const message = failure instanceof Error ? failure.message : '暂时无法获取官方挂单。';
        setError(message);
        setMemoryError(rememberTrade(memory, { observation: { at: new Date().toISOString(), message, detail: '网络请求未成功，不代表没有挂单。', failed: true } }));
        callback.current?.({ message, detail: '请打开官方交易页面查看。', url, status: 'error' });
      } finally {
        if (!request.signal.aborted && requestId === sequence.current) setBusy(false);
      }
    };
  });

  useEffect(() => {
    const timer = auto && !HOSTED_WORKBENCH ? window.setTimeout(() => { void currentRequest.current(); }, 700) : undefined;
    return () => window.clearTimeout(timer);
  }, [auto]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { setCooldownUntil(0); window.clearInterval(timer); }
    }, 500);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  return <section className="wb-price-estimate" aria-label={uiText("装备估价")}>
    <div className="wb-row wb-wrap">
      <h3>{uiText("相似物品挂牌参考")}</h3>
      {HOSTED_WORKBENCH ? <a className="wb-button" href={url} target="_blank" rel="noreferrer">{uiText("到官网查看挂牌 ↗")}</a> : <button type="button" className="wb-button" disabled={busy || remaining > 0}
        onClick={() => { void currentRequest.current(); }}>
        {uiText(busy ? '正在查询官方挂单…' : remaining > 0 ? `${remaining} 秒后可重试` : buttonLabel ?? '获取挂牌估价')}
      </button>}
    </div>
    <TradeMemoryActions {...memory} />
    {memoryError && <p className="wb-inline-warning" role="status">{uiText(memoryError)}</p>}
    <p className="wb-muted pe-caption">{uiText("低价挂牌样本 · 币种分别统计 · 非成交价")}</p>
    {busy && <p role="status">{uiText("正在读取官方搜索和标价，请稍候。")}</p>}
    {error && <p className="wb-warning" role="alert">{uiText(error)}</p>}
    {result && !result.ok && <p className="wb-warning" role="alert">{uiText(result.error.message)}</p>}
    {result?.ok && <div aria-live="polite">
      <div className="pe-result-meta"><span>{uiText("匹配 ")}{uiText(result.total.toLocaleString('zh-CN'))}{uiText(" · 已取 ")}{uiText(result.fetched)}{uiText(" · 有效 ")}{uiText(result.priced)}{uiText(result.duplicateSellers > 0 ? ` · 去重 ${result.duplicateSellers}` : '')} · {uiText(result.cached ? '缓存' : '实时')}</span>
      {result.confidence && <details className={result.confidence.level === 'low' ? 'wb-warning' : 'wb-muted'}>
        <summary>{uiText(result.confidence.level === 'low' ? '置信度低' : '置信度有限')}{uiText(" · 查看原因")}</summary>
        {result.confidence.reasons.map((reason) => <p key={reason}>{uiText(reason)}</p>)}
      </details>}</div>
      {!result.groups.length && <p>{uiText(result.total === 0 ? emptyMessage ?? '没有找到挂单。可切换“宽松比较”或减少勾选属性。' : '样本中没有有效标价，请到官网核对。')}</p>}
      {!!result.groups.length && <div className="lo-table-scroll"><table className="pe-price-table" aria-label={uiText("各币种挂牌参考")}><thead><tr><th>{uiText("低价样本中间 50% 区间")}</th><th>{uiText("卖家")}</th><th>{uiText("明细")}</th>{onRecordQuote && <th>{uiText("记录")}</th>}</tr></thead><tbody>{result.groups.map((group) => <tr key={group.currency}>
        <td><div className="pe-currency-range"><OfficialCurrencyIcon currencyId={({ exalted: 'exalt', alch: 'alchemy' } as Record<string, string>)[group.currency] ?? group.currency} label={uiText(estimateCurrencyName(group.currency))} /><strong>{uiText(estimateNumber(group.p25))}–{uiText(estimateNumber(group.p75))} {uiText(estimateCurrencyName(group.currency))}</strong></div></td>
        <td>{uiText(group.count)}</td><td><details><summary>{uiText("统计")}</summary><p className="wb-muted">{uiText("样本中位数 ")}{uiText(estimateNumber(group.median))}{uiText(" · 最低 ")}{uiText(estimateNumber(group.min))}{uiText(" · 最高 ")}{uiText(estimateNumber(group.max))}</p></details></td>
        {onRecordQuote && <td><button type="button" className="wb-button pe-record-button" aria-label={uiText(`记录到套装汇总（${estimateCurrencyName(group.currency)}）`)} disabled={!canonicalQuoteCurrency(group.currency) || result.context?.sufficient === false}
          title={uiText(!canonicalQuoteCurrency(group.currency) ? '该计价通货尚未接入资产账本。' : result.context?.sufficient === false ? '当前查询条件过于宽泛，请先补齐可比属性再记录。' : '记录当前条件下这组挂牌样本的中位数，供角色装备与资产情景参考。')}
          onClick={() => {
            const currency = canonicalQuoteCurrency(group.currency); if (!currency) return;
            onRecordQuote({ league, amount: group.median, currency, at: result.sampledAt, url: result.url,
              conditions: `${result.context?.summary.join(' · ') ?? '当前勾选条件'} · ${group.count} 个卖家样本中位数 · ${result.confidence?.level === 'low' ? '低置信' : '仅为挂牌参考'}`.slice(0, 1000) });
          }}>{uiText("记录到套装汇总")}</button></td>}
      </tr>)}</tbody></table></div>}
      <details className="pe-query-notes"><summary>{uiText("查询条件与样本说明")}</summary>
        {result.context && <p className="wb-muted">{uiText("主要条件：")}{uiText(result.context.summary.join(' · '))}</p>}
        <p className="wb-muted">{uiText("按当前勾选条件查询官方低价挂单，最多取 20 件。同币种分组、同卖家去重；不是全市场估值或成交价格。")}</p>
        <p className="wb-muted">{uiText(result.cached ? '两分钟内的缓存' : '实时请求')} · {uiText(new Date(result.sampledAt).toLocaleString('zh-CN', { hour12: false }))}</p>
        {result.warnings.filter((warning) => !result.confidence?.reasons.includes(warning)).map((warning) => <p key={warning} className="wb-muted">{uiText(warning)}</p>)}
      </details>
      {!!result.listings?.length && <details className="pe-listings">
        <summary>{uiText("查看实际挂单样本（")}{uiText(result.listings.length)}）</summary>
        <p className="wb-muted">{uiText("以下为官方结果中的部分物品，按币种展示低价与中间样本。请比较底座、主要属性和数值，再判断相似程度。")}</p>
        {result.listings.map((listing) => <details className="pe-listing" key={listing.id}>
          <summary>
            <strong>{uiText([listing.name, listing.base].filter(Boolean).map(localizeEquipmentName).join(' · '))}</strong>
            <span>{uiText(estimateNumber(listing.price.amount))} {uiText(estimateCurrencyName(listing.price.currency))}</span>
          </summary>
          {listing.properties?.map((property, index) => <p className="wb-muted" key={`property-${index}`}>{uiText(localizeEquipmentProperty(property))}</p>)}
          {listing.explicitMods?.map((mod, index) => <p key={`mod-${index}`}>{uiText(localizeEquipmentStat(mod))}</p>)}
          {listing.indexedAt && <p className="wb-muted">{uiText("挂牌索引时间：")}{uiText(new Date(listing.indexedAt).toLocaleString('zh-CN', { hour12: false }))}</p>}
          <a className="wb-link" href={result.url} target="_blank" rel="noreferrer">{uiText("在官方结果中核对样本 →")}</a>
        </details>)}
      </details>}
    </div>}
    {(error || result) && <p><a className="wb-link" href={result?.url ?? url} target="_blank" rel="noreferrer">{uiText("在官方交易网站核对挂单 ↗")}</a></p>}
  </section>;
}
