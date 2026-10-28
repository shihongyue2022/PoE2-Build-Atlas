import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import EquipmentTradePanel from './EquipmentTradePanel';
import LanguageSelect from './LanguageSelect';
import { setUiLocale, useUiLocale } from './uiLocale';
import { MORIOR_LOCALE_SAMPLE, MORIOR_LOCALE_CHINESE_SAMPLE } from './fixtures/moriorLocale';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { corePriceAxes } from './corePricing';
import { parseEquipment } from './genericEquipment';

vi.mock('./workbenchRuntime', async (original) => ({
  ...await original<typeof import('./workbenchRuntime')>(), HOSTED_WORKBENCH: true,
}));
afterEach(() => { cleanup(); setUiLocale('zh-CN'); });

it.each([MORIOR_LOCALE_SAMPLE, MORIOR_LOCALE_CHINESE_SAMPLE])('keeps Morior constraints and query IDs stable while translating labels and the joint summary (%#)', (raw) => {
  function Harness() {
    useUiLocale();
    return <><LanguageSelect /><EquipmentTradePanel raw={raw} league="Test" intent="upgrade" onLeague={() => {}} /></>;
  }
  const original = parseEquipment(raw)!;
  expect(corePriceAxes(original, equipmentTradeRows(original))).toHaveLength(6);
  setUiLocale('en');
  const { container } = render(<Harness />);
  const selection = screen.getByRole('combobox', { name: /Interface language/ });
  for (let index = 1; index < 6; index++) fireEvent.click(screen.getByRole('button', { name: 'Add stat' }));
  const summary = container.querySelector('.wb-core-conditions')!;
  expect(summary.textContent).not.toMatch(/[\u3400-\u9fff]/);
  expect(summary).toHaveTextContent(/Bonded: \+?5% to Quality of all Skills ≥ 5/);
  expect(summary).toHaveTextContent('23% reduced Critical Damage Bonus per Socket filled ≥ 23');
  expect(summary).toHaveTextContent(/\+?30 to Armour ≥ 30/);
  const links = () => [...container.querySelectorAll<HTMLAnchorElement>('.wb-core-price a[href*="pathofexile.com"]')].map((link) => link.href);
  const originalLinks = links();
  expect(originalLinks.length).toBeGreaterThan(0);
  fireEvent.change(selection, { target: { value: 'ja' } });
  expect(summary).toHaveTextContent('絆：全てのスキルの品質 +5% ≥ 5');
  expect(summary).toHaveTextContent('クリティカルダメージボーナスが23%減少する ≥ 23');
  expect(summary).toHaveTextContent('アーマー +30 ≥ 30');
  const coreSelectors = container.querySelectorAll<HTMLSelectElement>('.wb-core-axis-property');
  expect(coreSelectors).toHaveLength(6);
  expect(within(coreSelectors[0]!).getByRole('option', { selected: true }).textContent).not.toContain('命定');
  expect(links()).toEqual(originalLinks);
  fireEvent.change(selection, { target: { value: 'zh-CN' } });
  expect(summary).toHaveTextContent('命定');
  expect(links()).toEqual(originalLinks);
  expect(parseEquipment(raw)).toEqual(original);
});
