import { equipmentTradeRows, buildEquipmentTrade, type EquipmentTradeRow } from './genericEquipmentTrade';
import { matchEquipmentStat, parseEquipment, type Equipment } from './genericEquipment';
import { slotLabel, type LoadoutSlot, type LoadoutState } from './loadout';
import type { DamageAttributionRow, DamageAttributionResult } from './damageAttribution';
import { workflowPreferences } from './workflowPreferences';
import { currentCalculationSnapshot } from './calculationSnapshot';
import { parsePobXml } from './pobImport';

const slots: Record<string, LoadoutSlot> = { 'Weapon 1': 'mainHand', 'Weapon 2': 'offHand', Helmet: 'helmet', 'Body Armour': 'body', Gloves: 'gloves', Boots: 'boots', Amulet: 'amulet', 'Ring 1': 'ring1', 'Ring 2': 'ring2', Belt: 'belt', 'Flask 1': 'flask1', 'Flask 2': 'flask2', 'Charm 1': 'charm1', 'Charm 2': 'charm2', 'Charm 3': 'charm3' };
export const attributionSlot = (row: Pick<DamageAttributionRow, 'slot'>) => slots[row.slot.replace(/ Swap$/, '')];
export interface AttributionMarketRow { id: string; slot?: LoadoutSlot; jewelNode?: string; equipment?: Equipment; filter?: EquipmentTradeRow; reason?: string }
const placements: Record<string, string> = { implicitModLines: 'implicit', enchantModLines: 'enchant', runeModLines: 'rune' };
const jewelNode = (slot: string) => /^(?:Jewel|Socket)\s*(\d+)$/.exec(slot)?.[1];

/** Resolve tree sockets by node and item ID in the matching calculation snapshot.
 * Never guess a jewel from its name or borrow another passive-tree spec's sockets. */
export function attributionJewelSources(state: LoadoutState, result: DamageAttributionResult): ReadonlyMap<string, Equipment> {
  const sources = new Map<string, Equipment>(), snapshot = currentCalculationSnapshot(state);
  if (!snapshot || !result.rows.some((row) => jewelNode(row.slot))) return sources;
  try {
    const xml = new DOMParser().parseFromString(snapshot.xml, 'text/xml');
    const tree = [...xml.documentElement.children].find((child) => child.tagName === 'Tree');
    if (!tree) return sources;
    const index = Number(tree.getAttribute('activeSpec') ?? '1') - 1;
    const spec = [...tree.children].filter((child) => child.tagName === 'Spec')[index];
    if (!spec || !Number.isInteger(index) || index < 0) return sources;
    const items = parsePobXml(snapshot.xml).items;
    const allocations = spec.getAttribute('nodes')?.split(',').map((node) => node.trim());
    const bindings = [...spec.querySelectorAll('Sockets > Socket')];
    for (const row of result.rows) {
      const node = jewelNode(row.slot);
      if (!node || sources.has(row.slot) || allocations && !allocations.includes(node)) continue;
      const matching = bindings.filter((binding) => binding.getAttribute('nodeId') === node);
      if (matching.length !== 1) continue;
      const itemId = matching[0]!.getAttribute('itemId') ?? '', raw = items[itemId]?.raw;
      const equipment = raw && parseEquipment(raw);
      if (!equipment || equipment.category !== 'jewel' || !equipment.baseNameEnglish) continue;
      const name = equipment.nameEnglish ?? equipment.name;
      if (row.item !== name && row.item !== `${name}, ${equipment.baseNameEnglish}`) continue;
      sources.set(row.slot, equipment);
    }
  } catch { /* Missing/corrupt evidence keeps jewel filters unavailable, never guessed. */ }
  return sources;
}

