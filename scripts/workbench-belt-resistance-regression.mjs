import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.route('**/api/workbench/trade-log*', route => route.fulfill({ json: { ok: true, found: false, events: [], truncated: false } }));
  await page.route('**/api/workbench/pob/builds', route => route.fulfill({ json: { ok: true, installed: false, builds: [] } }));
  await page.route('**/api/workbench/estimate', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, total: 1, fetched: 1, priced: 1, groups: [], warnings: [], cached: false, sampledAt: new Date().toISOString(), url: 'https://www.pathofexile.com/trade2',
      listings: [{ id: 'synthetic-chaos-belt', name: 'Example Belt', base: 'Wide Belt', rarity: 'rare', price: { amount: 1, currency: 'divine' }, explicitMods: ['+20% to Chaos Resistance', '+70 to maximum Life'] }] } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  const original = await page.evaluate(async () => {
    const { damageState } = await import('/src/workbench/fixtures/damageGoal.ts');
    const { equipmentSignature } = await import('/src/workbench/resistanceModel.ts');
    const state = damageState();
    state.slots = { belt: 'Rarity: Unique\nMidnight Braid\nRawhide Belt\n--------\n+41 to maximum Mana\n+5% to all Elemental Resistances\n50% of Damage taken Recouped as Mana' };
    state.character.equipmentSignature = state.source.equipmentSignature = equipmentSignature(state.slots);
    state.character.values.chaosResistance = 58;
    const raw = JSON.stringify(state); localStorage.setItem('poe2-workbench-loadout-v1', raw); return raw;
  });
  await page.reload();
  await page.getByRole('button', { name: /^腰带：/ }).click();
  await page.getByRole('button', { name: '寻找这件的升级', exact: true }).click();
  const search = page.locator('.wb-equipment-core-search');
  await search.getByRole('button', { name: '搜补混沌抗性腰带 ≥ 17%', exact: true }).click();
  await expect(search.getByRole('combobox', { name: '核心属性要求：混沌抗性' })).toHaveValue('need:chaosResistance');
  const query = JSON.parse(new URL(await search.getByRole('link', { name: '官网核对联合条件 ↗' }).getAttribute('href')).searchParams.get('q'));
  assert.equal(query.query.name, undefined); assert.equal(query.query.type, undefined);
  assert.equal(query.query.filters.type_filters.filters.category.option, 'accessory.belt');
  assert.equal(query.query.filters.type_filters.filters.rarity.option, 'nonunique');
  assert(query.query.stats.flatMap(group => group.filters).every(filter => filter.value?.min === 17 && filter.value.max === undefined));
  await search.getByRole('button', { name: '检索提升候选', exact: true }).click();
  await expect(search.locator('tbody tr')).toHaveCount(1);
  await expect(search.locator('tbody tr')).toContainText('20');
  assert.equal(requests.length, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1')), original);
  await mkdir('artifacts/workbench', { recursive: true });
  await search.screenshot({ path: 'artifacts/workbench/belt-chaos-repair-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await search.screenshot({ path: 'artifacts/workbench/belt-chaos-repair-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS missing 17% chaos: explicit rare belt scope, no old unique/base/mechanic locks, minimum-only query accepts 20%, unchanged loadout, desktop/mobile.');
} finally { await browser.close(); }
