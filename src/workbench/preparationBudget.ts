import type { Engine } from '../lib/engine';
import { convertCraftCost, isCostCurrency, snapshotCraftRates, type CostCurrency, type CraftExchangeRates } from './craftExchange';
import { getCurrencyImageIdForAction, getOfficialCurrencyImage } from './currencyImages';

export interface PreparationBudget {
  materials: Record<string, { selected: boolean; quantity: string }>;
  prices: Record<string, string>;
  priceUnits?: Record<string, CostCurrency>;
  currency?: 'divine' | 'chaos';
  baseCost?: { included: boolean; amount: string; unit: CostCurrency };
  manualRates?: { divine: string; chaos: string };
}
export const emptyPreparationBudget = (): PreparationBudget => ({ materials: {}, prices: {} });
export const preparationMaterialKey = (step: string, name: string): string => JSON.stringify([step, name]);
export const CRAFT_LEDGER_TITLE = '路线通货与预兆';
export function preparationMaterialName(key: string): string | undefined {
  try { const parts: unknown = JSON.parse(key); return Array.isArray(parts) && parts.length === 2 && typeof parts[1] === 'string' ? parts[1] : undefined; }
  catch { return undefined; }
}
/** Preserve recorded expenses when moving the old preparation columns into one material ledger. */
export function mergePreparationMaterials(budget: PreparationBudget): PreparationBudget {
  const groups = new Map<string, PreparationBudget['materials'][string][]>(), materials: PreparationBudget['materials'] = {};
  for (const [key, entry] of Object.entries(budget.materials)) {
    const name = preparationMaterialName(key);
    if (!name) { materials[key] = entry; continue; }
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  for (const [name, entries] of groups) {
    const selected = entries.filter(entry => entry.selected);
    let quantity = (selected[0] ?? entries[0])!.quantity;
    if (selected.length > 1) {
      const amounts = selected.map(entry => budgetNumber(entry.quantity, true));
      const sum = amounts.reduce<number>((total, value) => total + (value ?? 0), 0);
      quantity = amounts.every(value => value !== undefined) && sum <= 1_000_000 ? String(sum) : '';
    }
    materials[preparationMaterialKey(CRAFT_LEDGER_TITLE, name)] = { selected: !!selected.length, quantity };
  }
  return { ...budget, materials };
}
export const BUDGET_STORAGE = 'poe2-workbench-preparation-budgets-v1';
export interface PreparationBudgetProject { league: string; referenceRaw: string; budget: PreparationBudget }

export function readPreparationProjects(raw: string | null): PreparationBudgetProject[] {
  try {
    const projects: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(projects)) return [];
    return projects.slice(-8).flatMap((input: unknown) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
      const project = input as Record<string, unknown>, data = project.budget;
      if (typeof project.league !== 'string' || project.league.length > 200 || typeof project.referenceRaw !== 'string' || project.referenceRaw.length > 64_000 || !data || typeof data !== 'object' || Array.isArray(data)) return [];
      const budget = data as Record<string, unknown>, materials: PreparationBudget['materials'] = {}, prices: PreparationBudget['prices'] = {};
      const entries = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).slice(0, 100) : [];
      for (const [key, value] of entries(budget.materials)) {
        if (key.length > 1000 || !value || typeof value !== 'object' || Array.isArray(value)) continue;
        const material = value as Record<string, unknown>;
        if (typeof material.quantity === 'string' && material.quantity.length <= 40) materials[key] = { selected: material.selected === true, quantity: material.quantity };
      }
      for (const [name, value] of entries(budget.prices)) if (name.length <= 300 && typeof value === 'string' && value.length <= 40) prices[name] = value;
      const result: PreparationBudget = { materials, prices };
      if (budget.currency === 'divine' || budget.currency === 'chaos') result.currency = budget.currency;
      const units = entries(budget.priceUnits).filter(([name, value]) => name.length <= 300 && isCostCurrency(value));
      if (units.length) result.priceUnits = Object.fromEntries(units);
      const base = budget.baseCost;
      if (base && typeof base === 'object' && !Array.isArray(base)) {
        const input = base as Record<string, unknown>;
        if (typeof input.amount === 'string' && input.amount.length <= 40 && isCostCurrency(input.unit)) result.baseCost = { included: input.included === true, amount: input.amount, unit: input.unit };
      }
      const rates = budget.manualRates;
      if (rates && typeof rates === 'object' && !Array.isArray(rates)) {
        const input = rates as Record<string, unknown>;
        if (typeof input.divine === 'string' && input.divine.length <= 40 && typeof input.chaos === 'string' && input.chaos.length <= 40) result.manualRates = { divine: input.divine, chaos: input.chaos };
      }
      return [{ league: project.league, referenceRaw: project.referenceRaw, budget: result }];
    });
  } catch { return []; }
}

