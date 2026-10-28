import { uiText } from './uiLocale';
import { useState } from 'react';
import images from './data/skill-icons.json';
import { publicAssetUrl } from './workbenchRuntime';

const icons: Record<string, { url: string }> = images.icons;
export function SkillGemArt({ name }: { name: string }) {
  const original = icons[name]?.url, url = original ? publicAssetUrl(original) : undefined, [failed, setFailed] = useState('');
  return <span className="sg-art" aria-hidden="true">{url && failed !== url
    ? <img src={url} alt="" draggable={false} width="40" height="40" loading="lazy" onError={() => setFailed(url)} />
    : <span title={uiText("暂无对应图标")}>◇</span>}</span>;
}
export default function SkillGemButton({ name, label, detail, selected, inactive, support, onClick, ariaLabel }: {
  name: string; label: string; detail?: string; selected?: boolean; inactive?: boolean; support?: boolean; onClick: () => void; ariaLabel?: string;
}) {
  return <button type="button" className={`sg-button${support ? ' support' : ''}${inactive ? ' inactive' : ''}`} aria-pressed={selected} aria-label={uiText(ariaLabel ?? label)}
    title={uiText(`${label}${detail ? ` · ${detail}` : ''}\n${name} · ${icons[name] ? 'GGG 官方美术' : '暂无对应图标'}${inactive ? ' · 未启用' : ''}`)} onClick={onClick}>
    <SkillGemArt name={name} /><span className="sg-caption"><b>{uiText(label)}</b>{detail && <small>{uiText(detail)}</small>}</span>
  </button>;
}
