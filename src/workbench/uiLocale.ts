import { useSyncExternalStore } from 'react';
import english from './data/ui/en.json';
import japanese from './data/ui/ja.json';
import nativeStats from './data/localized-stats.json';
import nativeEquipment from './data/equipment-index.json';
import gameReference from './data/ui/poe2db-ja.json';
import equipmentReference from './data/ui/equipment-ja.json';
import { nativeEquipmentModifier } from './nativeEquipmentLocale';
import nativeGems from './data/pob-gem-index.json';

export type UiLocale = 'zh-CN' | 'en' | 'ja';
const STORAGE_KEY = 'poe2-workbench-ui-language-v1';
const locales: readonly UiLocale[] = ['zh-CN', 'en', 'ja'];
const validLocale = (value: unknown): value is UiLocale => locales.includes(value as UiLocale);
const listeners = new Set<() => void>();
const titles: Record<UiLocale, string> = {
  'zh-CN': 'PoE2 Build Atlas · 配装与制作工坊',
  en: 'PoE2 Build Atlas · Equipment Workbench',
  ja: 'PoE2 Build Atlas · 装備・クラフト工房',
};
function initialLocale(): UiLocale {
  if (typeof window === 'undefined') return 'zh-CN';
  const query = new URL(window.location.href).searchParams.get('lang');
  if (validLocale(query)) return query;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (validLocale(saved)) return saved;
  } catch { /* Language selection still works with disabled storage. */ }
  return 'zh-CN';
}
let locale = initialLocale();
export const getUiLocale = (): UiLocale => locale;
export function setUiLocale(next: UiLocale): void {
  if (!validLocale(next)) return;
  const changed = next !== locale;
  locale = next;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.title = titles[locale];
  }
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Optional preference. */ }
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    try { window.history.replaceState(window.history.state, '', url); } catch { /* Embedded contexts may restrict history. */ }
  }
  if (changed) for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useUiLocale(): UiLocale {
  return useSyncExternalStore(subscribe, getUiLocale, () => 'zh-CN');
}
if (typeof document !== 'undefined') {
  document.documentElement.lang = locale;
  document.title = titles[locale];
}

