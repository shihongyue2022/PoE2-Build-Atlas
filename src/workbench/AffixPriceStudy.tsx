import { uiText } from './uiLocale';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EquipmentTradeOptions } from './genericEquipmentTrade';
import type { RollGuide } from './searchGuidance';
import { affixPriceBands } from './rollPriceComparison';
import { estimateCurrencyName, estimateNumber, fetchMarketEstimate, type MarketEstimateResult } from './marketEstimate';

export default function AffixPriceStudy({ options, guides }: { options: EquipmentTradeOptions; guides: ReadonlyMap<string, RollGuide> }) {
  const choices = options.rows.filter((row) => affixPriceBands(options, row, guides.get(row.key)).length > 1);
  const [selected, setSelected] = useState('');
  const row = choices.find((entry) => entry.key === selected) ?? choices.find((entry) => Number(entry.weight) > 0) ?? choices[0];
  const bands = row ? affixPriceBands(options, row, guides.get(row.key)) : [];
  const [results, setResults] = useState<Record<string, MarketEstimateResult>>({});
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [waitUntil, setWaitUntil] = useState(0), [remaining, setRemaining] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!waitUntil) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 500); return () => window.clearInterval(timer);
  }, [waitUntil]);
  const sample = useCallback(async (band: ReturnType<typeof affixPriceBands>[number]) => {
    if (busy || Date.now() < waitUntil) return;
    const request = new AbortController(); controller.current?.abort(); controller.current = request;
    setBusy(band.key); setError('');
    try {
      const next = await fetchMarketEstimate(band.query, options.league, request.signal);
      if (request.signal.aborted) return;
      setResults((old) => ({ ...old, [band.key]: next }));
      const seconds = next.ok ? 15 : next.error.retryAfterSeconds ?? 15;
      setWaitUntil(Date.now() + seconds * 1000); setRemaining(seconds);
    } catch (reason) { if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : '读取价格失败。'); }
    finally { if (!request.signal.aborted) setBusy(''); }
  }, [busy, waitUntil, options.league]);
  return <details className="wb-fold" aria-label={uiText("词缀价格影响")}><summary>{uiText("词缀价格影响 · 比较 roll 档位的低价挂牌")}</summary>
    <p className="wb-fine">{uiText("只改变所选词缀门槛，保留其他硬条件和预算，按价格升序分别取样。对照“高 roll 比当前贵多少”，寻找不值得追的满 roll 溢价；这不是单词缀的因果估值，也不保证全市场最低。")}</p>
    {!row ? <p className="wb-fine">{uiText("尚无已核对的可比较范围；先读取英文传奇范围或底座规则，不猜价格系数。")}</p> : <>
      <label className="wb-form-label">{uiText("比较属性")}<select aria-label={uiText("价格影响属性")} value={row.key} disabled={!!busy} onChange={(event) => { setSelected(event.target.value); setResults({}); setError(''); }}>{choices.map((entry) => <option key={entry.key} value={entry.key}>{uiText(entry.label)}</option>)}</select></label>
      <p className="wb-fine">{uiText(remaining > 0 ? `${remaining} 秒后可查询下一档，遵循官方请求间隔。` : '选择要比较的档位即可；也可直接打开官网核对。')}{uiText(" 不同币种分别对比，缺少报价不当成零价。")}</p>
      {error && <p role="status" className="wb-inline-warning">{uiText(error)}</p>}
      {bands.map((band, index) => {
        const result = results[band.key];
        const baseline = bands.slice(0, index).map((entry) => results[entry.key]).find((entry) => entry?.ok);
        return <div className="wb-card" key={band.key}><strong>{uiText(band.label)} · {uiText(band.min ? `≥ ${band.min}` : `≤ ${band.max}`)}</strong>
          <div className="wb-actions"><button type="button" className="wb-button" disabled={!!busy || remaining > 0} onClick={() => { void sample(band); }}>{uiText(busy === band.key ? '正在取样…' : `查询${band.label}价格`)}</button><a className="wb-link" href={band.url} target="_blank" rel="noreferrer">{uiText("官网同档低价 ↗")}</a></div>
          {result?.ok && <><p className="wb-fine">{uiText("匹配 ")}{uiText(result.total)}{uiText(" 件 · 读取 ")}{uiText(result.fetched)}{uiText(" 件 · ")}{uiText(result.cached ? '缓存' : '采样')} {uiText(new Date(result.sampledAt).toLocaleString('zh-CN'))}</p>{!result.groups.length && <p>{uiText("暂无有效报价；不代表装备价值为零。")}</p>}{result.groups.map((group) => {
            const prior = baseline?.ok ? baseline.groups.find((entry) => entry.currency === group.currency) : undefined;
            return <p key={group.currency}>{uiText(estimateCurrencyName(group.currency))}{uiText(" · 低价 ")}{uiText(estimateNumber(group.min))}{uiText(" · 低价样本中位 ")}{uiText(estimateNumber(group.median))} · {uiText(group.count)}{uiText(" 个卖家")}{uiText(prior && prior.count >= 3 && group.count >= 3 ? ` · 相对较低门槛样本中位 ${group.median / prior.median >= 1 ? '+' : ''}${estimateNumber((group.median / prior.median - 1) * 100)}%` : prior ? ' · 样本不足，不计算溢价' : ' · 尚无较低档同币种对照')}</p>;
          })}</>}
          {result && !result.ok && <p className="wb-inline-warning">{uiText(result.error.message)}</p>}
        </div>;
      })}
    </>}
  </details>;
}
