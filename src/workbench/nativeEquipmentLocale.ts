import equipmentIndex from './data/equipment-index.json';
import displayIndex from './data/equipment-display.json';

interface Matcher { string: string; negate?: boolean }
interface Rule { pattern: RegExp; english: string }
const index = equipmentIndex as unknown as { simplify: Readonly<Record<string, string>>; stats: { matchers: Matcher[] }[] };
const characters = index.simplify;
const normalize = (value: string) => [...value].map((char) => characters[char] ?? char).join('')
  .toLowerCase().replace(/\s|\u00a0/g, '').replace(/：/g, ':').replace(/，/g, ',').replace(/（/g, '(').replace(/）/g, ')');
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const number = '[+-]?(?:#|\\d[\\d,]*(?:\\.\\d+)?)(?:[–—-]\\d+(?:\\.\\d+)?)?';
const skeleton = (value: string) => normalize(value).replace(new RegExp(number, 'g'), '#');
const count = (value: string) => value.match(/#/g)?.length ?? 0;
const rules = new Map<string, Rule[]>();

function addPair(chinese: Matcher, english: Matcher) {
  if (Boolean(chinese.negate) !== Boolean(english.negate) || count(chinese.string) !== count(english.string)) return;
  const key = skeleton(chinese.string), entries = rules.get(key) ?? [];
  entries.push({ pattern: new RegExp('^' + normalize(chinese.string).split('#').map(escape).join('(' + number + ')') + '$'),
    english: english.string.trim() });
  rules.set(key, entries);
}

// Use the full pinned item vocabulary, not only the smaller crafting-engine stat list.
for (const stat of index.stats) {
  const english = stat.matchers.filter((matcher) => !/[\u3400-\u9fff]/.test(matcher.string));
  const chinese = stat.matchers.filter((matcher) => /[\u3400-\u9fff]/.test(matcher.string));
  chinese.forEach((local, index) => {
    const paired = english.length === chinese.length ? [english[index]!] : english;
    paired.forEach((native) => addPair(local, native));
  });
}
for (const stat of displayIndex.stats) {
  for (const local of stat.chinese as Matcher[]) for (const native of stat.english as Matcher[]) addPair(local, native);
}

/** Display-only recovery. Ambiguous mappings stay unchanged; IDs and query values never pass here. */
export function nativeEquipmentModifier(value: string): string | undefined {
  const matches = new Set<string>();
  for (const rule of rules.get(skeleton(value)) ?? []) {
    const match = rule.pattern.exec(normalize(value));
    if (!match) continue;
    let position = 1;
    matches.add(rule.english.replace(/#/g, () => match[position++]!).replace(/\+\+/g, '+').replace(/\+-/g, '-'));
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}
