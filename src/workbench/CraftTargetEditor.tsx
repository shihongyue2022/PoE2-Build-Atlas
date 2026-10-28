import { uiText } from './uiLocale';
import { useState, type ReactNode } from 'react';
import { blueprintAffixSource, EMPTY_BLUEPRINT_CHOICES, type craftBlueprint, type CraftBlueprintChoices, type CraftBlueprintGoal } from './craftBlueprint';
import { blueprintCeiling } from './craftReference';
import { CRAFT_AFFIX_CATEGORIES, CRAFT_AFFIX_SOURCES, craftAffixCategory } from './craftAffixCategories';
import { translateMod } from './localization';

export default function CraftTargetEditor({ blueprint, choices, onChange, compact = false, status }: {
  blueprint: ReturnType<typeof craftBlueprint>; choices: CraftBlueprintChoices;
  onChange: (patch: Partial<CraftBlueprintChoices>) => void;
  compact?: boolean; status?: (goal: CraftBlueprintGoal) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const goals: CraftBlueprintGoal[] = choices.goals ?? blueprint.rows.map(row => ({
    key: row.key, ...(!row.added ? { referenceKey: row.key } : {}), side: row.mod?.type ?? row.side ?? 'prefix',
    modId: row.needsSource ? undefined : row.mod?.id, tierDisplay: row.needsTier ? undefined : row.tierDisplay,
    enabled: row.selected, category: row.mod ? craftAffixCategory(row.mod) : 'all',
  }));
  const mods = [...blueprint.mods.values()];
  function update(key: string, patch: Partial<CraftBlueprintGoal>) {
    onChange({ goals: goals.map(goal => goal.key === key ? { ...goal, ...patch } : goal) });
  }
  return <div className={`cb-editor${compact ? ' cb-editor-comparison' : ''}`}>
    <div className="wb-actions cb-editor-toolbar">
      <button type="button" className="wb-button" disabled={goals.length >= 12} onClick={() => onChange({ goals: [...goals, { key: `target:${crypto.randomUUID()}`, side: 'prefix', category: 'all', enabled: true }] })}>{uiText("＋ 添加词缀条目")}</button>
      <input aria-label={uiText("筛选可选词缀")} value={search} placeholder={uiText("查找属性，如混沌、点伤、魔力")} onChange={event => setSearch(event.target.value)} />
      <button className="wb-text-button" type="button" onClick={() => { setSearch(''); onChange({ ...EMPTY_BLUEPRINT_CHOICES, replacements: {}, extra: [], goals: undefined }); }}>{uiText("恢复样例词缀")}</button>
    </div>
    <div className="lo-table-scroll"><table className="lo-deltas cb-target-table"><thead><tr><th>{uiText("使用")}</th><th>{uiText("前后缀")}</th><th>{uiText("属性分类")}</th><th>{uiText("目标词缀 · 按来源分组")}</th><th>{uiText("阶层与范围")}</th><th>{uiText("来源／详情")}</th><th>{uiText("操作")}</th></tr></thead><tbody>{goals.map((goal, index) => {
      const mod = goal.modId ? blueprint.mods.get(goal.modId) : undefined;
      const row = blueprint.rows.find(row => row.key === goal.key);
      const label = goal.referenceKey ?? `新增条目 ${index + 1}`;
      const category = goal.category ?? (mod ? craftAffixCategory(mod) : 'all');
      const sideMods = mods.filter(entry => entry.type === goal.side);
      const candidates = sideMods.filter(entry => (category === 'all' || craftAffixCategory(entry) === category)
        && `${translateMod(entry.text)} ${entry.text}`.toLowerCase().includes(search.trim().toLowerCase()));
      const source = mod && goal.tierDisplay !== undefined ? blueprintAffixSource(mod, goal.tierDisplay) : undefined;
      return <tr key={goal.key} aria-label={uiText(`目标条目 ${index + 1}`)} className={!goal.enabled ? 'is-disabled' : undefined}>
        <td><input type="checkbox" aria-label={uiText(`选为目标：${label}`)} title={uiText("勾选为本次制作必须达到的目标，不代表游戏中的破裂锁定")} checked={goal.enabled} onChange={event => update(goal.key, { enabled: event.target.checked })} /></td>
        <td><select aria-label={uiText(`目标前后缀：${label}`)} value={goal.side} onChange={event => update(goal.key, { side: event.target.value as 'prefix' | 'suffix', category: 'all', modId: undefined, tierDisplay: undefined })}><option value="prefix">{uiText("前缀")}</option><option value="suffix">{uiText("后缀")}</option></select></td>
        <td><select aria-label={uiText(`目标分类：${label}`)} value={category} onChange={event => {
          const category = event.target.value;
          update(goal.key, { category, ...(mod && category !== 'all' && craftAffixCategory(mod) !== category ? { modId: undefined, tierDisplay: undefined } : {}) });
        }}><option value="all">{uiText("全部分类 · ")}{uiText(sideMods.length)}</option>{CRAFT_AFFIX_CATEGORIES.map(([id, label]) => {
          const count = sideMods.filter(entry => craftAffixCategory(entry) === id).length;
          return <option key={id} value={id} disabled={!count && category !== id}>{uiText(label)} · {uiText(count)}</option>;
        })}</select></td>
        <td><select aria-label={uiText(`目标属性：${label}`)} value={mod?.id ?? ''} onChange={event => {
          const mod = blueprint.mods.get(event.target.value); if (!mod) return;
          update(goal.key, { modId: mod.id, tierDisplay: blueprintCeiling(mod, blueprint.parsed.level ?? 1).atLevel?.display ?? mod.tiers[0]?.display });
        }}><option value="" disabled>{uiText("选择")}{uiText(goal.side === 'prefix' ? '前缀' : '后缀')}{uiText("属性…")}</option>
          {mod && !candidates.includes(mod) && <optgroup label={uiText("当前所选")}><option value={mod.id}>{uiText(translateMod(mod.text))}</option></optgroup>}
          {CRAFT_AFFIX_SOURCES.map(([source, label]) => {
            const group = candidates.filter(mod => mod.source === source);
            return group.length ? <optgroup key={source} label={uiText(label)}>{group.map(mod => <option key={mod.id} value={mod.id}>{uiText(translateMod(mod.text).replace(/\n/g, '；'))}</option>)}</optgroup> : null;
          })}
        </select>{goal.enabled && (!mod || row?.needsTier) && <small className="cb-editor-needed">{uiText(!mod ? '请选择属性' : '请选择阶层')}</small>}{uiText(status?.(goal))}</td>
        <td><select aria-label={uiText(`目标阶层：${label}`)} disabled={!mod} value={row?.needsTier ? '' : goal.tierDisplay ?? ''} onChange={event => update(goal.key, { tierDisplay: Number(event.target.value) })}><option value="" disabled>{uiText("选择目标阶层…")}</option>{mod?.tiers.map(tier => <option key={tier.display} value={tier.display}>T{uiText(tier.display)} · {uiText(tier.values.join(' / ') || tier.name)}{uiText(" · 物等 ")}{uiText(tier.ilvl)}+</option>)}</select></td>
        <td>{source ? <a className="wb-link" href={source.url} target="_blank" rel="noreferrer">{uiText(source.label)} ↗</a> : <span className="wb-fine">{uiText("待选择")}</span>}
          {mod && <details><summary>{uiText("范围与依据")}</summary><div className="cb-target-detail">
            {row?.ceiling?.atLevel && <p>{uiText("样例物等 ")}{uiText(blueprint.parsed.level)}{uiText(" 上限 T")}{uiText(row.ceiling.atLevel.display)} · {uiText(row.ceiling.atLevel.values.join(' / '))}</p>}
            {row?.ceiling?.highest && <p>{uiText("本词池最高 T")}{uiText(row.ceiling.highest.display)} · {uiText(row.ceiling.highest.values.join(' / '))}{uiText(" · 物等 ")}{uiText(row.ceiling.highest.ilvl)}+</p>}
            {source && <p>{uiText(source.mechanism)}</p>}<p>{uiText(mod.text)}</p>
            {row?.fractured && <p>{uiText("样例有破裂标记，实际底装的锁定状态需另行导入核对。")}</p>}
          </div></details>}
        </td>
        <td><button type="button" className="wb-text-button cb-remove-target" aria-label={uiText(`删除目标：${label}`)} title={uiText("删除条目")} onClick={() => onChange({ goals: goals.filter(entry => entry.key !== goal.key) })}>×</button></td>
      </tr>;
    })}</tbody></table></div>
    {!goals.length && <p className="wb-fine">{uiText("点击「添加词缀条目」开始选择，或恢复样例词缀。")}</p>}
    <p className="wb-fine cb-editor-note">{uiText("每行选属性与阶层；来源在属性菜单内分组。前后缀槽位、同组互斥与精华／合金限制按当前底座校验。")}</p>
  </div>;
}
