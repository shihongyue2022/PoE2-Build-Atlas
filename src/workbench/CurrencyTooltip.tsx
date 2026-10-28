import { uiText } from './uiLocale';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import descriptions from './data/currency-descriptions.json';
import { englishPoe2dbUrl } from './poe2dbReference';
import './currencyTooltip.css';

export default function CurrencyTooltip({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false), id = useId();
  const anchor = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const entry = descriptions.items[name as keyof typeof descriptions.items];
  const show = useCallback(() => { clearTimeout(timer.current); setOpen(true); }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); }, []);
  const dismiss = useCallback(() => { clearTimeout(timer.current); setOpen(false); }, []);
  // Icons inside existing buttons use that button's keyboard focus; no nested tab stop.
  useEffect(() => {
    const root = anchor.current;
    if (!root) return;
    const control = root.closest<HTMLElement>('button,a') ?? root;
    root.tabIndex = control === root ? 0 : -1;
    const blur = (event: FocusEvent) => { if (!popup.current?.contains(event.relatedTarget as Node | null)) hide(); };
    control.addEventListener('focus', show); control.addEventListener('blur', blur);
    return () => { clearTimeout(timer.current); control.removeEventListener('focus', show); control.removeEventListener('blur', blur); };
  }, [show, hide]);
  useEffect(() => {
    if (!open) return;
    const control = anchor.current?.closest<HTMLElement>('button,a') ?? anchor.current;
    const prior = control?.getAttribute('aria-describedby');
    control?.setAttribute('aria-describedby', [prior, id].filter(Boolean).join(' '));
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); dismiss(); } };
    document.addEventListener('keydown', escape, true);
    return () => {
      if (prior) control?.setAttribute('aria-describedby', prior); else control?.removeAttribute('aria-describedby');
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, id, dismiss]);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const element = popup.current, trigger = anchor.current;
      if (!element || !trigger) return;
      const a = trigger.getBoundingClientRect(), p = element.getBoundingClientRect();
      const left = a.right + 10 + p.width <= innerWidth - 8 ? a.right + 10 : a.left - p.width - 10;
      element.style.left = `${Math.max(8, Math.min(innerWidth - p.width - 8, left))}px`;
      element.style.top = `${Math.max(8, Math.min(innerHeight - p.height - 8, a.top - 12))}px`;
    };
    position();
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open, name]);
  return <span className="wb-currency-tooltip-anchor" ref={anchor} onMouseEnter={show} onMouseLeave={hide}>
    {uiText(children)}
    {open && createPortal(<div ref={popup} id={id} role="tooltip" className="wb-native-currency-tooltip" onClick={event => event.stopPropagation()} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}>
      <header><strong lang="zh-Hant">{uiText(entry?.tw.name ?? name)}</strong><small>{uiText(name)}</small></header>
      {entry ? <div lang="zh-Hant" className="wb-native-currency-body">
        <div className="wb-native-currency-properties">{entry.tw.properties.map((line, i) => <p key={i}>{uiText(line)}</p>)}</div>
        <div className="wb-native-currency-effects">{entry.tw.effects.map((line, i) => <p key={i}>{uiText(line)}</p>)}</div>
        <div className="wb-native-currency-instructions">{entry.tw.instructions.map((line, i) => <p key={i}>{uiText(line)}</p>)}</div>
      </div> : <p className="wb-native-currency-body">{uiText("尚未收录该耗材的游戏原文，请打开来源核对。")}</p>}
      <footer>{uiText("游戏原文 · ")}{uiText(entry ? `繁中 · 收录 ${descriptions.checkedAt}` : '待收录')}<a href={entry?.tw.source ?? englishPoe2dbUrl(name)} target="_blank" rel="noreferrer">{uiText("PoE2DB 来源 ↗")}</a></footer>
    </div>, document.body)}
  </span>;
}
