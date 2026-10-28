export interface DamageAttributionRow {
  id: string; slot: string; item: string; line: string; placement: string;
  status: 'calculated' | 'pending'; without?: number; delta?: number; lossPercent?: number; reason?: string;
}
export interface DamageAttributionResult {
  version: 1; engine: string; metric: 'CombinedDPS' | 'TotalDPS'; baseline: number; skill: string; rows: DamageAttributionRow[]; items?: DamageAttributionItem[];
}
export interface DamageAttributionItem extends Omit<DamageAttributionRow, 'line' | 'placement'> { pendingLines: number }
export function readDamageAttribution(value: unknown): DamageAttributionResult {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15;
  if (!object(value) || value.version !== 1 || value.engine !== 'PoB2 v0.23.1' || !['CombinedDPS', 'TotalDPS'].includes(String(value.metric))
    || !finite(value.baseline) || value.baseline <= 0 || typeof value.skill !== 'string' || value.skill.length > 200 || !Array.isArray(value.rows) || value.rows.length > 600) throw new Error('PoB 贡献结果格式无效。');
  const ids = new Set<string>();
  for (const row of value.rows as unknown[]) {
    if (!object(row) || ['id', 'slot', 'item', 'line', 'placement'].some((key) => typeof row[key] !== 'string' || row[key].length > 3000)
      || ids.has(String(row.id)) || !['calculated', 'pending'].includes(String(row.status))) throw new Error('PoB 词缀结果无效。');
    ids.add(String(row.id));
    if (row.status === 'calculated' && (!finite(row.without) || row.without < 0 || !finite(row.delta) || !finite(row.lossPercent)
      || Math.abs(row.delta - (value.baseline - row.without)) > Math.max(1e-5, value.baseline * 1e-7)
      || Math.abs(row.lossPercent - 100 * row.delta / value.baseline) > 1e-5)) throw new Error('PoB 词缀差值不一致。');
    if (row.status === 'pending' && (typeof row.reason !== 'string' || row.reason.length > 1000 || row.delta !== undefined || row.without !== undefined || row.lossPercent !== undefined)) throw new Error('待核对词缀不能带有虚构贡献。');
  }
  if (value.items !== undefined) {
    if (!Array.isArray(value.items) || value.items.length > 100) throw new Error('PoB 装备汇总格式无效。');
    const slots = new Set<string>();
    for (const item of value.items as unknown[]) {
      if (!object(item) || ['id', 'slot', 'item'].some((key) => typeof item[key] !== 'string' || item[key].length > 3000)
        || slots.has(String(item.slot)) || !Number.isInteger(item.pendingLines) || Number(item.pendingLines) < 0 || Number(item.pendingLines) > 600) throw new Error('PoB 装备汇总无效。');
      slots.add(String(item.slot));
      const rows = (value.rows as DamageAttributionRow[]).filter((row) => row.slot === item.slot);
      if (rows.some((row) => row.item !== item.item) || rows.filter((row) => row.status === 'pending').length !== item.pendingLines) throw new Error('PoB 装备汇总与词缀来源不一致。');
      // Reuse the same arithmetic and pending-value checks without recomputing totals from rows.
      readDamageAttribution({ ...value, items: undefined, rows: [{ ...item, line: '', placement: 'all' }] });
    }
    if ((value.rows as DamageAttributionRow[]).some((row) => !slots.has(row.slot))) throw new Error('PoB 装备汇总缺少来源装备。');
  }
  return value as unknown as DamageAttributionResult;
}
export function groupDamageAttribution(result: DamageAttributionResult) {
  const slots = [...new Set([...result.rows.map((row) => row.slot), ...result.items?.map((item) => item.slot) ?? []])];
  return slots.map((slot) => {
    const rows = result.rows.filter((row) => row.slot === slot), ranked = rankDamageAttribution({ ...result, rows });
    const total = result.items?.find((item) => item.slot === slot);
    return { slot, item: total?.item ?? rows[0]!.item, total, ...ranked };
  }).sort((a, b) => {
    const aKnown = a.total?.status === 'calculated', bKnown = b.total?.status === 'calculated';
    return Number(bKnown) - Number(aKnown) || (aKnown && bKnown ? b.total!.delta! - a.total!.delta! : 0) || a.slot.localeCompare(b.slot);
  });
}
export function rankDamageAttribution(result: DamageAttributionResult) {
  const numeric = result.rows.filter((row) => row.status === 'calculated').sort((a, b) => b.delta! - a.delta! || a.id.localeCompare(b.id));
  return { positive: numeric.filter((row) => row.delta! > 1e-7), other: numeric.filter((row) => row.delta! <= 1e-7), pending: result.rows.filter((row) => row.status === 'pending') };
}
