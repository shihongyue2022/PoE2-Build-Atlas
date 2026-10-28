import { listMods, listPerfectEssences, listDesecrated, type Engine, type EngineMod, type ExistingItem, type TargetInput } from '../lib/engine';
import type { PasteChoices } from '../lib/pasteItem';
import { parseWorkbenchItem } from './itemImport';
import { findJewelleryBase } from './catalog';
import { translateCurrency, translateModAtTier } from './localization';
import { validateCraft, type CraftOptions } from './model';
import { buildFlexibleTrade, buildTradeFilterRows, tradeLineRangeMapping, type FlexibleTradeDocument } from './tradeSearch';
import { TRADE_CATEGORY, type GearTrade } from '../lib/gearTrade';
import { buildEquipmentTrade } from './genericEquipmentTrade';
import { englishPoe2dbUrl } from './poe2dbReference';
import { localizeEquipmentName, matchEquipmentStat, parseEquipment } from './genericEquipment';
import { craftReference, blueprintCeiling } from './craftReference';
import { modFamilies } from '../lib/engineTypes';
import { DEFAULT_TRADE_STATUS } from './tradeStatus';

export interface CraftBlueprintChoices {
  modIds: Record<string, string>; tiers: Record<string, number>; split: string[]; excluded: string[];
  /** Target substitutions are independent of answers about the original paste. */
  replacements?: Record<string, string>;
  extra?: { modId: string; tierDisplay: number }[];
  /** Editable targets have stable keys and are independent of the copied reference. */
  goals?: CraftBlueprintGoal[];
}
export interface CraftBlueprintGoal {
  key: string; referenceKey?: string; modId?: string; tierDisplay?: number;
  side: 'prefix' | 'suffix'; category?: string; enabled: boolean;
}
export interface ActualBaseChoices { modIds: Record<string, string>; tiers: Record<string, number>; split: string[] }
export const EMPTY_ACTUAL_CHOICES: ActualBaseChoices = { modIds: {}, tiers: {}, split: [] };
export const actualPasteChoices = (choices: ActualBaseChoices = EMPTY_ACTUAL_CHOICES): PasteChoices => ({
  modId: new Map(Object.entries(choices.modIds)), tier: new Map(Object.entries(choices.tiers)), split: new Set(choices.split),
});
export const EMPTY_BLUEPRINT_CHOICES: CraftBlueprintChoices = { modIds: {}, tiers: {}, split: [], excluded: [] };
export function blueprintMods(engine: Engine, baseId: string): ReadonlyMap<string, EngineMod> {
  const ordinary = listMods(engine.data, baseId);
  return new Map([...ordinary.prefixes, ...ordinary.suffixes, ...listPerfectEssences(engine.data, baseId), ...listDesecrated(engine.data, baseId)].map(mod => [mod.id, mod]));
}

