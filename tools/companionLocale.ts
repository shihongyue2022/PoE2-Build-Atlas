import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type CompanionLocale = 'zh-CN' | 'en' | 'ja';
export const validCompanionLocale = (value: unknown): value is CompanionLocale => value === 'zh-CN' || value === 'en' || value === 'ja';
export function createCompanionLocale(path = join(process.cwd(), 'logs', 'companion-locale.json')) {
  let locale: CompanionLocale = 'zh-CN';
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8')) as { locale?: unknown };
    if (validCompanionLocale(saved.locale)) locale = saved.locale;
  } catch { /* A fresh installation uses Chinese until the browser chooses a language. */ }
  return {
    read: () => locale,
    write(next: CompanionLocale) {
      if (next === locale) return;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ locale: next }), 'utf8');
      locale = next;
    },
  };
}
