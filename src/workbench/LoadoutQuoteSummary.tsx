import { uiText } from './uiLocale';
import { CURRENCIES, type Currency } from './finance';
import { currentLoadoutQuotes } from './loadoutQuotes';
import { LOADOUT_SLOTS, slotLabel, type LoadoutSlot, type LoadoutState } from './loadout';
import { equipmentDisplayName, parseEquipment } from './genericEquipment';
import { IconButton } from './WorkbenchIcon';

export default function LoadoutQuoteSummary({ state, league, onPrice }: {
  state: LoadoutState; league: string; onPrice?: (raw: string, slot: LoadoutSlot) => void;
}) {
  const quotes = currentLoadoutQuotes(state, league);
  const rows = LOADOUT_SLOTS.flatMap(({ id: slot }) => {
    const raw = state.slots[slot]; if (!raw?.trim()) return [];
    return [{ slot, raw, item: parseEquipment(raw), quote: quotes.find((entry) => entry.slot === slot)?.quote }];
  });
  const pending = rows.filter((row) => !row.quote), next = pending.find((row) => row.item);
  const totals = new Map<Currency, number>();
  for (const { quote } of quotes) totals.set(quote.currency, (totals.get(quote.currency) ?? 0) + quote.amount);
  return <section className="lo-summary" aria-label={uiText("整套装备挂牌参考")}>
    <div className="lo-quote-heading"><h3>{uiText("整套装备已记录的挂牌参考")}</h3>{onPrice && next && <button type="button" className="wb-button" onClick={() => onPrice(next.raw, next.slot)}>{uiText("补齐未记录（")}{uiText(pending.length)}）</button>}</div>
    <p className="lo-footnote">{uiText(quotes.length)} / {uiText(rows.length)}{uiText(" 件已记录 · ")}{uiText(league)}。{uiText(quotes.length === 0 ? '尚未记录报价，导入角色和查价历史不会自动填入这里。' : `还有 ${pending.length} 件未记录。`)}{uiText("查价后点击“记录到套装汇总”，即可更新此处。")}</p>
    {[...totals].map(([unit, amount]) => <p key={unit}>{uiText(amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 }))} {uiText(CURRENCIES[unit])}{uiText("（已记录部分）")}</p>)}
    {!!rows.length && <details className="lo-quote-items"><summary>{uiText("逐件报价状态 · ")}{uiText(pending.length)}{uiText(" 件待补齐")}</summary><div className="lo-quote-scroll"><table className="lo-quote-table"><thead><tr><th>{uiText("装备")}</th><th>{uiText("已记录报价")}</th><th>{uiText("操作")}</th></tr></thead><tbody>{rows.map(({ slot, raw, item, quote }) => <tr key={slot}>
      <td><strong>{uiText(slotLabel(slot))}</strong><small>{uiText(item ? equipmentDisplayName(item) : '物品文本待核对')}</small></td>
      <td>{quote ? <><span>{uiText(quote.amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 }))} {uiText(CURRENCIES[quote.currency])}</span><details><summary>{uiText("来源与时间")}</summary><p>{uiText(new Date(quote.at).toLocaleString('zh-CN'))} · {uiText(quote.conditions)}</p><a href={quote.url} target="_blank" rel="noreferrer">{uiText("官网核对 ↗")}</a></details></> : <span className="lo-footnote">{uiText(state.quotes?.[slot]?.league && state.quotes[slot].league !== league ? '其他赛季报价 · 本赛季未记录' : '未记录')}</span>}</td>
      <td>{onPrice && <IconButton icon="search" label={uiText(`查价：${slotLabel(slot)}`)} disabled={!item} onClick={() => onPrice(raw, slot)} />}</td>
    </tr>)}</tbody></table></div></details>}
    {!rows.length && <p className="lo-footnote">{uiText("先导入角色装备，再逐件查价。")}</p>}
    <p className="lo-footnote">{uiText("未知项不按 0 估值，各币种独立合计；挂牌参考不代表成交价。")}</p>
  </section>;
}
