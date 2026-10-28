import { expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import type { Engine } from '../lib/engine';
import { loadGearTrade, type GearTrade } from '../lib/gearTrade';
import { blueprintBaseTrade, blueprintTargetTrade, craftBlueprint, EMPTY_BLUEPRINT_CHOICES } from './craftBlueprint';
import { EXAMPLE_RING } from './itemImport';
import { BREACH_RING_SAMPLE, SOVEREIGN_BREACH_RING_SAMPLE } from './fixtures/breachRing';

const engine: Engine = { data: loadShippedPatch('data/patches/0.5.0'), prices: indexPrices({ prices: {} }) };
const trade = await loadGearTrade();

it('searches Breach Ring bases across normal, magic and rare instead of requiring a white item', () => {
  const blueprint = craftBlueprint(engine, BREACH_RING_SAMPLE, EMPTY_BLUEPRINT_CHOICES, 80);
  expect(blueprint.minimumLevel).toBe(75);
  const market = blueprintBaseTrade(blueprint, 'Test')!;
  expect(market.query.query.type).toBe('Breach Ring');
  expect(market.query.query.filters.type_filters.filters.rarity?.option).toBe('nonunique');
  expect(market.query.query.filters.misc_filters?.filters).toMatchObject({ ilvl: { min: 80 }, corrupted: { option: 'false' }, mirrored: { option: 'false' } });
  expect(market.query.query.stats.flatMap(group => group.filters)).toEqual([]);
  const minimum = blueprintBaseTrade(blueprint, 'Test', { minimumLevel: blueprint.minimumLevel })!;
  expect(minimum.query).toEqual({ ...market.query, query: { ...market.query.query, filters: { ...market.query.query.filters,
    misc_filters: { filters: { ...market.query.query.filters.misc_filters!.filters, ilvl: { min: 75 } } },
  } } });
  expect(blueprint.item.level).toBe(80);
  for (const rarity of ['nonunique', 'normal', 'magic', 'rare'] as const) {
    expect(blueprintBaseTrade(blueprint, 'Test', { rarity })!.query.query.filters.type_filters.filters.rarity?.option).toBe(rarity);
  }
  expect(() => blueprintBaseTrade(blueprint, 'Test', { minimumLevel: 74 })).toThrow('不能低于');
});

it('builds an English AND purchase query from every selected target with official pricing semantics', () => {
  const blueprint = craftBlueprint(engine, EXAMPLE_RING);
  const market = blueprintTargetTrade(engine, blueprint, trade, ' Test League ');
  expect(market.rows).toHaveLength(3);
  expect(market.rows.every(row => row.min !== '')).toBe(true);
  expect(market.query.query).toMatchObject({ type: 'Ruby Ring', filters: {
    type_filters: { filters: { category: { option: 'accessory.ring' }, rarity: { option: 'nonunique' } } },
    misc_filters: { filters: { ilvl: { min: blueprint.minimumLevel }, identified: { option: 'true' }, corrupted: { option: 'false' }, mirrored: { option: 'false' } } },
  } });
  expect(market.query.query.name).toBeUndefined();
  expect(market.query.sort).toEqual({ price: 'asc' });
  expect(market.query.query.stats.filter(group => group.type === 'count')).toHaveLength(3);
  expect(market.query.query.stats.every(group => group.type !== 'count' || group.value?.min === 1)).toBe(true);
  for (const row of market.rows) for (const id of row.ids) {
    expect(market.query.query.stats.flatMap(group => group.filters)).toContainEqual({ id, value: { min: Number(row.min) }, disabled: false });
  }
  expect(JSON.parse(new URL(market.url).searchParams.get('q')!)).toEqual(market.query);
  expect(new URL(market.url).pathname).toContain('Test%20League');
  expect(JSON.stringify(market.query)).not.toMatch(/[\u3400-\u9fff]/u);
  expect(blueprintBaseTrade(blueprint, 'Test')!.query.query.stats.flatMap(group => group.filters)).toEqual([]);
});

it('updates conditions and minimum level after exclusions, tier changes, replacement and added targets', () => {
  const original = craftBlueprint(engine, EXAMPLE_RING);
  const life = original.rows.find(row => row.mod?.id === 'Rings/IncreasedLife')!;
  const selected = { ...EMPTY_BLUEPRINT_CHOICES, excluded: original.rows.filter(row => row.key !== life.key).map(row => row.key), tiers: { [life.key]: 3 } };
  const lower = craftBlueprint(engine, EXAMPLE_RING, selected);
  const market = blueprintTargetTrade(engine, lower, trade, 'Test');
  expect(market.rows).toHaveLength(1);
  expect(market.rows[0]?.modId).toBe(life.mod!.id);
  expect(Number(market.rows[0]?.min)).toBe(engine.data.mods.get(life.mod!.id)!.tiers.at(-3)!.ranges[0]![0]);
  expect(lower.minimumLevel).toBeLessThan(original.minimumLevel);
  const replaced = craftBlueprint(engine, EXAMPLE_RING, { ...selected, replacements: { [life.key]: 'Rings/ChaosResistance' }, tiers: {}, extra: [{ modId: 'Rings/IncreasedMana', tierDisplay: 1 }] }, 86);
  const next = blueprintTargetTrade(engine, replaced, trade, 'Test');
  expect(next.rows.map(row => row.modId)).toEqual(['Rings/ChaosResistance', 'Rings/IncreasedMana']);
  expect(next.query.query.filters.misc_filters?.filters.ilvl).toEqual({ min: 86 });
});

it('uses raw tier minima and exact average damage endpoints, without inheriting quality or fracture', () => {
  const blueprint = craftBlueprint(engine, BREACH_RING_SAMPLE);
  const market = blueprintTargetTrade(engine, blueprint, trade, 'Test');
  const lightning = blueprint.rows.find(row => /Lightning damage to Attacks/i.test(row.mod?.text ?? ''))!;
  const nativeTier = engine.data.mods.get(lightning.mod!.id)!.tiers.at(-lightning.tierDisplay!)!;
  const expected = (nativeTier.ranges[0]![0]! + nativeTier.ranges[1]![0]!) / 2;
  expect(expected).toBe(30.5);
  expect(market.rows.find(row => row.modId === lightning.mod!.id)?.min).toBe('30.5');
  expect(market.rows.find(row => row.modId === 'Rings/AllResistances')?.min).toBe('15');
  expect(market.query.query.filters.type_filters.filters.quality).toBeUndefined();
  expect(market.query.query.name).toBeUndefined();
  expect(market.rows.find(row => row.modId === 'Rings/ItemFoundRarityIncrease')).toMatchObject({ min: '15', ambiguous: false, warning: undefined });
  expect(blueprintTargetTrade(engine, craftBlueprint(engine, SOVEREIGN_BREACH_RING_SAMPLE), trade, 'Test').rows
    .find(row => row.modId === 'Rings/PerfectEssence_EnchantmentHeistArmour')?.min).toBe('20');
});

it('supports the verified belt base and all lines of a hybrid modifier', () => {
  const raw = 'Rarity: Rare\nResearch Belt\nUtility Belt\n--------\nItem Level: 79\n--------\n+100 to maximum Life\n+20% to Chaos Resistance';
  const blueprint = craftBlueprint(engine, raw);
  const market = blueprintTargetTrade(engine, blueprint, trade, 'Test');
  expect(market.query.query.type).toBe('Utility Belt');
  expect(market.query.query.filters.type_filters.filters.category?.option).toBe('accessory.belt');
  expect(market.rows).toHaveLength(2);
  const hybrid = { id: 'Belts/testHybrid', text: 'Adds # to # Physical Damage\n#% increased Attack Speed', source: 'normal' as const, type: 'prefix' as const, family: 'test', tags: [],
    tiers: [{ name: 'test', ilvl: 1, weight: 100, ranges: [[3, 4], [8, 10], [12, 14]] }] };
  const testEngine = { ...engine, data: { ...engine.data, mods: new Map([...engine.data.mods, [hybrid.id, hybrid]]) } };
  const hybridTrade: GearTrade = { mods: { [hybrid.id]: [[0, 0, 2], [1, 2, 1]] }, rows: [{ ids: ['explicit.test0'] }, { ids: ['explicit.test1'] }] };
  const changed = { ...blueprint, targets: [{ modId: hybrid.id, tierDisplay: 1 }] };
  const combined = blueprintTargetTrade(testEngine, changed, hybridTrade, 'Test');
  expect(combined.rows.map(row => row.min)).toEqual(['5.5', '12']);
  expect(combined.query.query.stats.flatMap(group => group.filters).length).toBeGreaterThanOrEqual(combined.rows.length);
});

it('never drops unresolved, missing or ambiguous conditions to make a weaker purchase link', () => {
  const blueprint = craftBlueprint(engine, EXAMPLE_RING);
  expect(() => blueprintTargetTrade(engine, blueprint, { rows: [], mods: {} }, 'Test')).toThrow('映射');
  const first = blueprint.targets[0]!.modId;
  const ambiguous: GearTrade = { mods: { ...trade.mods, [first]: [[0, 0, 1]] }, rows: [{ ids: ['explicit.unknown'], ambiguous: true }] };
  expect(() => blueprintTargetTrade(engine, blueprint, ambiguous, 'Test')).toThrow('近似');
  const unknown = craftBlueprint(engine, EXAMPLE_RING + '\nInvented impossible damage effect');
  expect(() => blueprintTargetTrade(engine, unknown, trade, 'Test')).toThrow('未识别');
  const empty = craftBlueprint(engine, EXAMPLE_RING, { ...EMPTY_BLUEPRINT_CHOICES, excluded: blueprint.rows.map(row => row.key) });
  expect(() => blueprintTargetTrade(engine, empty, trade, 'Test')).toThrow('至少');
  expect(() => blueprintTargetTrade(engine, blueprint, trade, ' ')).toThrow('赛季');
});
