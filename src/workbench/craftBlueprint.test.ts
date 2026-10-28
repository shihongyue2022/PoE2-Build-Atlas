import { expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import { craftBlueprint, blueprintBaseTrade, blueprintActualBase, blueprintActionMaterials, EMPTY_BLUEPRINT_CHOICES, type CraftBlueprintGoal } from './craftBlueprint';
import { EXAMPLE_RING } from './itemImport';
import type { Engine } from '../lib/engine';
import { BREACH_RING_SAMPLE, FRACTURED_COLD_BREACH_RING_SAMPLE, SOVEREIGN_BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { breachPreparation } from './craftReference';
import { makeSolveRequest } from './model';

const engine: Engine = { data: loadShippedPatch('data/patches/0.5.0'), prices: indexPrices({ prices: {} }) };

it('accepts the reported three-prefix/three-suffix base for a compatible goal but explains a fourth-prefix fracture conflict', () => {
  const compatible = craftBlueprint(engine, FRACTURED_COLD_BREACH_RING_SAMPLE);
  expect(compatible.issues).toEqual([]);
  const actual = blueprintActualBase(engine, compatible, FRACTURED_COLD_BREACH_RING_SAMPLE, compatible.options);
  expect(actual.item.prefixes).toHaveLength(3); expect(actual.item.suffixes).toHaveLength(3);
  expect(actual.item.prefixes.find(entry => entry.fractured)).toMatchObject({ modId: 'Rings/ColdDamage', tierDisplay: 8 });
  const originalTarget = craftBlueprint(engine, BREACH_RING_SAMPLE);
  expect(originalTarget.issues).toEqual([]);
  const check = () => blueprintActualBase(engine, originalTarget, FRACTURED_COLD_BREACH_RING_SAMPLE, originalTarget.options);
  expect(check).toThrow('底装已识别：3 条前缀 / 3 条后缀');
  expect(check).toThrow('T8，破裂锁定');
  expect(check).toThrow('共需要 4 条前缀 / 3 条后缀');
  expect(check).toThrow('请至少取消 1 条前缀目标');
  const mana = originalTarget.rows.find(row => row.mod?.id === 'Rings/IncreasedMana')!;
  const adjusted = craftBlueprint(engine, BREACH_RING_SAMPLE, { ...EMPTY_BLUEPRINT_CHOICES, excluded: [mana.key] });
  const ready = blueprintActualBase(engine, adjusted, FRACTURED_COLD_BREACH_RING_SAMPLE, adjusted.options);
  const request = makeSolveRequest(engine, ready.item, ready.targets, adjusted.mods, ready.options, 5000, 0, false);
  expect(request.targets).toContainEqual({ modId: 'Rings/ColdDamage', tierDisplay: 8 });
  expect(request.spare).toEqual({ prefixes: 0, suffixes: 0 });
});

it('keeps the reference intact when targets are deleted and rejects incomplete or wrong-side editor rows', () => {
  const original = craftBlueprint(engine, EXAMPLE_RING);
  const goal: CraftBlueprintGoal = { key: 'stable-goal', side: 'suffix', enabled: true, modId: 'Rings/ChaosResistance', tierDisplay: 2, category: 'resistance' };
  const changed = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, goals: [goal] });
  expect(changed.referenceRows).toEqual(original.referenceRows);
  expect(changed.rows).toHaveLength(1);
  expect(changed.targets).toEqual([{ modId: goal.modId, tierDisplay: 2 }]);
  expect(changed.issues).toEqual([]);
  const blank = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, goals: [goal, { key: 'pending', side: 'prefix', enabled: true }] });
  expect(blank.issues.join('')).toContain('待确认');
  expect(blueprintBaseTrade(blank, 'Test')).toBeUndefined();
  const wrongSide = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, goals: [{ ...goal, side: 'prefix' }] });
  expect(wrongSide.issues.join('')).toContain('待确认');
  expect(wrongSide.targets).toEqual([]);
});

