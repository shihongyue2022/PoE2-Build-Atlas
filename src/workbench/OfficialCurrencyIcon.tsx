import { uiText } from './uiLocale';
import { useState, type ReactNode } from 'react';
import { getOfficialCurrencyImage, getOfficialCurrencyImageForName } from './currencyImages';
import CurrencyTooltip from './CurrencyTooltip';

/** Use exact, verified GGG artwork; a failed request never turns into another currency's image. */
export default function OfficialCurrencyIcon({ currencyId, materialName, label, size = 'inline', fallback }: {
  currencyId?: string;
  materialName?: string;
  label: string;
  size?: 'card' | 'inline';
  fallback?: ReactNode;
}) {
  const image = materialName ? getOfficialCurrencyImageForName(materialName) : currencyId ? getOfficialCurrencyImage(currencyId) : undefined;
  const [failedUrl, setFailedUrl] = useState('');
  if (!image && size === 'inline') return fallback ?? null;
  const visible = image && image.url !== failedUrl;
  return <CurrencyTooltip name={materialName ?? image?.name ?? label}><span className={`wb-currency-art ${size}${visible ? '' : ' unavailable'}`}>
    {visible ? <img src={image.url} alt={uiText(`${label} · GGG 官方通货图标`)} decoding="async"
      referrerPolicy="no-referrer" onError={() => setFailedUrl(image.url)} />
      : <span className="wb-currency-art-fallback" role="img" aria-label={uiText(`${label} · ${image ? '官方图标加载失败' : '暂无官方图标'}`)}>
        {uiText(size === 'card' ? image ? '图标未加载' : '暂无图标' : '?')}</span>}
  </span></CurrencyTooltip>;
}
