import { expect, it, vi } from 'vitest';
import { createCraftExchangeService, parseCraftExchange } from './craftExchange';

const feed = { lines: [{ id: 'divine', primaryValue: 1 }, { id: 'exalted', primaryValue: 0.002 }, { id: 'chaos', primaryValue: 0.05 }] };
const reply = (data: unknown) => new Response(JSON.stringify(data));
it('normalizes primary values into Ex consistently, rejecting missing, duplicate and nonpositive currency rates', () => {
  expect(parseCraftExchange(feed, 'Test', '2026-10-24T00:00:00Z').rates).toEqual({ exalted: 1, divine: 500, chaos: 25 });
  for (const lines of [feed.lines.slice(1), [...feed.lines, feed.lines[0]], feed.lines.map(row => ({ ...row, primaryValue: 0 }))]) {
    expect(() => parseCraftExchange({ lines }, 'Test', '')).toThrow('有效');
  }
});
it('verifies the exact league, deduplicates and caches requests and refreshes expired rates without credentials', async () => {
  let now = Date.parse('2026-10-24T00:00:00Z');
  const network = vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('/leagues') ? reply([{ id: 'Test' }]) : reply(feed));
  const lookup = createCraftExchangeService({ fetch: network, now: () => now });
  const [a, b] = await Promise.all([lookup('Test'), lookup('Test')]);
  expect(a.rates).toEqual(b.rates); expect(network).toHaveBeenCalledTimes(2);
  expect(await lookup('Test')).toMatchObject({ cached: true, league: 'Test' });
  await expect(lookup('Other')).rejects.toThrow('没有所选赛季');
  expect(network).toHaveBeenCalledTimes(2);
  for (const call of network.mock.calls) {
    expect(call[1]).toMatchObject({ redirect: 'error' });
    expect(call[1]).not.toHaveProperty('credentials');
  }
  now += 5 * 60_000 + 1;
  expect(await lookup('Test')).toMatchObject({ cached: false, asOf: new Date(now).toISOString() });
  expect(network).toHaveBeenCalledTimes(4);
});
it('does not fabricate rates on upstream failures and throttles retries', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response('rate limited', { status: 429 }));
  const lookup = createCraftExchangeService({ fetch: network });
  await expect(lookup('Test')).rejects.toThrow('429');
  await expect(lookup('Test')).rejects.toThrow('429');
  expect(network).toHaveBeenCalledTimes(1);
  await expect(lookup('bad\nleague')).rejects.toThrow('有效赛季');
});
