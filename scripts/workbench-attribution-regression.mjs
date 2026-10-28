import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await page.evaluate(async () => {
    const { rememberAttributionFixture } = await import('/src/workbench/fixtures/damageAttribution.ts');
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(rememberAttributionFixture()));
  });
  await page.reload();
  const panel = page.getByRole('region', { name: '全身伤害词缀排行', exact: true });
  await expect(panel.getByRole('button', { name: '计算全身词缀贡献' })).toBeEnabled();
  const original = await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1'));
  const request = page.waitForResponse(response => response.url().endsWith('/api/workbench/damage-attribution') && response.request().method() === 'POST');
  await panel.getByRole('button', { name: '计算全身词缀贡献' }).click();
  const response = await request;
  const payload = await response.json();
  assert.equal(payload.ok, true, JSON.stringify(payload));
  const result = payload.result;
  await mkdir('artifacts/workbench', { recursive: true });
  await writeFile('artifacts/workbench/synthetic-attribution.json', JSON.stringify(result));
  assert.equal(result.engine, 'PoB2 v0.23.1'); assert.equal(result.skill, 'Fireball'); assert(result.baseline > 0);
  const fire = result.rows.find(row => row.line === '40% increased Fire Damage');
  assert(fire.delta > 0 && fire.lossPercent > 0);
  assert.equal(result.rows.find(row => row.line === '100% increased Physical Damage').delta, 0, 'local weapon damage must not increase Fireball damage');
  const rune = result.rows.find(row => row.placement === 'runeModLines' && row.line === '16% increased Physical Damage');
  assert.equal(rune?.status, 'calculated', 'generated rune line must be evaluated by the native engine'); assert.equal(rune.delta, 0);
  assert(result.rows.some(row => row.status === 'pending' && row.delta === undefined), 'unknown native effects remain pending');
  await expect(panel).toContainText('基准 CombinedDPS');
  const rows = panel.locator('[data-attribution="positive"] tbody tr');
  assert(Array.isArray(result.items) && result.items.length === 3, 'each active item needs an independently calculated total');
  assert.equal(result.items.find(item => item.slot === 'Ring 1').pendingLines, 1);
  const itemGroups = panel.locator('.da-item-groups > .da-item-group');
  const slotOrder = await itemGroups.evaluateAll(groups => groups.map(group => group.dataset.slot));
  const expectedSlots = result.items.filter(item => result.rows.some(row => row.slot === item.slot && row.delta > 0))
    .sort((a,b) => b.delta-a.delta).map(item => item.slot);
  assert.deepEqual(slotOrder, expectedSlots, 'outer groups must sort by native simultaneous item-mod removal');
  for (const group of await itemGroups.all()) {
    const values = (await group.locator('[data-attribution="positive"] td:nth-child(4)').allTextContents()).map(text => Number(text.replaceAll(',', '')));
    assert.deepEqual(values, [...values].sort((a,b) => b-a), 'each item sorts its own affixes descending');
  }
  // Different multiplication factors overlap; a whole-item loss must not be summed from individual losses.
  const comparison = await page.evaluate(async body => (await fetch('/api/workbench/damage-attribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(),
    { ...response.request().postDataJSON(), xml: response.request().postDataJSON().xml.replace('+80 to maximum Mana', '10% increased Cast Speed') });
  assert.equal(comparison.ok, true, JSON.stringify(comparison));
  const ringTotal = comparison.result.items.find(item => item.slot === 'Ring 1');
  const lineSum = comparison.result.rows.filter(row => row.slot === 'Ring 1' && row.status === 'calculated').reduce((sum,row) => sum+row.delta, 0);
  assert(ringTotal.status === 'calculated' && Math.abs(ringTotal.delta-lineSum) > 0.1, 'real PoB must compute a non-additive bundled item contribution');
  const heights = await rows.evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  assert(heights.every(height => height <= 48), `desktop contribution rows must be compact: ${heights}`);
  const marketBar = panel.getByRole('group', { name: '词缀联合市场检索' });
  await panel.getByRole('checkbox', { name: '全选左戒指正贡献词缀' }).check();
  await expect(marketBar).toContainText('已选 2 项');
  await expect(panel.locator('.da-item-group[data-slot="Ring 1"]')).toHaveAttribute('open', '');
  await marketBar.getByRole('checkbox', { name: '全选可检索的正贡献词缀' }).check();
  await expect(marketBar).toContainText('已选 3 项');
  const jointLink = marketBar.getByRole('link', { name: '搜左戒指 · 2 项' });
  const href = await jointLink.getAttribute('href');
  const jointQuery = JSON.parse(new URL(href).searchParams.get('q'));
  const hardFloors = jointQuery.query.stats.flatMap(group => group.filters).map(filter => filter.value?.min);
  assert(hardFloors.includes(40) && hardFloors.includes(20), 'all selected same-slot affixes must have hard floors');
  assert(!hardFloors.includes(10), 'another equipment slot must use its own query');
  await expect(marketBar.getByRole('link', { name: '搜右戒指 · 1 项' })).toBeVisible();
  await marketBar.getByRole('combobox', { name: '词缀市场检索门槛' }).selectOption('5');
  const improvedQuery = JSON.parse(new URL(await jointLink.getAttribute('href')).searchParams.get('q'));
  assert(improvedQuery.query.stats.flatMap(group => group.filters).some(filter => filter.value?.min === 42));
  await marketBar.getByRole('combobox', { name: '词缀市场检索门槛' }).selectOption('current');
  // Verify the user-facing link opens the complete official query, without querying a live account.
  await page.context().route('https://www.pathofexile.com/trade2/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Official query fixture</title>' }));
  const popupEvent = page.waitForEvent('popup'); await jointLink.click(); const popup = await popupEvent;
  await popup.waitForLoadState('domcontentloaded'); assert.equal(popup.url(), href); await popup.close();
  await mkdir('artifacts/workbench', { recursive: true });
  await panel.screenshot({ path: 'artifacts/workbench/damage-attribution-desktop.png' });
  async function expectGearNavigation(button, label, slot) {
    await button.click();
    const detail = page.getByRole('region', { name: `${label}装备详情`, exact: true });
    const selector = detail.getByRole('combobox', { name: '选择装备栏位' });
    await expect(selector).toHaveValue(slot); await expect(selector).toBeFocused();
    await expect.poll(async () => {
      const bounds = await detail.locator('.lo-detail-heading').boundingBox();
      return bounds !== null && bounds.y >= 0 && bounds.y < 120;
    }).toBe(true);
    await expect(detail.getByRole('heading', { name: label, exact: true })).toBeInViewport();
  }
  const leftEquipment = rows.first().getByRole('button', { name: '查看左戒指装备详情' });
  await expectGearNavigation(leftEquipment, '左戒指', 'ring1');
  await expectGearNavigation(leftEquipment, '左戒指', 'ring1');
  await expectGearNavigation(rows.last().getByRole('button', { name: '查看右戒指装备详情' }), '右戒指', 'ring2');
  const keys = await panel.getByRole('combobox', { name: '贡献分析技能' }).locator('option').evaluateAll(options => options.map(option => option.value));
  await panel.getByRole('combobox', { name: '贡献分析技能' }).selectOption(keys[1]);
  await expect(panel).not.toContainText('基准 CombinedDPS');
  const second = page.waitForResponse(response => response.url().endsWith('/api/workbench/damage-attribution') && response.request().method() === 'POST');
  await panel.getByRole('button', { name: '计算全身词缀贡献' }).click();
  const spark = await (await second).json(); assert.equal(spark.ok, true, JSON.stringify(spark));
  assert.equal(spark.result.skill, 'Spark'); assert.equal(spark.result.rows.find(row => row.line === '40% increased Fire Damage').delta, 0);
  await expect(marketBar).toContainText('已选 0 项');
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1')), original, 'analysis must not mutate the loadout or its search focus');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await marketBar.getByRole('checkbox', { name: '全选可检索的正贡献词缀' }).check();
  await expect(marketBar.getByRole('link').first()).toBeVisible();
  await panel.screenshot({ path: 'artifacts/workbench/damage-attribution-mobile.png' });
  await expect(rows.first().locator('td:nth-child(5)')).toBeInViewport();
  await expectGearNavigation(rows.getByRole('button', { name: '查看右戒指装备详情' }).first(), '右戒指', 'ring2');
  // Existing installations can recover the exact saved XML without another import.
  const savedAt = '2026-10-01T00:00:00Z';
  const xml = await page.evaluate(async () => (await import('/src/workbench/fixtures/damageAttribution.ts')).attributionXml);
  await page.route('**/api/workbench/pob/builds', route => route.fulfill({ json: { ok: true, builds: [{ id: 'a'.repeat(64), name: 'Synthetic.xml', modifiedAt: savedAt }] } }));
  await page.route('**/api/workbench/pob/build', route => route.fulfill({ json: { ok: true, xml, name: 'Synthetic.xml', modifiedAt: savedAt } }));
  await page.evaluate((savedAt) => {
    localStorage.removeItem('poe2-workbench-calculation-xml-v1');
    const state = JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1'));
    state.source.fileName = 'Synthetic.xml'; state.source.savedAt = savedAt;
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
  }, savedAt);
  await page.reload(); await panel.locator('summary').first().click();
  const recovered = page.waitForResponse(response => response.url().endsWith('/api/workbench/damage-attribution') && response.request().method() === 'POST');
  await panel.getByRole('button', { name: '计算全身词缀贡献' }).click();
  assert.equal((await (await recovered).json()).ok, true, 'legacy source must calculate through verified local XML backfill');
  await expect(panel).toContainText('基准 CombinedDPS');
  assert(await page.evaluate(() => !!localStorage.getItem('poe2-workbench-calculation-xml-v1')));
  let staleRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/api/workbench/damage-attribution')) staleRequests++; });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1'));
    state.slots.ring1 = state.slots.ring1.replace('40%', '41%');
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
  });
  await page.reload(); await panel.locator('summary').first().click();
  await expect(panel).not.toContainText('基准 CombinedDPS');
  await panel.getByRole('button', { name: '计算全身词缀贡献' }).click();
  await expect(panel.getByRole('alert')).toContainText('当前装备与原 PoB 快照不一致');
  assert.equal(staleRequests, 0, 'changed gear must never calculate using the original saved XML');
  // Tree jewels are separate inventory sources, including per-node radius affixes.
  await page.evaluate(async () => {
    const { rememberJewelAttributionFixture } = await import('/src/workbench/fixtures/damageAttribution.ts');
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(rememberJewelAttributionFixture()));
  });
  await page.reload(); await panel.locator('summary').first().click();
  const jewelResponse = page.waitForResponse(response => response.url().endsWith('/api/workbench/damage-attribution') && response.request().method() === 'POST');
  await panel.getByRole('button', { name: '计算全身词缀贡献' }).click();
  const jewelResult = await (await jewelResponse).json(); assert.equal(jewelResult.ok, true, JSON.stringify(jewelResult));
  assert(jewelResult.result.rows.some(row => row.slot === 'Jewel 60735'), 'native calculator must expose the allocated radius jewel');
  assert(jewelResult.result.rows.some(row => row.slot === 'Jewel 32763'), 'native calculator must expose the allocated ordinary jewel');
  await panel.locator('.da-other-groups > summary').click();
  const radius = panel.locator('.da-item-group[data-slot="Jewel 60735"]');
  await radius.locator(':scope > summary').click();
  await radius.locator('.da-group-extra > summary').filter({ hasText: '零或负向' }).click();
  const radiusRows = radius.locator('[data-attribution="other"] tbody tr');
  await expect(radiusRows).toHaveCount(3);
  for (const checkbox of await radiusRows.getByRole('checkbox').all()) { await expect(checkbox).toBeEnabled(); await checkbox.check(); }
  const jewelLink = marketBar.getByRole('link', { name: '搜珠宝 60735 · 3 项' });
  await expect(jewelLink).toBeVisible();
  const jewelQuery = JSON.parse(new URL(await jewelLink.getAttribute('href')).searchParams.get('q'));
  assert.equal(jewelQuery.query.type, 'Time-Lost Emerald'); assert.equal(jewelQuery.query.filters.type_filters.filters.category.option, 'jewel');
  assert(jewelQuery.query.stats.flatMap(group => group.filters).every(filter => filter.value?.min === 2), 'radius searches use each affix roll, never scaled tree damage');
  const ordinary = panel.locator('.da-item-group[data-slot="Jewel 32763"]');
  await ordinary.locator('.da-group-extra > summary').filter({ hasText: '零或负向' }).click();
  await ordinary.locator('[data-attribution="other"]').getByRole('checkbox').check();
  const ordinaryLink = marketBar.getByRole('link', { name: '搜珠宝 32763 · 1 项' });
  await expect(ordinaryLink).toBeVisible();
  assert.equal(JSON.parse(new URL(await ordinaryLink.getAttribute('href')).searchParams.get('q')).query.type, 'Diamond');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.screenshot({ path: 'artifacts/workbench/damage-attribution-jewels.png' });
  assert.deepEqual(errors, []);
  console.log('PASS real native attribution: non-additive bundled totals, item/affix sorting, grouped selections and official queries, ordinary/radius jewel sources from active tree, exact jewel bases and per-node rolls, unchanged loadout, mobile navigation, XML backfill and stale-gear blocking.');
} finally { await browser.close(); }