/** Exact species/grade only. Missing Fracturing/Catalyst/Essence quotes stay unknown. */
export function preparationMaterialPrice(engine: Engine, name: string, league: string): number | undefined {
  if (engine.prices.meta?.league && engine.prices.meta.league !== league) return undefined;
  const id = getCurrencyImageIdForAction(name);
  const key = id && getOfficialCurrencyImage(id)?.name === name ? id : undefined;
  const omen = ({ 'Omen of Whittling': 'OmenofWhittling', 'Omen of Sinistral Necromancy': 'OmenofSinistralNecromancy' } as Record<string, string>)[name];
  const value = key ? engine.prices.currency[key] : omen ? engine.prices.omens[omen]
    : name === 'Ancient Collarbone' ? engine.prices.bones?.collarbone_ancient : undefined;
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}
export function budgetNumber(raw: string, quantity = false): number | undefined {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim())) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= (quantity ? 1_000_000 : 1e12) && (!quantity || Number.isInteger(value)) ? value : undefined;
}

export interface PreparationCostRow {
  key: string; name: string; selected: boolean; quantity?: number; price?: number; subtotal?: number; manual: boolean;
}
export function preparationCostRows(steps: readonly { title: string; materials: readonly string[] }[], budget: PreparationBudget, engine: Engine, league: string, exchange = snapshotCraftRates(engine, league)): PreparationCostRow[] {
  return steps.flatMap(step => step.materials.map(name => {
    const key = preparationMaterialKey(step.title, name), entry = budget.materials[key];
    const quantity = budgetNumber(entry?.quantity ?? '1', true), rawPrice = budget.prices[name];
    const manual = rawPrice !== undefined && rawPrice.trim() !== '';
    const input = manual ? budgetNumber(rawPrice) : undefined;
    const currency = name === 'Divine Orb' ? 'divine' : name === 'Chaos Orb' ? 'chaos' : undefined;
    const price = manual ? input === undefined ? undefined : convertCraftCost(input, budget.priceUnits?.[name] ?? 'exalted', 'exalted', exchange)
      : currency ? exchange.rates[currency] : preparationMaterialPrice(engine, name, league);
    return { key, name, selected: entry?.selected === true, quantity, price, manual,
      subtotal: quantity === 0 ? 0 : quantity !== undefined && price !== undefined ? quantity * price : undefined };
  }));
}

export function preparationBaseCost(budget: PreparationBudget, exchange: CraftExchangeRates): number | undefined {
  if (!budget.baseCost?.included) return 0;
  const value = budgetNumber(budget.baseCost.amount);
  return value === undefined ? undefined : convertCraftCost(value, budget.baseCost.unit, 'exalted', exchange);
}
export function preparationCostTotal(rows: readonly PreparationCostRow[]) {
  const selected = rows.filter(row => row.selected);
  const missingQuantity = selected.filter(row => row.quantity === undefined).length;
  const missingPrice = selected.filter(row => row.quantity !== undefined && row.quantity > 0 && row.price === undefined).length;
  const known = selected.reduce((sum, row) => sum + (row.subtotal ?? 0), 0);
  return { selected: selected.length, known, missingQuantity, missingPrice,
    total: selected.length && !missingQuantity && !missingPrice ? known : undefined };
}
