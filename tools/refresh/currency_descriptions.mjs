// Read the game's item-popup text only; no wiki commentary, lore or inferred engine rules.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const EXTRA = ['Fracturing Orb', 'Essence of the Breach', "Xoph's Catalyst", 'Omen of Whittling', 'Omen of Sinistral Necromancy', 'Ancient Collarbone', 'Preserved Collarbone'];
function plain(html) {
  return html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|lt|gt);/gi, (_, entity) => {
    if (entity.startsWith('#')) return String.fromCodePoint(entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    return ({ amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>' })[entity.toLowerCase()] ?? '';
  }).split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
export function parseCurrencyDescription(html, name, locale) {
  const opening = /<div\b[^>]*class=["'][^"']*\bnewItemPopup\b[^"']*["'][^>]*>/i.exec(html);
  if (!opening) throw new Error(`${name}/${locale}: no game item popup`);
  const tags = /<\/?div\b[^>]*>/gi; tags.lastIndex = opening.index;
  let depth = 0, end = -1;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (!depth) { end = tags.lastIndex; break; }
  }
  if (end < 0) throw new Error(`${name}: incomplete popup`);
  const popup = html.slice(opening.index, end);
  const title = /<div\b[^>]*class=["'][^"']*\bitemName\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(popup)?.[1];
  const label = title && plain(title);
  if (!label || (locale === 'en' ? label !== name : !plain(popup).split('\n').includes(name))) throw new Error(`${name}/${locale}: mismatched item name`);
  const read = className => [...popup.matchAll(new RegExp(`<div\\b[^>]*class=["']${className}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'gi'))].map(match => plain(match[1])).filter(Boolean);
  const properties = read('property').filter(line => !/Stack Size|堆疊數量/.test(line));
  const effects = read('explicitMod'), instructions = read('default fst-italic');
  if (!effects.length) throw new Error(`${name}/${locale}: no effect text`);
  return { name: label, properties, effects, instructions };
}
async function main() {
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));
  const snapshot = JSON.parse(await readFile(join(ROOT, 'src/workbench/data/currency-icons.json'), 'utf8'));
  const names = [...new Set([...Object.values(snapshot.currencies).map(value => value.name), ...EXTRA])];
  const cache = join(ROOT, 'artifacts/workbench/currency-description-sources'); await mkdir(cache, { recursive: true });
  const items = {};
  for (const name of names) {
    const slug = name.replace(/['’]/g, '').replace(/ /g, '_');
    const entry = {};
    for (const [locale, path] of [['tw', 'tw'], ['en', 'us']]) {
      const source = `https://poe2db.tw/${path}/${encodeURIComponent(slug)}`, file = join(cache, `${slug}-${locale}.html`);
      let html;
      try { html = await readFile(file, 'utf8'); } catch {
        const response = await fetch(source, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        html = await response.text(); await writeFile(file, html);
      }
      entry[locale] = { ...parseCurrencyDescription(html, name, locale), source };
    }
    items[name] = entry; console.log(`Read ${name}`);
  }
  await writeFile(join(ROOT, 'src/workbench/data/currency-descriptions.json'), JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), source: 'PoE2DB game item popups', items }, null, 2) + '\n');
  console.log(`Saved ${names.length} native item descriptions (Traditional Chinese and English).`);
}
if (import.meta.url.startsWith('file:') && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
