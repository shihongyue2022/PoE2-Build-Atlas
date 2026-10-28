/** GGG /api/trade2/data/filters: status_filters.status (snapshot 2026-10-22). */
export const TRADE_STATUSES = [
  { value: 'available', label: '一口价购买及当面交易' },
  { value: 'securable', label: '一口价购买' },
  { value: 'onlineleague', label: '当面交易（当前赛季在线）' },
  { value: 'online', label: '当面交易（在线）' },
  { value: 'any', label: '任何' },
] as const;
export type TradeStatus = typeof TRADE_STATUSES[number]['value'];
export const DEFAULT_TRADE_STATUS: TradeStatus = 'securable';
export const isTradeStatus = (value: unknown): value is TradeStatus => TRADE_STATUSES.some(option => option.value === value);
export const tradeStatusLabel = (value: unknown): string => TRADE_STATUSES.find(option => option.value === value)?.label ?? '未知交易方式';
