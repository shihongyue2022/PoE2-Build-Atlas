import { parseItemText } from '../../packages/engine/src/parseItem';
import type { EngineMod } from '../lib/engine';
import type { WorkbenchItemImport } from './itemImport';

export interface ReferenceAffix {
  text: string;
  statedTier?: number;
  increase?: number;
}

/** Keep the copied values and the game's numeric tier as evidence. Never divide
 * every stat by catalyst quality: only the tagged groups are affected, and the
 * advanced copy's ranges may already describe the underlying roll. */
export function craftReference(parsed: WorkbenchItemImport) {
  const affixes = new Map<string, ReferenceAffix>();
  let header = '', lines: string[] = [];
  function flush() {
    if (!header || !lines.length) return;
    const group = parseItemText(`Rarity: Rare\nReference\n${parsed.baseNameEnglish ?? parsed.baseName}\n--------\n${header}\n${lines.join('\n')}`)?.mods.find(mod => mod.kind === 'explicit');
    if (!group) return;
    const tier = /\(Tier:\s*(\d+)\)/i.exec(header)?.[1];
    const increase = /(?:increased(?: by)?|增加)\s*(\d+(?:\.\d+)?)\s*%/i.exec(header)?.[1];
    affixes.set(group.lines.join('\n'), { text: lines.join('；'),
      ...(tier ? { statedTier: Number(tier) } : {}), ...(increase ? { increase: Number(increase) } : {}) });
  }
  for (const line of parsed.normalizedText.split('\n')) {
    if (/^\{|^-{4,}/.test(line)) { flush(); header = line.startsWith('{') ? line : ''; lines = []; }
    else if (header && line.trim()) lines.push(line);
  }
  flush();
  const qualityLine = parsed.rawText.split(/\r?\n/).find(line => /^(?:Quality|品質|品质)(?:[（(]|\s*:|\s*：)/i.test(line.trim()));
  const quality = qualityLine ? Number(/[:：]\s*\+?(\d+(?:\.\d+)?)%/.exec(qualityLine)?.[1]) : undefined;
  return { affixes, quality: Number.isFinite(quality) ? quality : undefined, qualityLine };
}

export function blueprintCeiling(mod: EngineMod, level: number) {
  const atLevel = mod.tiers.filter(tier => tier.ilvl <= level).sort((a, b) => a.display - b.display)[0];
  const highest = [...mod.tiers].sort((a, b) => a.display - b.display)[0];
  return { atLevel, highest };
}

export const BREACH_GUIDE_SOURCES = [
  { label: '作者实作：高点伤裂痕戒指', url: 'https://www.reddit.com/r/PathOfExile2/comments/1uo6iia/triple_flat_breach_ring_craft/', kind: 'community' },
  { label: '作者补充：品质必须先处理', url: 'https://www.reddit.com/r/PathOfExile2/comments/1uorq7h/triple_flat_damage_refined_breach_ring_update/', kind: 'community' },
  { label: '底座与固定词缀', url: 'https://poe2db.tw/us/Breach_Ring', kind: 'data' },
  { label: '裂痕精华机制', url: 'https://poe2db.tw/us/Essence', kind: 'data' },
  { label: '催化剂／催化崇高预兆', url: 'https://poe2db.tw/us/Catalysts', kind: 'data' },
  { label: '通货与预兆规则', url: 'https://poe2db.tw/us/Crafting', kind: 'data' },
  { label: '削凿之兆对应混沌石', url: 'https://poe2db.tw/us/Omen_of_Whittling', kind: 'data' },
] as const;

/** A researched preparation outline, not an engine policy or a guaranteed recipe.
 * Refined Breach Ring guides have a different implicit; do not copy their caps. */
export function breachPreparation(base: string | undefined, quality: number | undefined) {
  if (base !== 'Breach Ring') return undefined;
  return {
    checkedAt: '2026-10-23',
    steps: [
      { title: '选底座与破裂锚点', text: '按目标最低物等买未腐化、未复制的裂痕戒指；也可购买已有目标破裂词缀的底装。本例破裂稀有度，攻略常破裂点伤，两种起点不能混算。自行使用破裂石可能锁错词缀，先比较购买破裂底装。', materials: ['Fracturing Orb'] },
      { title: '先做品质准备，再填最终词缀', text: `普通裂痕戒指为基础 20% 品质上限加固定 +20%，合计 40%；裂痕精华临时前缀再加 20%，可准备到 60%。${quality !== undefined ? `样例品质为 ${quality}%。` : ''}火焰品质用索伏催化剂；精华会随机移除词缀后加前缀，需预留位置并检查要保留的词缀。`, materials: ['Essence of the Breach', "Xoph's Catalyst"] },
      { title: '清理临时品质前缀，核对实际底装', text: '同类实作会先达到品质目标，再移除临时的 +20% 最大品质前缀，腾出成品槽位。无效石随机移除词缀；混沌石＋削凿之兆是另一种需要核对最低词缀等级的方案，两者不是默认连续使用。移除后补品质受上限限制；更换催化类型或消耗品质后需要重新研究准备阶段。', materials: ['Orb of Annulment', 'Chaos Orb', 'Omen of Whittling'] },
      { title: '按所选词池生成词缀路线', text: '把真正准备好的底装粘贴到下方进入执行，按保留的破裂、前后缀空位和目标阶层计算。先完成重要属性，再按实际结果补其他目标；样例亵渎闪电点伤属于普通词池，本身不要求必须复刻亵渎来源。', materials: ['Perfect Exalted Orb', 'Ancient Collarbone', 'Omen of Sinistral Necromancy'] },
      { title: '阶层达标后再处理 roll', text: '神圣石调整已有词缀阶层内的数值，不把 T2 升成 T1；破裂词缀不能按普通可改词缀处理。这里只比较所选阶层的路线成本，品质准备、破裂试错和最终洗值须另外计入。', materials: ['Divine Orb'] },
    ],
  };
}
