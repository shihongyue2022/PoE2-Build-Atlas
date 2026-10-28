import type { LoadoutState } from './loadout';
import type { PobSource } from './loadoutSource';
import { equipmentSignature } from './resistanceModel';
const KEY = 'poe2-workbench-calculation-xml-v1';
export interface CalculationSnapshot { version: 1; xml: string; importedAt: string; itemSetId: string; signatures: string[] }
/** Calculation sections only: no import accounts, notes, or cached outputs. */
export function calculationXml(root: Element): string {
  const document = root.ownerDocument.implementation.createDocument('', 'PathOfBuilding2');
  for (const child of root.children) {
    if (!['Build', 'Tree', 'Items', 'Skills', 'Config', 'Party'].includes(child.tagName)) continue;
    const copy = document.importNode(child, true);
    if (copy.tagName === 'Build') {
      for (const attribute of [...copy.attributes]) if (!['targetVersion', 'level', 'characterLevelAutoMode', 'mainSocketGroup', 'mainSkillIndex'].includes(attribute.name)) copy.removeAttribute(attribute.name);
      for (const nested of [...copy.children]) if (!['Spectre', 'BeastCompanion', 'TimelessData'].includes(nested.tagName)) nested.remove();
    }
    if (copy.tagName === 'Party') {
      for (const attribute of [...copy.attributes]) copy.removeAttribute(attribute.name);
      for (const nested of [...copy.children]) if (nested.tagName !== 'ImportedBuffs') nested.remove();
    }
    document.documentElement.append(copy);
  }
  return new XMLSerializer().serializeToString(document);
}
export function rememberCalculationSnapshot(xml: string | undefined, source: PobSource, signatures: string[]): string | undefined {
  try {
    if (!xml) { localStorage.removeItem(KEY); return '请重新导入完整 PoB2 文件以保存重算依据。'; }
    localStorage.setItem(KEY, JSON.stringify({ version: 1, xml, importedAt: source.importedAt, itemSetId: source.setId, signatures: [...new Set(signatures)] } satisfies CalculationSnapshot));
  } catch { try { localStorage.removeItem(KEY); } catch { /* Never reuse old calculation evidence. */ } return 'PoB 重算快照未能保存；请检查浏览器存储后重新导入。'; }
}
export function currentCalculationSnapshot(state: LoadoutState): CalculationSnapshot | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CalculationSnapshot | null;
    if (value?.version !== 1 || typeof value.xml !== 'string' || value.xml.length > 3_000_000 || !value.xml.startsWith('<PathOfBuilding2')
      || /<!DOCTYPE|<!ENTITY/i.test(value.xml) || value.importedAt !== state.source?.importedAt || value.itemSetId !== state.source?.setId
      || !Array.isArray(value.signatures) || !value.signatures.includes(equipmentSignature(state.slots))) return undefined;
    return value;
  } catch { return undefined; }
}
