import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DamageAttributionPanel from './DamageAttributionPanel';
import { rememberBarrageAttributionFixture } from './fixtures/damageAttribution';
import { attributionSkillChoices } from './attributionSkills';
import { setSkillRoutine } from './skillRoutine';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('shows selected Barrage and calculates equipment contribution through its chosen output instead of Barrage itself', async () => {
  localStorage.clear();
  const state = rememberBarrageAttributionFixture(), before = JSON.stringify(state), choices = attributionSkillChoices(state);
  const network = vi.fn<typeof fetch>().mockImplementation((_input, options) => {
    if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body');
    const request = JSON.parse(options.body) as { skill: { name: string } };
    return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { version: 1, engine: 'PoB2 v0.23.1', metric: 'CombinedDPS', baseline: 100, skill: request.skill.name, rows: [], items: [] } })));
  });
  vi.stubGlobal('fetch', network);
  const view = render(<DamageAttributionPanel state={state} onSelectSlot={vi.fn()} />);
  expect(screen.getByRole('region', { name: '全身伤害词缀排行' })).toBeVisible();
  expect(network).not.toHaveBeenCalled();
  const select = screen.getByRole('combobox', { name: '贡献分析技能' });
  expect(within(select).getByRole('option', { name: '弹幕 · 联动／增益' })).toBeInTheDocument();
  await userEvent.selectOptions(select, choices.find(choice => choice.name === 'Barrage')!.key);
  expect(screen.getByRole('status')).toHaveTextContent('弹幕本身没有独立伤害');
  const target = screen.getByRole('combobox', { name: '联动作用的输出技能' });
  expect(within(target).queryByRole('option', { name: '回旋斩' })).not.toBeInTheDocument();
  expect(within(target).getByRole('option', { name: '旋风' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '计算全身词缀贡献' }));
  await waitFor(() => expect(network).toHaveBeenCalledTimes(1));
  const body = network.mock.calls[0]![1]?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON request body');
  const request = JSON.parse(body) as { skill: { name: string }; excludedGroups: number[] };
  expect(request.skill.name).toBe('Twister');
  expect(request.excludedGroups).toEqual([6]);
  expect(await screen.findByText('弹幕 → 旋风 · 基准 CombinedDPS 100')).toBeVisible();
  await userEvent.selectOptions(target, choices.find(choice => choice.name === 'Explosive Spear')!.key);
  expect(screen.queryByText(/基准 CombinedDPS/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '计算全身词缀贡献' }));
  expect(await screen.findByText('弹幕 → 爆炸长矛 · 基准 CombinedDPS 100')).toBeVisible();
  expect(JSON.stringify(state)).toBe(before);
  const without = setSkillRoutine(state, state.goals.skillBar!.filter(entry => entry.name !== 'Barrage'));
  view.rerender(<DamageAttributionPanel state={without} onSelectSlot={vi.fn()} />);
  expect(within(select).queryByRole('option', { name: /弹幕/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/基准 CombinedDPS/)).not.toBeInTheDocument();
});

it('explains an incompatible routine without sending a non-damaging gem to the native calculator', async () => {
  localStorage.clear();
  const original = rememberBarrageAttributionFixture();
  const state = setSkillRoutine(original, original.goals.skillBar!.filter(entry => ['Barrage', 'Whirling Slash'].includes(entry.name ?? '')));
  const network = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', network);
  render(<DamageAttributionPanel state={state} onSelectSlot={vi.fn()} />);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '贡献分析技能' }), attributionSkillChoices(state).find(choice => choice.name === 'Barrage')!.key);
  expect(screen.getByRole('status')).toHaveTextContent('请在上方技能组加入可重复');
  expect(screen.getByRole('button', { name: '计算全身词缀贡献' })).toBeDisabled();
  expect(network).not.toHaveBeenCalled();
});
