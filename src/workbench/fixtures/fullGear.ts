/** Clipboard fixtures containing no account or character identifiers. */
export const NORMAL_MANA_FLASK_SAMPLE = `物品種類: 魔力藥劑
稀有度: 中
終極魔力藥劑
--------
3 秒內恢復 310 魔力
每次使用會從 75 充能次數中消耗 10 次
目前有 29 充能次數
--------
需求: 等級 60
--------
物品等級: 65
--------
右鍵點擊以喝下藥劑。只有裝備於腰帶上時才會充能。在水井或殺死怪物可回復充能次數。`;

export const MANA_FLASK_SAMPLE = `物品種類: 魔力藥劑
稀有度: 魔法
豐沛的終極魔力藥劑
--------
每次使用會從 75 充能次數中消耗 10 次
目前有 0 充能次數
--------
需求: 等級 60
--------
物品等級: 65
--------
右鍵點擊以喝下藥劑。只有裝備於腰帶上時才會充能。在水井或殺死怪物可回復充能次數。`;

export const BOOTS_SAMPLE = `Item Class: Boots
Rarity: Rare
Dusk Trail
Adherent Leggings
--------
Armour: 200 (augmented)
Energy Shield: 80 (augmented)
--------
Requirements:
Level: 60
--------
Item Level: 82
--------
{ Prefix Modifier "Healthy" (Tier: 1) — Life }
+100(90-100) to maximum Life
{ Suffix Modifier "of the Ice" (Tier: 2) — Cold, Resistance }
+35(31-35)% to Cold Resistance
{ Prefix Modifier "Hellion's" (Tier: 1) — Speed }
30(25-30)% increased Movement Speed`;

export const BOOTS_UPGRADE = BOOTS_SAMPLE.replace('Dusk Trail', 'Dawn Trail')
  .replace('+100(90-100)', '+120(110-120)').replace('200 (augmented)', '250 (augmented)');

export const WEAPON_SAMPLE = `Item Class: Bows
Rarity: Rare
Storm Branch
Crude Bow
--------
Physical Damage: 100-200 (augmented)
Elemental Damage: 10-20, 30-40 (augmented)
Attacks per Second: 1.50 (augmented)
--------
Item Level: 82
--------
100% increased Physical Damage
20% increased Attack Speed`;
