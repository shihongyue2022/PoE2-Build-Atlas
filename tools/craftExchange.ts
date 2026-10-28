import type { CraftExchangeRates } from '../src/workbench/craftExchange';

const API = 'https://poe.ninja/poe2/api/economy';
const TTL = 5 * 60_000;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export class CraftExchangeError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function parseCraftExchange(feed: unknown, league: string, asOf: string): CraftExchangeRates {
  if (!object(feed) || !Array.isArray(feed.lines)) throw new CraftExchangeError(502, '汇率数据格式已变化，请稍后重试或手动填写汇率。');
  const lines: unknown[] = feed.lines;
  const value = (id: string) => {
    const matches = lines.filter((line): line is Record<string, unknown> => object(line) && line.id === id);
    const v: unknown = matches.length === 1 ? matches[0]!.primaryValue : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new CraftExchangeError(502, '缺少有效的神圣石、混沌石或崇高石汇率，未使用零值代替。');
    return v;
  };
  const exalt = value('exalted'), divine = value('divine'), chaos = value('chaos');
  if (![divine / exalt, chaos / exalt].every(v => Number.isFinite(v) && v > 0)) throw new CraftExchangeError(502, '汇率数值无效。');
  return { league, asOf, source: 'poe.ninja', rates: { exalted: 1, divine: divine / exalt, chaos: chaos / exalt } };
}
/** Fixed public endpoints only; league discovery prevents a missing league from silently returning another economy. */
export function createCraftExchangeService(options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const request = options.fetch ?? fetch, now = options.now ?? Date.now;
  const cache = new Map<string, CraftExchangeRates>(), pending = new Map<string, Promise<CraftExchangeRates>>();
  let leagues: { names: string[]; until: number } | undefined;
  let discovering: Promise<string[]> | undefined;
  const failures = new Map<string, { until: number; error: unknown }>();
  async function json(url: string): Promise<unknown> {
    const response = await request(url, { signal: AbortSignal.timeout(12_000), redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'PoE2-Craft-Workbench/1.1 (+https://github.com/shihongyue2022/PoE2-Build-Atlas)' } });
    if (!response.ok) throw new CraftExchangeError(response.status === 429 ? 429 : 502, `汇率来源暂不可用（${response.status}），请稍后重试。`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new CraftExchangeError(502, '汇率响应过大。');
    try { return JSON.parse(text); } catch { throw new CraftExchangeError(502, '汇率来源返回了无效数据。'); }
  }
  async function names() {
    if (leagues && leagues.until > now()) return leagues.names;
    discovering ??= json(`${API}/leagues`).then(data => {
      if (!Array.isArray(data)) throw new CraftExchangeError(502, '无法核对汇率赛季。');
      const names = data.flatMap((row: unknown) => object(row) && typeof row.id === 'string' ? [row.id] : []);
      leagues = { names, until: now() + TTL }; return names;
    }).finally(() => { discovering = undefined; });
    return discovering;
  }
  return async (league: unknown) => {
    if (typeof league !== 'string' || !league.trim() || league.length > 150 || Array.from(league).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new CraftExchangeError(400, '请选择有效赛季。');
    league = league.trim();
    const name = league as string, cached = cache.get(name);
    if (cached && now() - Date.parse(cached.asOf) < TTL) return { ...cached, cached: true };
    const failure = failures.get(name);
    if (failure && failure.until > now()) throw failure.error;
    if (!pending.has(name)) {
      pending.set(name, (async () => {
        if (!(await names()).includes(name)) throw new CraftExchangeError(404, '汇率来源没有所选赛季，未借用其他赛季的数据；可手动填写。');
        const feed = await json(`${API}/exchange/current/overview?league=${encodeURIComponent(name)}&type=Currency`);
        const result = parseCraftExchange(feed, name, new Date(now()).toISOString());
        if (cache.size >= 8) cache.delete(cache.keys().next().value!);
        cache.set(name, result); return result;
      })().catch(error => {
        const issue = error instanceof CraftExchangeError ? error : new CraftExchangeError(502, '汇率请求超时或网络不可用，可手动填写。');
        if (failures.size >= 8) failures.delete(failures.keys().next().value!);
        failures.set(name, { until: now() + 30_000, error: issue }); throw issue;
      }).finally(() => { pending.delete(name); }));
    }
    return { ...await pending.get(name)!, cached: false };
  };
}