/** The copied finished item supplies goals, never an owned starting state. */
export function craftBlueprint(engine: Engine, raw: string, choices: CraftBlueprintChoices = EMPTY_BLUEPRINT_CHOICES, levelFloor = 0) {
  // A requested target tier may differ from the reference's roll. It is not an
  // answer about what tier the copied item currently owns.
  const answers: PasteChoices = { modId: new Map(Object.entries(choices.modIds)), tier: new Map(), split: new Set(choices.split) };
  const parsed = parseWorkbenchItem(engine.data, raw, answers, true);
  if (!parsed?.baseId) throw new Error('未能确认成品的原生底座与词缀池；请复制完整文本，未知底座不套用其他装备的规则。');
  const researchOnly = !['Rings', 'Amulets'].includes(parsed.baseId);
  const base: { english: string; supported: boolean; unsupportedReason?: string } | undefined = findJewelleryBase(parsed.baseNameEnglish ?? parsed.baseName)
    ?? (researchOnly && parsed.baseNameEnglish ? { english: parsed.baseNameEnglish, supported: true } : undefined);
  const mods = blueprintMods(engine, parsed.baseId);
  const reference = craftReference(parsed);
  const originals = parsed.rows.map(row => {
    const originalMod = row.modId ? mods.get(row.modId) : undefined;
    const replacement = choices.replacements?.[row.key];
    const mod = replacement ? mods.get(replacement) : originalMod;
    const copied = reference.affixes.get(row.key);
    // A numeric game header is usable only when that tier exists and the
    // unboosted roll resolver independently agrees. Contradictory imports remain
    // reviewable instead of silently trusting a T1 label pasted onto a T5 roll.
    const headerTier = copied?.statedTier !== undefined && row.tiers.some(tier => tier.display === copied.statedTier)
      ? copied.statedTier : undefined;
    const tierConflict = copied?.statedTier !== undefined && headerTier === undefined;
    const referenceTier = headerTier ?? row.tierDisplay;
    const selected = !choices.excluded.includes(row.key);
    const needsSource = !replacement && row.canSplit && !choices.modIds[row.key];
    const requestedTier = choices.tiers[row.key];
    const tierDisplay = requestedTier === undefined ? replacement ? mod && blueprintCeiling(mod, parsed.level ?? 1).atLevel?.display : referenceTier
      : mod?.tiers.some(tier => tier.display === requestedTier) ? requestedTier : undefined;
    const needsTier = tierDisplay === undefined || !replacement && (row.sanctified || tierConflict) && requestedTier === undefined;
    return { ...row, tierDisplay, mod, selected, needsSource, needsTier, copied, referenceTier, originalMod, added: false, tierConflict,
      ceiling: mod ? blueprintCeiling(mod, parsed.level ?? 1) : undefined };
  });
  const extra = (choices.extra ?? []).slice(0, 6).map((entry, index) => {
    const mod = mods.get(entry.modId), key = `pool:${index}:${entry.modId}`;
    const tierDisplay = choices.tiers[key] ?? entry.tierDisplay;
    return { key, lines: [] as readonly string[], modIds: [entry.modId], modId: entry.modId, tiers: [], side: mod?.type,
      fractured: false, desecrated: false, canSplit: false, sanctified: false, tierDisplay, mod, selected: !choices.excluded.includes(key),
      needsSource: !mod, needsTier: !mod?.tiers.some(tier => tier.display === tierDisplay), copied: undefined, referenceTier: undefined,
      originalMod: undefined, added: true, tierConflict: false, ceiling: mod ? blueprintCeiling(mod, parsed.level ?? 1) : undefined };
  });
  const rows = choices.goals === undefined ? [...originals, ...extra] : choices.goals.slice(0, 12).map(goal => {
    const reference = originals.find(row => row.key === goal.referenceKey);
    const candidate = goal.modId ? mods.get(goal.modId) : undefined;
    const mod = candidate?.type === goal.side ? candidate : undefined;
    return { key: goal.key, lines: reference?.lines ?? [], modIds: reference?.modIds ?? [], modId: goal.modId,
      tiers: reference?.tiers ?? [], side: goal.side, category: goal.category,
      fractured: reference?.fractured ?? false, desecrated: reference?.desecrated ?? false,
      canSplit: false, sanctified: false, tierDisplay: goal.tierDisplay, mod,
      selected: goal.enabled, needsSource: !mod, needsTier: !mod?.tiers.some(tier => tier.display === goal.tierDisplay),
      copied: reference?.copied, referenceTier: reference?.referenceTier, originalMod: reference?.originalMod,
      added: !reference, tierConflict: false, ceiling: mod ? blueprintCeiling(mod, parsed.level ?? 1) : undefined };
  });
  const targets: TargetInput[] = rows.flatMap(row => row.selected && row.mod && !row.needsSource && !row.needsTier && row.tierDisplay !== undefined
    ? [{ modId: row.mod.id, tierDisplay: row.tierDisplay }] : []);
  const minimumLevel = Math.max(1, ...targets.map(entry => mods.get(entry.modId)!.tiers.find(tier => tier.display === entry.tierDisplay)!.ilvl));
  const item: ExistingItem = { baseId: parsed.baseId, level: Math.max(minimumLevel, levelFloor), rarity: 'normal', prefixes: [], suffixes: [] };
  const options: CraftOptions = { strengths: true, omens: true, essences: true, desecration: targets.some(entry => mods.get(entry.modId)?.source === 'desecrated') };
  const issues = [
    ...(parsed.rarity === 'unique' ? ['传奇固定词缀不使用这套普通制作规则。'] : []),
    ...(!base?.supported ? [base?.unsupportedReason ?? '底座未确认，请重新复制具体底座名称。'] : []),
    ...(parsed.unmatchedLines.length ? [`${parsed.unmatchedLines.length} 行词缀尚未识别，不能声称复刻完整成品；请补齐原文或改用资料完整的样例。`] : []),
    ...(rows.some(row => row.selected && (!row.mod || row.needsSource || row.needsTier)) ? ['请在表格中选择待确认的词缀来源／目标阶层。'] : []),
    ...(targets.length ? [] : ['请至少选择一条目标词缀。']),
  ];
  // Other slots share the research workflow, while their execution rules remain
  // outside validateCraft. Check their native limits/families here; never run
  // their cost calculation through the jewellery solver.
  const invalid = researchOnly ? researchTargetIssue(engine, item.baseId, targets, mods) : validateCraft(item, targets, mods, options);
  if (invalid && !issues.includes(invalid)) issues.push(invalid);
  const selectedMods = rows.filter(row => row.selected && row.mod).map(row => row.mod!);
  const slots = { prefixes: selectedMods.filter(mod => mod.type === 'prefix').length, suffixes: selectedMods.filter(mod => mod.type === 'suffix').length,
    crafted: selectedMods.filter(mod => ['essence', 'perfect', 'alloy'].includes(mod.source)).length };
  return { parsed, base, mods, rows, referenceRows: originals, targets, minimumLevel, item, options, issues, reference, slots, researchOnly,
    limits: engine.data.bases.get(item.baseId)?.limits ?? { prefixes: 3, suffixes: 3, crafted: 1 },
    tradeCategory: parseEquipment(raw)?.category };
}

