import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import type { Engine } from '../lib/engine';
import type { SolveResult } from '../lib/solve';
import CraftBlueprintPanel from './CraftBlueprintPanel';
import { computeWorkbench } from './compute';
import { EXAMPLE_RING } from './itemImport';
import { loadGearTrade } from '../lib/gearTrade';
import { BREACH_RING_SAMPLE, FRACTURED_COLD_BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { blueprintMaterialLabel } from './craftBlueprint';

vi.mock('./workbenchRuntime', () => ({ HOSTED_WORKBENCH: true }));
vi.mock('./compute', () => ({ computeWorkbench: vi.fn() }));
const engine: Engine = { data: loadShippedPatch('data/patches/0.5.0'), prices: indexPrices({ prices: {} }) };
const normal = 'Rarity: Normal\nRuby Ring\n--------\nItem Level: 86';
const trade = await loadGearTrade();
const renderPanel = (initialRaw?: string) => render(<CraftBlueprintPanel engine={engine} league="Test" overrides={{}} initialRaw={initialRaw} tradeData={trade} />);
const input = () => {
  const field = screen.queryByRole('textbox', { name: '实际购买底装文本' });
  if (field) return field;
  fireEvent.click(screen.getByText('实际底装原文／重新导入'));
  return screen.getByRole('textbox', { name: '实际购买底装文本' });
};
const generate = () => screen.getByRole('button', { name: '生成制作手顺' });
const confirm = () => {
  const importing = screen.queryByRole('button', { name: '导入底装' });
  if (importing) fireEvent.click(importing);
  fireEvent.click(screen.getByRole('button', { name: '核对底装' }));
};
const owned = 'Rarity: Rare\nOwned Ring\nRuby Ring\n--------\nItem Level: 86\n--------\n+100 to maximum Life\n+150 to maximum Mana\n+20% to Chaos Resistance (fractured)';
const goal = 'Rarity: Rare\nTarget Ring\nRuby Ring\n--------\nItem Level: 86\n--------\n+100 to maximum Life';
const routeResult: SolveResult = { kind: 'item', plan: { plansEvaluated: 1, assumedOdds: false, frontier: [{
  expected: 20, perAttempt: 10, probability: .5, expectedAttempts: 2, steps: [
    { n: 1, currency: 'annul', label: 'Annul', target: 'Remove: +# to maximum Mana', prob: .5 },
    { n: 2, currency: 'exalt', label: 'Exalt (Sinistral, Perfect)', target: '+# to maximum Life', prob: .5 },
  ],
}] }, markov: { applicable: true, feasible: true, converged: false, bound: 'lower', expectedCost: 20, assumedOdds: false, nodes: [], edges: [] } };
async function beginStep() {
  vi.mocked(computeWorkbench).mockReturnValue({ promise: Promise.resolve(routeResult), cancel: vi.fn() });
  const view = renderPanel(goal);
  fireEvent.change(input(), { target: { value: owned } }); confirm(); fireEvent.click(generate());
  fireEvent.click(await screen.findByRole('button', { name: '在本页开始逐步核对' }));
  fireEvent.click(screen.getByRole('button', { name: '设置制作锚点' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /^允许移除：.*最大魔力/ }));
  fireEvent.click(screen.getByRole('button', { name: '锁定本步目标' }));
  return view;
}

it('ties the compact material ledger to the selected route instead of collecting every branch', async () => {
  const result: SolveResult = { ...routeResult, plan: { ...routeResult.plan, frontier: [...routeResult.plan.frontier, {
    ...routeResult.plan.frontier[0]!, steps: [{ n: 1, currency: 'chaos', label: 'Chaos (Perfect) + Omen of Whittling', target: '+# to maximum Life', prob: .5 }],
  }] } };
  vi.mocked(computeWorkbench).mockReturnValue({ promise: Promise.resolve(result), cancel: vi.fn() });
  renderPanel(goal); fireEvent.change(input(), { target: { value: owned } }); confirm(); fireEvent.click(generate());
  const select = await screen.findByRole('combobox', { name: '选择图示路线' });
  const ledger = within(screen.getByRole('region', { name: '当前路线材料' }));
  const chaos = `材料数量：${blueprintMaterialLabel('Perfect Chaos Orb')}`;
  expect(ledger.queryByRole('spinbutton', { name: chaos })).toBeNull();
  fireEvent.change(ledger.getByRole('spinbutton', { name: '材料数量：无效石' }), { target: { value: '3' } });
  fireEvent.change(select, { target: { value: '1' } });
  expect(ledger.getByRole('heading')).toHaveTextContent('路线 2');
  expect(ledger.getByRole('spinbutton', { name: chaos })).toBeInTheDocument();
  expect(ledger.getByRole('spinbutton', { name: `材料数量：${blueprintMaterialLabel('Omen of Whittling')}` })).toBeInTheDocument();
  expect(ledger.queryByRole('spinbutton', { name: `材料数量：${blueprintMaterialLabel('Perfect Exalted Orb')}` })).toBeNull();
  expect(ledger.getByRole('spinbutton', { name: '材料数量：无效石' })).toHaveValue(3);
  expect(ledger.getByText('补记／此前用量')).toBeVisible();
  expect(computeWorkbench).toHaveBeenCalledTimes(1);
});

it('checks a step in place, keeps its ledger and goals, and recalculates from the observed item', async () => {
  const view = await beginStep();
  const costs = screen.getByRole('region', { name: '制作成本汇总' });
  fireEvent.click(within(costs).getByRole('checkbox', { name: '计入底装买价' }));
  fireEvent.change(within(costs).getByRole('spinbutton', { name: '底装购买金额' }), { target: { value: '7' } });
  const material = screen.getByRole('spinbutton', { name: '材料数量：无效石' });
  fireEvent.change(material, { target: { value: '3' } });
  const icons = within(screen.getByRole('region', { name: '图示制作路线' }));
  expect(icons.getAllByRole('listitem')).toHaveLength(2);
  expect(within(icons.getByRole('listitem', { name: '路线步骤 2' })).getAllByRole('img')).toHaveLength(2);
  const after = owned.replace('+150 to maximum Mana\n', '');
  fireEvent.change(screen.getByRole('textbox', { name: '操作后装备文本' }), { target: { value: after } });
  fireEvent.click(screen.getByRole('button', { name: '校验本步结果' }));
  expect(screen.getByText('本步移除目标已达成')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '成品目标制作规划' })).toBeVisible();
  expect(screen.queryByRole('region', { name: '图示制作路线' })).toBeNull();
  expect(screen.getByRole('spinbutton', { name: '材料数量：无效石' })).toBe(material);
  expect(material).toHaveValue(3);
  expect(within(costs).getByRole('spinbutton', { name: '底装购买金额' })).toHaveValue(7);
  expect(JSON.parse(localStorage.getItem('poe2-workbench-craft-blueprint-v1')!).actualRaw).toBe(after);
  const first = vi.mocked(computeWorkbench).mock.calls[0]![0];
  fireEvent.click(screen.getByRole('button', { name: '重新计算后续策略' }));
  await waitFor(() => expect(computeWorkbench).toHaveBeenCalledTimes(2));
  const next = vi.mocked(computeWorkbench).mock.calls[1]![0];
  expect(next.kind).toBe('item');
  if (next.kind === 'item') { expect(next.item.prefixes).toHaveLength(1); expect(next.item.suffixes[0]?.fractured).toBe(true); }
  expect(next.targets).toEqual(first.targets);
  expect(material).toHaveValue(3);
  view.unmount(); renderPanel(); confirm();
  expect(screen.getByRole('spinbutton', { name: '材料数量：无效石' })).toHaveValue(3);
  expect(screen.getByRole('spinbutton', { name: '底装购买金额' })).toHaveValue(7);
});