it('applies family and slot restrictions equally to editable targets', () => {
  const goal: CraftBlueprintGoal = { key: 'cold-1', modId: 'Rings/ColdResistance', side: 'suffix', tierDisplay: 2, enabled: true };
  const duplicate = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, goals: [goal, { ...goal, key: 'cold-2' }] });
  expect(duplicate.issues.join('')).toContain('互斥');
  const empty = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, goals: [] });
  expect(empty.issues.join('')).toContain('至少');
});
it('reads a finished reference as goals and searches nonunique bases without inheriting affixes or fractures', () => {
  const blueprint = craftBlueprint(engine, EXAMPLE_RING);
  expect(blueprint.issues).toEqual([]);
  expect(blueprint.targets).toHaveLength(3);
  expect(blueprint.item).toMatchObject({ rarity: 'normal', prefixes: [], suffixes: [] });
  expect(blueprint.minimumLevel).toBe(Math.max(...blueprint.targets.map(target => blueprint.mods.get(target.modId)!.tiers.find(tier => tier.display === target.tierDisplay)!.ilvl)));
  const market = blueprintBaseTrade(blueprint, 'Test League')!;
  expect(market.query.query.type).toBe('Ruby Ring'); expect(market.query.query.name).toBeUndefined();
  expect(market.query.query.filters.type_filters.filters.rarity?.option).toBe('nonunique');
  expect(market.query.query.filters.misc_filters?.filters).toMatchObject({ ilvl: { min: blueprint.minimumLevel }, corrupted: { option: 'false' }, mirrored: { option: 'false' } });
  expect(market.query.query.stats.flatMap(group => group.filters)).toHaveLength(0);
  expect(JSON.stringify(market.query)).not.toMatch(/[\u3400-\u9fff]/u);
  const copiedFracture = craftBlueprint(engine, EXAMPLE_RING.replace('+110最大生命', '+110最大生命 (fractured)'));
  expect(copiedFracture.item.prefixes).toEqual([]);
  expect(copiedFracture.targets.every(target => !('fractured' in target))).toBe(true);
});

it('keeps a corrupted reference usable as direction evidence while rejecting a corrupted actual starting item', () => {
  const blueprint = craftBlueprint(engine, EXAMPLE_RING + '\n--------\nCorrupted');
  expect(blueprint.issues).toEqual([]);
  expect(blueprint.parsed.corrupted).toBe(true);
  expect(() => blueprintActualBase(engine, blueprint, EXAMPLE_RING + '\n--------\nCorrupted', blueprint.options)).toThrow('污染');
  const actual = blueprintActualBase(engine, blueprint, 'Rarity: Normal\nRuby Ring\n--------\nItem Level: 86', blueprint.options);
  expect(actual.item).toMatchObject({ level: 86, rarity: 'normal', prefixes: [], suffixes: [] });
  expect(actual.targets).toEqual(blueprint.targets);
  expect(() => blueprintActualBase(engine, blueprint, 'Rarity: Normal\nSapphire Ring\n--------\nItem Level: 86', blueprint.options)).toThrow('底座不一致');
  expect(() => blueprintActualBase(engine, blueprint, 'Rarity: Normal\nRuby Ring\n--------\nItem Level: 1', blueprint.options)).toThrow('物品等级不足');
});

it('lets a target tier differ from the sample roll and recalculates the minimum base level', () => {
  const reference = craftBlueprint(engine, EXAMPLE_RING), row = reference.rows.find(row => row.mod?.id === 'Rings/IncreasedLife')!;
  const next = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, tiers: { [row.key]: 3 }, excluded: reference.rows.filter(entry => entry.key !== row.key).map(entry => entry.key) });
  expect(next.issues).toEqual([]);
  expect(next.targets).toEqual([{ modId: 'Rings/IncreasedLife', tierDisplay: 3 }]);
  expect(next.minimumLevel).toBe(row.mod!.tiers.find(tier => tier.display === 3)!.ilvl);
  expect(next.item.prefixes).toEqual([]);
  expect(next.parsed.rows.find(entry => entry.key === row.key)!.tierDisplay).toBe(row.tierDisplay);
});

it('blocks unverified explicit goals, unsupported bases and empty selections instead of pretending to reproduce them', () => {
  const unknown = craftBlueprint(engine, EXAMPLE_RING + '\nInvented impossible damage effect');
  expect(unknown.issues.join('')).toContain('未识别');
  expect(blueprintBaseTrade(unknown, 'Test')).toBeUndefined();
  const original = craftBlueprint(engine, EXAMPLE_RING);
  const empty = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, excluded: original.rows.map(row => row.key) });
  expect(empty.issues.join('')).toContain('至少');
  expect(craftBlueprint(engine, EXAMPLE_RING.replace('紅玉戒指', 'Gloam Ring')).issues.join('')).toContain('上限');
});

