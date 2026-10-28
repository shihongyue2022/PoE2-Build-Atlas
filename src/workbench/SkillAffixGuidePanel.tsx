import { uiText } from './uiLocale';
import { publicAssetUrl } from './workbenchRuntime';
import { useMemo, useState } from 'react';
import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import type { LoadoutState } from './loadout';
import { localizeEquipmentName } from './genericEquipment';
import { skillPlan, type MainSkillSelection } from './skillRecommendation';
import { skillAffixDirections, skillFamilyLabel, skillGuideFacts, skillRuneLabel, skillRuneUrl, SKILL_GUIDE_CHECKED, SKILL_GUIDE_SOURCES, type SkillAffixSearch } from './skillAffixGuide';
import { englishPoe2dbUrl } from './poe2dbReference';
import SkillGemButton, { SkillGemArt } from './SkillGemButton';
import SkillLinkPicker from './SkillLinkPicker';
import { IconButton } from './WorkbenchIcon';
import { focusRoutineSkill, routineSkillChoices, skillSelectionKey } from './skillRoutine';

export interface SkillInspection { selection: MainSkillSelection; focusSupport?: { name: string; label: string } }
export default function SkillAffixGuidePanel({ state, inspection, data, trade, onSave, onSearch, onClose }: {
  state: LoadoutState; inspection: SkillInspection; data?: PatchData; trade?: GearTrade | null;
  onSave: (state: LoadoutState) => boolean; onSearch?: (request: SkillAffixSearch) => void; onClose: () => void;
}) {
  const [selection, setSelection] = useState(inspection.selection);
  const [focusSupport, setFocusSupport] = useState(inspection.focusSupport);
  const preview = useMemo(() => {
    try { return focusRoutineSkill(state, selection); }
    catch { return { ...state, goals: { ...state.goals, mainSkill: selection } }; }
  }, [state, selection]);
  const savedSelection = preview.goals.mainSkill ?? selection;
  const configuredSkill = routineSkillChoices(state).find((entry) => entry.key === skillSelectionKey(selection));
  const plan = skillPlan(preview), current = skillPlan(state);
  const directions = useMemo(() => skillAffixDirections(preview, data, trade), [preview, data, trade]);
  const [family, setFamily] = useState('all'), [expanded, setExpanded] = useState(false), [places, setPlaces] = useState<Record<string, string>>({}), [tiers, setTiers] = useState<Record<string, string>>({});
  const families = [...new Set(directions.map((entry) => entry.family))];
  const facts = plan ? skillGuideFacts(plan.name, plan.supports) : [];
  const focusedFacts = focusSupport ? facts.filter((entry) => entry.label.startsWith(focusSupport.label)) : facts.filter((entry) => /单体命中限制|投速参与增伤/.test(entry.label));
  const keyFacts = focusedFacts.length ? focusedFacts : facts.slice(0, 2), otherFacts = facts.filter((entry) => !keyFacts.includes(entry));
  const isMain = current?.key === plan?.key && current?.name === plan?.name && !!plan;
  const unchanged = isMain && JSON.stringify(state.goals.mainSkill?.links ?? []) === JSON.stringify(selection.links ?? []);
  const filtered = family === 'all' ? directions : directions.filter((entry) => entry.family === family);
  const visible = expanded ? filtered : filtered.slice(0, 8);
  return <section className="ca-skill-guide" aria-label={uiText("技能增伤与装备检索")}>
    <div className="wb-section-head"><h4 className="sg-guide-title">{(plan || configuredSkill) && <SkillGemArt name={plan?.name ?? configuredSkill!.name} />}{uiText(plan?.label ?? configuredSkill?.label ?? inspection.selection.name ?? '技能')}{uiText(" · 增伤与装备")}</h4><IconButton icon="close" label={uiText("收起增伤与装备")} onClick={onClose} /></div>
    {!plan ? <><p className="lo-footnote">{uiText(configuredSkill ? '此主动技能作为增益／联动保留。加入上方技能组后，可在下方伤害词缀排行选择它，查看已核对的输出联动；自身不单独生成输出装备检索。' : '此技能未启用、属于另一武器组或资料未匹配。请先核对技能配置，再生成装备检索。')}</p>
      {configuredSkill && <a className="wb-link" href={englishPoe2dbUrl(configuredSkill.name)} target="_blank" rel="noreferrer">{uiText(configuredSkill.label)}{uiText("技能原文 ↗")}</a>}
      {configuredSkill && <div className="sg-support-strip">{configuredSkill.supports.map((support) => <SkillGemButton key={support.name} name={support.name} label={uiText(support.label)} support onClick={() => setFocusSupport(support)} />)}</div>}
      {focusSupport && <a className="wb-link" href={englishPoe2dbUrl(focusSupport.name)} target="_blank" rel="noreferrer">{uiText(focusSupport.label)}{uiText("原文 ↗")}</a>}</> : <>
      <div className="lo-actions"><button type="button" className="wb-button" disabled={unchanged} onClick={() => onSave(preview)}>{uiText(state.goals.skillBar !== undefined ? isMain ? '当前检索重点' : '作为装备检索重点' : unchanged ? '当前主输出' : isMain ? '保存联动方案' : '设为主要输出技能')}</button><a className="wb-link" href={englishPoe2dbUrl(plan.name)} target="_blank" rel="noreferrer">{uiText("技能原文 ↗")}</a>{focusSupport && <a className="wb-link" href={englishPoe2dbUrl(focusSupport.name)} target="_blank" rel="noreferrer">{uiText(focusSupport.label)}{uiText("原文 ↗")}</a>}</div>
      <div className="sg-support-strip" role="group" aria-label={uiText("查阅辅助机制")}>{plan.supports.map((support) => <SkillGemButton key={support.name} name={support.name} label={uiText(support.label)} support selected={focusSupport?.name === support.name}
        onClick={() => setFocusSupport(support)} />)}</div>
      {state.goals.skillBar === undefined && <SkillLinkPicker state={state} selection={selection} name={plan.name} onChange={setSelection} />}
      {state.goals.skillBar !== undefined && <details><summary>{uiText("组合联动 · ")}{uiText(plan.notes.filter((note) => note.startsWith('联动')).length)}{uiText(" 项")}</summary>{plan.notes.filter((note) => note.startsWith('联动')).map((note) => <p key={note} className="lo-footnote">{uiText(note)}</p>)}</details>}
      <p className="lo-footnote">{uiText("选词缀 → 部位／档位 → 放大镜检索。方向按机制匹配排序，实际 DPS 需 PoB 重算。")}</p>
      {focusSupport && !plan.supports.some((entry) => entry.name === focusSupport.name) && <p className="lo-alert">{uiText("此辅助在当前配置中未启用，不用于本次增伤推荐；可查阅原文后再决定是否启用。")}</p>}
      {keyFacts.length > 0 && <details className="ca-skill-facts"><summary>{uiText("技能与辅助机制 · ")}{uiText(facts.length)}{uiText(" 项")}</summary>{keyFacts.map((fact) => <p key={fact.label} className="lo-footnote"><b>{uiText(fact.label)}</b>：{uiText(fact.detail)} <a className="wb-link" href={fact.url} target="_blank" rel="noreferrer">{uiText("依据 ↗")}</a></p>)}{otherFacts.length > 0 && <details><summary>{uiText("其余技能与辅助机制 · ")}{uiText(otherFacts.length)}{uiText(" 项")}</summary>{otherFacts.map((fact) => <p key={fact.label} className="lo-footnote"><b>{uiText(fact.label)}</b>：{uiText(fact.detail)} <a className="wb-link" href={fact.url} target="_blank" rel="noreferrer">{uiText("依据 ↗")}</a></p>)}</details>}</details>}
      {plan.warnings.length > 0 && <details className="ca-guide-warnings"><summary>{uiText("伤害快照待核对 · ")}{uiText(plan.warnings.length)}{uiText(" 项")}</summary>{plan.warnings.map((warning) => <p className="lo-footnote" key={warning}>{uiText(warning)}</p>)}</details>}
      <div className="ca-skill-filter"><label>{uiText("增伤方向")}<select aria-label={uiText("筛选技能增伤方向")} value={family} onChange={(event) => setFamily(event.target.value)}><option value="all">{uiText("全部方向 · ")}{uiText(directions.length)}{uiText(" 条")}</option>{families.map((key) => <option key={key} value={key}>{uiText(skillFamilyLabel(key))}</option>)}</select></label><small className="lo-footnote">{uiText("前后缀／需解锁词池 · 规则 ")}{uiText(data?.patch ?? '加载中')}</small></div>
      {!data || !trade ? <p role="status" className="lo-footnote">{uiText("正在加载装备词池与官方交易映射。")}</p> : !directions.length ? <p className="lo-footnote">{uiText("当前技能／底座暂无可核验的普通增伤词缀，保留原文核对入口，不编造属性或阶层。")}</p> : <div className="ca-affix-directions"><div className="lo-table-scroll ca-affix-scroll"><table className="ca-affix-table" aria-label={uiText("技能增伤词缀检索表")}><thead><tr><th>{uiText("词缀 · 点开机制")}</th><th>{uiText("部位 / 前后缀")}</th><th>{uiText("档位 / 物等")}</th><th>{uiText("T1 范围")}</th><th aria-label={uiText("检索")} /></tr></thead><tbody>{visible.map((direction) => {
        const location = direction.locations.find((entry) => `${entry.slot}:${entry.baseId}` === places[direction.ref]) ?? direction.locations[0]!;
        const choices = location.row.targetTiers!.filter((entry) => entry.tier <= 3).sort((a, b) => b.tier - a.tier);
        const preset = choices.some((entry) => `tier:${entry.tier}` === tiers[direction.ref]) ? tiers[direction.ref]! : `tier:${choices[0]!.tier}`;
        return <tr key={direction.ref} className="ca-affix-direction"><td><details><summary><strong>{uiText(direction.label)}</strong><small>{uiText(skillFamilyLabel(direction.family))}{uiText(location.row.requiredRune ? ' · 需符文解锁' : '')}</small></summary><p className="lo-footnote">{uiText(direction.reason)}</p>
          <p className="lo-footnote">{uiText("可出现：")}{uiText([...new Set(direction.locations.map((entry) => entry.slotLabel))].join('、'))}。</p>
          {location.row.requiredRune && <p className="lo-footnote">{uiText("词池前提：需")}{uiText(skillRuneLabel(location.row.requiredRune))}{uiText("解锁。此项是符文开放的装备前后缀，不是镶嵌符文就直接获得这条数值。 ")}<a className="wb-link" href={skillRuneUrl(location.row.requiredRune)} target="_blank" rel="noreferrer">{uiText("词池依据 ↗")}</a></p>}
          <p className="lo-footnote">{uiText("本部位 T1 roll：")}{uiText(location.row.targetRange!.min)}–{uiText(location.row.targetRange!.max)}{uiText("；检索普通词缀，原传奇独有机制需另行核对。")}</p></details></td>
          <td><select aria-label={uiText(`检索部位：${direction.label}`)} title={uiText(`${location.slotLabel} · ${localizeEquipmentName(location.baseName)} · ${location.row.affixType === 'prefix' ? '前缀' : '后缀'}`)} value={`${location.slot}:${location.baseId}`} onChange={(event) => setPlaces((old) => ({ ...old, [direction.ref]: event.target.value }))}>{direction.locations.map((entry) => <option key={`${entry.slot}:${entry.baseId}`} value={`${entry.slot}:${entry.baseId}`}>{uiText(entry.slotLabel)} · {uiText(localizeEquipmentName(entry.baseName))} · {uiText(entry.row.affixType === 'prefix' ? '前缀' : '后缀')}</option>)}</select></td>
          <td><select aria-label={uiText(`检索档位：${direction.label}`)} value={preset} onChange={(event) => setTiers((old) => ({ ...old, [direction.ref]: event.target.value }))}>{choices.map((entry) => <option key={entry.tier} value={`tier:${entry.tier}`}>T{uiText(entry.tier)} · ≥{uiText(entry.min)}{uiText(" · 物等")}{uiText(entry.requiredLevel)}</option>)}</select></td>
          <td className="ca-affix-range" title={uiText("本部位普通词缀的 T1 roll 范围")}>{uiText(location.row.targetRange!.min)}–{uiText(location.row.targetRange!.max)}</td>
          <td><IconButton icon="search" label={uiText(isMain ? '检索这条词缀' : state.goals.skillBar !== undefined ? '按此技能检索' : '以此为主输出并检索')} disabled={!onSearch} onClick={() => { if (onSave(preview)) onSearch?.({ selection: savedSelection, slot: location.slot, baseId: location.baseId, ref: direction.ref, preset, requiredRune: location.row.requiredRune }); }} /></td>
        </tr>;
      })}</tbody></table></div>{filtered.length > 8 && <button type="button" className="wb-text-button" onClick={() => setExpanded((old) => !old)}>{uiText(expanded ? '收起更多词缀' : `展开其余 ${filtered.length - 8} 条词缀`)}</button>}</div>}
      <details><summary>{uiText("数据来源与适用边界")}</summary><p className="lo-footnote">{uiText("技能、辅助与机制核对：")}{uiText(SKILL_GUIDE_CHECKED)}{uiText("。技能资料、版本变更和普通词池各自保留来源；词池版本不代表已自动更新到当前游戏。当前伤害快照仍属于原 PoB 保存的技能，点击其他技能不会借用那份 DPS。")}</p><div className="lo-actions"><a className="wb-link" href={SKILL_GUIDE_SOURCES.modifiers} target="_blank" rel="noreferrer">{uiText("英文词缀资料 ↗")}</a><a className="wb-link" href={SKILL_GUIDE_SOURCES.official} target="_blank" rel="noreferrer">{uiText("GGG 技能更新说明 ↗")}</a><a className="wb-link" href={SKILL_GUIDE_SOURCES.pob} target="_blank" rel="noreferrer">{uiText("PoB2 技能数据 ↗")}</a><a className="wb-link" href={publicAssetUrl("/images/skills/manifest.json")} target="_blank" rel="noreferrer">{uiText("GGG 图标来源 ↗")}</a></div><p className="lo-footnote">{uiText("抗性仍是整套约束；这里只选增伤方向，不自动换装，不推算未配置的地面、盛怒、敌人抗性或覆盖率。")}</p></details>
    </>}
  </section>;
}
