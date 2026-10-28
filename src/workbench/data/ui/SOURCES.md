# Japanese terminology verification

## Equipment display supplement (2026-10-28)

`equipment-ja.json` adds Morior Invictus / Grand Regalia names and the per-filled-socket
critical damage reduction template from [Morior Invictus](https://poe2db.tw/jp/Morior_Invictus).
The Bonded label (絆) and flat Armour wording come from
[Bonded Modifiers](https://poe2db.tw/jp/Bonded_Modifiers). Each entry retains its URL.
These entries translate display text only; they do not clamp imported rolls to the reference
ranges, alter trade IDs, or infer socket counts.

Chinese equipment labels recover their canonical English using the full pinned
`equipment-index.json` and `equipment-display.json` bilingual matchers, including matching
increased/reduced variants. Only unique text correspondences are displayed. Verified Japanese
wording is preferred; otherwise the native English wording is retained.

## General vocabulary snapshot (2026-10-25)

Checked on 2026-10-25 against PoE2DB's English (`/us/`), Japanese (`/jp/`),
and Traditional Chinese (`/tw/`) pages. The site serves as the reference for game
names and terminology; it is not an external translation service.

`poe2db-ja.json` stores 2,701 name pairs and 121 modifier templates. Each entry retains
its source URL. Names require a unique correspondence on the same entity URL.
Modifiers require a unique match of source pool, native Code or ModFamilyList,
required level, prefix/suffix side, spawn tags, weight, and printed numeric ranges.
Duplicate or conflicting correspondences are excluded. These snapshots provide
display text, never crafting rules, market filters, or confirmation that the game
patch matches the engine snapshot.

- [Currencies](https://poe2db.tw/jp/Currency): 高貴なオーブ, カオスオーブ,
  and the suffixes `(上級)` / `(完全)`.
- [Omens](https://poe2db.tw/jp/Omen): お告げ; 削減のお告げ for Omen of Whittling.
- [Rings](https://poe2db.tw/jp/Rings) and [amulets](https://poe2db.tw/jp/Amulets):
  base names, unique names, and modifier wording such as 最大ライフ and 火耐性.
- [Skills](https://poe2db.tw/jp/Skill_Gems) and [supports](https://poe2db.tw/jp/Support_Gems):
  ツイスター, ワーリングスラッシュ, エクスプローシブスピア, バラージ.
- [Essences](https://poe2db.tw/jp/Essence) and [modifiers](https://poe2db.tw/jp/Modifiers):
  source names and the game's モッド terminology.

Refresh from the repository root:

```powershell
node tools/refresh/japanese_vocabulary.mjs --fetch
```

Without `--fetch`, the script rebuilds from the cached reference pages in the ignored
`artifacts/i18n/references` directory. Downloaded JavaScript is never executed;
the embedded modifier payload is parsed only as inert JSON. The application ships
the resulting local data and does not contact these pages to translate user data.

English uses native names from the existing equipment/PoB index. Japanese display
prefers the verified reference names; unknown or ambiguous terms retain native English.
The Chinese-to-English parser and official trade IDs remain independent of display
language. Japanese clipboard parsing is not implied by these display mappings.

PoE2DB content is maintained by its respective contributors. Game item names, skill
names, and game text remain the property of Grinding Gear Games and their rights holders.
