// Offline only: compile the reviewed Chinese / English / Japanese copy into runtime catalogs.
import { readFile, writeFile } from 'node:fs/promises';
const rows = (await readFile('src/workbench/data/ui/copy.tsv', 'utf8')).trim().split(/\r?\n/).map((line) => line.split('\t'));
for (const [language, column] of [['en', 1], ['ja', 2]]) {
  const path = `src/workbench/data/ui/${language}.json`;
  const catalog = JSON.parse(await readFile(path, 'utf8'));
  for (const row of rows) {
    if (row.length !== 3 || !row[column]) throw new Error(`Invalid translation row: ${row[0]}`);
    catalog[row[0]] = row[column];
  }
  await writeFile(path, JSON.stringify(Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))), null, 2) + '\n');
  console.log(`${language}: ${Object.keys(catalog).length} reviewed entries`);
}
