import ts from 'typescript';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve('src/workbench');
const messages = new Set();
const chinese = /[\u3400-\u9fff]/;
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (s) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" })[s]);
export function jsxText(text) {
  return decode(text.split(/\r?\n/).map((line, i, lines) => {
    let value = line.replace(/\t/g, ' ');
    if (i) value = value.trimStart();
    if (i < lines.length - 1) value = value.trimEnd();
    return value;
  }).filter(Boolean).join(' '));
}
for (const file of await readdir(root)) {
  if (!/\.tsx?$/.test(file) || /\.test\.|\.worker\.|^uiMessages|^uiLocale|^LanguageSelect/.test(file)) continue;
  const source = await readFile(join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      const value = (ts.isJsxText(node) ? jsxText(node.text) : node.text).trim();
      if (chinese.test(value) && !value.startsWith('http') && !value.startsWith('#')) messages.add(value);
    }
    if (ts.isTemplateExpression(node)) {
      const template = node.head.text + node.templateSpans.map((part, i) => `{${i}}${part.literal.text}`).join('');
      if (chinese.test(template)) messages.add(template.trim());
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
await mkdir('artifacts/i18n', { recursive: true });
await writeFile('artifacts/i18n/messages.json', JSON.stringify([...messages].sort(), null, 2));
console.log(`Collected ${messages.size} interface messages.`);
