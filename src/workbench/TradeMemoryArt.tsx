import { uiText } from './uiLocale';
import { useMemo, useState } from 'react';
import { parseEquipment } from './genericEquipment';
import { getOfficialItemImage } from './itemImages';
import type { TradeMemoryEntry } from './tradeMemory';

/** Resolve old records locally; never attach a different item's art to an unknown item. */
export default function TradeMemoryArt({ entry, onOpen }: { entry: TradeMemoryEntry; onOpen: () => void }) {
  const url = useMemo(() => {
    const item = entry.raw ? parseEquipment(entry.raw) : null;
    const exactName = entry.query.query.name || entry.query.query.type;
    const candidate = item?.icon ?? (exactName ? getOfficialItemImage(exactName)?.url : undefined);
    return candidate?.startsWith('https://web.poecdn.com/') ? candidate : undefined;
  }, [entry.raw, entry.query]);
  const [failed, setFailed] = useState('');
  const available = url && failed !== url;
  return <button className="wb-history-art" onClick={onOpen} aria-label={uiText(`查看 ${entry.title} 原条件`)}
    title={uiText(available ? 'GGG 官方物品图片 · 点击查看原条件' : '暂无对应图片 · 点击查看原条件')}>
    {available ? <img src={url} alt={uiText(`${entry.title} · 官方物品图片`)} loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onError={() => setFailed(url)} />
      : <span className="wb-history-art-fallback" aria-label={uiText("暂无对应物品图片")}>◇</span>}
  </button>;
}
