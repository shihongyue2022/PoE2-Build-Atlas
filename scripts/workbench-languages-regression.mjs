import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/';
const catalogs = Object.fromEntries(await Promise.all(['en', 'ja'].map(async (locale) => [locale,
  JSON.parse(await readFile(new URL(`../src/workbench/data/ui/${locale}.json`, import.meta.url), 'utf8')),
])));
async function assertLocalized(locale, stage) {
  const text = await page.evaluate(() => {
    const result = [];
    const walker = document.createTreeWalker(document.querySelector('.wb-app'), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, element = node.parentElement;
      // Raw item text and the multilingual language menu must keep their original content.
      if (element.getClientRects().length && !element.closest('textarea, pre, .wb-language')) {
        const value = node.textContent.trim();
        if (value) result.push(value);
      }
    }
    for (const select of document.querySelectorAll('select')) {
      if (select.getClientRects().length && !select.closest('.wb-language')) {
        result.push(...[...select.selectedOptions].map((option) => option.textContent.trim()));
      }
    }
    return [...new Set(result)];
  });
  const residual = locale === 'en' ? text.filter((value) => /[\u3400-\u9fff]/.test(value))
    : text.filter((value) => value.length >= 4 && catalogs.en[value] && catalogs.ja[value] && catalogs.ja[value] !== value);
  assert.deepEqual(residual, [], `Untranslated interface text: ${locale} / ${stage}`);
  for (const input of await page.locator('input[type="file"]').all()) {
    assert(await input.isHidden(), 'Native file captions must not expose the browser language');
  }
}
async function auditWorkspaces(locale, stage) {
  await page.getByRole('combobox', { name: 'Interface language / 表示言語 / 界面语言' }).selectOption(locale);
  const tabs = page.locator('.wb-tabs button');
  for (let index = 0; index < await tabs.count(); index++) {
    await tabs.nth(index).click();
    const sample = page.getByRole('button', { name: catalogs[locale]['戒指目标示例'], exact: true });
    if (await sample.isVisible()) await sample.click();
    // Include instructions hidden behind disclosure widgets, not only the first-screen labels.
    await page.locator('details').evaluateAll((panels) => panels.forEach((panel) => { panel.open = true; }));
    await assertLocalized(locale, `${stage} / ${await tabs.nth(index).textContent()}`);
  }
}
await mkdir('artifacts/i18n', { recursive: true });
try {
  await page.goto(`${base}?lang=en`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Character equipment', exact: true }).waitFor();
  const language = page.getByRole('combobox', { name: 'Interface language / 表示言語 / 界面语言' });
  await page.getByRole('button', { name: 'Paste item', exact: true }).click();
  const draft = page.locator('.wb-paste textarea');
  await draft.fill('Rarity: Rare\nTest Ring\nAmethyst Ring\n--------\nItem Level: 82\n--------\n+30% to Fire Resistance');
  const original = await draft.inputValue();
  const stores = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('ui-language'))));
  await language.selectOption('ja');
  await page.getByRole('navigation', { name: '作業エリア' }).getByRole('button', { name: 'キャラクター装備', exact: true }).waitFor();
  assert.equal(await draft.inputValue(), original);
  assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('ui-language')))), stores);
  await page.screenshot({ path: 'artifacts/i18n/japanese-desktop.png', fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await language.inputValue(), 'ja');
  await language.selectOption('en');
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Crafting planner', exact: true }).click();
  await page.screenshot({ path: 'artifacts/i18n/english-crafting.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await language.selectOption('ja');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: 'artifacts/i18n/japanese-mobile.png', fullPage: true });
  await language.selectOption('zh-CN');
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '角色装备', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const locale of ['en', 'ja']) await auditWorkspaces(locale, 'expanded help');
  await language.selectOption('en');
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Character equipment', exact: true }).click();
  const xml = '<PathOfBuilding2><Items><Item id="1"><![CDATA[Rarity: NORMAL\nAmethyst Ring\nItem Level: 82\nImplicits: 1\n+12% to Chaos Resistance]]></Item><ItemSet id="1" title="Current"><Slot name="Ring 1" itemId="1" /></ItemSet></Items></PathOfBuilding2>';
  const chooserEvent = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose XML file', exact: true }).click();
  const chooser = await chooserEvent;
  await chooser.setFiles({ name: 'language-check.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) });
  await page.getByRole('button', { name: /Confirm loadout replacement/ }).waitFor();
  await assertLocalized('en', 'XML preview');
  await language.selectOption('ja');
  await assertLocalized('ja', 'XML preview');
  assert((await page.locator('.wb-file-picker').first().textContent()).includes('language-check.xml'));
  await page.getByRole('button', { name: /装備一式の置き換えを確定/ }).click();
  for (const locale of ['en', 'ja']) await auditWorkspaces(locale, 'imported character');
  await page.getByRole('navigation', { name: '作業エリア' }).getByRole('button', { name: 'キャラクター装備', exact: true }).click();
  await page.screenshot({ path: 'artifacts/i18n/japanese-import-help.png', fullPage: true });
  await language.selectOption('en');
  await page.screenshot({ path: 'artifacts/i18n/english-import-help.png', fullPage: true });
  const equipmentSource = await readFile(new URL('../src/workbench/fixtures/moriorLocale.ts', import.meta.url), 'utf8');
  const equipment = /MORIOR_LOCALE_SAMPLE = `([\s\S]*?)`;/.exec(equipmentSource)[1];
  if (!await page.locator('.wb-paste textarea').isVisible()) await page.getByRole('button', { name: 'Paste item', exact: true }).click();
  await page.locator('.wb-paste textarea').fill(equipment);
  await page.locator('.wb-paste .wb-button.primary').click();
  const core = page.locator('.wb-equipment-core-search');
  await core.waitFor();
  for (let index = 1; index < 6; index++) await core.getByRole('button', { name: 'Add stat', exact: true }).click();
  assert.equal(await core.locator('.wb-core-axis-property').count(), 6);
  const queryLinks = () => core.locator('.wb-core-price a[href*="pathofexile.com"]').evaluateAll((links) => links.map((link) => link.href));
  const originalQueryLinks = await queryLinks();
  assert(originalQueryLinks.length > 0);
  for (const locale of ['en', 'ja']) {
    await language.selectOption(locale);
    await assertLocalized(locale, 'Morior Invictus six-stat upgrade search');
    const summary = await core.locator('.wb-core-conditions').textContent();
    if (locale === 'ja') {
      assert(summary.includes('絆：全てのスキルの品質 +5% ≥ 5'));
      assert(summary.includes('クリティカルダメージボーナスが23%減少する ≥ 23'));
      assert(summary.includes('アーマー +30 ≥ 30'));
    } else {
      assert(/Bonded: \+?5% to Quality of all Skills ≥ 5/.test(summary));
      assert(summary.includes('23% reduced Critical Damage Bonus per Socket filled ≥ 23'));
    }
    assert.deepEqual(await queryLinks(), originalQueryLinks, 'Language switches must not change official query IDs or values');
    await core.screenshot({ path: `artifacts/i18n/${locale}-morior-search.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Equipment search must fit mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: language switching, draft/storage preservation, reload, mobile layout, expanded help, crafting sample, XML import, and Morior Invictus six-stat search with unchanged official queries.');
} finally {
  await browser.close();
}
