import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../src/workbench/fixtures/fullGear.ts', import.meta.url), 'utf8');
const raw = /BOOTS_SAMPLE = `([\s\S]*?)`;/.exec(source)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; let requests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/workbench/estimate', async route => {
    requests++;
    const { league, search } = route.request().postDataJSON();
    assert.equal(league, 'Forbidden Rites');
    assert(search.query.stats.length);
    await route.fulfill({ json: { ok: true, total: 3, fetched: 3, priced: 3, duplicateSellers: 0,
      groups: [{ currency: 'divine', count: 3, min: 5, max: 9, median: 7, p25: 6, p75: 8 }],
      sampledAt: '2026-10-24T00:00:00Z', cached: false, url: 'https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites?q=test', warnings: [],
      listings: [5, 7, 9].map((amount, index) => ({ id: `fixture-${index}`, name: 'Comparable Boots', base: 'Adherent Leggings',
        price: { amount, currency: 'divine' }, properties: ['Armour: 200', 'Energy Shield: 80'], itemLevel: 82,
        explicitMods: ['+100 to maximum Life', '+35% to Cold Resistance', '30% increased Movement Speed'] })) } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5175/?companion=1', { waitUntil: 'networkidle' });
  await page.evaluate(async raw => {
    const { emptyLoadout, serializeLoadout, LOADOUT_STORAGE_KEY } = await import('/src/workbench/loadout.ts');
    localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout({ ...emptyLoadout(), slots: { boots: raw } }));
  }, raw);
  await page.reload({ waitUntil: 'networkidle' });
  const summary = page.getByRole('region', { name: '整套装备挂牌参考', exact: true });
  await expect(summary).toContainText('0 / 1 件已记录');
  assert.equal(requests, 0, 'loading a character must not batch query the market');
  await summary.getByRole('button', { name: '补齐未记录（1）' }).click();
  await expect(page.getByRole('note').filter({ hasText: '当前查价关联鞋靴' })).toBeVisible();
  const record = page.getByRole('button', { name: '记录到套装汇总（神圣石）' });
  await expect(record).toBeEnabled({ timeout: 30000 });
  assert.equal(requests, 1, 'explicit completion opens and queries the exact current item once');
  await record.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).quotes?.boots?.amount)).toBe(5);
  await page.getByRole('button', { name: '查看套装汇总' }).click();
  await expect(summary).toContainText('1 / 1 件已记录');
  await expect(summary).toContainText('5 神圣石（已记录部分）');
  await summary.getByText('逐件报价状态 · 0 件待补齐').click();
  await mkdir('artifacts/workbench', { recursive: true });
  await summary.screenshot({ path: 'artifacts/workbench/loadout-quote-summary.png' });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(summary).toContainText('1 / 1 件已记录');
  assert.equal(requests, 1);
  assert.deepEqual(errors, []);
  console.log('PASS summary completion → exact loadout pricing → explicit record → updated currency total → reload persistence; no automatic batch queries.');
} finally { await browser.close(); }