/** Resolve the actual item's modifier and placement, never infer a trade ID from a DPS score. */
export function attributionMarketRow(state: LoadoutState, row: DamageAttributionRow, jewels?: ReadonlyMap<string, Equipment>): AttributionMarketRow {
  const slot = attributionSlot(row), node = jewelNode(row.slot);
  const equipment = slot ? parseEquipment(state.slots[slot] ?? '') ?? undefined : jewels?.get(row.slot);
  const base = { id: row.id, slot, equipment, ...(node ? { jewelNode: node } : {}) };
  if (!equipment?.category) return { ...base, reason: node ? '未能核对当前天赋方案的珠宝来源，请重新导入完整 PoB 并计算。' : '该物品不在当前可定位的装备栏，暂不能确定检索类别。' };
  if (row.placement === 'buffModLines') return { ...base, reason: '这是物品生成的增益，不能直接视为可交易词缀。' };
  const placement = placements[row.placement], probe = matchEquipmentStat(row.line);
  const matches = equipment.mods.filter((mod) => mod.searchable && mod.ref && mod.ref === probe.ref
    && JSON.stringify(mod.values) === JSON.stringify(probe.values)
    && (placement ? mod.ids.every((id) => id.startsWith(`${placement}.`)) : !mod.ids.some((id) => /^(implicit|enchant|rune)\./.test(id))));
  if (!matches.length) return { ...base, reason: '尚未匹配当前物品该词缀及其来源的官方交易条件。' };
  if (new Set(matches.map((mod) => [...mod.ids].sort().join(','))).size !== 1) return { ...base, reason: '同值词缀存在不同来源，请先核对对应的官方条件。' };
  const filter = equipmentTradeRows({ ...equipment, mods: [matches[0]!] }, 'strict').find((entry) => entry.ids.length > 0);
  if (!filter) return { ...base, reason: '该效果暂无独立的官方交易条件。' };
  return { ...base, filter: { ...filter, key: row.id, enabled: true } };
}

export type AttributionMarketFloor = 'current' | 'presence' | '3' | '5';
/** One AND query per source slot. Do not demand an entire loadout's affixes on one item. */
export function attributionMarketQueries(state: LoadoutState, entries: readonly AttributionMarketRow[], league: string, floor: AttributionMarketFloor = 'current') {
  const groups = new Map<string, AttributionMarketRow[]>();
  for (const entry of entries) if (entry.filter && (entry.slot || entry.jewelNode) && entry.equipment) {
    const source = entry.slot ?? `jewel:${entry.jewelNode}`;
    const group = groups.get(source) ?? []; group.push(entry); groups.set(source, group);
  }
  const workflow = workflowPreferences(state);
  return [...groups].map(([slot, group]) => {
    const filters = new Map<string, EquipmentTradeRow>();
    for (const entry of group) {
      const row = entry.filter!, identity = [...row.ids].sort().join(',');
      const previous = filters.get(identity);
      // Official trade reports the total for repeated modifiers in the same placement.
      const actualValue = row.actualValue === undefined || previous && previous.actualValue === undefined ? undefined : row.actualValue + (previous?.actualValue ?? 0);
      filters.set(identity, { ...row, actualValue, presenceOnly: row.presenceOnly || previous?.presenceOnly });
    }
    const rows = [...filters.values()].map((row) => ({ ...row, enabled: true, max: '',
      min: floor === 'presence' || row.presenceOnly || row.actualValue === undefined || row.actualValue <= 0 ? ''
        : String(Number((row.actualValue * (1 + (floor === 'current' ? 0 : Number(floor)) / 100)).toFixed(6))),
    }));
    const origin = group[0]!;
    const result = buildEquipmentTrade({ equipment: origin.equipment!, league, rows, exactBase: !!origin.jewelNode, exactUnique: true,
      sameCorruption: false, budget: workflow.budget ? String(workflow.budget) : '', budgetCurrency: workflow.currency });
    return { slot, label: origin.slot ? slotLabel(origin.slot) : `珠宝 ${origin.jewelNode}`, selectedCount: group.length, conditions: rows.length, ...result };
  });
}
