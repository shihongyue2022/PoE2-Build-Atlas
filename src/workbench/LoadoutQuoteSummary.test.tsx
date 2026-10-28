import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadoutQuoteSummary from './LoadoutQuoteSummary';
import { emptyLoadout } from './loadout';
import { BOOTS_SAMPLE, BOOTS_UPGRADE, WEAPON_SAMPLE } from './fixtures/fullGear';

const quote = { itemText: BOOTS_SAMPLE, league: 'Test', amount: 10, currency: 'divine' as const,
  at: '2026-10-24T00:00:00Z', url: 'https://www.pathofexile.com/trade2/search/poe2/Test?q=boots', conditions: '已核对核心条件' };
const state = { ...emptyLoadout(), slots: { mainHand: WEAPON_SAMPLE, boots: BOOTS_SAMPLE } };
describe('loadout quotation completion', () => {
  it('explains missing data and directly opens the exact pending item with its loadout slot', async () => {
    const onPrice = vi.fn(), user = userEvent.setup();
    render(<LoadoutQuoteSummary state={state} league="Test" onPrice={onPrice} />);
    expect(screen.getByText(/0 \/ 2 件已记录/)).toHaveTextContent('导入角色和查价历史不会自动填入');
    await user.click(screen.getByRole('button', { name: '补齐未记录（2）' }));
    expect(onPrice).toHaveBeenLastCalledWith(WEAPON_SAMPLE, 'mainHand');
    await user.click(screen.getByText('逐件报价状态 · 2 件待补齐'));
    await user.click(screen.getByRole('button', { name: '查价：鞋靴' }));
    expect(onPrice).toHaveBeenLastCalledWith(BOOTS_SAMPLE, 'boots');
    expect(screen.queryByText(/0 神圣石/)).toBeNull();
  });
  it('updates totals on recording, keeps currencies separate, and skips completed items', async () => {
    const onPrice = vi.fn(), user = userEvent.setup();
    const view = render(<LoadoutQuoteSummary state={state} league="Test" onPrice={onPrice} />);
    view.rerender(<LoadoutQuoteSummary state={{ ...state, quotes: { boots: quote } }} league="Test" onPrice={onPrice} />);
    expect(screen.getByText('10 神圣石（已记录部分）')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '补齐未记录（1）' }));
    expect(onPrice).toHaveBeenLastCalledWith(WEAPON_SAMPLE, 'mainHand');
    view.rerender(<LoadoutQuoteSummary state={{ ...state, quotes: { boots: quote, mainHand: { ...quote, itemText: WEAPON_SAMPLE, amount: 25, currency: 'exalted' } } }} league="Test" onPrice={onPrice} />);
    expect(screen.getByText('25 崇高石（已记录部分）')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /补齐未记录/ })).toBeNull();
  });
  it('does not reuse another league or replaced item quote, and shows why an item remains unpriced', async () => {
    const view = render(<LoadoutQuoteSummary state={{ ...state, quotes: { boots: quote } }} league="Other" onPrice={vi.fn()} />);
    await userEvent.click(screen.getByText('逐件报价状态 · 2 件待补齐'));
    expect(screen.getByText('其他赛季报价 · 本赛季未记录')).toBeVisible();
    view.rerender(<LoadoutQuoteSummary state={{ ...state, slots: { ...state.slots, boots: BOOTS_UPGRADE }, quotes: { boots: quote } }} league="Test" />);
    expect(screen.getByText(/0 \/ 2 件已记录/)).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('10 神圣石')).toBeNull();
  });
});
