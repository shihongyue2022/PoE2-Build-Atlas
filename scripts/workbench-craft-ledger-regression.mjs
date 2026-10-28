import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// A fixed worker result isolates the multi-step layout and branch-selection contract.
// Legality and actual worker calculations are covered by workbench-craft-blueprint-regression.
const labels = ['Annul', 'Annul', 'Desecrate (Ancient, Sinistral)', 'Sovereign Alloy + Omen of Sinistral Crystallisation', 'Exalt (Perfect)', 'Chaos (Perfect) + Omen of Whittling'];
const plan = { probability: .1, expected: 100, perAttempt: 10, expectedAttempts: 10,
  steps: labels.map((label, index) => ({ n: index + 1, label, currency: 'annul', target: '+# to maximum Life', prob: .5 })) };
const fixture = { kind: 'item', plan: { plansEvaluated: 2, assumedOdds: false, frontier: [plan, { ...plan, steps: [{ ...plan.steps[0], label: 'Exalt (Greater)' }] }] },
  markov: { applicable: true, feasible: true, converged: false, bound: 'lower', expectedCost: 100, assumedOdds: false, nodes: [], edges: [] } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(fixture => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) { super(url, options); this.isCraft = String(url).includes('compute.worker'); }
      postMessage(message, ...rest) {
        if (!this.isCraft) return super.postMessage(message, ...rest);
        queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: { type: 'result', result: fixture } })));
      }
    };
  }, fixture);
  await page.route('**/api/workbench/affix-reference', route => route.fulfill({ status: 503, json: { ok: false } }));
  await page.route('**/api/workbench/pob/builds', route => route.fulfill({ json: { ok: true, installed: false, builds: [] } }));
  await page.route('**/api/workbench/trade-log*', route => route.fulfill({ json: { ok: true, found: false, events: [] } }));
  await page.route('**/api/workbench/craft-exchange?*', route => route.fulfill({ json: { ok: true, exchange: { league: new URL(route.request().url()).searchParams.get('league'), source: 'poe.ninja', asOf: '2026-10-25T00:00:00Z', rates: { exalted: 1, divine: 100, chaos: 5 } } } }));
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5175/?companion=1');
  await page.getByRole('button', { name: '制作策略', exact: true }).click();
  const panel = page.getByRole('region', { name: '成品目标制作规划' });
  await panel.getByRole('button', { name: '60% 品质裂痕戒指' }).click();
  const actual = panel.getByRole('region', { name: '实际底装核对' });
  await actual.getByRole('textbox').fill('Rarity: Normal\nBreach Ring\n--------\nItem Level: 86');
  await actual.getByRole('button', { name: '导入底装', exact: true }).click();
  await actual.getByRole('button', { name: '核对底装', exact: true }).click();
  await panel.getByRole('button', { name: '生成制作手顺', exact: true }).click();
  const ledger = panel.getByRole('region', { name: '当前路线材料' }), rows = ledger.locator('.cb-ledger-row');
  const budget = panel.getByRole('region', { name: '攻略与制作准备' });
  await expect(rows).toHaveCount(8);
  assert.equal(await budget.locator('.cb-prep-reference').evaluate(element => element.open), false);
  const names = await page.evaluate(async () => {
    const { blueprintMaterialLabel } = await import('/src/workbench/craftBlueprint.ts');
    return { annul: blueprintMaterialLabel('Orb of Annulment'), greater: blueprintMaterialLabel('Greater Exalted Orb'), fracture: blueprintMaterialLabel('Fracturing Orb') };
  });
  await expect(ledger.getByRole('spinbutton', { name: `材料数量：${names.greater}` })).toHaveCount(0);
  await expect(ledger.getByRole('spinbutton', { name: `材料数量：${names.fracture}` })).toHaveCount(0);
  await mkdir('artifacts/workbench', { recursive: true });
  const measure = () => ledger.evaluate(element => {
    const row = element.querySelector('.cb-ledger-row').getBoundingClientRect(), area = element.getBoundingClientRect();
    return { width: row.width / area.width, rowHeight: row.height, height: area.height };
  });
  const desktop = await measure(); assert(desktop.width > .95 && desktop.rowHeight < 110 && desktop.height < 850, JSON.stringify(desktop));
  await budget.screenshot({ path: 'artifacts/workbench/craft-ledger-eight-materials-desktop.png' });
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert((await measure()).width > .95);
    await budget.screenshot({ path: `artifacts/workbench/craft-ledger-eight-materials-${width}.png` });
  }
  await page.setViewportSize({ width: 1600, height: 1100 });
  const annul = ledger.getByRole('group', { name: `材料：${names.annul}`, exact: true });
  await annul.getByRole('spinbutton', { name: `材料数量：${names.annul}` }).fill('3');
  await annul.getByText('调整单价').click();
  await annul.getByRole('spinbutton', { name: `材料单价：${names.annul}` }).fill('2');
  await budget.getByRole('checkbox', { name: '计入底装买价' }).check();
  await budget.getByRole('spinbutton', { name: '底装购买金额' }).fill('2');
  await expect(budget.getByLabel('制作总成本')).toHaveText('总成本：2.06 神圣石');
  await panel.getByRole('combobox', { name: '选择图示路线' }).selectOption('1');
  await expect(rows).toHaveCount(2);
  await expect(ledger.getByRole('heading')).toContainText('路线 2');
  await expect(annul.getByText('补记／此前用量')).toBeVisible();
  await expect(budget.getByLabel('制作总成本')).toHaveText('总成本：2.06 神圣石');
  await panel.getByRole('combobox', { name: '选择图示路线' }).selectOption('0');
  await expect(rows).toHaveCount(8);
  await expect(annul.getByRole('spinbutton', { name: `材料数量：${names.annul}` })).toHaveValue('3');
  assert.deepEqual(errors, []);
  console.log('PASS six-step/eight-material layout fixture: compact full-width rows, selected-branch materials, collapsed preparation reference, retained expenses and desktop/tablet/mobile bounds.');
} finally { await browser.close(); }
