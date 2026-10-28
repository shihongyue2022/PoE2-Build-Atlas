import type { Engine } from '../lib/engine';

export type CostCurrency = 'exalted' | 'divine' | 'chaos';
export const COST_CURRENCY_LABELS: Record<CostCurrency, string> = { divine: '神圣石', chaos: '混沌石', exalted: 'Ex' };
/** All rates are Ex per one unit. Input amounts retain their original currency when rates change. */
export interface CraftExchangeRates {
  league: string;
  asOf: string;
  source: string;
  rates: { exalted: number; divine?: number; chaos?: number };
}
export function snapshotCraftRates(engine: Engine, league: string): CraftExchangeRates {
  const same = !engine.prices.meta?.league || engine.prices.meta.league === league;
  const positive = (value?: number) => value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
  return { league, asOf: engine.prices.meta?.updated ?? engine.prices.meta?.generated ?? '', source: '内置价格快照',
    rates: { exalted: 1, divine: same ? positive(engine.prices.currency.divine) : undefined, chaos: same ? positive(engine.prices.currency.chaos) : undefined } };
}
export function convertCraftCost(value: number, from: CostCurrency, to: CostCurrency, exchange: CraftExchangeRates): number | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  if (from === to || value === 0) return value;
  const a = exchange.rates[from], b = exchange.rates[to];
  const converted = a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 ? value * a / b : undefined;
  return converted !== undefined && Number.isFinite(converted) ? converted : undefined;
}
export function isCostCurrency(value: unknown): value is CostCurrency {
  return value === 'divine' || value === 'chaos' || value === 'exalted';
}
