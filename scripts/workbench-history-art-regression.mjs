import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixture = await readFile(new URL('../src/workbench/fixtures/fullGear.ts', import.meta.url), 'utf8');
const raw = /BOOTS_SAMPLE = `([\s\S]*?)`;/.exec(fixture)[1];
const base = { league: 'Forbidden Rites', saved: false, folder: '', updatedAt: '2026-10-24T10:00:00Z',
  query: { query: { status: { option: 'any' }, filters: { type_filters: { filters: {} } }, stats: [] }, sort: { price: 'asc' } },
  observation: { at: '2026-10-24T10:00:00Z', message: '1 项核心属性同时满足 · 挂牌参考', detail: '', failed: false } };
const entries = [
  { ...base, id: 'boots', title: '稀有长靴', raw },
  { ...base, id: 'unique', title: '亡者呼唤', raw: 'Item Class: Rings\nRarity: Unique\nDeath Rush\nEmerald Ring\n--------' },
  { ...base, id: 'map', title: '换界石（阶级 7）', raw: '物品種類: 換界石\n稀有度: 普通\n換界石（階級 7）\n--------\n換界石階級: 7' },
  { ...base, id: 'unknown', title: '未收录物品', raw: 'Rarity: Rare\nInvented Thing\nUnknown Base\n--------' },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [], estimates = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/workbench/estimate')) estimates.push(request.url()); });
  await page.addInitScript(value => localStorage.setItem('poe2-workbench-trade-memory-v1', JSON.stringify(value)), entries);
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5175/?companion=1', { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '官方查价' }).click();
  const history = page.locator('.wb-trade-memory');
  await history.locator('> summary').click();
  const images = history.locator('.wb-history-art img');
  await images.first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.wb-history-art img')].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await images.count(), 3);
  assert.equal(await history.locator('.wb-history-art-fallback').count(), 1);
  await mkdir('artifacts/workbench', { recursive: true });
  await history.screenshot({ path: 'artifacts/workbench/history-art-desktop.png' });
  await history.getByRole('button', { name: '查看 亡者呼唤 原条件' }).click();
  assert(await history.getByRole('region', { name: '已保存的搜索条件' }).isVisible());
  assert.equal(estimates.length, 0);
  await history.getByRole('button', { name: '收起原条件' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await history.screenshot({ path: 'artifacts/workbench/history-art-mobile.png' });
  assert(await history.evaluate(el => el.scrollWidth <= el.clientWidth));
  assert.deepEqual(errors, []);
  console.log('PASS official history art loads for boots / unique / waystone, unknown fallback, original query opens without market requests, desktop / mobile layout.');
} finally { await browser.close(); }
