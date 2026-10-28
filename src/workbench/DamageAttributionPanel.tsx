import { uiText } from './uiLocale';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type LoadoutState, type LoadoutSlot, slotLabel } from './loadout';
import { currentCalculationSnapshot, rememberCalculationSnapshot } from './calculationSnapshot';
import { readOriginalLocalPob } from './pobRepair';
import { parsePobXml, previewPob } from './pobImport';
import { equipmentSignature } from './resistanceModel';
import { readDamageAttribution, rankDamageAttribution, groupDamageAttribution, type DamageAttributionResult, type DamageAttributionRow } from './damageAttribution';
import { activeSecondWeapons } from './weaponSets';
import { skillSelectionKey } from './skillRoutine';
import { attributionSkillChoices, excludedAttributionGroups } from './attributionSkills';
import { equipmentDisplayName, localizeEquipmentName, localizeEquipmentStat } from './genericEquipment';
import { attributionSlot, attributionJewelSources, attributionMarketRow, attributionMarketQueries, type AttributionMarketFloor } from './attributionMarket';
import { HOSTED_WORKBENCH, WORKBENCH_SOURCE } from './workbenchRuntime';
import { workflowDamageState } from './workflowPreferences';
import Icon, { IconButton } from './WorkbenchIcon';
import './damageAttribution.css';

