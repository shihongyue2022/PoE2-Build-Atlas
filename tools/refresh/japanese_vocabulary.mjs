// Download reference pages only. Never upload project copy, character data, or account data.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const pages = ['Currency', 'Rings', 'Amulets', 'Skill_Gems', 'Support_Gems', 'Omen', 'Essence', 'Modifiers'];
const locales = ['us', 'jp', 'tw'];
const cache = resolve('artifacts/i18n/references');
const fetchPages = process.argv.includes('--fetch');
const decode = (text) => text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|lt|gt);/gi, (_, entity) => {
  if (entity.startsWith('#')) return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  return ({ amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>' })[entity.toLowerCase()] ?? '';
});
const plain = (html) => decode(html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
function modData(html) {
  const call = html.indexOf('new ModsView(');
  if (call < 0) return new Map();
  const start = html.indexOf('{', call);
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) throw new Error('Incomplete ModsView reference data');
  // Parse inert JSON, never execute downloaded JavaScript.
  const data = JSON.parse(html.slice(start, end));
  const rows = new Map();
  const duplicates = new Set();
  for (const [pool, values] of Object.entries(data)) {
    if (!Array.isArray(values)) continue;
    for (const row of values) {
      if (!row.str || (!row.Code && !row.ModFamilyList?.length)) continue;
      const identity = JSON.stringify([pool, row.Code ?? row.ModFamilyList, row.Level, row.ModGenerationTypeID, row.spawn_no, row.DropChance]);
      if (rows.has(identity)) { rows.delete(identity); duplicates.add(identity); }
      else if (!duplicates.has(identity)) rows.set(identity, row);
    }
  }
  return rows;
}
function modTemplate(html) {
  let output = '', at = 0;
  const values = [];
  for (const match of html.matchAll(/<span\b[^>]*class=['"]mod-value['"][^>]*>/g)) {
    if (match.index < at) continue;
    const tags = /<\/?span\b[^>]*>/g; tags.lastIndex = match.index;
    let depth = 0, end = -1;
    for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (!depth) { end = tags.lastIndex; break; }
    }
    if (end < 0) throw new Error('Incomplete modifier value span');
    output += html.slice(at, match.index) + `{${values.length}}`;
    values.push(plain(html.slice(match.index, end)));
    at = end;
  }
  return { text: plain(output + html.slice(at)), values };
}
function links(html) {
  const result = new Map();
  for (const match of html.matchAll(/<a\b([^>]*\bhref="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!/\bdata-hover=/.test(match[1]) || /class="currencyitem"/.test(match[1])) continue;
    const path = decode(match[2]).replace(/^\/(?:us|jp|tw)\//, '');
    if (!/^[A-Za-z][A-Za-z0-9_'.()%,-]*$/.test(path)) continue;
    const name = decode(match[3].replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')).split('\n')[0].trim();
    if (!name || name.length > 120 || /[{}#]/.test(name)) continue;
    const names = result.get(path) ?? new Set(); names.add(name); result.set(path, names);
  }
  return result;
}
await mkdir(cache, { recursive: true });
const sources = [];
const entries = new Map();
const ambiguous = new Set();
const modifiers = new Map();
const ambiguousModifiers = new Set();
for (const page of pages) {
  const documents = {};
  const mods = {};
  for (const language of locales) {
    const file = `${cache}/${language}-${page}.html`;
    let html;
    if (fetchPages) {
      const response = await fetch(`https://poe2db.tw/${language}/${page}`, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`${language}/${page}: HTTP ${response.status}`);
      html = await response.text();
      await writeFile(file, html);
    } else html = await readFile(file, 'utf8');
    documents[language] = links(html);
    mods[language] = modData(html);
  }
  for (const [code, englishMod] of mods.us) {
    const japaneseMod = mods.jp.get(code);
    if (!japaneseMod) continue;
    const english = modTemplate(englishMod.str), japanese = modTemplate(japaneseMod.str);
    if (!english.values.length || english.values.length !== japanese.values.length || english.text.length > 500 || japanese.text.length > 500) continue;
    // Require the same printed numeric ranges on the same native Mod ID, in the same order.
    // Cross-language reordering or changed ranges is left unverified instead of guessed.
    if (JSON.stringify(english.values) !== JSON.stringify(japanese.values)) continue;
    if (ambiguousModifiers.has(english.text)) continue;
    const existing = modifiers.get(english.text);
    if (existing && existing.japanese !== japanese.text) {
      modifiers.delete(english.text); ambiguousModifiers.add(english.text); continue;
    }
    modifiers.set(english.text, { japanese: japanese.text, identity: JSON.parse(code), url: `https://poe2db.tw/jp/${page}` });
  }
  let added = 0;
  for (const [id, englishNames] of documents.us) {
    const japaneseNames = [...(documents.jp.get(id) ?? [])].filter((name) => /[\u3040-\u30ff\u3400-\u9fff]/u.test(name));
    // Only a unique name on the same entity URL in both languages is evidence.
    if (englishNames.size !== 1 || japaneseNames.length !== 1) continue;
    const english = [...englishNames][0], japanese = japaneseNames[0];
    const chinese = [...(documents.tw.get(id) ?? [])];
    if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(english)) continue;
    const existing = entries.get(english);
    if (ambiguous.has(english)) continue;
    if (existing && existing.japanese !== japanese) {
      entries.delete(english); ambiguous.add(english); continue;
    }
    entries.set(english, { japanese, aliases: [...new Set([...(existing?.aliases ?? []), ...chinese])], url: `https://poe2db.tw/jp/${id}` });
    added++;
  }
  sources.push({ english: `https://poe2db.tw/us/${page}`, japanese: `https://poe2db.tw/jp/${page}`, chinese: `https://poe2db.tw/tw/${page}` });
  console.log(`${page}: ${added} uniquely paired names`);
}
await writeFile('src/workbench/data/ui/poe2db-ja.json', JSON.stringify({
  checkedAt: '2026-10-25',
  method: 'Names paired by identical PoE2DB entity URL. Modifiers require unique matching pool, native Code or ModFamilyList, level, affix side, spawn tags, weight, and printed numeric ranges. Chinese aliases are display-only. No inferred translations or mechanics.',
  sources, excludedAmbiguousNames: [...ambiguous].sort(), names: Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b, 'en'))),
  modifiers: Object.fromEntries([...modifiers].sort(([a], [b]) => a.localeCompare(b, 'en'))),
}, null, 2) + '\n');
console.log(`Saved ${entries.size} verified names and ${modifiers.size} modifier templates.`);
