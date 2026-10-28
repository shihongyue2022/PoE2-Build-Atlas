import { uiText } from './uiLocale';
import LocalizedFileInput from './LocalizedFileInput';
import { useRef, useState } from 'react';
import { CURRENCIES } from './finance';
import { parseTradeCsv, previewTradeImport, suggestTradeMapping, TRADE_COLUMNS, type TradeMapping, type TradeTable } from './tradeImport';
import type { TradeCandidate } from './tradeTracking';

export default function TradeImportPanel({ league, onImport }: { league: string; onImport: (rows: TradeCandidate[], confirmed: boolean) => boolean }) {
  const [table, setTable] = useState<TradeTable>();
  const [mapping, setMapping] = useState<TradeMapping>({});
  const [direction, setDirection] = useState<'' | 'sale' | 'purchase'>('');
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewTradeImport>>>();
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const revision = useRef(0);
  function invalidate() { revision.current++; setPreview(undefined); setConfirmed(false); }
  return <section className="tt-import" aria-label={uiText("导入交易记录")}>
    <h3>{uiText("导入已有成交记录")}</h3>
    <p className="wb-fine">{uiText("选择交易 CSV，核对时间、方向、总金额和通货后导入。可读取本工具导出的 CSV；其他工具的 CSV 可在下方指定列。不会从报价推断成交，也不会自动连接 Overwolf。")}</p>
    <LocalizedFileInput label={uiText("交易 CSV 文件")} aria-label={uiText("交易 CSV 文件")} accept=".csv,text/csv,text/tab-separated-values" disabled={busy} onChange={(event) => { void (async () => {
      const file = event.target.files?.[0]; invalidate(); setTable(undefined); setError('');
      if (!file) return;
      const task = revision.current;
      try {
        if (file.size > 2_000_000) throw new Error('文件不能超过 2 MB。');
        const parsed = parseTradeCsv(await file.text());
        if (task !== revision.current) return;
        setTable(parsed); setMapping(suggestTradeMapping(parsed));
      } catch (failure) { if (task === revision.current) setError(failure instanceof Error ? failure.message : 'CSV 无法读取。'); }
    })(); }} />
    {table && <>
      <p>{uiText("已读取 ")}{uiText(table.rows.length)}{uiText(" 行，尚未写入账本。没有联盟列时使用 ")}{uiText(league)}{uiText("；金额是本笔交易总额，不乘物品数量。")}</p>
      <details open={Object.keys(mapping).length < 5}><summary>{uiText("列对应与交易方向")}</summary><div className="tt-import-columns">{Object.entries(TRADE_COLUMNS).map(([key, label]) => <label key={key}>{uiText(label)}<select aria-label={uiText(`导入列：${label}`)} value={mapping[key as keyof TradeMapping] ?? ''} onChange={(event) => {
        invalidate(); const next = { ...mapping }; if (event.target.value === '') delete next[key as keyof TradeMapping]; else next[key as keyof TradeMapping] = Number(event.target.value); setMapping(next);
      }}><option value="">{uiText(['player', 'quantity', 'league', 'id'].includes(key) ? '不提供' : '请选择')}</option>{table.headers.map((header, index) => <option key={index} value={index}>{uiText(header)}</option>)}</select></label>)}</div>
        <label>{uiText("无方向列时整份文件为")}<select aria-label={uiText("导入默认交易方向")} value={direction} onChange={(event) => { invalidate(); setDirection(event.target.value as typeof direction); }}><option value="">{uiText("必须提供方向列")}</option><option value="sale">{uiText("卖出收入")}</option><option value="purchase">{uiText("买入支出")}</option></select></label>
      </details>
      <button type="button" className="wb-button" disabled={busy} onClick={() => { void (async () => {
        const task = ++revision.current; setBusy(true); setError(''); setPreview(undefined); setConfirmed(false);
        try { const parsed = await previewTradeImport(table, mapping, league, direction); if (task === revision.current) setPreview(parsed); }
        catch (failure) { if (task === revision.current) setError(failure instanceof Error ? failure.message : '无法解析交易。'); }
        finally { setBusy(false); }
      })(); }}>{uiText(busy ? '正在预览…' : '预览交易')}</button>
    </>}
    {preview && <>
      <p>{uiText(preview.candidates.length)}{uiText(" 笔可导入 · ")}{uiText(preview.warnings.length)}{uiText(" 行需处理。重复来源会跳过。")}</p>
      {preview.missingIds && <p className="wb-fine">{uiText("部分记录没有来源 ID，按内容及同秒序号去重；同一交易若来自不同工具，请核对是否重复。")}</p>}
      {preview.warnings.length > 0 && <details><summary>{uiText("未导入行与原因")}</summary>{preview.warnings.map((warning) => <p key={warning} className="wb-fine">{uiText(warning)}</p>)}</details>}
      <div className="fn-scroll"><table><thead><tr><th>{uiText("时间")}</th><th>{uiText("物品")}</th><th>{uiText("方向")}</th><th>{uiText("总金额")}</th><th>{uiText("联盟")}</th></tr></thead><tbody>{preview.candidates.slice(0, 8).map((row) => <tr key={row.id}><td>{uiText(new Date(row.at).toLocaleString('zh-CN'))}</td><td>{uiText(row.item)}</td><td>{uiText(row.kind === 'sale' ? '卖出' : '买入')}</td><td>{uiText(row.amount)} {uiText(row.currency && CURRENCIES[row.currency])}</td><td>{uiText(row.league)}</td></tr>)}</tbody></table></div>
      <label className="tt-enable"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{uiText("这些是已完成的交易，实际金额与通货已经核对")}</label>
      <button type="button" className="wb-button primary" disabled={!preview.candidates.length || busy} onClick={() => {
        if (onImport(preview.candidates, confirmed)) { setTable(undefined); setPreview(undefined); setConfirmed(false); }
      }}>{uiText(confirmed ? '确认并导入已成交记录' : '加入待确认列表')}</button>
    </>}
    {error && <p role="alert">{uiText(error)}</p>}
  </section>;
}
