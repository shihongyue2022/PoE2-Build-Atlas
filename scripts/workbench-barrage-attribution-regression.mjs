import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().endsWith('/api/workbench/damage-attribution')) requests.push(request.postDataJSON()); });
try {
  await page.route('**/api/workbench/pob/builds', route => route.fulfill({ json: { ok: true, installed: false, builds: [] } }));
  await page.route('**/api/workbench/trade-log*', route => route.fulfill({ json: { ok: true, found: false, events: [] } }));
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5175/?companion=1');
  await page.evaluate(async () => {
    const { rememberBarrageAttributionFixture } = await import('/src/workbench/fixtures/damageAttribution.ts');
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(rememberBarrageAttributionFixture()));
  });
  await page.reload();
  const panel = page.locator('.da-panel');
  await expect(panel).toBeVisible();
  const select = panel.getByRole('combobox', { name: '贡献分析技能' });
  const barrage = await select.getByRole('option', { name: '弹幕 · 联动／增益', exact: true }).getAttribute('value');
  await select.selectOption(barrage);
  const target = panel.getByRole('combobox', { name: '联动作用的输出技能' });
  assert.deepEqual(await target.getByRole('option').allTextContents(), ['旋风', '爆炸长矛']);
  await expect(panel.getByRole('status')).toContainText('弹幕本身没有独立伤害');
  const original = await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1'));
  async function calculate() {
    const response = page.waitForResponse(response => response.url().endsWith('/api/workbench/damage-attribution') && response.request().method() === 'POST', { timeout: 130000 });
    await panel.getByRole('button', { name: '计算全身词缀贡献' }).click();
    const result = await (await response).json();
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.result;
  }
  const linked = await calculate();
  assert.equal(linked.skill, 'Twister'); assert(linked.baseline > 0);
  assert.equal(requests[0].skill.name, 'Twister');
  assert.deepEqual(requests[0].excludedGroups, [6]);
  await expect(panel).toContainText('弹幕 → 旋风 · 基准');
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1')), original);
  await mkdir('artifacts/workbench', { recursive: true });
  await panel.screenshot({ path: 'artifacts/workbench/barrage-attribution-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await panel.screenshot({ path: 'artifacts/workbench/barrage-attribution-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { setSkillRoutine } = await import('/src/workbench/skillRoutine.ts');
    const state = JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1'));
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(setSkillRoutine(state, state.goals.skillBar.filter(entry => entry.name !== 'Barrage'))));
  });
  await page.reload(); await panel.locator(':scope > summary').click();
  await expect(select.getByRole('option', { name: /弹幕/ })).toHaveCount(0);
  const without = await calculate();
  assert.equal(without.skill, 'Twister');
  assert.deepEqual(requests[1].excludedGroups, [4, 6]);
  assert(Math.abs(linked.baseline - without.baseline) > 1e-6, 'native Barrage must affect the selected repeatable attack, and removal must remove its effect');
  assert(!requests[1].excludedGroups.includes(5), 'persistent Wind Dancer must remain in the saved configuration');
  console.log(JSON.stringify({ skill: linked.skill, withBarrage: linked.baseline, withoutBarrage: without.baseline }));
  await page.evaluate(async () => {
    const { setSkillRoutine } = await import('/src/workbench/skillRoutine.ts');
    const { rememberBarrageAttributionFixture } = await import('/src/workbench/fixtures/damageAttribution.ts');
    const state = rememberBarrageAttributionFixture();
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(setSkillRoutine(state, state.goals.skillBar.filter(entry => ['Whirling Slash', 'Barrage'].includes(entry.name)))));
  });
  await page.reload(); await panel.locator(':scope > summary').click(); await select.selectOption(barrage);
  await expect(panel.getByRole('button', { name: '计算全身词缀贡献' })).toBeDisabled();
  await expect(panel.getByRole('status')).toContainText('请在上方技能组加入可重复');
  assert.equal(requests.length, 2); assert.deepEqual(errors, []);
  console.log('PASS Barrage routine analysis: visible utility choice, compatible output targets, real native calculation, selected/removed buff isolation, persistent buff preservation, unchanged loadout and mobile layout.');
} finally { await browser.close(); }
