// One-time source migration. Translate render boundaries, never stored values or game input.
import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { jsxText } from './collect-ui-messages.mjs';

let changed = 0;
for (const name of await readdir('src/workbench')) {
  if (!name.endsWith('.tsx') || /\.test\.|^LanguageSelect/.test(name)) continue;
  const path = `src/workbench/${name}`;
  const source = await readFile(path, 'utf8');
  if (source.includes("import { uiText } from './uiLocale'")) continue;
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const replace = (start, end, value) => edits.push({ start, end, value });
  const rawElement = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isJsxElement(p) && ['pre', 'code', 'textarea'].includes(p.openingElement.tagName.getText(ast))) return true;
    }
    return false;
  };
  const hasJsx = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
    return ts.forEachChild(node, hasJsx) ?? false;
  };
  const displayAttributes = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label', 'emptyLabel']);
  function visit(node) {
    if (rawElement(node)) return;
    if (ts.isJsxText(node) && /[\u3400-\u9fff]/.test(node.text)) {
      replace(node.getFullStart(), node.end, `{uiText(${JSON.stringify(jsxText(node.text))})}`);
      return;
    }
    if (ts.isJsxAttribute(node) && displayAttributes.has(node.name.getText(ast)) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init) && /[\u3400-\u9fff]/.test(init.text)) {
        replace(init.getStart(ast), init.end, `{uiText(${JSON.stringify(init.text)})}`);
      } else if (ts.isJsxExpression(init) && init.expression) {
        const expression = init.expression;
        replace(expression.getStart(ast), expression.getStart(ast), 'uiText(');
        replace(expression.end, expression.end, ')');
      }
      return;
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent) && !ts.isJsxSpreadAttribute(node.parent)) {
      const expression = node.expression;
      if (!hasJsx(expression) && !/\b(?:raw|rawText|normalizedText|diagnostic|originalText)\b/.test(expression.getText(ast))) {
        replace(expression.getStart(ast), expression.getStart(ast), 'uiText(');
        replace(expression.end, expression.end, ')');
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let output = source;
  for (const edit of edits) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  output = "import { uiText } from './uiLocale';\n" + output;
  await writeFile(path, output);
  changed++;
}
console.log(`Localized render boundaries in ${changed} components.`);
