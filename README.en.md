# PoE2 Build Atlas · Skill-driven Equipment Workbench

[简体中文](README.md) · **English** · [日本語](README.ja.md)

[![CI](https://github.com/shihongyue2022/PoE2-Build-Atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/shihongyue2022/PoE2-Build-Atlas/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)

An integrated workbench for the international version of Path of Exile 2. It connects PoB2 character and skill-setup analysis, modifier references, official trade, equipment comparison, and crafting. The workbench organizes native damage calculations so modifier and whole-item contributions lead directly into searches and replacement decisions.

**Import character and skill setup → Calculate modifier and item contributions → Select stats to preserve → Generate official searches → Compare the resulting loadout → Continue through buying or crafting.**

Official trade accepts already-defined conditions. This workbench connects the character and contribution analysis before that search with the candidate comparison after it. Damage calculations use PoB2, listing searches use official trade, and crafting uses the upstream engine. The development work integrates their data, calculation calls, results, and actions.

The interface supports Simplified Chinese, English, and Japanese. Item-text import accepts English, Traditional Chinese, and Simplified Chinese. Reference matching and trade filters use native English names and official stat IDs. Press **Alt + E** in-game for a quick price check.

## Interface language

Choose **简体中文 / English / 日本語** at the top right. Local and hosted editions use offline language catalogs.

Links can specify `?lang=en`, `?lang=ja`, or `?lang=zh-CN`. The URL parameter takes priority over the preference saved in this browser. Switching is immediate and preserves equipment, drafts, crafting calculations, and ledgers.

Japanese clipboard item text is not supported yet; characters from the Japanese client can still be imported through PoB2 XML or share codes. Verified Japanese game terminology is preferred; otherwise native English is retained. Original source documents, raw diagnostics, and some older detailed notes keep their original language.

Copy is maintained in `src/workbench/data/ui/copy.tsv`. Run `npm.cmd run i18n:build` to compile the English and Japanese JSON catalogs. Display translation does not modify parser results, trade IDs, Worker requests, raw item text, or ledger amounts, and does not send user data to a translation service.

Equipment labels recover canonical English through the full equipment vocabulary before matching verified Japanese text. File controls follow the application language, while filenames and raw equipment text stay unchanged. The language regression covers expanded help, XML import, equipment searches, and unchanged query links. Run `npm.cmd run test:workbench:languages`; `WORKBENCH_URL` can target a preview or hosted build.

Japanese names and modifiers are checked against [PoE2DB Japanese references](https://poe2db.tw/jp/), using matching entity URLs and modifier identities. See [terminology sources and matching rules](src/workbench/data/ui/SOURCES.md).

**[Open the browser edition](https://shihongyue2022.github.io/apps/poe2-companion/?lang=en)** to import PoB2 XML/share codes, define skills, compare equipment, build official searches, and calculate crafting routes. Native PoB2 contribution recalculation, automatic file access, desktop shortcuts, logs, background listings, and trade synchronization require the local edition. Browser and local records do not sync automatically.

## Start locally

Requires Windows and Node.js **20.19+ or 22.12+**. Importing a game character also requires Path of Building for PoE2. Official trade-history synchronization optionally uses the included Chrome/Edge extension.

```powershell
git clone https://github.com/shihongyue2022/PoE2-Build-Atlas.git
cd PoE2-Build-Atlas
npm.cmd ci
.\start-workbench.cmd
```

After installing Node.js, you can also double-click `start-workbench.cmd`. It installs dependencies on first launch and opens the local page and shortcut helper. The default address is <http://127.0.0.1:5173/?companion=1&lang=en>.

- `start-workbench.cmd`: starts the page and shortcut helper; services continue after the launcher window closes.
- `start-hotkeys.cmd`: starts the shortcut helper and ensures the workbench is running.
- `stop-workbench.cmd`: stops this project's background services; exit the shortcut helper from its tray icon.

## Everyday equipment workflow

### 1. Import the current character

From Character equipment, open PoB2 and use **Import/Export Build**. Authorize on the official site, import the character's passives, jewels, equipment, and skills, then press **Ctrl + S**. Return to the workbench, choose the action to reread after saving, preview changes, and confirm the import. Share codes and XML files are also supported.

After changing gear in-game, reimport the character in PoB2, save, and reread. When removing equipment, flasks, or charms, enable **Delete equipment** in PoB2 so empty slots overwrite previous items. Saving an old file alone does not fetch the latest game state.

The workbench checks the source file's save time and shows before/after differences. Weapon sets I and II are separate: only the active main-hand/off-hand pair and shared equipment contribute to its totals. Missing baselines stay unknown rather than borrowing another set's stats.

### 2. Define the skills actually used

In the skill-setup panel, press **＋**, then drag skills from the library into the routine. Drag to reorder or remove them; on mobile, tap to add and use arrows to reorder. Click a skill icon to inspect its supports, interactions, modifiers, and item locations.

**The actual skill setup, equipment-search focus, and main skill saved in PoB are recorded separately.** Inspecting a skill does not change the loadout or search focus. Choose the explicit search-focus action when researching gear for that skill.

Saved single-skill damage appears under **Sources & validation → Original PoB snapshot & equipment**, together with actions to load missing skill data or XML.

Starting with defaults applies the following rules, while preserving an already-defined nonempty routine:

| Rule | Default |
| --- | --- |
| Encounter | Sustained boss damage; scenarios and interaction uptime are recorded for later validation |
| Skills and supports | Preserve imported supports; when the required skills exist, offer Twister as damage focus, Explosive Spear for ground interaction, and Whirling Slash as the whirlwind source |
| Replacement scope | Consider two-item swaps; check all four resistances on the final loadout |
| Purchase budget | Unrestricted initially, with selectable limits; total purchase cost does not subtract unsold gear |
| Unique protection | Preserve equipped uniques and recognized mechanics while allowing better rolls of the same item; unlock a slot before replacing its identity |

Other builds can define their own routine. The three-skill preset is offered only when those skills exist in the imported data.

### 3. Analyze modifier and equipment contributions

Inspect skill tags, support conditions, conversions, and interaction requirements. The modifier guide lists searchable attributes, legal slots, and verified affix types and tiers with reference links. Choose a modifier, slot, and tier to open equipment search. Support effects, levels, conditional modifiers, and conversions cannot simply be multiplied; area or projectile speed is not automatically treated as damage.

In the **local edition**, open the damage-modifier ranking under the skill setup. Select an output within the routine and calculate contributions. The workbench calls the native **PoB2 v0.23.1** engine with the current loadout, passives, supports, and saved configuration. It removes one item modifier at a time, recalculates, and ranks the resulting DPS loss.

Rows show the remaining DPS, absolute loss, and relative loss. Select modifiers to preserve and open searches for their item slots:

- Selected modifiers on the same slot must all match; different slots are searched separately.
- Use current-value floors, +3% / +5%, or presence-only conditions.
- Uniques retain the same-name requirement. Unmapped modifiers do not silently become filters.
- The equipment icon locates the source item.

The analysis selector follows the chosen routine, including active buffs such as **Barrage**. Select Barrage, then a compatible repeatable bow or projectile-spear output, such as Twister. This analyzes the output under that linked setup, not standalone Barrage DPS. Removed active buffs are excluded, while saved persistent buffs remain. Repeats, Frenzy Charges, and cooldowns use PoB's configuration; the workbench does not infer a complete combat rotation. Calculation is disabled with an explanation when no compatible output exists.

Results are grouped by equipment. The outer ranking independently removes all modifiers on an item together, keeping its base, quality, and socket count; the inner ranking removes modifiers individually. Whole-item contribution is not the sum of individual contributions sharing multipliers or conditions. Groups can collapse or select all searchable rows. Zero/negative and pending effects stay with their source item; partially resolved totals are marked as partial.

Passive-tree jewels support individual and joint searches too. The current tree specification and socket identify the source jewel. Searches preserve its verified English base and use the modifier's own value, not its accumulated damage contribution. Different jewels are queried separately. Missing source or official mapping disables the filter with an explanation.

The first calculation stores an XML snapshot containing calculation data only. An unchanged local source can be reread automatically. After changing equipment, update PoB, save, and reimport first. Effects that cannot be parsed, isolated, or removed without disabling the selected skill remain pending rather than counting as zero. Loss percentages do not add up to 100%, and outputs are calculated separately. This requires Windows, the local edition, and installed PoB2; the online edition does not substitute heuristic scores for native contributions.

### 4. Search around core attributes

Both finding an upgrade and pricing an equipped item open the joint core-stat search:

- Select one attribute per row and require at least the current value, an exact match, or a relative improvement. All selected conditions must hold together.
- Add item-level requirements. Belts offer common verified pool attributes, available T3/T2/T1 presets, required levels, and charm-slot counts.
- Press **↓** to select one attribute for descending inspection. Other requirements stay active.
- Search upgrade candidates by ascending price within the existing thresholds and budget, then check each listing's values, price, and resistance gaps.

Prices refer to individual listings with comparable core attributes. Different rolls are not mixed into a generic cheap-item average, and currencies are not combined at unknown exchange rates. Listing prices are not completed-sale prices.

### 5. Compare the loadout before adopting a plan

Comparing a candidate returns it to the matching character slot and adds its item and public quote to the candidate pool. Continue with another slot to compare one- or two-item plans against total purchase cost and final resistances.

**Resistance constraints apply to the whole loadout.** Fire, cold, lightning, and chaos are separate; all elemental resistance excludes chaos. Overcapped resistance adds no damage-direction score. A single item that loses resistance may remain a candidate for a compensating pair; single-item-only mode holds other slots fixed.

Unknown stats, missing prices, mismatched currencies, or quotes older than a day need review. They are not treated as free or already valid. Equipment, weapon-set, or baseline changes invalidate the old pool.

Adopting a plan rechecks the constraints and updates the workbench records together. It does not trade for you, alter game equipment, or write back to PoB2. Recalculate the resulting setup in PoB2 and verify against the game.

## Other connected tools

| Tool | Purpose and scope |
| --- | --- |
| Skill and equipment breakdown | Inspect imported skills, supports, readable snapshots, and equipment contributions, keeping source snapshots distinct from recalculated results |
| Quick price checks | In-game Alt + E; equipment uses core-stat search, while maps, gems, currency, and materials use their own types |
| Crafting | Finished reference → base and pool research → target stats and tiers → actual base import → currency/omen routes → observed-result checks; cost and execution support rings and amulets |
| Trade tracking | Readable official history, whisper leads, CSV import/export, currency-separated cash flow, and separate held-asset valuation changes |

### Official trade-history bridge

Load the included Chrome/Edge extension first. In Trade tracker, open official-history synchronization and its extension installation entry. Follow the [bridge installation guide (Chinese)](browser-extension/official-history/README.md), reload the workbench and official history page, sign in normally, and synchronize.

Only recent transactions actually returned by the official site are covered. Each sync shows its time range, directions, and deduplication. **Purchase coverage and retrievable history length have not been verified for the user's account; complete history is not guaranteed.** Missing purchases do not establish zero expenses, and income without confirmed expenses is not net profit. Whispers are offers until actual delivery is confirmed; cross-source duplicates still need review.

### From a finished target to an actual crafting base

Crafting projects are saved separately from character loadouts. Start with a reference item, adjust the goals, acquire a base, paste its actual text, and check it before calculating a route. The solver uses its real level, rarity, held modifiers, and fractured locks rather than an assumed empty base. Draft base text is saved, but must be checked again after refresh. Changes to the base, targets, or mechanics invalidate old results.

A local Worker compares currencies, omens, and random branches. Expected material cost excludes the base purchase price; tier goals do not guarantee a particular roll. A checked base can continue into step-by-step result verification.

The target table can generate an official purchase query using all selected modifiers together: matching base, required level, uncorrupted and unmirrored state, and ascending price. Floors use the selected tier's original lower bound; damage ranges use the official average. Random rare names are not required. Disable secondary goals to find a partial base, or search only the base. Base-only search includes normal, magic, and rare non-uniques with optional rarity restrictions. Changing targets updates the link; unverified mappings block joint searches rather than silently omitting requirements. Verify actual tiers, quality scaling, and open slots after purchase.

Target rows select prefix/suffix, attribute family, modifier, and tier. Categories include flat damage, increased damage, speed, critical stats, resistances, life, mana, and defences, with normal, essence, perfect essence, alloy, desecrated, and rune sources grouped inside menus. Only the actual base pool supplies candidates. Rows can be disabled or deleted; edits are saved without modifying the original reference. Blank or conflicting rows are not skipped silently.

Preparation steps use numbered official material icons connected by arrows. Select materials and enter quantities, then review step subtotals and material budgets. Prices prefer local league records; missing prices can be entered manually. Unselected materials are excluded; incomplete rows show only the priced portion. These budgets are stored by reference and league and remain separate from the solver's random expected cost and the base purchase price.

Tier details show ranges, required levels, and item-level ceilings, with affix-slot, group-conflict, essence, and alloy checks. Quality, fractured state, and desecrated history remain separate from original modifier tiers. Breach Ring research includes consulted community examples, game references, and quality preparation; normal and refined bases are handled separately. Other equipment supports research only when its native English base uniquely matches a local pool, without currency costs or execution routes. See [crafting research and Breach Ring example (Chinese)](docs/CRAFTING_RESEARCH.md).

Advanced-copy headers such as Crafted and Unscalable Value are supported. Actual rolls and their true sources are retained for crafted-modifier limits. For example, a 29% magnitude increase for variable resistance modifiers is recognized against the corresponding alloy's 20–30% prefix; that annotation is not mistaken for a prohibition on modifying the entire item. Unknown modifiers still need review.

## Data and capability boundaries

| Area | Current behavior |
| --- | --- |
| Character source | Reads saved PoB2 data, not game memory; refresh and save the character after in-game changes |
| Weapon sets and baselines | Checks each active set independently; complete set-specific passives, Spirit reservation, persistent buffs, and final replacement damage are not automatically reconstructed |
| Paired replacements | Enumerates one- and two-item plans from up to 24 collected candidates, not a market-wide global optimum |
| Modifier and crafting data | Uses repository rule/reference snapshots; new patches are not automatically guaranteed compatible, and unknown effects are not zero benefit |
| Local records | Loadouts, candidates, quotes, and ledgers mainly live in this browser; clearing site data or changing browsers does not migrate them automatically—export supported backups regularly |

Official-site login stays on the official site. The bridge does not read or store cookies or passwords. Local PoB2 files, character saves, logs, credentials, dependencies, and build outputs are not distributed in the repository.

## Development and checks

```powershell
npm.cmd run dev
npm.cmd run type-check
npm.cmd run test:workbench
npm.cmd run build
```

With the local workbench running, isolated browser workflows can be exercised with:

```powershell
node scripts/workbench-skill-recommendation-regression.mjs
node scripts/workbench-default-workflow-regression.mjs
node scripts/workbench-craft-blueprint-regression.mjs
```

These cover skills and modifier-search actions, quoted candidates and paired swaps, and crafting goals and actual-base checks. See [workflow checks (Chinese)](docs/WORKFLOW.md#验证).

The development server and `npm.cmd run preview` provide local APIs. Serving `dist` alone cannot provide local PoB2, log access, or background price checks.

For static hosting, build with `VITE_WORKBENCH_HOSTED=1` and a mount path such as `VITE_WORKBENCH_BASE=/apps/poe2-companion/`. This mode does not probe the visitor's computer and delegates listing searches to generated official links. It is the actual application, not the portfolio illustration. Leave these variables unset for local builds.

- [Daily workflow (Chinese)](docs/WORKFLOW.md): step-by-step operations and data sources.
- [WORKBENCH.md (Chinese)](WORKBENCH.md): features, runtime, and implementation.
- [TODO.md](TODO.md): unfinished capabilities.
- [Issues](https://github.com/shihongyue2022/PoE2-Build-Atlas/issues): problems and suggestions.

## Sources and license

Built on [Dboire9/POE2_HTC](https://github.com/Dboire9/POE2_HTC), retaining its crafting engine, related code, attribution, and provenance records while extending character equipment, skill references, trade search, desktop shortcuts, and transaction workflows. See [UPSTREAM.txt](UPSTREAM.txt) for the base revision and [README.upstream.md](README.upstream.md) for the original documentation.

Code continues under **[GNU AGPL-3.0](LICENSE)**. Game names and item/skill artwork belong to Grinding Gear Games and their respective owners; their rights are separate from the code license. This is an unofficial community tool.
