import { uiText } from './uiLocale';
import { isTradeStatus, TRADE_STATUSES, type TradeStatus } from './tradeStatus';

export default function TradeStatusSelect({ value, onChange, label = '交易方式' }: {
  value: TradeStatus; onChange: (value: TradeStatus) => void; label?: string;
}) {
  return <label className="wb-form-label wb-trade-status-select">{uiText("交易方式")}<select aria-label={uiText(label)} value={value}
    onChange={event => { if (isTradeStatus(event.target.value)) onChange(event.target.value); }}>
    {TRADE_STATUSES.map(option => <option key={option.value} value={option.value}>{uiText(option.label)}</option>)}
  </select></label>;
}
