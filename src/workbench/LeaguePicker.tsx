import { uiText } from './uiLocale';
import type { TradeLeague } from './market';
export default function LeaguePicker({ label, value, leagues, onChange, compact = false }: { label: string; value: string; leagues: readonly TradeLeague[]; onChange: (value: string) => void; compact?: boolean }) {
  const options = [...new Map([{ id: value, label: value }, ...leagues].filter((entry) => entry.id).map((entry) => [entry.id, entry])).values()];
  return <div><label className="wb-form-label">{uiText("交易赛季")}<select aria-label={uiText(label)} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((entry) => <option key={entry.id} value={entry.id}>{uiText(entry.label)}</option>)}</select></label>
    {!compact && <details><summary>{uiText("私有赛季名称（高级）")}</summary><input aria-label={uiText(`${label}自定义名称`)} value={value} onChange={(event) => onChange(event.target.value)} /></details>}</div>;
}
