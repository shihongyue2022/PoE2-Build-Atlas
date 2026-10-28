import type { EngineMod } from '../lib/engine';

/** Browsing groups only; native families, sources and tiers still decide legality. */
export const CRAFT_AFFIX_CATEGORIES = [
  ['added_damage', '点伤／额外伤害'], ['damage', '增伤／转伤'], ['speed', '攻击／施法／投射物速度'],
  ['critical', '暴击'], ['skill', '技能等级／技能效果'], ['ailment', '异常／穿透／诅咒'],
  ['resistance', '抗性'], ['life', '生命／回复'], ['mana', '魔力／回复'], ['spirit', '精魂'],
  ['defence', '防御／格挡'], ['attribute', '力量／敏捷／智慧'], ['movement', '移动／行动速度'],
  ['flask', '药剂／护符'], ['rarity', '掉落／稀有度'], ['magnitude', '品质／词缀效果'], ['other', '其他机制'],
] as const;
export type CraftAffixCategory = typeof CRAFT_AFFIX_CATEGORIES[number][0];
export const CRAFT_AFFIX_SOURCES: readonly (readonly [EngineMod['source'], string])[] = [
  ['normal', '普通随机词池'], ['essence', '普通精华'], ['perfect', '完美精华'],
  ['alloy', '合金'], ['desecrated', '亵渎'], ['rune', '符文解锁'],
];

export function craftAffixCategory(mod: Pick<EngineMod, 'text'>): CraftAffixCategory {
  const text = mod.text;
  if (/Quality|Modifier magnitudes/i.test(text)) return 'magnitude';
  if (/Flask|Charm/i.test(text)) return 'flask';
  if (/Rarity of Items|Quantity of Items|Item Rarity|Items found/i.test(text)) return 'rarity';
  if (/Movement Speed|Action Speed|Sprint/i.test(text)) return 'movement';
  if (/Resistance/i.test(text) && !/Penetrat|Enemy|Enemies/i.test(text)) return 'resistance';
  if (/Strength|Dexterity|Intelligence|Attributes/i.test(text)) return 'attribute';
  if (/Critical/i.test(text)) return 'critical';
  if (/Level of|Skill Levels|Grants.*Skill/i.test(text)) return 'skill';
  if (/Attack Speed|Cast Speed|Casting Speed|Projectile Speed/i.test(text)) return 'speed';
  if (/Ailment|Ignit|Shock|Chill|Freez|Bleed|Poison|Penetrat|Exposure|Curse/i.test(text)) return 'ailment';
  if (/Spirit/i.test(text)) return 'spirit';
  if (/Life|Health|Regenerat.*Life|Leech.*Life/i.test(text)) return 'life';
  if (/Mana/i.test(text)) return 'mana';
  if (/Armour|Evasion|Energy Shield|Block|Deflect|Ward|Stun Threshold/i.test(text)) return 'defence';
  if (/Adds? .*Damage|Gain .*Damage as Extra|Damage as Extra/i.test(text)) return 'added_damage';
  if (/Damage/i.test(text)) return 'damage';
  return 'other';
}
