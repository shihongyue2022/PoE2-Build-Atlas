import { uiText } from './uiLocale';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CURRENCIES, collectTrades, confirmTrade, correctTradeDirection, isCurrency, trackerReport, validTradeCandidate, type Currency, type FinanceState, ENTRY_LABELS } from './finance';
import { parseTradeMessage, type TradeCandidate, type TradeLogSummary } from './tradeTracking';
import Icon, { IconButton } from './WorkbenchIcon';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import TradeImportPanel from './TradeImportPanel';
import { applyTradeImport } from './tradeImport';
import OfficialHistoryPanel from './OfficialHistoryPanel';
import { HOSTED_WORKBENCH } from './workbenchRuntime';

const format = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
function Unit({ value }: { value: Currency }) { return <span className="tt-unit"><OfficialCurrencyIcon currencyId={value === 'exalted' ? 'exalt' : value} label={uiText(CURRENCIES[value])} />{uiText(CURRENCIES[value])}</span>; }
function CurrencySelect({ value, onChange, label }: { value: Currency | ''; onChange: (value: Currency) => void; label: string }) {
  return <select aria-label={uiText(label)} value={value} onChange={(event) => { if (isCurrency(event.target.value)) onChange(event.target.value); }}>
    {!value && <option value="" disabled>{uiText("选择通货")}</option>}{Object.entries(CURRENCIES).map(([id, text]) => <option key={id} value={id}>{uiText(text)}</option>)}
  </select>;
}
function PendingTrade({ trade, onConfirm, onIgnore, disabled }: { trade: TradeCandidate; onConfirm: (actual: { amount: number; currency: Currency; kind: 'sale' | 'purchase' }) => void; onIgnore: () => void; disabled: boolean }) {
  const [amount, setAmount] = useState(String(trade.amount ?? '')), [currency, setCurrency] = useState<Currency | ''>(trade.currency ?? '');
  const [kind, setKind] = useState(trade.kind ?? '');
  const [editing, setEditing] = useState(false), editorId = useId();
  const incomplete = !currency || !kind || !Number.isFinite(Number(amount)) || Number(amount) <= 0;
  return <article className="tt-pending-row" aria-label={uiText(`待确认：${trade.item}`)}>
    <div className="tt-pending-item"><strong title={uiText(trade.item)}>{uiText(trade.quantity > 1 ? `${trade.quantity} × ` : '')}{uiText(trade.item)}</strong><small>{uiText(trade.player || '玩家待核对')} · {uiText(new Date(trade.at).toLocaleString('zh-CN'))}{uiText(trade.league && ` · ${trade.league}`)}</small>
      {trade.acceptedAt && <small>{uiText("日志出现接受交易提示，仍需核对实际交付。")}</small>}</div>
    <div className={`tt-quote-value${incomplete ? ' tt-needs-review' : ''}`}><span>{uiText(kind === 'sale' ? '卖出收入' : kind === 'purchase' ? '买入支出' : '方向待确认')}</span> · {uiText(amount || '金额待确认')} {uiText(currency ? CURRENCIES[currency] : trade.currencyText)}{!currency && <small>{uiText("币种待核对")}</small>}</div>
    <button type="button" className="wb-text-button tt-edit-trade" aria-label={uiText(`更正这笔成交：${trade.item}`)} aria-expanded={editing} aria-controls={editorId} onClick={() => setEditing(!editing)}>{uiText(editing ? '收起' : incomplete ? '补全' : '更正')}</button>
    <button type="button" className="wb-button primary" disabled={disabled || !currency || !kind || !Number.isFinite(Number(amount)) || Number(amount) <= 0} onClick={() => { if (currency && (kind === 'sale' || kind === 'purchase')) onConfirm({ amount: Number(amount), currency, kind }); }}><Icon name="check" size={16} />{uiText("确认成交")}</button>
    <IconButton icon="close" label={uiText(`忽略${trade.item}交易线索`)} onClick={onIgnore} />
    {editing && <div className="tt-pending-editor" id={editorId} role="group" aria-label={uiText(`更正${trade.item}成交`)}>
      {!trade.currency && <p className="wb-fine">{uiText("原通货：")}{uiText(trade.currencyText)}{uiText("，请核对币种。")}</p>}
      <div className="tt-pending-correction">
      <select aria-label={uiText(`${trade.item}成交方向`)} value={kind} onChange={(event) => setKind(event.target.value)}><option value="" disabled>{uiText("买入 / 卖出")}</option><option value="sale">{uiText("卖出")}</option><option value="purchase">{uiText("买入")}</option></select>
      <label>{uiText("实际总金额")}<input aria-label={uiText(`${trade.item}实际成交数量`)} type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <CurrencySelect label={uiText(`${trade.item}实际成交通货`)} value={currency} onChange={setCurrency} />
    </div></div>}
  </article>;
}
export default function TradeTracker({ state, league, save, onError, onManual, active = true }: {
  state: FinanceState; league: string; save: (next: FinanceState, message?: string) => boolean; onError: (message: string) => void; onManual: () => void; active?: boolean;
}) {
  const [currency, setCurrency] = useState<Currency>(() => {
    const currencies = trackerReport(state, league, 'exalted', 30).currencies;
    return currencies.find((row) => row.currency === 'exalted')?.currency ?? [...currencies].sort((a, b) => b.count - a.count)[0]?.currency ?? 'exalted';
  }), [days, setDays] = useState(30), [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('尚未读取游戏日志'), [paste, setPaste] = useState(''), [showPaste, setShowPaste] = useState(false);
  const [showImport, setShowImport] = useState(false), [summary, setSummary] = useState<TradeLogSummary>(), [attempted, setAttempted] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'purchase' | 'sale'>('all');
  const inboxPanel = useRef<HTMLDetailsElement>(null);
  const inflight = useRef(false), mounted = useRef(false), firstRead = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latest = useRef({ state, save });
  useEffect(() => { latest.current = { state, save }; }, [state, save]);
  const refresh = useCallback(async (history = false) => {
    if (HOSTED_WORKBENCH) return;
    if (inflight.current) return;
    inflight.current = true; setBusy(true); setAttempted(true);
    try {
      const response = await fetch(`/api/workbench/trade-log${history ? '?history=1' : ''}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('无法读取本地日志，请确认工坊后台服务已启动。');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('events' in data) || !Array.isArray(data.events) || data.events.length > 500 || !data.events.every(validTradeCandidate)) throw new Error('日志摘要格式不正确。');
      if (!mounted.current) return;
      const summary = data as TradeLogSummary;
      const current = latest.current;
      const next = collectTrades(current.state, summary.events);
      if (next !== current.state && !current.save(next)) throw new Error('读取完成，但账本未保存；请检查页面提示后重新读取。');
      setSummary(summary);
      setStatus(summary.found ? `${summary.source ?? '游戏日志'} · ${summary.events.length} 条可读交易线索${summary.warning ? ` · ${summary.warning}` : ''}` : summary.warning ?? '没有找到游戏日志');
    } catch (reason) { if (mounted.current) { setSummary(undefined); setStatus(reason instanceof Error ? reason.message : '读取失败，可手动粘贴密语。'); } }
    finally { inflight.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => {
    if (HOSTED_WORKBENCH || !active || firstRead.current) return;
    const timer = setTimeout(() => { firstRead.current = true; void refresh(true); }, 0);
    return () => clearTimeout(timer);
  }, [active, refresh]);
  useEffect(() => {
    if (HOSTED_WORKBENCH || !state.tradeEnabled) return;
    const first = setTimeout(() => { void refresh(); }, 0);
    const timer = setInterval(() => { void refresh(); }, 10000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [state.tradeEnabled, refresh]);
  const report = trackerReport(state, league, currency, days, search);
  const inbox = (state.tradeInbox ?? []).filter((row) => !row.league || row.league === league);
  const shownInbox = inbox.filter((row) => inboxFilter === 'all' || row.kind === inboxFilter);
  const official = state.officialHistory?.[league];
  const hasOfficial = !!official || state.entries.some((row) => row.trade?.sourceId.startsWith('official-') && state.sessions.some((session) => session.id === row.sessionId && session.league === league));
  const other = (state.tradeInbox?.length ?? 0) - inbox.length;
  const otherLeagues = [...new Set((state.tradeInbox ?? []).filter((row) => row.league && row.league !== league).map((row) => row.league!))];
  const allConfirmed = state.entries.filter((entry) => entry.confirmed && state.sessions.some((session) => session.id === entry.sessionId && session.league === league)).length;
  function reviewPurchases() { setInboxFilter('purchase'); if (inboxPanel.current) { inboxPanel.current.open = true; inboxPanel.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); } }
  function exportCsv() {
    const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const rows = [['时间', '物品', '玩家', '类型', '数量', '通货', '联盟', '物品数量', '来源交易ID'], ...report.rows.map((row) => [row.at, row.label, row.trade?.player ?? '', ENTRY_LABELS[row.kind], row.amount, CURRENCIES[row.currency], league, row.trade?.quantity ?? 1, row.trade?.sourceId ?? `entry-${row.id}`])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'poe2-trades.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="tt-dashboard" aria-label={uiText("交易追踪器")}>
    <div className="tt-heading"><div><h2>{uiText("交易追踪器")}</h2><p>{uiText(league)}{uiText(" · 收入与支出")}</p></div><div className="tt-filters"><CurrencySelect label={uiText("交易统计通货")} value={currency} onChange={setCurrency} /><select aria-label={uiText("交易统计时间")} value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={1}>{uiText("今天")}</option><option value={7}>{uiText("最近 7 天")}</option><option value={30}>{uiText("最近 30 天")}</option><option value={0}>{uiText("全部时间")}</option></select></div></div>
    <OfficialHistoryPanel league={league} state={state} save={save} active={active} onSynced={(next) => {
      // Reveal the freshly synchronized ledger even when an old currency/time
      // or text filter would otherwise hide every imported record.
      const visible = trackerReport(next, league, currency, days, search);
      if (!visible.rows.length) {
        const all = trackerReport(next, league, currency, 0);
        const available = [...all.currencies].sort((a, b) => b.count - a.count);
        if (available.length) { setSearch(''); setDays(0); setCurrency(available.find((row) => row.currency === currency)?.currency ?? available[0]!.currency); }
      }
    }} />
    <details className="tt-diagnostics"><summary>{uiText("其他交易来源 · 密语线索与 CSV")}</summary><div className="tt-sources" aria-label={uiText("交易数据来源")}><div><strong>{uiText("密语交易 · ")}{uiText(summary?.found ? '日志已连接' : summary ? '日志未找到' : busy ? '正在检查日志' : attempted ? '日志读取失败' : '尚未检查日志')}</strong><small>{uiText("首次打开读取最近 30 天；开启自动读取后每 10 秒检查。识别报价后仍需确认实际成交。")}</small></div><div><strong>{uiText("已有交易账本")}</strong><small>{uiText("可导入其他工具导出的成交 CSV，与官网记录分来源去重；跨来源重复仍需核对。")}</small><button type="button" className="wb-text-button" onClick={() => setShowImport(true)}>{uiText("导入已有成交 CSV")}</button></div></div></details>
    <div className="tt-cards">
      <div className="tt-card"><span>{uiText("已记录收入")}</span><strong className="positive">{uiText(format(report.income))}</strong><Unit value={currency} /></div>
      <div className="tt-card"><span>{uiText("已记录支出")}</span><strong className={report.expenseCount ? 'negative' : 'tt-unknown'}>{uiText(report.expenseCount ? format(report.expense) : '未记录')}</strong><Unit value={currency} /><small>{uiText(report.expenseCount ? `${report.expenseCount} 笔已确认支出` : '没有可计入的已确认支出，不表示实际花费为 0')}</small>{report.pendingPurchases.length > 0 && <button type="button" className="wb-text-button" onClick={reviewPurchases}>{uiText("核对 ")}{uiText(report.pendingPurchases.length)}{uiText(" 笔买入线索 →")}</button>}</div>
      <div className="tt-card"><span>{uiText("已记录差额")}</span><strong className={report.expenseCount ? report.net >= 0 ? 'positive' : 'negative' : 'tt-unknown'}>{uiText(report.expenseCount ? format(report.net) : '待补支出')}</strong><Unit value={currency} /><small>{uiText(report.expenseCount ? '仅为已确认账目的收入减支出，不是完整利润' : '支出记录缺失，暂不将卖出收入当作利润')}</small></div>
    </div>
    <p className="tt-coverage wb-fine" role="status">{uiText(hasOfficial ? official?.purchases ? `官网本次返回 ${official.purchases} 笔显式买入，覆盖范围仍不完整。` : '官网同步未读取到买入，尚未覆盖游戏市集买入支出。' : '买入密语只作为报价线索，确认实际成交后才计入支出。')}{uiText("收支按当前通货／时间／搜索条件统计；其他币种分别列在下方。")}</p>
    <div className="tt-toolbar"><label className="tt-search"><Icon name="search" size={17} /><input aria-label={uiText("搜索交易记录")} placeholder={uiText("搜索物品或玩家")} value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="tt-enable"><input type="checkbox" disabled={HOSTED_WORKBENCH} checked={!HOSTED_WORKBENCH && Boolean(state.tradeEnabled)} onChange={(event) => save({ ...state, tradeEnabled: event.target.checked })} />{uiText("自动读取交易线索")}</label>
      <IconButton icon="refresh" label={uiText("读取最近 30 天日志")} disabled={HOSTED_WORKBENCH || busy} onClick={() => { void refresh(true); }} /><IconButton icon="paste" label={uiText("粘贴交易密语")} aria-expanded={showPaste} onClick={() => setShowPaste(!showPaste)} /><IconButton icon="ledger" label={uiText("导入成交 CSV")} aria-expanded={showImport} onClick={() => setShowImport(!showImport)} /><IconButton icon="plus" label={uiText("手动添加收支")} onClick={onManual} /><IconButton icon="download" label={uiText("导出当前筛选交易 CSV")} disabled={!report.rows.length} onClick={exportCsv} />
    </div>
    <p className="wb-fine tt-status" role="status">{uiText(busy ? '正在读取交易线索…' : status)}{uiText((state.tradeInbox?.length ?? 0) >= 500 ? ' · 待确认列表已满，请先处理现有线索，再读取新记录。' : '')}</p>
    {summary?.diagnostics && <details className="tt-diagnostics"><summary>{uiText("日志读取明细 · ")}{uiText(summary.diagnostics.whispers)}{uiText(" 条密语中识别 ")}{uiText(summary.events.length)}{uiText(" 条交易线索")}</summary><p className="wb-fine">{uiText(summary.diagnostics.history ? '最近 30 天历史扫描' : '最近 1 MiB 增量窗口')}{uiText(" · 最后写入 ")}{uiText(summary.modifiedAt ? new Date(summary.modifiedAt).toLocaleString('zh-CN') : '未知')} · {uiText(summary.diagnostics.unmatchedTradeMessages)}{uiText(" 条疑似交易未匹配 · ")}{uiText(summary.diagnostics.acceptanceHints)}{uiText(" 条接受交易提示。这里只显示计数，不保存普通聊天。")}</p></details>}
    {showImport && <TradeImportPanel league={league} onImport={(rows, confirmed) => {
      try {
        const result = applyTradeImport(state, rows, confirmed, league);
        if (!save(result.state, `已${confirmed ? '记入成交' : '加入待确认'} ${result.added} 笔，跳过重复 ${result.duplicates} 笔。`)) return false;
        setShowImport(false); return true;
      } catch (failure) { onError(failure instanceof Error ? failure.message : '导入失败。'); return false; }
    }} />}
    {report.currencies.length > 0 && <div className="tt-currency-summary" aria-label={uiText("各通货收支")}>{report.currencies.map((row) => <button type="button" key={row.currency} aria-pressed={currency === row.currency} onClick={() => setCurrency(row.currency)}>{uiText(CURRENCIES[row.currency])} · {uiText(row.count)}{uiText(" 笔 · 已记收入 ")}{uiText(format(row.income))} · {uiText(row.expenseCount ? `已记支出 ${format(row.expense)} · 账本差额 ${format(row.net)}` : '支出未记录')}</button>)}</div>}
    {!report.rows.length && allConfirmed > 0 && <p className="wb-fine">{uiText("本联盟已有 ")}{uiText(allConfirmed)}{uiText(" 笔确认记录，当前通货、时间或搜索条件没有匹配结果。")}<button type="button" className="wb-text-button" onClick={() => { setDays(0); setSearch(''); const entry = state.entries.find((row) => row.confirmed && state.sessions.some((session) => session.id === row.sessionId && session.league === league)); if (entry) setCurrency(entry.currency); }}>{uiText("显示已有记录")}</button></p>}
    {showPaste && <div className="tt-paste"><textarea aria-label={uiText("交易密语文字")} maxLength={16000} value={paste} onChange={(event) => setPaste(event.target.value)} rows={3} placeholder={uiText("粘贴官方交易密语；带 @來自 / @From 可识别出售方向。")} /><button type="button" className="wb-button" disabled={!paste.trim()} onClick={() => {
      const candidate = parseTradeMessage(paste, { id: `paste-${crypto.randomUUID()}`, source: 'paste' });
      if (!candidate) { onError('未识别到官方买卖密语，请保留物品、报价、通货和联盟。'); return; }
      if (save(collectTrades(state, [candidate]), '已加入待确认，请核对实际成交金额。')) { setPaste(''); setShowPaste(false); }
    }}>{uiText("识别交易")}</button></div>}
    <details className="tt-inbox" ref={inboxPanel} open={inbox.length > 0}><summary>{uiText("待确认交易 ")}<span className="wb-count">{uiText(inbox.length)}</span>{other > 0 && <small>{uiText(" · 另有 ")}{uiText(other)}{uiText(" 条属于其他联盟")}</small>}</summary><p className="wb-fine">{uiText("密语是报价线索，不代表已经成交。按实际交付核对后确认；自动读取只在工坊网页打开时运行。")}</p>
      <div className="wb-actions" role="group" aria-label={uiText("待确认交易方向")}>{([['all', '全部'], ['purchase', '买入支出'], ['sale', '卖出收入']] as const).map(([kind, label]) => <button type="button" className="wb-button" key={kind} aria-pressed={inboxFilter === kind} onClick={() => setInboxFilter(kind)}>{uiText(label)}</button>)}</div>
      {otherLeagues.length > 0 && <p className="wb-fine">{uiText("其他联盟：")}{uiText(otherLeagues.join('、'))}{uiText("。请切换顶部联盟后处理，记录没有丢失。")}</p>}
      {shownInbox.map((row) => <PendingTrade key={row.id} trade={row} disabled={busy} onConfirm={(actual) => { try { save(confirmTrade(state, row, league, actual), '已计入成交记录。'); } catch (reason) { onError(reason instanceof Error ? reason.message : '未能确认。'); } }} onIgnore={() => save({ ...state, tradeInbox: state.tradeInbox?.filter((entry) => entry.id !== row.id), ignoredTradeIds: [...state.ignoredTradeIds ?? [], row.id] })} />)}
      {!!inbox.length && !shownInbox.length && <p className="tt-empty">{uiText("当前方向没有待确认线索。")}</p>}
      {!inbox.length && <p className="tt-empty">{uiText("暂无待确认交易。开启自动读取，或粘贴官方交易密语。")}</p>}
    </details>
    <div className="tt-records"><div className="tt-record-heading"><h3>{uiText("交易记录")}</h3><span>{uiText(report.rows.length)}{uiText(" 笔 · ")}{uiText(CURRENCIES[currency])}</span></div>
      {report.groups.map(([day, entries], index) => { const income = entries.filter((row) => row.kind === 'sale' || row.kind === 'income').reduce((n, row) => n + row.amount, 0); const expense = entries.filter((row) => row.kind === 'purchase' || row.kind === 'craft').reduce((n, row) => n + row.amount, 0);
        return <details className="tt-day" key={day} open={index === 0}><summary><strong>{uiText(day)}</strong><span>{uiText(entries.length)}{uiText(" 笔")}</span><span className="positive">+{uiText(format(income))}</span><span className="negative">−{uiText(format(expense))}</span><b>{uiText("已记差额 ")}{uiText(format(income - expense))}</b></summary>
          <div className="fn-scroll"><table><thead><tr><th>{uiText("物品 / 项目")}</th><th>{uiText("玩家")}</th><th>{uiText("类型")}</th><th>{uiText("金额")}</th><th>{uiText("时间")}</th><th>{uiText("操作")}</th></tr></thead><tbody>{entries.map((row) => <tr key={row.id}><td>{uiText(row.trade && row.trade.quantity > 1 ? `${row.trade.quantity} × ` : '')}{uiText(row.label)}</td><td>{uiText(row.trade?.player || '—')}</td><td>{row.kind === 'sale' || row.kind === 'purchase' ? <select aria-label={uiText(`更正${row.label}成交方向`)} title={uiText("更正这笔成交方向")} value={row.kind} onChange={(event) => {
            const kind = event.target.value; if (kind !== 'sale' && kind !== 'purchase') return;
            try { save(correctTradeDirection(state, row.id, kind), '已更正成交方向，收支已重新统计。'); } catch (reason) { onError(reason instanceof Error ? reason.message : '方向未能更正。'); }
          }}><option value="sale">{uiText("出售收入")}</option><option value="purchase">{uiText("购买支出")}</option></select> : ENTRY_LABELS[row.kind]}</td><td className={row.kind === 'sale' || row.kind === 'income' ? 'positive' : 'negative'}>{uiText(row.kind === 'sale' || row.kind === 'income' ? '+' : '−')}{uiText(format(row.amount))}</td><td>{uiText(new Date(row.at).toLocaleTimeString('zh-CN'))}</td><td><IconButton icon="undo" label={uiText(`撤回${row.label}成交确认`)} onClick={() => save({ ...state, entries: state.entries.map((entry) => entry.id === row.id ? { ...entry, confirmed: false } : entry) }, '已撤回确认，可在场次记账中重新确认。')} /></td></tr>)}</tbody></table></div></details>;
      })}
      {!report.rows.length && <div className="tt-empty"><Icon name="ledger" size={32} /><p>{uiText("当前筛选下还没有已确认记录。")}</p><small>{uiText("先确认一笔交易，或展开下方手动记账。")}</small></div>}
    </div><p className="wb-fine">{uiText("按所选通货统计已确认账目，不跨币种相加。账本差额不代表完整利润；持有资产的价格涨跌在下方独立查看。")}</p>
  </section>;
}