function researchTargetIssue(engine: Engine, baseId: string, targets: TargetInput[], mods: ReadonlyMap<string, EngineMod>) {
  const limits = engine.data.bases.get(baseId)?.limits ?? { prefixes: 3, suffixes: 3, crafted: 1 };
  const families = new Set<string>();
  let prefixes = 0, suffixes = 0, crafted = 0;
  for (const target of targets) {
    const mod = mods.get(target.modId);
    if (!mod?.tiers.some(tier => tier.display === target.tierDisplay)) return '存在无法识别的词缀或阶层。';
    const isCrafted = ['essence', 'perfect', 'alloy'].includes(mod.source);
    const groups = modFamilies(mod);
    if (groups.some(group => families.has(group))) return '同组词缀互斥，请移除冲突词缀。';
    groups.forEach(group => families.add(group));
    if (mod.type === 'prefix') prefixes++; else suffixes++;
    if (isCrafted) crafted++;
  }
  if (prefixes > limits.prefixes || suffixes > limits.suffixes) return `该底座最多允许 ${limits.prefixes} 前缀 / ${limits.suffixes} 后缀。`;
  return crafted > limits.crafted ? `该底座最多允许 ${limits.crafted} 条精华／合金制作词缀。` : null;
}

export type BlueprintBaseRarity = 'nonunique' | 'normal' | 'magic' | 'rare';
export function blueprintBaseTrade(blueprint: ReturnType<typeof craftBlueprint>, league: string, options: { rarity?: BlueprintBaseRarity; minimumLevel?: number } = {}) {
  if (!blueprint.base || !blueprint.targets.length || blueprint.issues.length) return undefined;
  league = league.trim();
  if (!league) throw new Error('请先选择官方交易赛季。');
  const rarity = options.rarity ?? 'nonunique', minimumLevel = options.minimumLevel ?? blueprint.item.level;
  if (!['nonunique', 'normal', 'magic', 'rare'].includes(rarity)) throw new Error('底材稀有度只能选择非传奇、普通、魔法或稀有。');
  if (!Number.isInteger(minimumLevel) || minimumLevel < blueprint.minimumLevel || minimumLevel > 100) throw new Error(`底装物等不能低于目标所需的 ${blueprint.minimumLevel}。`);
  if (blueprint.researchOnly) {
    if (!blueprint.tradeCategory) return undefined;
    const query: FlexibleTradeDocument = { query: { type: blueprint.base.english, status: { option: DEFAULT_TRADE_STATUS },
      stats: [{ type: 'and', filters: [], disabled: false }], filters: {
        type_filters: { filters: { category: { option: blueprint.tradeCategory }, rarity: { option: rarity } } },
        misc_filters: { filters: { ilvl: { min: minimumLevel }, corrupted: { option: 'false' }, mirrored: { option: 'false' } } },
      } }, sort: { price: 'asc' } };
    return { query, url: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(query))}` };
  }
  const initial = buildFlexibleTrade({ league, baseId: blueprint.item.baseId, baseName: blueprint.base.english, rarity, itemLevelMin: minimumLevel, rows: [] });
  const query: FlexibleTradeDocument = { ...initial.query, query: { ...initial.query.query,
    filters: { ...initial.query.query.filters, misc_filters: { filters: { ...initial.query.query.filters.misc_filters?.filters, corrupted: { option: 'false' }, mirrored: { option: 'false' } } } } } };
  return { query, url: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(query))}` };
}