it('rejects other items, incomplete observations and lost fractures without replacing the actual base or advancing', async () => {
  await beginStep();
  for (const raw of [owned.replace('Ruby Ring', 'Sapphire Ring'), 'not an item', owned.replace(' (fractured)', '').replace('+150 to maximum Mana\n', '')]) {
    fireEvent.change(screen.getByRole('textbox', { name: '操作后装备文本' }), { target: { value: raw } });
    fireEvent.click(screen.getByRole('button', { name: '校验本步结果' }));
    expect(screen.getByRole('button', { name: '重新计算后续策略' })).toBeDisabled();
    expect(JSON.parse(localStorage.getItem('poe2-workbench-craft-blueprint-v1')!).actualRaw).toBe(owned);
  }
  expect(computeWorkbench).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: '制作成本汇总' })).toBeVisible();
});

it('keeps an off-target single-step result as the real state for a repair solve', async () => {
  await beginStep();
  const after = owned.replace('+100 to maximum Life\n', '');
  fireEvent.change(screen.getByRole('textbox', { name: '操作后装备文本' }), { target: { value: after } });
  fireEvent.click(screen.getByRole('button', { name: '校验本步结果' }));
  expect(screen.getByText('必须保留的词缀未能保留')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新计算后续策略' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '重新计算后续策略' }));
  await waitFor(() => expect(computeWorkbench).toHaveBeenCalledTimes(2));
  const next = vi.mocked(computeWorkbench).mock.calls[1]![0];
  if (next.kind === 'item') expect(next.item.prefixes.map(entry => entry.modId)).toEqual(['Rings/IncreasedMana']);
});

beforeEach(() => {
  vi.mocked(computeWorkbench).mockReset();
  vi.mocked(computeWorkbench).mockImplementation(() => {
    let reject!: (error: Error) => void;
    const promise = new Promise<never>((_resolve, fail) => { reject = fail; });
    return { promise, cancel: vi.fn(() => reject(new Error('cancelled'))) };
  });
});

it('converts a large route cost to Divine while preserving the lower-bound and excluded-base-price labels', async () => {
  const result: SolveResult = { kind: 'item', plan: { frontier: [], plansEvaluated: 0, assumedOdds: false }, markov: {
    applicable: true, feasible: true, converged: false, bound: 'lower', expectedCost: 346743, assumedOdds: false, nodes: [], edges: [],
  } };
  vi.mocked(computeWorkbench).mockReturnValue({ promise: Promise.resolve(result), cancel: vi.fn() });
  render(<CraftBlueprintPanel engine={{ ...engine, prices: indexPrices({ prices: { divine: 1000 } }) }} league="Test" overrides={{}} initialRaw={EXAMPLE_RING} />);
  fireEvent.change(input(), { target: { value: normal } }); confirm(); fireEvent.click(generate());
  const cost = await screen.findByText('≈ 346.74 神圣石');
  expect(cost.closest('p')).toHaveTextContent('材料期望：≈ 346.74 神圣石（成本下界） · 未含底装买价');
  expect(screen.getByText('当前仅得到成本下界')).toBeInTheDocument();
});

it('shows material use and the final cost section only after the actual base is verified, hiding them when it changes', () => {
  renderPanel(BREACH_RING_SAMPLE);
  expect(screen.queryByRole('region', { name: '攻略与制作准备' })).toBeNull();
  fireEvent.change(input(), { target: { value: 'Rarity: Normal\nBreach Ring\n--------\nItem Level: 86' } }); confirm();
  const route = screen.getByRole('region', { name: '从底装计算制作手顺' });
  const materials = screen.getByRole('region', { name: '攻略与制作准备' });
  expect(route.compareDocumentPosition(materials) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('region', { name: '制作成本汇总' })).toBeInTheDocument();
  expect(computeWorkbench).not.toHaveBeenCalled();
  fireEvent.change(input(), { target: { value: '' } });
  expect(screen.queryByRole('region', { name: '攻略与制作准备' })).toBeNull();
});

it('explains a valid actual ring versus incompatible four-prefix goals and permits calculation after a goal is removed', () => {
  renderPanel(BREACH_RING_SAMPLE);
  fireEvent.change(input(), { target: { value: FRACTURED_COLD_BREACH_RING_SAMPLE } }); confirm();
  const base = within(screen.getByRole('region', { name: '实际底装核对' }));
  expect(base.getByRole('alert')).toHaveTextContent('底装已识别：3 条前缀 / 3 条后缀');
  expect(base.getByRole('alert')).toHaveTextContent('共需要 4 条前缀 / 3 条后缀');
  expect(base.getByRole('alert')).toHaveTextContent('T8，破裂锁定');
  expect(generate()).toBeDisabled(); expect(computeWorkbench).not.toHaveBeenCalled();
  const mana = screen.getByRole('row', { name: '目标条目 3' });
  expect(within(mana).getByRole('combobox', { name: /^目标属性：/ })).toHaveValue('Rings/IncreasedMana');
  fireEvent.click(within(mana).getByRole('checkbox'));
  confirm();
  expect(base.queryByRole('alert')).toBeNull(); expect(generate()).toBeEnabled();
  expect(base.getByRole('status')).toHaveTextContent('已有 3 前 / 3 后 · 1 条破裂锁定');
});

it('imports an incompatible actual base for side-by-side editing before validation, while preserving raw affixes and fractures', () => {
  renderPanel(BREACH_RING_SAMPLE);
  fireEvent.change(input(), { target: { value: FRACTURED_COLD_BREACH_RING_SAMPLE } });
  fireEvent.click(screen.getByRole('button', { name: '导入底装' }));
  expect(generate()).toBeDisabled();
  expect(screen.getByRole('region', { name: '底装与目标词缀对比' })).toBeVisible();
  const actual = screen.getByRole('region', { name: '实际底装词缀校正' });
  const goals = screen.getByRole('region', { name: '本次制作目标微调' });
  expect(within(actual).getAllByRole('group', { name: /^底装词缀/ })).toHaveLength(6);
  expect(within(actual).getByText('破裂锁定')).toBeVisible();
  expect(within(actual).getByRole('combobox', { name: '底装阶层校正：1' })).toHaveValue('8');
  expect(within(goals).getAllByRole('row', { name: /^目标条目/ })).toHaveLength(6);
  const mana = within(goals).getByRole('row', { name: '目标条目 3' });
  fireEvent.click(within(mana).getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '核对底装' }));
  expect(generate()).toBeEnabled();
  expect(within(actual).getByRole('combobox', { name: '底装阶层校正：1' })).toHaveValue('8');
  const lifeRegen = within(actual).getByRole('combobox', { name: '底装阶层校正：4' });
  fireEvent.change(lifeRegen, { target: { value: '2' } });
  expect(generate()).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '核对底装' }));
  expect(generate()).toBeEnabled();
  expect(within(actual).getByRole('combobox', { name: '底装阶层校正：1' })).toHaveValue('8');
  expect(computeWorkbench).not.toHaveBeenCalled();
});

