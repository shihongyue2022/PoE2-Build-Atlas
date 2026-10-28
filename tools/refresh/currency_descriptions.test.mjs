import { expect, it } from 'vitest';
import { parseCurrencyDescription } from './currency_descriptions.mjs';

it('keeps the named game popup only including its minimum tier and usage instructions, excluding lore and commentary', () => {
  const html = '<div class="newItemPopup CurrencyPopup"><div class="itemName"><span>Perfect Exalted Orb</span></div><div class="Stats"><div class="property">Minimum Modifier Level: <span>50</span></div><div class="explicitMod">Adds a <a>random modifier</a></div></div><div class="default fst-italic">Right click.<br>Apply to rare item.</div><div class="FlavourText">Fictional lore</div></div><div class="explicitMod">Unrelated wiki commentary</div>';
  expect(parseCurrencyDescription(html, 'Perfect Exalted Orb', 'en')).toEqual({ name: 'Perfect Exalted Orb', properties: ['Minimum Modifier Level: 50'], effects: ['Adds a random modifier'], instructions: ['Right click.\nApply to rare item.'] });
  expect(() => parseCurrencyDescription(html, 'Exalted Orb', 'en')).toThrow('mismatched');
});