it('names exact orb strength, essence species and each omen, including the jewellery bone grade', () => {
  expect(blueprintActionMaterials('Exalt (Sinistral, Perfect)')).toEqual(['Perfect Exalted Orb', 'Omen of Sinistral Exaltation']);
  expect(blueprintActionMaterials('Perfect Essence of the Body + Omen of Dextral Crystallisation')).toEqual(['Perfect Essence of the Body', 'Omen of Dextral Crystallisation']);
  expect(blueprintActionMaterials('Sovereign Alloy + Omen of Sinistral Crystallisation')).toEqual(['Sovereign Alloy', 'Omen of Sinistral Crystallisation']);
  expect(blueprintActionMaterials('Desecrate (Ancient, Omen of the Blackblooded, Dextral, Omen of Abyssal Echoes)')).toEqual(['Ancient Collarbone', 'Omen of Dextral Necromancy', 'Omen of the Blackblooded', 'Omen of Abyssal Echoes']);
  expect(blueprintActionMaterials('Annul (Omen of Light)')).toEqual(['Orb of Annulment', 'Omen of Light']);
  expect(blueprintActionMaterials('Start over with a new base')).toEqual([]);
});

it('researches the advanced 60% quality reference without treating quality, fracture or desecration as an intrinsic tier', () => {
  const blueprint = craftBlueprint(engine, BREACH_RING_SAMPLE);
  expect(blueprint.issues).toEqual([]);
  expect(blueprint.rows).toHaveLength(6);
  expect(blueprint.slots).toEqual({ prefixes: 3, suffixes: 3, crafted: 0 });
  expect(blueprint.reference.quality).toBe(60);
  expect(blueprint.rows.find(row => row.mod?.id === 'Rings/AllResistances')).toMatchObject({ referenceTier: 1, copied: { increase: 60 } });
  expect(blueprint.rows.find(row => row.mod?.id === 'Rings/IncreasedMana')).toMatchObject({ referenceTier: 2, tierDisplay: 2, ceiling: { atLevel: { display: 1, ilvl: 75 } } });
  expect(blueprint.rows.find(row => row.mod?.id === 'Rings/ColdResistance')).toMatchObject({ referenceTier: 3, tierDisplay: 3, ceiling: { atLevel: { display: 2 }, highest: { display: 1, ilvl: 82 } } });
  const des = blueprint.rows.find(row => row.desecrated)!;
  expect(des.mod?.source).toBe('normal');
  expect(blueprint.options.desecration).toBe(false);
  expect(blueprint.item.prefixes).toEqual([]);
  expect(blueprint.targets.every(target => !('fractured' in target) && !('desecrated' in target))).toBe(true);
  expect(blueprint.rows.filter(row => row.copied?.increase === 60)).toHaveLength(2);
});

it('includes the copied Sovereign Alloy as a real crafted goal and counts it against the crafted limit', () => {
  const blueprint = craftBlueprint(engine, SOVEREIGN_BREACH_RING_SAMPLE);
  expect(blueprint.issues).toEqual([]);
  expect(blueprint.parsed.unmatchedLines).toEqual([]);
  expect(blueprint.slots).toEqual({ prefixes: 3, suffixes: 3, crafted: 1 });
  const alloy = blueprint.rows.find(row => row.mod?.source === 'alloy')!;
  expect(alloy).toMatchObject({ selected: true, tierDisplay: 1, needsSource: false, needsTier: false });
  expect(alloy.mod?.tiers[0]?.values).toEqual(['20–30']);
  expect(blueprint.targets).toContainEqual({ modId: 'Rings/PerfectEssence_EnchantmentHeistArmour', tierDisplay: 1 });
  const cold = blueprint.rows.find(row => row.mod?.id === 'Rings/ColdResistance')!;
  const conflict = craftBlueprint(engine, SOVEREIGN_BREACH_RING_SAMPLE, { ...EMPTY_BLUEPRINT_CHOICES, replacements: { [cold.key]: 'Rings/Essence_ColdResistance' } });
  expect(conflict.issues.join('')).toContain('一条精华');
});