/** Buy an already-affixed base using the same AND/alias semantics as official pricing.
 * Thresholds come from the chosen raw tiers, never the reference item's boosted rolls.
 * Incomplete mappings must not quietly broaden a purchase query.
 */
export function blueprintTargetTrade(engine: Engine, blueprint: ReturnType<typeof craftBlueprint>, trade: GearTrade, league: string) {
  if (blueprint.issues.length) throw new Error(blueprint.issues[0]);
  const category = blueprint.tradeCategory ?? TRADE_CATEGORY[blueprint.item.baseId];
  if (!blueprint.base?.supported || !category) throw new Error('底座或官方交易类别尚未确认。');
  const rows = buildTradeFilterRows(engine.data, trade, blueprint.targets).map(row => {
    if (!row.ambiguous || !row.modId || row.lineIndex === undefined) return row;
    const mod = engine.data.mods.get(row.modId), mapping = trade.mods[row.modId]?.[row.lineIndex];
    const target = blueprint.targets.find(entry => entry.modId === row.modId);
    const tier = mod && target && mod.tiers.at(-target.tierDisplay);
    if (!mod || !mapping || !tier) return row;
    const layout = tradeLineRangeMapping(mod, mapping, row.lineIndex);
    if (!layout.count) return row;
    const ranges = tier.ranges.slice(layout.first, layout.first + layout.count);
    const render = (end: 0 | 1) => {
      let index = 0;
      return (row.sourceLabel ?? '').replace(/#/g, () => String(ranges[index++]?.[end] ?? NaN));
    };
    // Confirm the rendered meaning against the pricing index instead of trusting
    // a near-match list. Context-specific aliases remain under the exact base/category.
    const low = matchEquipmentStat(render(0)), high = matchEquipmentStat(render(1));
    const ids = row.ids.filter(id => low.ids.includes(id) && high.ids.includes(id));
    if (!low.searchable || low.ref !== high.ref || low.value !== Number(row.min) || !ids.length) return row;
    return { ...row, ids, ambiguous: false, warning: undefined };
  });
  if (!rows.length) throw new Error('请至少选择一条目标词缀。');
  for (const row of rows) {
    if (!row.ids.length || row.ambiguous || row.warning) throw new Error(`${row.label}：${row.warning ?? '官方交易映射待核对。'}`);
  }
  const market = buildEquipmentTrade({ league, equipment: {
    raw: '', name: '', baseName: blueprint.base.english, baseNameEnglish: blueprint.base.english,
    category, slot: 'other', rarity: 'rare', identified: true, corrupted: false, twoHanded: false,
    properties: [], mods: [], warnings: [],
  }, rows: [
    ...rows.map(row => ({ ...row, ids: [...row.ids], enabled: true })),
    { key: 'base:ilvl', label: '物品等级', ids: [], enabled: true, min: String(blueprint.item.level), max: '', equipmentFilter: 'ilvl', filterGroup: 'misc_filters' },
  ] });
  const query: FlexibleTradeDocument = { ...market.query, query: { ...market.query.query,
    filters: { ...market.query.query.filters, misc_filters: { filters: { ...market.query.query.filters.misc_filters?.filters, mirrored: { option: 'false' } } } } } };
  return { query, rows, url: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league.trim())}?q=${encodeURIComponent(JSON.stringify(query))}` };
}

/** Material names are dataset names, not inferred from a translated affix label. */
export function blueprintAffixSource(mod: EngineMod, tierDisplay: number) {
  const tier = mod.tiers.find(entry => entry.display === tierDisplay);
  const material = ['essence', 'perfect', 'alloy'].includes(mod.source) ? tier?.name : undefined;
  const mechanism = mod.source === 'essence' ? '在魔法底装阶段用指定精华升为稀有，保证添加这条词缀。'
    : mod.source === 'perfect' || mod.source === 'alloy' ? '稀有阶段移除一条词缀后保证添加；具体移除侧及预兆由路线决定。'
    : mod.source === 'desecrated' ? '亵渎词池；按装备部位选择对应材料（戒指／项链使用锁骨），选择结果与预兆按实际分支处理。'
    : mod.source === 'rune' ? '先确认符文解锁词池；当前空白底装路线未自动假设已解锁。'
    : '来自普通随机词池；采用哪一种及哪一档通货，由底装状态和计算路线决定。';
  return { material, label: material ? blueprintMaterialLabel(material) : mod.source === 'desecrated' ? '亵渎材料／预兆' : mod.source === 'rune' ? '符文解锁词池' : '普通随机词池', mechanism,
    url: material ? englishPoe2dbUrl(material) : englishPoe2dbUrl(mod.source === 'desecrated' ? 'Crafting' : 'Modifiers') };
}

export function blueprintMaterialLabel(name: string) {
  const label = localizeEquipmentName(name);
  return label === name ? translateCurrency(name) : label;
}

/** Interpret the engine's closed action grammar for jewellery only; never infer
 * an Essence species from the target's translated text. */
export function blueprintActionMaterials(action: string): string[] {
  if (action === 'Start over with a new base') return [];
  const parts = action.split(/\s*\+\s*/), match = /^([^()]+?)(?:\s*\(([^()]+)\))?$/.exec(parts[0]!.trim());
  if (!match) return [];
  const main = match[1]!.trim(), modifiers = match[2]?.split(/\s*,\s*/) ?? [];
  const baseNames: Record<string, string> = { Transmute: 'Orb of Transmutation', Transmutation: 'Orb of Transmutation', Augment: 'Orb of Augmentation', Augmentation: 'Orb of Augmentation', Regal: 'Regal Orb', Exalt: 'Exalted Orb', Exalted: 'Exalted Orb', Annul: 'Orb of Annulment', Annulment: 'Orb of Annulment', Chaos: 'Chaos Orb', Alchemy: 'Orb of Alchemy' };
  const strength = modifiers.includes('Perfect') ? 'Perfect' : modifiers.includes('Greater') ? 'Greater' : '';
  const names = main === 'Desecrate' || main === 'Desecration' ? [modifiers.includes('Ancient') ? 'Ancient Collarbone' : 'Preserved Collarbone']
    : baseNames[main] ? [`${strength ? strength + ' ' : ''}${baseNames[main]}`]
    : /^(?:(?:Lesser|Greater|Perfect) )?Essence of .+$/.test(main) || / Alloy$/.test(main) ? [main] : [];
  if (!names.length) return [];
  const directional = modifiers.find(value => value === 'Sinistral' || value === 'Dextral') ?? parts.find(value => value === 'Sinistral' || value === 'Dextral');
  if (directional) {
    const kind = main.startsWith('Desecrat') ? 'Necromancy' : /^Annul/.test(main) ? 'Annulment' : /Essence|Alloy/.test(main) ? 'Crystallisation' : main === 'Chaos' ? 'Erasure' : 'Exaltation';
    names.push(`Omen of ${directional} ${kind}`);
  }
  return [...new Set([...names, ...modifiers.filter(value => value.startsWith('Omen of ')), ...parts.slice(1).filter(value => value.startsWith('Omen of '))])];
}

export function blueprintActualBase(engine: Engine, blueprint: ReturnType<typeof craftBlueprint>, raw: string, options: CraftOptions, choices?: ActualBaseChoices) {
  if (blueprint.researchOnly) throw new Error('此部位已支持成品与词池调查，通货成本及逐步执行暂只支持戒指和项链。');
  if (blueprint.issues.length) throw new Error(blueprint.issues[0]);
  const parsed = parseWorkbenchItem(engine.data, raw, actualPasteChoices(choices));
  if (!parsed?.complete || parsed.craftingBlocked || !parsed.level) throw new Error(parsed?.blockedReason ?? '请复制完整且可制作的实际底装；未识别的词缀需先核对。');
  if (parsed.baseNameEnglish !== blueprint.base?.english || parsed.baseId !== blueprint.item.baseId) throw new Error('实际底装与本次规划的具体底座不一致，请重新调查路线。');
  const item: ExistingItem = { baseId: parsed.baseId, level: parsed.level, rarity: parsed.rarity as ExistingItem['rarity'], prefixes: parsed.prefixes, suffixes: parsed.suffixes };
  const invalid = validateCraft(item, blueprint.targets, blueprint.mods, options);
  if (invalid) {
    const locked = [...item.prefixes, ...item.suffixes].filter(entry => entry.fractured).map(entry => {
      const mod = blueprint.mods.get(entry.modId);
      return `${mod ? translateModAtTier(mod, entry.tierDisplay) : entry.modId}（T${entry.tierDisplay}，破裂锁定）`;
    });
    throw new Error(`底装已识别：${item.prefixes.length} 条前缀 / ${item.suffixes.length} 条后缀${locked.length ? `；${locked.join('、')}` : ''}。${invalid}`);
  }
  return { item, raw, baseName: parsed.baseNameEnglish!, targets: blueprint.targets, options };
}
