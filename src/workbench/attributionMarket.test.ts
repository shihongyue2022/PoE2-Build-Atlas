import { afterEach, describe, expect, it } from 'vitest';
import { attributionJewelSources, attributionMarketQueries, attributionMarketRow } from './attributionMarket';
import { attributionState, jewelAttributionXml, rememberJewelAttributionFixture } from './fixtures/damageAttribution';
import type { DamageAttributionResult, DamageAttributionRow } from './damageAttribution';
import { parseEquipment } from './genericEquipment';
import { rememberCalculationSnapshot } from './calculationSnapshot';
import { equipmentSignature } from './resistanceModel';

const native = (slot: string, line: string, placement = 'explicitModLines'): DamageAttributionRow => ({ id: `${slot}:${line}`, slot, item: 'Test', line, placement, status: 'calculated', without: 900, delta: 100, lossPercent: 10 });
afterEach(() => localStorage.clear());
describe('damage contribution market selections', () => {
  it('makes selected affixes hard AND floors on the same item and separates source slots', () => {
    const state = attributionState();
    const rows = [native('Ring 1', '40% increased Fire Damage'), native('Ring 1', '20% increased Spell Damage'), native('Ring 2', '10% increased Cast Speed')].map((row) => attributionMarketRow(state, row));
    expect(rows.every((row) => row.filter)).toBe(true);
    const markets = attributionMarketQueries(state, rows, 'Test League');
    expect(markets.map((market) => [market.slot, market.conditions])).toEqual([['ring1', 2], ['ring2', 1]]);
    const filters = markets[0]!.query.query.stats.flatMap((group) => group.filters);
    expect(filters.some((filter) => filter.value?.min === 40)).toBe(true);
    expect(filters.some((filter) => filter.value?.min === 20)).toBe(true);
    expect(filters.some((filter) => filter.value?.min === 10)).toBe(false);
    expect(markets[0]!.query.query.stats.every((group) => group.type === 'and' || group.type === 'count')).toBe(true);
    expect(markets[0]!.query.sort).toEqual({ price: 'asc' });
    expect(JSON.parse(new URL(markets[0]!.url).searchParams.get('q')!)).toEqual(markets[0]!.query);
    expect(new URL(markets[0]!.url).pathname).toContain('Test%20League');
    expect(markets[0]!.query.query.type).toBeUndefined();
    const improved = attributionMarketQueries(state, rows.slice(0, 1), 'Test', '5')[0]!;
    expect(improved.query.query.stats.flatMap((group) => group.filters).some((filter) => filter.value?.min === 42)).toBe(true);
    const exists = attributionMarketQueries(state, rows.slice(0, 1), 'Test', 'presence')[0]!;
    expect(exists.query.query.stats.flatMap((group) => group.filters).every((filter) => !filter.value)).toBe(true);
  });
  it('keeps native rune placement and rejects invented or unlocatable effects', () => {
    const state = attributionState();
    const rune = attributionMarketRow(state, native('Weapon 1', '16% increased Physical Damage', 'runeModLines'));
    expect(rune.filter?.ids.length).toBeGreaterThan(0); expect(rune.filter?.ids.every((id) => id.startsWith('rune.'))).toBe(true);
    expect(attributionMarketRow(state, native('Weapon 1', '100% increased Physical Damage')).filter?.ids.every((id) => !id.startsWith('rune.'))).toBe(true);
    expect(attributionMarketRow(state, native('Ring 1', 'invented damage effect')).filter).toBeUndefined();
    expect(attributionMarketRow(state, native('Socket 1', '40% increased Fire Damage')).filter).toBeUndefined();
    expect(attributionMarketRow(state, native('Ring 1', '40% increased Fire Damage', 'buffModLines')).filter).toBeUndefined();
  });
  it('preserves legendary identity, mechanic presence and loadout budget without imposing single-item resists', () => {
    const state = attributionState();
    state.slots.ring1 = `Rarity: Unique\nThe Taming\nPrismatic Ring\nItem Level: 80\n--------\n24% increased Damage for each type of Elemental Ailment on Enemy`;
    state.goals.workflow = { version: 1, encounter: 'boss-sustained', replacement: 'pair', budget: 50, currency: 'divine', conditions: {}, unlockedSlots: [] };
    const entry = attributionMarketRow(state, native('Ring 1', '24% increased Damage for each type of Elemental Ailment on Enemy'));
    expect(parseEquipment(state.slots.ring1)?.nameEnglish).toBe('The Taming'); expect(entry.filter).toBeDefined();
    const market = attributionMarketQueries(state, [entry], 'Test')[0]!;
    expect(market.query.query.name).toBe('The Taming');
    expect(market.query.query.stats.flatMap((group) => group.filters).every((filter) => !filter.value)).toBe(true);
    expect(market.query.query.filters.trade_filters?.filters.price).toEqual({ max: 50, option: 'divine' });
    expect(market.query.query.stats.flatMap((group) => group.filters).map((filter) => filter.id).sort()).toEqual(entry.filter!.ids.slice().sort());
  });
  it('combines repeated official stat totals instead of dropping a selected roll', () => {
    const state = attributionState();
    const entry = attributionMarketRow(state, native('Ring 1', '40% increased Fire Damage'));
    const second = { ...entry, id: 'second', filter: { ...entry.filter!, key: 'second', actualValue: 10 } };
    const market = attributionMarketQueries(state, [entry, second], 'Test')[0]!;
    expect(market.conditions).toBe(1);
    expect(market.query.query.stats.flatMap((group) => group.filters).every((filter) => filter.value?.min === 50)).toBe(true);
  });
  it('resolves ordinary and radius jewels from the active tree and searches exact jewel bases with per-node rolls', () => {
    const state = rememberJewelAttributionFixture();
    const rows = [
      ...['Small Passive Skills in Radius also grant 2% increased Damage with Spears', 'Notable Passive Skills in Radius also grant 2% increased Attack Speed', 'Notable Passive Skills in Radius also grant 2% increased Attack Speed with Spears']
        .map((line) => ({ ...native('Jewel 60735', line), item: 'Fixture Radius, Time-Lost Emerald' })),
      { ...native('Jewel 32763', '2% increased Attack Speed'), item: 'Fixture Diamond, Diamond' },
    ];
    const result: DamageAttributionResult = { version: 1, engine: 'PoB2 v0.23.1', metric: 'CombinedDPS', baseline: 1000, skill: 'Fireball', rows };
    const sources = attributionJewelSources(state, result);
    expect(sources.size).toBe(2);
    const entries = rows.map((row) => attributionMarketRow(state, row, sources));
    expect(entries.every((entry) => entry.filter)).toBe(true);
    const queries = attributionMarketQueries(state, entries, 'Test');
    expect(queries.map((query) => [query.slot, query.conditions, query.query.query.type])).toEqual([
      ['jewel:60735', 3, 'Time-Lost Emerald'], ['jewel:32763', 1, 'Diamond'],
    ]);
    expect(queries[0]!.query.query.filters.type_filters.filters.category).toEqual({ option: 'jewel' });
    const filters = queries[0]!.query.query.stats.flatMap((group) => group.filters);
    expect(filters.every((filter) => filter.value?.min === 2)).toBe(true);
    expect(filters.map((filter) => filter.id)).toEqual(expect.arrayContaining(['explicit.stat_2809428780', 'explicit.stat_2822644689', 'explicit.stat_1266413530']));
    expect(JSON.stringify(queries[0]!.query)).not.toContain('60735');
    expect(JSON.stringify(queries[0]!.query)).not.toMatch(/[\u3400-\u9fff]/u);
    rememberCalculationSnapshot(jewelAttributionXml.replace('activeSpec="2"', 'activeSpec="1"'), state.source!, [equipmentSignature(state.slots)]);
    expect(attributionJewelSources(state, result).size).toBe(0);
    expect(attributionJewelSources({ ...state, slots: { ...state.slots, ring1: '' } }, result).size).toBe(0);
  });
});
