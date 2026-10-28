import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import descriptions from './data/currency-descriptions.json';
import { breachPreparation } from './craftReference';

it('shows exact game effect, tier property and instructions on image hover without triggering the material action', async () => {
  const select = vi.fn();
  render(<button onClick={select} aria-label="选择完美崇高石"><OfficialCurrencyIcon currencyId="exalt_perfect" label="完美崇高石" size="card" /></button>);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseEnter(screen.getByRole('img'));
  const popup = screen.getByRole('tooltip'), entry = descriptions.items['Perfect Exalted Orb'].tw;
  for (const line of [...entry.properties, ...entry.effects, ...entry.instructions]) expect(popup.textContent).toContain(line);
  expect(popup).toHaveTextContent('最小詞綴等級: 50');
  expect(within(popup).getByRole('link')).toHaveAttribute('href', entry.source);
  fireEvent.click(within(popup).getByRole('link'));
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.focus(screen.getByRole('button'));
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  expect(screen.getByRole('img').closest('.wb-currency-tooltip-anchor')).toHaveAttribute('tabindex', '-1');
  fireEvent.blur(screen.getByRole('button')); await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});
it('covers every preparation material by exact species and keeps missing descriptions explicit', () => {
  const items: Record<string, unknown> = descriptions.items;
  for (const step of breachPreparation('Breach Ring', 60)!.steps) for (const name of step.materials) expect(items[name]).toBeDefined();
  render(<OfficialCurrencyIcon materialName="Imaginary Catalyst" label="未知材料" size="card" />);
  fireEvent.mouseEnter(screen.getByRole('img'));
  expect(screen.getByRole('tooltip')).toHaveTextContent('尚未收录');
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('最小詞綴等級');
});
