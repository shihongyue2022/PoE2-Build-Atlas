import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { indexPrices } from '../../packages/optimizer/src/cost';
import CraftCostAmount from './CraftCostAmount';

const prices = indexPrices({ league: 'Test', updated: '2026-10-18', prices: { divine: 697.4 } });
it('converts large Ex costs with the solver price sheet and retains the precise original and rate in its title', () => {
  render(<CraftCostAmount value={346743} prices={prices} />);
  expect(screen.getByText('≈ 497.19 神圣石')).toHaveAttribute('title', expect.stringContaining('原始成本：346,743 Ex；1 神圣石 = 697.4 Ex'));
  expect(screen.getByText('≈ 497.19 神圣石')).toHaveAttribute('title', expect.stringContaining('Test · 2026-10-18'));
});
it('keeps small values in Ex, honors manual rates and never invents a rate for missing or zero prices', () => {
  const view = render(<CraftCostAmount value={999} prices={prices} />);
  expect(screen.getByText('999 Ex')).toBeInTheDocument();
  view.rerender(<CraftCostAmount value={1000} prices={prices} />);
  expect(screen.getByText('≈ 1.43 神圣石')).toBeInTheDocument();
  view.rerender(<CraftCostAmount value={346743} prices={prices} overrides={{ divine: 1000 }} />);
  expect(screen.getByText('≈ 346.74 神圣石')).toHaveAttribute('title', expect.stringContaining('手填神圣石价格'));
  view.rerender(<CraftCostAmount value={346743} prices={prices} overrides={{ divine: 0 }} />);
  expect(screen.getByText('346,743 Ex')).toHaveAttribute('title', expect.stringContaining('缺少有效'));
  view.rerender(<CraftCostAmount value={346743} />);
  expect(screen.getByText('346,743 Ex')).toBeInTheDocument();
  view.rerender(<CraftCostAmount value={1000} prices={prices} overrides={{ divine: 1000000 }} />);
  expect(screen.getByText('1,000 Ex')).toBeInTheDocument();
  view.rerender(<CraftCostAmount value={0} prices={prices} />);
  expect(screen.getByText('0 Ex')).toBeInTheDocument();
  view.rerender(<CraftCostAmount value={Infinity} prices={prices} />);
  expect(screen.getByText('尚无有效成本')).toBeInTheDocument();
});