it('requires a verified actual base before any worker request and never substitutes the hypothetical purchasing base', async () => {
  renderPanel(EXAMPLE_RING);
  expect(generate()).toBeDisabled();
  expect(computeWorkbench).not.toHaveBeenCalled();
  const base = screen.getByRole('region', { name: '实际底装核对' }), route = screen.getByRole('region', { name: '从底装计算制作手顺' });
  expect(base.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.change(input(), { target: { value: normal.replace('Ruby Ring', 'Sapphire Ring') } }); confirm();
  expect(within(base).getByRole('alert')).toHaveTextContent('底座不一致');
  expect(generate()).toBeDisabled();
  fireEvent.change(input(), { target: { value: normal } });
  expect(generate()).toBeDisabled(); confirm();
  expect(within(base).getByRole('status')).toHaveTextContent('物等 86 · 普通 · 已有 0 前 / 0 后');
  expect(generate()).toBeEnabled(); fireEvent.click(generate());
  await waitFor(() => expect(computeWorkbench).toHaveBeenCalledTimes(1));
  expect(vi.mocked(computeWorkbench).mock.calls[0]![0]).toMatchObject({ kind: 'lab', from: { baseId: 'Rings', level: 86 } });
});

it('sends existing rare affixes and fracture protection to the solver, and cancels when the draft is replaced', async () => {
  renderPanel(EXAMPLE_RING);
  const owned = 'Rarity: Rare\nOwned Ring\nRuby Ring\n--------\nItem Level: 86\n--------\n+110 to maximum Life\n+20% to Chaos Resistance (fractured)';
  fireEvent.change(input(), { target: { value: owned } }); confirm();
  expect(generate()).toBeEnabled(); fireEvent.click(generate());
  await waitFor(() => expect(computeWorkbench).toHaveBeenCalledTimes(1));
  const request = vi.mocked(computeWorkbench).mock.calls[0]![0];
  expect(request.kind).toBe('item');
  if (request.kind !== 'item') throw new Error('Actual rare base was replaced by a blank base');
  expect(request.item).toMatchObject({ level: 86, rarity: 'rare', prefixes: [{ modId: 'Rings/IncreasedLife' }], suffixes: [{ modId: 'Rings/ChaosResistance', fractured: true }] });
  expect(request.targets.some(target => target.modId === 'Rings/ChaosResistance')).toBe(true);
  const job = vi.mocked(computeWorkbench).mock.results[0]!.value as ReturnType<typeof computeWorkbench>;
  fireEvent.change(input(), { target: { value: normal } });
  expect(job.cancel).toHaveBeenCalledTimes(1);
  expect(generate()).toBeDisabled();
  expect(screen.queryByText(/已核对：/)).not.toBeInTheDocument();
  confirm(); expect(generate()).toBeEnabled();
});

it('revalidates changed targets against the actual held fracture instead of treating it as removable', () => {
  renderPanel(EXAMPLE_RING);
  const lifeTier = screen.getByRole('combobox', { name: /^目标阶层：.*maximum Life/ });
  fireEvent.change(lifeTier, { target: { value: '2' } });
  fireEvent.change(input(), { target: { value: 'Rarity: Rare\nOwned Ring\nRuby Ring\n--------\nItem Level: 86\n--------\n+90 to maximum Life (fractured)' } }); confirm();
  expect(generate()).toBeEnabled();
  fireEvent.change(screen.getByRole('combobox', { name: /^目标阶层：.*maximum Life/ }), { target: { value: '1' } });
  expect(generate()).toBeDisabled();
  expect(within(screen.getByRole('region', { name: '实际底装核对' })).getByRole('alert')).toHaveTextContent('破裂锁定');
  expect(computeWorkbench).not.toHaveBeenCalled();
});

it('keeps the actual base draft across reloads but requires fresh verification', () => {
  const view = renderPanel(EXAMPLE_RING);
  fireEvent.change(input(), { target: { value: normal } }); confirm();
  expect(generate()).toBeEnabled(); view.unmount();
  renderPanel();
  expect(input()).toHaveValue(normal);
  expect(generate()).toBeDisabled(); confirm();
  expect(generate()).toBeEnabled();
});

it('adds classified dropdown rows, blocks incomplete goals and preserves remaining tiers when deleting and reloading', () => {
  const view = renderPanel(EXAMPLE_RING);
  const editor = () => screen.getByRole('region', { name: '目标词缀来源调查' });
  const reference = () => screen.getByRole('region', { name: '成品样例与可调目标' });
  const original = reference().textContent;
  fireEvent.click(within(editor()).getByRole('button', { name: '＋ 添加词缀条目' }));
  let row = within(editor()).getByRole('row', { name: '目标条目 4' });
  expect(within(editor()).queryByRole('link', { name: '按已选词缀购买 ↗' })).not.toBeInTheDocument();
  expect(within(row).getByRole('combobox', { name: /^目标阶层：/ })).toBeDisabled();
  fireEvent.change(within(row).getByRole('combobox', { name: /^目标前后缀：/ }), { target: { value: 'suffix' } });
  fireEvent.change(within(row).getByRole('combobox', { name: /^目标分类：/ }), { target: { value: 'resistance' } });
  const attribute = within(row).getByRole('combobox', { name: /^目标属性：/ });
  expect(within(attribute).getAllByRole('option').some(option => option.getAttribute('value') === 'Rings/IncreasedLife')).toBe(false);
  expect([...attribute.querySelectorAll('optgroup')].map(group => group.label)).toContain('普通随机词池');
  fireEvent.change(attribute, { target: { value: 'Rings/ChaosResistance' } });
  fireEvent.change(within(row).getByRole('combobox', { name: /^目标阶层：/ }), { target: { value: '3' } });
  let link = within(editor()).getByRole('link', { name: '按已选词缀购买 ↗' });
  const query = JSON.parse(new URL(link.getAttribute('href')!).searchParams.get('q')!);
  expect(query.query.stats.flatMap((group: { filters: { id: string }[] }) => group.filters).some((filter: { id: string }) => filter.id === 'explicit.stat_2923486259')).toBe(true);
  fireEvent.click(within(editor()).getByRole('button', { name: '＋ 添加词缀条目' }));
  row = within(editor()).getByRole('row', { name: '目标条目 5' });
  fireEvent.change(within(row).getByRole('combobox', { name: /^目标分类：/ }), { target: { value: 'mana' } });
  fireEvent.change(within(row).getByRole('combobox', { name: /^目标属性：/ }), { target: { value: 'Rings/IncreasedMana' } });
  fireEvent.change(within(row).getByRole('combobox', { name: /^目标阶层：/ }), { target: { value: '4' } });
  fireEvent.click(within(within(editor()).getByRole('row', { name: '目标条目 4' })).getByRole('button', { name: /^删除目标：/ }));
  row = within(editor()).getByRole('row', { name: '目标条目 4' });
  expect(within(row).getByRole('combobox', { name: /^目标属性：/ })).toHaveValue('Rings/IncreasedMana');
  expect(within(row).getByRole('combobox', { name: /^目标阶层：/ })).toHaveValue('4');
  expect(reference().textContent).toBe(original);
  view.unmount(); renderPanel();
  row = within(editor()).getByRole('row', { name: '目标条目 4' });
  expect(within(row).getByRole('combobox', { name: /^目标分类：/ })).toHaveValue('mana');
  expect(within(row).getByRole('combobox', { name: /^目标阶层：/ })).toHaveValue('4');
  link = within(editor()).getByRole('link', { name: '按已选词缀购买 ↗' });
  expect(link).toHaveAttribute('target', '_blank');
  fireEvent.click(within(editor()).getByRole('button', { name: /^删除目标：.*maximum Life/ }));
  expect(reference().textContent).toBe(original);
  fireEvent.click(within(editor()).getByRole('button', { name: '恢复样例词缀' }));
  expect(within(editor()).getAllByRole('row')).toHaveLength(4);
  expect(within(editor()).getByRole('combobox', { name: /^目标属性：.*maximum Life/ })).toHaveValue('Rings/IncreasedLife');
});