const format = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
export default function DamageAttributionPanel({ state, league = '', onSelectSlot }: {
  state: LoadoutState; league?: string; onSelectSlot: (slot: LoadoutSlot) => void;
}) {
  const choices = attributionSkillChoices(state), primary = workflowDamageState(state).goals.mainSkill;
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const choice = choices.find((entry) => entry.key === key) ?? choices.find((entry) => primary && entry.key === skillSelectionKey(primary)) ?? choices[0];
  const targets = choices.filter(entry => choice?.targets.includes(entry.key));
  const output = targets.find(entry => entry.key === targetKey) ?? targets.find(entry => primary && entry.key === skillSelectionKey(primary)) ?? targets[0];
  const snapshot = currentCalculationSnapshot(state), canBackfill = !!state.source?.fileName && !!state.source.savedAt;
  const basis = JSON.stringify([state.source?.importedAt, state.source?.setId, state.source?.combat?.sets, state.slots, state.goals.skillBar, state.goals.workflow, choice?.key, output?.key, activeSecondWeapons(state)]);
  const [stored, setStored] = useState<{ basis: string; result: DamageAttributionResult }>();
  const [selection, setSelection] = useState<{ basis: string; ids: string[] }>({ basis: '', ids: [] });
  const [floor, setFloor] = useState<AttributionMarketFloor>('current');
  const result = stored?.basis === basis ? stored.result : undefined, request = useRef<AbortController | null>(null);
  const currentBasis = useRef(basis); useEffect(() => { currentBasis.current = basis; });
  useEffect(() => () => request.current?.abort(), [basis]);
  const marketRows = useMemo(() => {
    const jewels = result ? attributionJewelSources(state, result) : undefined;
    return new Map(result?.rows.map((row) => [row.id, attributionMarketRow(state, row, jewels)]) ?? []);
  }, [state, result]);
  const picked = selection.basis === basis ? selection.ids.filter((id) => marketRows.get(id)?.filter) : [];
  const ranked = result && rankDamageAttribution(result);
  const groups = result ? groupDamageAttribution(result) : [];
  const activeGroups = groups.filter((group) => group.positive.length > 0 || (group.total?.delta ?? 0) > 1e-7);
  const otherGroups = groups.filter((group) => !activeGroups.includes(group));
  const selectable = ranked?.positive.filter((row) => marketRows.get(row.id)?.filter).map((row) => row.id) ?? [];
  let marketError = '', markets: ReturnType<typeof attributionMarketQueries> = [];
  try { if (picked.length) markets = attributionMarketQueries(state, picked.flatMap((id) => marketRows.get(id) ?? []), league, floor); }
  catch (reason) { marketError = reason instanceof Error ? reason.message : '市场条件暂不可用。'; }
  function toggle(id: string, checked: boolean) {
    setSelection({ basis, ids: checked ? [...new Set([...picked, id])] : picked.filter((entry) => entry !== id) });
  }
  async function calculate() {
    if ((!snapshot && !canBackfill) || !choice || !output || HOSTED_WORKBENCH || busy) return;
    const task = new AbortController(); request.current?.abort(); request.current = task;
    const token = basis; setBusy(true); setError('');
    try {
      let evidence = snapshot;
      if (!evidence && state.source) {
        const original = parsePobXml(await readOriginalLocalPob(state.source, task.signal, true));
        const signatures = [false, true].map((second) => equipmentSignature(previewPob(original, state.source!.setId, second).slots));
        if (!signatures.includes(equipmentSignature(state.slots))) throw new Error('当前装备与原 PoB 快照不一致，请更新 PoB 并重新导入；未套用旧伤害。');
        const warning = rememberCalculationSnapshot(original.calculationXml, state.source, signatures);
        if (warning) throw new Error(warning);
        evidence = currentCalculationSnapshot(state);
      }
      if (!evidence) throw new Error('没有与当前装备匹配的重算快照。');
      const excludedGroups = excludedAttributionGroups(state, output.selection);
      const response = await fetch('/api/workbench/damage-attribution', { method: 'POST', signal: task.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xml: evidence.xml, itemSetId: evidence.itemSetId, secondWeapons: activeSecondWeapons(state), skill: output.selection, excludedGroups }) });
      const value = await response.json() as { ok?: boolean; result?: unknown; error?: { message?: string } };
      if (!response.ok || value.ok !== true) throw new Error(value.error?.message ?? 'PoB 重算接口不可用，请重新启动本地工坊。');
      const parsed = readDamageAttribution(value.result);
      if (parsed.skill !== output.name) throw new Error('重算技能与所选输出技能不一致，未采用结果。');
      if (!task.signal.aborted && currentBasis.current === token) setStored({ basis: token, result: parsed });
    } catch (reason) { if (!task.signal.aborted) setError(reason instanceof Error ? reason.message : '伤害重算失败。'); }
    finally { setBusy(false); }
  }
  function renderRows(rows: DamageAttributionRow[], kind: 'positive' | 'other' | 'pending' = 'positive') {
    return <div className="lo-table-scroll da-scroll" data-attribution={kind}><table className="lo-deltas da-table"><thead><tr><th aria-label={uiText("多选词缀")} /><th>{uiText("装备")}</th><th>{uiText("词缀")}</th><th>{uiText("DPS 损失")}</th><th>{uiText("损失率")}</th><th>{uiText("操作")}</th></tr></thead><tbody>{rows.map((row) => {
      const slot = attributionSlot(row), market = marketRows.get(row.id), item = market?.equipment;
      const label = localizeEquipmentStat(row.line), name = item ? equipmentDisplayName(item) : localizeEquipmentName(row.item);
      let url: string | undefined;
      try { if (market?.filter && league) url = attributionMarketQueries(state, [market], league, floor)[0]?.url; } catch { /* No unchecked fallback query. */ }
      return <tr key={row.id} className={picked.includes(row.id) ? 'da-selected' : ''}>
        <td><input type="checkbox" aria-label={uiText(`选择词缀：${row.id}`)} title={uiText(market?.reason ?? label)} disabled={!market?.filter} checked={picked.includes(row.id)} onChange={(event) => toggle(row.id, event.target.checked)} /></td>
        <td title={uiText(name)}><span>{uiText(slot ? slotLabel(slot) : row.slot.startsWith('Socket') ? `珠宝 ${row.slot.replace('Socket ', '')}` : row.slot)}</span><small>{uiText(name)}</small></td>
        <td className="da-mod" title={uiText(`${row.line}${market?.reason ? `\n${market.reason}` : ''}`)}><span>{uiText(label)}</span>{market?.filter && (market.filter.presenceOnly || market.filter.actualValue === undefined || market.filter.actualValue <= 0) && <small className="da-presence">{uiText("只查存在")}</small>}</td>
        <td className={row.delta !== undefined && row.delta > 0 ? 'positive' : ''} title={uiText(row.without === undefined ? '原生引擎未完整识别或无法独立移除；未记为零贡献。' : `移除后 DPS：${format(row.without)}`)}>{uiText(row.delta === undefined ? '待核对' : format(row.delta))}</td>
        <td>{uiText(row.lossPercent === undefined ? '—' : `${format(row.lossPercent)}%`)}</td>
        <td><div className="da-actions">{slot && <IconButton icon="equipment" label={uiText(`查看${slotLabel(slot)}装备详情`)} onClick={() => onSelectSlot(slot)} />}{url && <a className="wb-icon-button" aria-label={uiText(`官网检索词缀：${row.id}`)} title={uiText(`在官网检索：${label}`)} href={url} target="_blank" rel="noreferrer"><Icon name="search" size={16} /></a>}</div></td>
      </tr>;
    })}</tbody></table></div>;
  }
  function renderGroup(group: ReturnType<typeof groupDamageAttribution>[number]) {
    const slot = attributionSlot(group), first = group.positive[0] ?? group.other[0] ?? group.pending[0];
    const item = first && marketRows.get(first.id)?.equipment;
    const name = item ? equipmentDisplayName(item) : localizeEquipmentName(group.item);
    const label = slot ? slotLabel(slot) : group.slot.replace(/^(?:Socket|Jewel)\s*(\d+)$/, '珠宝 $1');
    const eligible = group.positive.filter((row) => marketRows.get(row.id)?.filter).map((row) => row.id);
    const total = group.total;
    return <details key={group.slot} className="da-item-group" data-slot={group.slot} open={group.positive.length > 0}>
      <summary>
        <input type="checkbox" aria-label={uiText(`全选${label}正贡献词缀`)} disabled={!eligible.length} checked={eligible.length > 0 && eligible.every((id) => picked.includes(id))} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelection({ basis, ids: event.target.checked ? [...new Set([...picked, ...eligible])] : picked.filter((id) => !eligible.includes(id)) })} />
        <span className="da-group-name"><strong>{uiText(label)} · {uiText(name)}</strong><small>{uiText(group.positive.length)}{uiText(" 条正贡献")}{uiText(group.pending.length ? ` · ${group.pending.length} 条待核对` : '')}</small></span>
        <span className="da-group-impact" title={uiText(total?.without === undefined ? '整件词缀无法完整隔离重算；不会用单条贡献相加代替。' : `同时移除本件全部词缀后 DPS：${format(total.without)}${total.pendingLines ? '；仅代表 PoB 可计算部分，仍有词缀待核对。' : ''}`)}>
          <small>{uiText(total?.pendingLines ? '已算部分' : '整件词缀')}</small><b>{uiText(total?.delta === undefined ? '待核对' : `${total.delta > 0 ? '+' : ''}${format(total.delta)} DPS`)}</b><b>{uiText(total?.lossPercent === undefined ? '—' : `${format(total.lossPercent)}%`)}</b>
        </span>
      </summary>
      {uiText(group.positive.length > 0 && renderRows(group.positive))}
      {group.other.length > 0 && <details className="da-group-extra"><summary>{uiText("零或负向 · ")}{uiText(group.other.length)}{uiText(" 条")}</summary>{uiText(renderRows(group.other, 'other'))}</details>}
      {group.pending.length > 0 && <details className="da-group-extra"><summary>{uiText("待核对 · ")}{uiText(group.pending.length)}{uiText(" 条")}</summary>{uiText(renderRows(group.pending, 'pending'))}</details>}
    </details>;
  }
  return <section className="lo-summary da-panel" aria-label={uiText("全身伤害词缀排行")}><h3 className="da-heading">{uiText("全身伤害词缀排行")}{uiText(ranked ? ` · ${ranked.positive.length} 项正贡献 · ${ranked.pending.length} 项待核对` : ' · PoB 逐词缀重算')}</h3>
    <div className="lo-actions da-toolbar"><label>{uiText("分析技能")}<select aria-label={uiText("贡献分析技能")} value={choice?.key ?? ''} onChange={(event) => { setKey(event.target.value); setTargetKey(''); setSelection({ basis: '', ids: [] }); setError(''); }} disabled={busy}>{!choices.length && <option value="">{uiText("先定义实际输出技能组")}</option>}{choices.map((entry) => <option key={entry.key} value={entry.key}>{uiText(entry.label)}{uiText(entry.output ? '' : ' · 联动／增益')}</option>)}</select></label>{choice && !choice.output && targets.length > 0 && <label>{uiText("作用于")}<select aria-label={uiText("联动作用的输出技能")} value={output?.key ?? ''} disabled={busy} onChange={event => { setTargetKey(event.target.value); setSelection({ basis: '', ids: [] }); setError(''); }}>{targets.map(entry => <option key={entry.key} value={entry.key}>{uiText(entry.label)}</option>)}</select></label>}<button type="button" className="wb-button primary" disabled={(!snapshot && !canBackfill) || !output || HOSTED_WORKBENCH || busy} onClick={() => { void calculate(); }}>{uiText(busy ? 'PoB 正在逐条重算…' : '计算全身词缀贡献')}</button>{result && <span className="lo-footnote">{uiText(choice && !choice.output ? `${choice.label} → ` : '')}{uiText(output?.label)}{uiText(" · 基准 ")}{uiText(result.metric)} {uiText(format(result.baseline))}</span>}</div>
    {choice && !choice.output && <p className="lo-footnote da-link-note" role="status">{uiText(output ? `${choice.label}本身没有独立伤害，此处分析 ${choice.label} → ${output.label} 的装备词缀贡献。保留已选联动与各组辅助；重复伤害、狂怒球及冷却沿用 PoB 配置，不视为全程覆盖。` : choice.name === 'Barrage' ? '弹幕本身没有独立伤害；请在上方技能组加入可重复的弓／投射物长矛攻击（例如旋风），再分析联动后的装备贡献。' : '此技能作为增益／联动保留，暂未核对可直接分析的输出目标；请选择组内输出技能查看装备贡献。')}</p>}
    {HOSTED_WORKBENCH && <p className="lo-footnote">{uiText("精确排行需要本机 PoB 原生引擎；浏览器版不会用方向分伪装贡献。")}<a href={WORKBENCH_SOURCE + '#启动'} target="_blank" rel="noreferrer">{uiText("打开本地版说明 ↗")}</a></p>}
    {!snapshot && <p className="lo-footnote">{uiText(canBackfill ? '点击计算时会补读同一份未变更的本机 PoB 存档，并核对整套装备。' : '请重新导入并确认完整 PoB2 快照。')}{uiText("装备或来源已变化时，旧快照不能代表当前套装；手动换装后需先在 PoB 更新并保存。")}</p>}
    {error && <p role="alert" className="lo-alert">{uiText(error)}</p>}
    {result && ranked && <><div className="da-market-bar" role="group" aria-label={uiText("词缀联合市场检索")}>
      <label><input type="checkbox" aria-label={uiText("全选可检索的正贡献词缀")} disabled={!selectable.length} checked={selectable.length > 0 && selectable.every((id) => picked.includes(id))} onChange={(event) => setSelection({ basis, ids: event.target.checked ? [...new Set([...picked, ...selectable])] : picked.filter((id) => !selectable.includes(id)) })} />{uiText("全选可检索")}</label>
      <span>{uiText("已选 ")}{uiText(picked.length)}{uiText(" 项")}</span><label>{uiText("门槛")}<select aria-label={uiText("词缀市场检索门槛")} value={floor} onChange={(event) => setFloor(event.target.value as AttributionMarketFloor)}><option value="current">{uiText("≥ 当前")}</option><option value="3">{uiText("至少 +3%")}</option><option value="5">{uiText("至少 +5%")}</option><option value="presence">{uiText("只要求存在")}</option></select></label>
      {markets.map((market) => <a key={market.slot} className="wb-button primary da-market-link" href={market.url} target="_blank" rel="noreferrer" title={uiText(`${market.label}：${market.conditions} 项官方条件同时满足，按价格升序`)}><Icon name="external" size={15} />{uiText("搜")}{uiText(market.label)} · {uiText(market.conditions)}{uiText(" 项")}</a>)}
      {!!picked.length && <button type="button" className="wb-text-button" onClick={() => setSelection({ basis, ids: [] })}>{uiText("清空")}</button>}
    </div><p className="lo-footnote da-market-note">{uiText("装备按整件词缀重算损失降序，组内词缀降序；总值不累加单条贡献。勾选后同部位联合检索、跨部位分别搜；四抗仍需整套核对。")}</p>{marketError && <p className="lo-alert" role="alert">{uiText(marketError)}</p>}{!result.items && <p className="lo-footnote">{uiText("请重新计算以读取装备汇总；旧的逐条结果不用于推算总贡献。")}</p>}<div className="da-item-groups">{uiText(activeGroups.map(renderGroup))}{otherGroups.length > 0 && <details className="da-other-groups"><summary>{uiText("其余装备 · ")}{uiText(otherGroups.length)}{uiText(" 件")}</summary>{uiText(otherGroups.map(renderGroup))}</details>}</div></>}
    <details><summary>{uiText("计算口径与依据")}</summary><p className="lo-footnote">{uiText("装备汇总同时移除本件全部词缀重算，保留底座、品质和孔数，按独立计算的 DPS 损失降序排列。组内词缀分别移除并排序，不能累加成装备总值。含待核对词缀时标记“已算部分”；整件效果无法隔离或所选技能失效时标为待核对，旧版无汇总结果需重新计算。")}</p><p className="lo-footnote">{uiText(result?.engine ?? 'PoB2 v0.23.1')}{uiText(" 保持整套、天赋、辅助及配置不变。技能组内各输出技能分别计算，不直接相加。损失率＝（当前 DPS－移除后 DPS）÷当前 DPS；移除后 DPS 可悬停差值查看。四抗与生存仍需满足整套约束。不同词缀共享乘区、转伤和条件，百分比不能相加成 100%。沿用 PoB 敌人配置与覆盖率，不将工坊“常驻”选项自动写入引擎。未选中的主动技能／非持续增益组停用，已选联动、持续增益与各组辅助保留；弹幕按所选输出分析，实际循环仍需核对。市场检索使用原生英文对应的官方编号，不把贡献率当作数值门槛或价格。同部位所选词缀同时满足，跨部位分别检索；传奇限定同名，珠宝保留已核对底座，其余装备不额外限底座；不额外限腐化，沿用配装预算。未知数值或数值优劣依赖机制的词缀只查存在。")}</p><a className="wb-link" href="https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/v0.23.1/src/Modules/Calcs.lua" target="_blank" rel="noreferrer">{uiText("PoB 原生计算依据 ↗")}</a></details>
  </section>;
}
