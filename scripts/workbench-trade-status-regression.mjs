import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture = await readFile(new URL('../src/workbench/fixtures/fullGear.ts', import.meta.url), 'utf8');
const raw = /BOOTS_SAMPLE = `([\s\S]*?)`;/.exec(fixture)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/workbench/estimate', async route => {
    const request = route.request().postDataJSON(); requests.push(request);
    await route.fulfill({ json: { ok: true, total: 0, fetched: 0, priced: 0, duplicateSellers: 0, groups: [], listings: [], warnings: [],
      sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites?q=fixture' } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5175/?companion=1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '粘贴游戏物品', exact: true }).click();
  await page.getByRole('textbox', { name: '游戏物品文本' }).fill(raw);
  await page.getByRole('button', { name: '识别并导入' }).click();
  const panel = page.getByRole('region', { name: '全物品查价', exact: true });
  const select = panel.getByRole('combobox', { name: '全装备交易方式' });
  await expect(select).toBeVisible(); await expect(select).toHaveValue('securable');
  const query = async () => JSON.parse(new URL(await panel.getByRole('link', { name: '官网核对联合条件 ↗' }).getAttribute('href')).searchParams.get('q'));
  const initial = await query(); assert.equal(initial.query.status.option, 'securable');
  assert.deepEqual(await select.getByRole('option').evaluateAll(options => options.map(option => option.value)), ['available', 'securable', 'onlineleague', 'online', 'any']);
  for (const mode of ['any', 'online', 'onlineleague', 'available', 'securable']) {
    await select.selectOption(mode); const current = await query();
    assert.equal(current.query.status.option, mode);
    assert.deepEqual(current.query.filters, initial.query.filters); assert.deepEqual(current.query.stats, initial.query.stats);
  }
  await mkdir('artifacts/workbench', { recursive: true });
  await panel.locator(':scope > .wb-section-head').screenshot({ path: 'artifacts/workbench/trade-status-desktop.png' });
  await select.selectOption('available');
  await panel.getByRole('button', { name: '检索提升候选' }).click();
  await expect.poll(() => requests.length).toBe(1); assert.equal(requests[0].search.query.status.option, 'available');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-trade-memory-v1') || '[]')[0]?.query.query.status.option)).toBe('available');
  const history = page.locator('.wb-trade-memory'); await history.locator(':scope > summary').click();
  await history.getByRole('button', { name: '打开原条件' }).first().click();
  const restoredLink = history.getByRole('link', { name: '官网搜索', exact: true }).first();
  assert.equal(JSON.parse(new URL(await restoredLink.getAttribute('href')).searchParams.get('q')).query.status.option, 'available');
  await select.selectOption('securable'); await page.setViewportSize({ width: 390, height: 844 });
  await expect(select).toBeVisible();
  assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth));
  await panel.locator(':scope > .wb-section-head').screenshot({ path: 'artifacts/workbench/trade-status-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS instant-buyout default, five exact official modes, unchanged item constraints, live request / history round-trip and mobile menu.');
} finally { await browser.close(); }
