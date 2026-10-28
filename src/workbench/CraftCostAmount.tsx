import { uiText } from './uiLocale';
import type { Engine } from '../lib/engine';
import { formatCost } from './model';

/** Display conversion uses the solver's own price basis, never a newer, unrelated market rate. */
export default function CraftCostAmount({ value, prices, overrides = {} }: {
  value: number; prices?: Engine['prices']; overrides?: Readonly<Record<string, number>>;
}) {
  if (!Number.isFinite(value) || value < 0) return <span>{uiText("尚无有效成本")}</span>;
  const rate = overrides.divine ?? prices?.currency.divine;
  const divine = rate !== undefined && Number.isFinite(rate) && rate > 0 ? value / rate : undefined;
  const converted = Number.isFinite(value) && value >= 1000 && divine !== undefined && Number.isFinite(divine) && divine >= 1;
  const original = `${formatCost(value)} Ex`;
  const source = [prices?.meta?.league, prices?.meta?.updated ?? prices?.meta?.generated].filter(Boolean).join(' · ');
  const title = converted ? `原始成本：${value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} Ex；1 神圣石 = ${rate!.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} Ex。成本价格表${source ? `：${source}` : ''}${overrides.divine !== undefined ? '（使用手填神圣石价格）' : ''}。`
    : Number.isFinite(value) && value >= 1000 && (rate === undefined || !Number.isFinite(rate) || rate <= 0) ? '缺少有效的神圣石汇率，保留原始 Ex 成本。' : undefined;
  return <span title={uiText(title)}>{uiText(converted ? `≈ ${divine.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 神圣石` : original)}</span>;
}
