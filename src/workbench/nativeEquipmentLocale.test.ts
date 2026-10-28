import { expect, it } from 'vitest';
import { nativeEquipmentModifier } from './nativeEquipmentLocale';

it('preserves the distinction between increased and reduced socket effects', () => {
  expect(nativeEquipmentModifier('每個鑲嵌的插槽使對你的擊中減少23%暴擊傷害加成'))
    .toBe('Hits against you have 23% reduced Critical Damage Bonus per Socket filled');
  expect(nativeEquipmentModifier('每个镶嵌的插槽使对你的击中增加23%暴击伤害加成'))
    .toBe('Hits against you have 23% increased Critical Damage Bonus per Socket filled');
});

it('preserves signed and decimal values and does not guess unknown descriptions', () => {
  expect(nativeEquipmentModifier('命定： +5%至全部技能的品質')).toBe('Bonded: +5% to Quality of all Skills');
  expect(nativeEquipmentModifier('+30護甲值')).toBe('+30 to Armour');
  expect(nativeEquipmentModifier('-30护甲值')).toBe('-30 to Armour');
  expect(nativeEquipmentModifier('每个镶嵌的插槽使对你的击中减少23.5%暴击伤害加成'))
    .toBe('Hits against you have 23.5% reduced Critical Damage Bonus per Socket filled');
  expect(nativeEquipmentModifier('尚未核对的特殊效果 +30')).toBeUndefined();
});
