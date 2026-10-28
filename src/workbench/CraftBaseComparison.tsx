import { uiText } from './uiLocale';
import type { EngineMod } from '../lib/engine';
import { type WorkbenchItemImport } from './itemImport';
import { type ActualBaseChoices, type craftBlueprint, type CraftBlueprintChoices, type CraftBlueprintGoal } from './craftBlueprint';
import { CRAFT_AFFIX_CATEGORIES, craftAffixCategory } from './craftAffixCategories';
import { translateBase, translateMod, translateModAtTier } from './localization';
import { modFamilies } from '../lib/engineTypes';
import CraftTargetEditor from './CraftTargetEditor';

export default function CraftBaseComparison({ parsed, blueprint, choices, actualChoices, onActualChange, onGoalChange }: {
  parsed: WorkbenchItemImport; blueprint: ReturnType<typeof craftBlueprint>; choices: CraftBlueprintChoices; actualChoices: ActualBaseChoices;
  onActualChange: (choices: ActualBaseChoices) => void; onGoalChange: (patch: Partial<CraftBlueprintChoices>) => void;
}) {
  const held = [...parsed.prefixes, ...parsed.suffixes];
  const required = [...new Set([...blueprint.targets.map(target => target.modId), ...held.filter(entry => entry.fractured).map(entry => entry.modId)])].map(id => blueprint.mods.get(id));
  const prefixes = required.filter(mod => mod?.type === 'prefix').length, suffixes = required.filter(mod => mod?.type === 'suffix').length;
  const conflicts = (mod: EngineMod) => held.filter(entry => {
    const current = blueprint.mods.get(entry.modId);
    return entry.fractured && entry.modId !== mod.id && current && modFamilies(current).some(family => modFamilies(mod).includes(family));
  });
  function goalStatus(goal: CraftBlueprintGoal) {
    if (!goal.enabled) return <small className="cb-compare-status">{uiText("未选为本次目标")}</small>;
    const mod = goal.modId && blueprint.mods.get(goal.modId);
    if (!mod || goal.tierDisplay === undefined) return null;
    const current = held.find(entry => entry.modId === mod.id);
    const message = current ? current.tierDisplay <= goal.tierDisplay ? `底装已有 T${current.tierDisplay} · 已达标${current.fractured ? ' · 破裂' : ''}`
      : `底装 T${current.tierDisplay} → 目标 T${goal.tierDisplay}${current.fractured ? ' · 破裂不可升阶' : ' · 需升级'}`
      : conflicts(mod).length ? '与底装破裂词缀同组冲突' : '底装尚无 · 需要新增';
    return <small className={`cb-compare-status${current && current.tierDisplay <= goal.tierDisplay ? ' is-met' : ' is-needed'}`}>{uiText(message)}</small>;
  }
  return <section className="cb-comparison" aria-label={uiText("底装与目标词缀对比")}>
    <section className="cb-comparison-side" aria-label={uiText("实际底装词缀校正")}>
      <h4>{uiText("实际底装 · ")}{uiText(translateBase(parsed.baseNameEnglish ?? parsed.baseName))}</h4>
      <p className="wb-fine">{uiText("物等 ")}{uiText(parsed.level ?? '待确认')}{uiText(" · 已识别 ")}{uiText(parsed.prefixes.length)}{uiText(" 前 / ")}{uiText(parsed.suffixes.length)}{uiText(" 后。下拉仅校正原文匹配到的属性与阶层，真实状态以游戏为准。")}</p>
      <div className="cb-held-rows">{parsed.rows.map((row, index) => {
        const mod = row.modId ? blueprint.mods.get(row.modId) : undefined;
        const category = mod && CRAFT_AFFIX_CATEGORIES.find(([id]) => id === craftAffixCategory(mod))?.[1];
        const goal = mod && blueprint.targets.find(target => target.modId === mod.id);
        return <div className="cb-held-row" key={row.key} role="group" aria-label={uiText(`底装词缀 ${index + 1}`)}>
          <div className="cb-held-text"><span className="wb-tag">{uiText((mod?.type ?? row.side) === 'prefix' ? '前' : '后')} · {uiText(category ?? '待识别')}</span>{row.fractured && <strong className="cb-fracture">{uiText("破裂锁定")}</strong>}
            <p>{uiText(translateMod(row.lines.join('；')))}</p>
            <small className="cb-compare-status">{uiText(goal ? row.tierDisplay !== undefined && row.tierDisplay <= goal.tierDisplay ? '当前已达目标阶层' : row.fractured ? '破裂不可升阶，请调整右侧目标' : '需要升级到目标阶层' : row.fractured ? '必须保留，占用一个词缀槽位' : '未选为目标，可参与后续替换')}</small>
          </div>
          <div className="cb-held-controls"><select aria-label={uiText(`底装属性校正：${index + 1}`)} value={row.modId ?? ''} onChange={event => {
            const tiers = { ...actualChoices.tiers }; delete tiers[row.key];
            onActualChange({ ...actualChoices, modIds: { ...actualChoices.modIds, [row.key]: event.target.value }, tiers });
          }}>
            <option value="" disabled>{uiText("选择原文匹配属性…")}</option>{row.modIds.map(id => { const entry = blueprint.mods.get(id); return entry && <option key={id} value={id}>{uiText(translateMod(entry.text))}</option>; })}
          </select><select aria-label={uiText(`底装阶层校正：${index + 1}`)} value={row.tierDisplay ?? ''} disabled={!mod} onChange={event => onActualChange({ ...actualChoices, tiers: { ...actualChoices.tiers, [row.key]: Number(event.target.value) } })}>
            <option value="" disabled>{uiText("选择原文阶层…")}</option>{row.tiers.map(tier => <option key={tier.display} value={tier.display}>T{uiText(tier.display)} · {uiText(mod?.tiers.find(entry => entry.display === tier.display)?.values.join(' / ') ?? tier.name)}</option>)}
          </select></div>
          {row.canSplit && <button type="button" className="wb-text-button" onClick={() => onActualChange({ ...actualChoices, split: [...new Set([...actualChoices.split, row.key])] })}>{uiText("按两条词缀分别识别")}</button>}
        </div>;
      })}</div>
      {!parsed.rows.length && <p className="wb-fine">{uiText("无显式词缀，从当前空余槽位规划。")}</p>}
      {!!parsed.unmatchedLines.length && <p className="wb-inline-warning">{uiText("待识别原文：")}{uiText(parsed.unmatchedLines.join('；'))}{uiText("。请补齐游戏原文后重新导入。")}</p>}
      {!!parsed.warnings.length && <details><summary>{uiText("读取提示 · ")}{uiText(parsed.warnings.length)}</summary>{parsed.warnings.map((message, index) => <p className="wb-fine" key={index}>{uiText(message)}</p>)}</details>}
      {!!held.filter(entry => entry.fractured).length && <p className="wb-fine">{uiText("必须保留：")}{uiText(held.filter(entry => entry.fractured).map(entry => { const mod = blueprint.mods.get(entry.modId); return mod ? translateModAtTier(mod, entry.tierDisplay) : entry.modId; }).join('；'))}</p>}
    </section>
    <section className="cb-comparison-side" aria-label={uiText("本次制作目标微调")}><h4>{uiText("目标装备 · 锁定本次要做的词缀")}</h4>
      <p className="wb-fine">{uiText("勾选为必须达到的目标，取消不需要的属性；与第 2 步同步。底装破裂锁定始终占槽，勾选目标不会让普通词缀变成破裂。")}</p>
      <p aria-label={uiText("含破裂的目标槽位")} className={prefixes > blueprint.limits.prefixes || suffixes > blueprint.limits.suffixes ? 'wb-inline-warning' : 'wb-fine'}>{uiText("最终需占用 前缀 ")}{uiText(prefixes)}/{uiText(blueprint.limits.prefixes)}{uiText(" · 后缀 ")}{uiText(suffixes)}/{uiText(blueprint.limits.suffixes)}{uiText("（含底装破裂）")}</p>
      <CraftTargetEditor blueprint={blueprint} choices={choices} onChange={onGoalChange} compact status={goalStatus} />
    </section>
  </section>;
}
