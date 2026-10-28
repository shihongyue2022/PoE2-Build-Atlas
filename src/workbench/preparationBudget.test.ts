import { expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import type { Engine } from '../lib/engine';
import { breachPreparation } from './craftReference';
import { getOfficialCurrencyImageForName } from './currencyImages';
import { budgetNumber, emptyPreparationBudget, preparationBaseCost, preparationCostRows, preparationCostTotal, preparationMaterialKey, preparationMaterialPrice, readPreparationProjects, mergePreparationMaterials, CRAFT_LEDGER_TITLE } from './preparationBudget';
import { convertCraftCost, snapshotCraftRates } from './craftExchange';

const engine: Engine = { data: loadShippedPatch('data/patches/0.5.0'), prices: indexPrices({ league: 'Test', prices: { annul: 2, chaos: 4, exalt_perfect: 10, divine: 100, desecrate_ancient: 999, perfect_essence: 77 },
  bones: { collarbone_ancient: 17 }, omens: { OmenofWhittling: 8, OmenofSinistralNecromancy: 3 } }) };
const guide = breachPreparation('Breach Ring', 60)!;

it('moves old preparation and route expenses into one row per material without losing quantity, cost or quote units', () => {
  const budget = emptyPreparationBudget();
  budget.materials[preparationMaterialKey('清理品质前缀', 'Orb of Annulment')] = { selected: true, quantity: '2' };
  budget.materials[preparationMaterialKey(CRAFT_LEDGER_TITLE, 'Orb of Annulment')] = { selected: true, quantity: '3' };
  budget.materials[preparationMaterialKey('未使用准备', 'Orb of Annulment')] = { selected: false, quantity: '99' };
  budget.prices['Orb of Annulment'] = '4'; budget.priceUnits = { 'Orb of Annulment': 'chaos' };
  budget.baseCost = { included: true, amount: '7', unit: 'divine' };
  const merged = mergePreparationMaterials(budget), key = preparationMaterialKey(CRAFT_LEDGER_TITLE, 'Orb of Annulment');
  expect(merged.materials).toEqual({ [key]: { selected: true, quantity: '5' } });
  expect(merged.priceUnits).toEqual(budget.priceUnits); expect(merged.baseCost).toEqual(budget.baseCost);
  expect(preparationCostTotal(preparationCostRows([{ title: CRAFT_LEDGER_TITLE, materials: ['Orb of Annulment'] }], merged, engine, 'Test')).total).toBe(80);
  expect(mergePreparationMaterials(merged)).toEqual(merged);
  budget.materials[key]!.quantity = '';
  expect(mergePreparationMaterials(budget).materials[key]).toEqual({ selected: true, quantity: '' });
});

it('retains manual quote units and base purchase amount while converting all costs with the chosen rate', () => {
  const budget = emptyPreparationBudget(), exchange = snapshotCraftRates(engine, 'Test');
  budget.prices['Fracturing Orb'] = '2'; budget.priceUnits = { 'Fracturing Orb': 'divine' };
  budget.materials[preparationMaterialKey(guide.steps[0]!.title, 'Fracturing Orb')] = { selected: true, quantity: '3' };
  budget.baseCost = { included: true, amount: '5', unit: 'chaos' };
  budget.currency = 'chaos'; budget.manualRates = { divine: '100', chaos: '4' };
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test', exchange)).total).toBe(600);
  expect(preparationBaseCost(budget, exchange)).toBe(20);
  expect(convertCraftCost(620, 'exalted', 'divine', exchange)).toBe(6.2);
  expect(convertCraftCost(620, 'exalted', 'chaos', exchange)).toBe(155);
  const changed = { ...exchange, rates: { exalted: 1, divine: 200, chaos: 10 } };
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test', changed)).total).toBe(1200);
  expect(preparationBaseCost(budget, changed)).toBe(50);
  expect(budget.prices['Fracturing Orb']).toBe('2');
  expect(readPreparationProjects(JSON.stringify([{ league: 'Test', referenceRaw: 'sample', budget }]))[0]?.budget).toEqual(budget);
  budget.baseCost.amount = '';
  expect(preparationBaseCost(budget, exchange)).toBeUndefined();
  const unknown = snapshotCraftRates(engine, 'Other League');
  expect(convertCraftCost(100, 'exalted', 'divine', unknown)).toBeUndefined();
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Other League', unknown))).toMatchObject({ missingPrice: 1, total: undefined });
});

it('prices exact orb grades, omens and collarbones without substituting another material or a generic essence', () => {
  expect(preparationMaterialPrice(engine, 'Perfect Exalted Orb', 'Test')).toBe(10);
  expect(preparationMaterialPrice(engine, 'Chaos Orb', 'Test')).toBe(4);
  expect(preparationMaterialPrice(engine, 'Omen of Whittling', 'Test')).toBe(8);
  expect(preparationMaterialPrice(engine, 'Ancient Collarbone', 'Test')).toBe(17);
  expect(preparationMaterialPrice(engine, 'Essence of the Breach', 'Test')).toBeUndefined();
  expect(preparationMaterialPrice(engine, "Xoph's Catalyst", 'Test')).toBeUndefined();
  expect(preparationMaterialPrice(engine, 'Fracturing Orb', 'Test')).toBeUndefined();
  expect(preparationMaterialPrice(engine, 'Divine Orb', 'Other League')).toBeUndefined();
  for (const step of guide.steps) for (const material of step.materials) {
    expect(getOfficialCurrencyImageForName(material)?.url).toMatch(/^https:\/\/web\.poecdn\.com\//);
  }
  expect(getOfficialCurrencyImageForName('Imaginary Catalyst')).toBeUndefined();
});

it('sums only selected quantities, reports partial costs honestly, and accepts explicit zeros', () => {
  const budget = emptyPreparationBudget();
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test')).total).toBeUndefined();
  const annul = preparationMaterialKey(guide.steps[2]!.title, 'Orb of Annulment');
  const fracture = preparationMaterialKey(guide.steps[0]!.title, 'Fracturing Orb');
  budget.materials[annul] = { selected: true, quantity: '3' };
  budget.materials[fracture] = { selected: true, quantity: '2' };
  let summary = preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test'));
  expect(summary).toMatchObject({ known: 6, missingPrice: 1, total: undefined });
  budget.prices['Fracturing Orb'] = '7.5';
  summary = preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test'));
  expect(summary.total).toBe(21);
  budget.materials[fracture].quantity = '';
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test'))).toMatchObject({ missingQuantity: 1, total: undefined });
  budget.materials[fracture].quantity = '0'; delete budget.prices['Fracturing Orb'];
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test')).total).toBe(6);
  budget.prices['Orb of Annulment'] = '-1';
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test')).total).toBeUndefined();
  budget.prices['Orb of Annulment'] = '0';
  expect(preparationCostTotal(preparationCostRows(guide.steps, budget, engine, 'Test')).total).toBe(0);
  expect(budgetNumber('1.5', true)).toBeUndefined(); expect(budgetNumber('-1', true)).toBeUndefined();
});

it('keeps per-step use separate, shares an exact material price and rejects stale or malformed storage', () => {
  const steps = [{ title: 'first', materials: ['Orb of Annulment'] }, { title: 'second', materials: ['Orb of Annulment'] }], budget = emptyPreparationBudget();
  budget.materials[preparationMaterialKey('first', 'Orb of Annulment')] = { selected: true, quantity: '2' };
  budget.materials[preparationMaterialKey('second', 'Orb of Annulment')] = { selected: true, quantity: '3' };
  budget.prices['Orb of Annulment'] = '4';
  expect(preparationCostTotal(preparationCostRows(steps, budget, engine, 'Test')).total).toBe(20);
  expect(readPreparationProjects(JSON.stringify([{ league: 'Test', referenceRaw: 'original', budget }]))[0]?.budget).toEqual(budget);
  expect(readPreparationProjects('broken')).toEqual([]);
  expect(readPreparationProjects(JSON.stringify([{ league: 'Test', referenceRaw: 'x', budget: { materials: { x: { selected: true, quantity: 5 } } } }]))[0]?.budget.materials).toEqual({});
});
