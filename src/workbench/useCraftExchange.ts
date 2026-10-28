import { useEffect, useState } from 'react';
import type { Engine } from '../lib/engine';
import { HOSTED_WORKBENCH } from './workbenchRuntime';
import { snapshotCraftRates, type CraftExchangeRates } from './craftExchange';

export function useCraftExchange(engine: Engine, league: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ loading: boolean; exchange?: CraftExchangeRates; error?: string }>({ loading: !HOSTED_WORKBENCH });
  useEffect(() => {
    if (HOSTED_WORKBENCH) return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setState(old => ({ ...old, loading: true, error: undefined })); });
    void (async () => {
      try {
        const response = await fetch(`/api/workbench/craft-exchange?league=${encodeURIComponent(league)}`, { signal: controller.signal });
        const data = await response.json() as { ok?: boolean; error?: { message?: string }; exchange?: CraftExchangeRates };
        if (!response.ok || !data.ok) throw new Error(data.error?.message ?? '汇率查询失败。');
        const exchange = data.exchange;
        if (!exchange || exchange.league !== league || !Number.isFinite(Date.parse(exchange.asOf)) || exchange.source !== 'poe.ninja'
          || exchange.rates?.exalted !== 1 || ![exchange.rates.divine, exchange.rates.chaos].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)) throw new Error('汇率数据或赛季不一致，未应用。');
        if (!controller.signal.aborted) setState({ loading: false, exchange });
      } catch (error) {
        if (!controller.signal.aborted) setState(old => ({ ...old, loading: false, error: error instanceof Error ? error.message : '汇率暂不可用。' }));
      }
    })();
    return () => controller.abort();
  }, [league, revision]);
  return { exchange: state.exchange?.league === league ? state.exchange : snapshotCraftRates(engine, league),
    loading: state.loading, error: state.error, refresh: () => setRevision(old => old + 1) };
}
