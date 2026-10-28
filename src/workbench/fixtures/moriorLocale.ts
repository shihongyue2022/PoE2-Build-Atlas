/** Reproduces the reported upgrade-search labels without account or character data. */
export const MORIOR_LOCALE_SAMPLE = `Item Class: Body Armours
Rarity: Unique
Morior Invictus
Grand Regalia
--------
Armour: 1389
Evasion Rating: 1278
Energy Shield: 393
--------
Item Level: 84
Sockets: S S S S S
--------
Bonded: +5% to Quality of all Skills (rune)
Hits against you have 23% reduced Critical Damage Bonus per Socket filled
+30 to Armour (rune)`;

export const MORIOR_LOCALE_CHINESE_SAMPLE = MORIOR_LOCALE_SAMPLE
  .replace('Bonded: +5% to Quality of all Skills', '命定: +5%至全部技能的品质')
  .replace('Hits against you have 23% reduced Critical Damage Bonus per Socket filled', '每个镶嵌的插槽使对你的击中减少23%暴击伤害加成')
  .replace('+30 to Armour', '+30护甲值');
