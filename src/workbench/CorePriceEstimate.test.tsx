import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CorePriceEstimate from './CorePriceEstimate';
import { parseEquipment } from './genericEquipment';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { corePriceAxes } from './corePricing';
import { BOOTS_SAMPLE } from './fixtures/fullGear';

const equipment = parseEquipment(BOOTS_SAMPLE)!, rows = equipmentTradeRows(equipment, 'similar');
const life = corePriceAxes(equipment, rows).find(row => row.actualValue === 100)!;
const result = { ok: true, total: 3, fetched: 3, priced: 3, duplicateSellers: 0,
  groups: [{ currency: 'divine', count: 3, min: 8, max: 12, median: 10, p25: 9, p75: 11 }],
  sampledAt: '2026-10-24T00:00:00Z', cached: false, url: 'https://www.pathofexile.com/trade2/search/poe2/Test?q=test', warnings: [],
  listings: [8, 10, 12].map((amount, index) => ({ id: `boot-${index}`, name: 'Comparable Boots', base: 'Adherent Leggings', price: { currency: 'divine', amount }, explicitMods: ['+100 to maximum Life'] })) };
afterEach(() => vi.restoreAllMocks());
describe('recording a core comparison into the loadout summary', () => {
  it('records the selected comparable price and its exact league, source and conditions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(result)));
    const onRecordQuote = vi.fn(), user = userEvent.setup();
    render(<CorePriceEstimate options={{ equipment, league: 'Test', rows }} initialSelection={{ key: life.key, preset: 'at-least' }} onRecordQuote={onRecordQuote} />);
    await user.click(screen.getByRole('button', { name: '检索提升候选' }));
    await user.click(await screen.findByRole('button', { name: '记录到套装汇总（神圣石）' }));
    expect(onRecordQuote).toHaveBeenCalledWith(expect.objectContaining({ amount: 8, currency: 'divine', league: 'Test', conditions: expect.stringContaining('3 卖家 · 联合条件最低挂牌参考') }));
  });
  it('explains why too few comparable sellers cannot be recorded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...result, listings: result.listings.slice(0, 1) })));
    render(<CorePriceEstimate options={{ equipment, league: 'Test', rows }} initialSelection={{ key: life.key, preset: 'at-least' }} onRecordQuote={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '检索提升候选' }));
    expect(await screen.findByRole('button', { name: '记录到套装汇总（神圣石）' })).toBeDisabled();
    expect(screen.getByText('至少需要 3 个卖家的可比样本才能记录。')).toBeInTheDocument();
  });
});