it('adjusts reference goals using the actual pool and enforces families, slot caps and the single crafted modifier limit', () => {
  const reference = craftBlueprint(engine, BREACH_RING_SAMPLE);
  const cold = reference.rows.find(row => row.mod?.id === 'Rings/ColdResistance')!;
  const selected = { ...EMPTY_BLUEPRINT_CHOICES, tiers: { [cold.key]: 1 } };
  const upgraded = craftBlueprint(engine, BREACH_RING_SAMPLE, selected);
  expect(upgraded.minimumLevel).toBe(82);
  expect(upgraded.issues).toEqual([]);
  expect(upgraded.rows.find(row => row.key === cold.key)?.referenceTier).toBe(3);
  const swapped = craftBlueprint(engine, BREACH_RING_SAMPLE, { ...EMPTY_BLUEPRINT_CHOICES, replacements: { [cold.key]: 'Rings/ChaosResistance' } });
  expect(swapped.issues).toEqual([]);
  expect(swapped.targets.some(target => target.modId === 'Rings/ChaosResistance')).toBe(true);
  expect(swapped.targets.some(target => target.modId === 'Rings/ColdResistance')).toBe(false);
  expect(swapped.parsed.rawText).toBe(BREACH_RING_SAMPLE);
  const overflow = craftBlueprint(engine, BREACH_RING_SAMPLE, { ...EMPTY_BLUEPRINT_CHOICES, extra: [{ modId: 'Rings/ChaosResistance', tierDisplay: 1 }] });
  expect(overflow.issues.join('')).toContain('最多允许');
  const conflict = craftBlueprint(engine, BREACH_RING_SAMPLE, { ...EMPTY_BLUEPRINT_CHOICES, replacements: { [cold.key]: 'Rings/AllResistances' } });
  expect(conflict.issues.join('')).toContain('互斥');
  const essences = [...reference.mods.values()].filter(mod => ['essence', 'perfect', 'alloy'].includes(mod.source)).slice(0, 2);
  const crafted = craftBlueprint(engine, BREACH_RING_SAMPLE, { ...EMPTY_BLUEPRINT_CHOICES, excluded: reference.rows.map(row => row.key), extra: essences.map(mod => ({ modId: mod.id, tierDisplay: mod.tiers[0]!.display })) });
  expect(crafted.issues.join('')).toContain('一条精华');
  expect(craftBlueprint(engine, BREACH_RING_SAMPLE, { ...EMPTY_BLUEPRINT_CHOICES, replacements: { [cold.key]: 'not-in-pool' } }).issues.join('')).toContain('待确认');
});

it('scopes researched preparation to the exact base and keeps special stages out of the ordinary cost claim', () => {
  expect(breachPreparation('Ruby Ring', 60)).toBeUndefined();
  expect(breachPreparation('Refined Breach Ring', 65)).toBeUndefined();
  const guide = breachPreparation('Breach Ring', 60)!;
  expect(guide.steps.map(step => step.text).join('')).toContain('40%');
  expect(guide.steps.flatMap(step => step.materials)).toContain("Xoph's Catalyst");
  expect(guide.steps.at(-1)?.text).toContain('另外计入');
});

it('requires an explicit target when a numeric advanced header contradicts the resolved roll tier', () => {
  const contradictory = BREACH_RING_SAMPLE.replace('"北極熊之"(階層：3)', '"北極熊之"(階層：1)');
  const blueprint = craftBlueprint(engine, contradictory), row = blueprint.rows.find(row => row.mod?.id === 'Rings/ColdResistance')!;
  expect(row).toMatchObject({ tierConflict: true, needsTier: true, copied: { statedTier: 1 }, referenceTier: 3 });
  expect(blueprint.issues.join('')).toContain('待确认');
  const adjusted = craftBlueprint(engine, contradictory, { ...EMPTY_BLUEPRINT_CHOICES, tiers: { [row.key]: 1 } });
  expect(adjusted.issues).toEqual([]);
  expect(adjusted.minimumLevel).toBe(82);
  expect(adjusted.rows.find(entry => entry.key === row.key)?.referenceTier).toBe(3);
});

it('researches another exact native base without applying the jewellery execution model', () => {
  const raw = 'Rarity: Rare\nResearch Belt\nUtility Belt\n--------\nItem Level: 79\n--------\n+100 to maximum Life\n+20% to Chaos Resistance';
  const blueprint = craftBlueprint(engine, raw);
  expect(blueprint.researchOnly).toBe(true);
  expect(blueprint.parsed.baseId).toBe('Belts');
  expect(blueprint.rows).toHaveLength(2);
  expect(blueprint.issues).toEqual([]);
  const query = blueprintBaseTrade(blueprint, 'Test')!.query;
  expect(query.query.type).toBe('Utility Belt');
  expect(query.query.filters.type_filters.filters.category?.option).toBe('accessory.belt');
  expect(query.query.filters.type_filters.filters.rarity?.option).toBe('nonunique');
  expect(query.query.stats.flatMap(group => group.filters)).toEqual([]);
  expect(() => blueprintBaseTrade(blueprint, '')).toThrow('赛季');
  expect(() => blueprintActualBase(engine, blueprint, raw, blueprint.options)).toThrow('暂只支持');
  expect(() => craftBlueprint(engine, raw.replace('Utility Belt', 'Imaginary Unknown Belt'))).toThrow('原生底座');
});