const catalogs: Record<'en' | 'ja', Readonly<Record<string, string>>> = { en: english, ja: japanese };
function escape(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const nativeIndex = nativeEquipment as unknown as {
  simplify: Readonly<Record<string, string>>;
  items: readonly { en: string; zh?: string }[];
};
const simplifiedCharacters = nativeIndex.simplify;
const simplified = (text: string) => [...text].map((char) => simplifiedCharacters[char] ?? char).join('');
const nativeNames = new Map(nativeIndex.items.flatMap((item) => item.zh ? [[simplified(item.zh), item.en] as const] : []));
const gameNames: Readonly<Record<string, { japanese: string; aliases: readonly string[] }>> = { ...gameReference.names, ...equipmentReference.names };
const aliases = new Map<string, Set<string>>();
function addAlias(alias: string, englishName: string) {
  const key = simplified(alias);
  const names = aliases.get(key) ?? new Set<string>();
  names.add(englishName); aliases.set(key, names);
}
for (const [name, entry] of Object.entries(gameNames)) {
  for (const alias of entry.aliases) addAlias(alias, name);
}
const gems = nativeGems as unknown as { gems: Readonly<Record<string, readonly [string, string, ...unknown[]]>> };
const gemAliases = new Map<string, Set<string>>();
for (const gem of Object.values(gems.gems)) {
  const key = simplified(gem[1]), names = gemAliases.get(key) ?? new Set<string>();
  names.add(gem[0]); gemAliases.set(key, names);
}
function nativeName(text: string, language: 'en' | 'ja'): string | undefined {
  const candidates = aliases.get(simplified(text));
  const gemCandidates = gemAliases.get(simplified(text));
  const englishName = Object.prototype.hasOwnProperty.call(gameNames, text) ? text
    : nativeNames.get(text) ?? (gemCandidates?.size === 1 ? [...gemCandidates][0] : undefined)
      ?? (candidates?.size === 1 ? [...candidates][0] : undefined);
  return englishName === undefined ? undefined : language === 'en' ? englishName : gameNames[englishName]?.japanese ?? englishName;
}
const gameModifierPatterns = Object.entries({ ...gameReference.modifiers, ...equipmentReference.modifiers }).map(([source, target]) => {
  const tokens: string[] = [];
  let at = 0, pattern = '^';
  for (const token of source.matchAll(/\{(\d+)\}/g)) {
    pattern += escape(source.slice(at, token.index)) + '([+-]?(?:#|\\d[\\d,]*(?:\\.\\d+)?(?:[–—-]\\d+(?:\\.\\d+)?)?))';
    tokens.push(token[1]!); at = token.index + token[0].length;
  }
  return { regex: new RegExp(pattern + escape(source.slice(at)) + '$'), tokens, japanese: target.japanese };
});
function japaneseModifier(text: string): string | undefined {
  const bonded = /^Bonded:\s*(.+)$/.exec(text);
  if (bonded) return equipmentReference.bonded.japanese + '：' + (japaneseModifier(bonded[1]!) ?? bonded[1]!);
  for (const entry of gameModifierPatterns) {
    const match = entry.regex.exec(text);
    if (!match) continue;
    const values = new Map(entry.tokens.map((token, index) => [token, match[index + 1]!]));
    return entry.japanese.replace(/\{(\d+)\}/g, (token, index: string) => values.get(index) ?? token)
      .replace(/\+\+/g, '+').replace(/\+-/g, '-');
  }
  return undefined;
}
// English names and stat templates are the canonical PoB/trade vocabulary. When a Japanese
// game-text translation is not in the catalog, keep this native English instead of inventing one.
const nativeStatPatterns = nativeStats.stats.flatMap((stat) => stat.traditional.map((local) => ({
  regex: new RegExp('^' + simplified(local).split('#').map(escape).join('([+-]?(?:#|\\d+(?:\\.\\d+)?(?:[–—-]\\d+(?:\\.\\d+)?)?))') + '$'),
  english: stat.english,
})));
const displayCache: Record<'en' | 'ja', Map<string, string>> = { en: new Map(), ja: new Map() };
const patterns = Object.fromEntries(Object.entries(catalogs).map(([language, catalog]) => [language,
  Object.entries(catalog).filter(([source]) => /\{\d+\}/.test(source)).map(([source, target]) => {
    const tokens = [...source.matchAll(/\{(\d+)\}/g)];
    let at = 0;
    let pattern = '^';
    for (const token of tokens) {
      pattern += escape(source.slice(at, token.index)) + '([\\s\\S]*?)';
      at = token.index + token[0].length;
    }
    pattern += escape(source.slice(at)) + '$';
    return { regex: new RegExp(pattern), tokens: tokens.map((token) => token[1]!), target };
  }),
])) as Record<'en' | 'ja', { regex: RegExp; tokens: string[]; target: string }[]>;

/** Display boundary only. Never use localized text as an ID, parser input, or stored state. */
export function uiText<T>(value: T): T {
  if (typeof value !== 'string' || locale === 'zh-CN') return value;
  const source = value.trim();
  const catalog = catalogs[locale];
  let translated = displayCache[locale].get(source) ?? nativeName(source, locale);
  if (translated === undefined && locale === 'ja') translated = japaneseModifier(source);
  if (translated === undefined) translated = catalog[source];
  if (translated === undefined && /[\u3400-\u9fff]/.test(source)) {
    const native = nativeEquipmentModifier(source);
    if (native !== undefined) translated = locale === 'ja' ? japaneseModifier(native) ?? native : native;
  }
  if (translated === undefined && /[\u3400-\u9fff]/.test(source)) {
    for (const entry of nativeStatPatterns) {
      const match = entry.regex.exec(source);
      if (!match) continue;
      let index = 1;
      translated = entry.english.replace(/#/g, () => match[index++] ?? '#');
      // A copied numeric value already includes its sign; do not emit ++30.
      translated = translated.replace(/\+\+/g, '+').replace(/\+-/g, '-');
      if (locale === 'ja') translated = japaneseModifier(translated) ?? translated;
      break;
    }
  }
  // Composed table cells retain punctuation and numbers. Translate each semantic segment
  // instead of adding a separate message for every tier, item level, and numeric threshold.
  if (translated === undefined && /[\u3400-\u9fff]/.test(source)) {
    const parts = source.split(/(\s*·\s*|\s+[≥≤→]\s+|\s*：\s*|\t)/);
    if (parts.length > 1) {
      const joined = parts.map((part, index) => index % 2 ? part : uiText(part)).join('');
      if (joined !== source) translated = joined;
    }
    if (translated === undefined) {
      const decoration = /^([·＋/：:]+\s*)(.+)$/.exec(source);
      if (decoration) {
        const body = uiText(decoration[2]!);
        if (body !== decoration[2]) translated = decoration[1]! + body;
      }
    }
  }
  if (translated === undefined && /[\u3400-\u9fff]/.test(source)) {
    for (const entry of patterns[locale]) {
      const match = entry.regex.exec(source);
      if (!match) continue;
      const values = new Map(entry.tokens.map((token, i) => [token, match[i + 1]!]));
      translated = entry.target.replace(/\{(\d+)\}/g, (token, index: string) => uiText(values.get(index) ?? token));
      break;
    }
  }
  if (translated === undefined) return value;
  if (displayCache[locale].size > 2048) displayCache[locale].clear();
  displayCache[locale].set(source, translated);
  return (value.slice(0, value.indexOf(source)) + translated + value.slice(value.indexOf(source) + source.length)) as T;
}
