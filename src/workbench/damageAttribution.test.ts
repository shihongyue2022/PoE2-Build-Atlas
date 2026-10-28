import { afterEach, describe, expect, it } from 'vitest';
import { readDamageAttribution, rankDamageAttribution, groupDamageAttribution, type DamageAttributionResult } from './damageAttribution';
import { calculationXml, currentCalculationSnapshot, rememberCalculationSnapshot } from './calculationSnapshot';
import { attributionState, attributionXml } from './fixtures/damageAttribution';
import { equipmentSignature } from './resistanceModel';

export const resultFixture: DamageAttributionResult = { version: 1, engine: 'PoB2 v0.23.1', metric: 'CombinedDPS', baseline: 1000, skill: 'Fireball', rows: [
  { id: 'zero', slot: 'Ring 1', item: 'Ring', line: '+80 to maximum Mana', placement: 'explicitModLines', status: 'calculated', without: 1000, delta: 0, lossPercent: 0 },
  { id: 'low', slot: 'Ring 2', item: 'Ring', line: '10% increased Cast Speed', placement: 'explicitModLines', status: 'calculated', without: 900, delta: 100, lossPercent: 10 },
  { id: 'high', slot: 'Ring 1', item: 'Ring', line: '40% increased Fire Damage', placement: 'explicitModLines', status: 'calculated', without: 600, delta: 400, lossPercent: 40 },
  { id: 'unknown', slot: 'Ring 1', item: 'Ring', line: 'Unparsed effect', placement: 'explicitModLines', status: 'pending', reason: 'Native parser does not support it' },
] };
afterEach(() => localStorage.clear());
describe('native modifier attribution evidence', () => {
  it('sorts actual removal deltas while keeping unknown effects out of numeric ranks', () => {
    const ranked = rankDamageAttribution(readDamageAttribution(resultFixture));
    expect(ranked.positive.map((row) => row.id)).toEqual(['high', 'low']);
    expect(ranked.other.map((row) => row.id)).toEqual(['zero']); expect(ranked.pending[0]?.delta).toBeUndefined();
    expect(() => readDamageAttribution({ ...resultFixture, rows: [{ ...resultFixture.rows[2], delta: 1 }] })).toThrow('不一致');
    expect(() => readDamageAttribution({ ...resultFixture, rows: [{ ...resultFixture.rows[3], delta: 0 }] })).toThrow('虚构');
  });
  it('retains calculation sections without import identities, notes, or cached player stats', () => {
    const document = new DOMParser().parseFromString(attributionXml.replace('</PathOfBuilding2>', '<Import accountName="PRIVATE"/><Notes>PRIVATE</Notes></PathOfBuilding2>').replace('<Build level=', '<Build accountName="PRIVATE" level='), 'text/xml');
    const xml = calculationXml(document.documentElement);
    expect(xml).not.toContain('PRIVATE'); expect(xml).toContain('targetVersion="0_1"'); expect(xml).toContain('nameSpec="Fireball"');
    const party = new DOMParser().parseFromString('<PathOfBuilding2><Party name="PRIVATE"><ImportedBuffs name="Aura">20% increased Damage</ImportedBuffs><ExportedBuffs name="PRIVATE">PRIVATE</ExportedBuffs></Party></PathOfBuilding2>', 'text/xml');
    expect(calculationXml(party.documentElement)).toContain('20% increased Damage'); expect(calculationXml(party.documentElement)).not.toContain('PRIVATE');
  });
  it('sorts native whole-item totals independently of per-line sums, then sorts lines inside each slot', () => {
    const result: DamageAttributionResult = { ...resultFixture, rows: [...resultFixture.rows,
      { ...resultFixture.rows[2]!, id: 'middle', without: 850, delta: 150, lossPercent: 15 }], items: [
      { id: 'Ring 1', slot: 'Ring 1', item: 'Ring', status: 'calculated', without: 650, delta: 350, lossPercent: 35, pendingLines: 1 },
      { id: 'Ring 2', slot: 'Ring 2', item: 'Ring', status: 'calculated', without: 550, delta: 450, lossPercent: 45, pendingLines: 0 },
    ] };
    const groups = groupDamageAttribution(readDamageAttribution(result));
    expect(groups.map((group) => group.slot)).toEqual(['Ring 2', 'Ring 1']);
    expect(groups[1]!.positive.map((row) => row.delta)).toEqual([400, 150]);
    expect(groups[1]!.total?.delta).toBe(350); expect(groups[1]!.total?.pendingLines).toBe(1);
    expect(groups[1]!.pending[0]?.delta).toBeUndefined();
    expect(groupDamageAttribution(resultFixture).every((group) => group.total === undefined)).toBe(true);
    expect(() => readDamageAttribution({ ...result, items: [result.items![0], result.items![0]] })).toThrow('汇总');
    expect(() => readDamageAttribution({ ...result, items: result.items!.map((item) => ({ ...item, pendingLines: 0 })) })).toThrow('来源不一致');
  });
  it('rejects old gear or another import even when the item names stay the same', () => {
    const state = attributionState();
    rememberCalculationSnapshot(attributionXml, state.source!, [equipmentSignature(state.slots)]);
    expect(currentCalculationSnapshot(state)).toBeDefined();
    expect(currentCalculationSnapshot({ ...state, slots: { ...state.slots, ring1: state.slots.ring1!.replace('40%', '41%') } })).toBeUndefined();
    expect(currentCalculationSnapshot({ ...state, source: { ...state.source!, importedAt: '2026-01-01T00:00:00Z' } })).toBeUndefined();
  });
});
