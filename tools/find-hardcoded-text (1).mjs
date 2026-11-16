// Finds visible text that is typed directly inside screens instead of coming from t("key").
// One-time setup:  npm install -D @babel/parser
// Run:             node tools/find-hardcoded-text.mjs
// Costs nothing. It prints a list: file, line and the text. "0 found" means all text goes through t().
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const ROOT = path.resolve('src');
const SKIP_DIRS = new Set(['i18n', 'node_modules']);
const ALLOWED = new Set(['Hospivo', 'HOSPIVO', 'UPI', 'GST', 'GSTIN', 'PIN', 'WhatsApp', 'HSN', 'A4', 'OK',
  // language names must stay exactly as written, in every language
  'English', 'Hindi (English letters)', 'हिन्दी']);
const VISIBLE_PROPS = new Set(['placeholder', 'title', 'alt', 'aria-label', 'label', 'hint', 'helper', 'helperText',
  'subtitle', 'description', 'message', 'text', 'heading', 'caption', 'tooltip', 'confirmLabel', 'cancelLabel']);
const COMPARE_OPS = new Set(['==', '===', '!=', '!==']);
const T_NAMES = new Set(['t', 'tr', 'translate']);

const hasLetters = (s) => /\p{L}{2,}/u.test(s);
const looksVisible = (s) => hasLetters(s) && (/\s/.test(s.trim()) || /^\p{Lu}/u.test(s.trim()) || /[^\x00-\x7F]/.test(s));

function listFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) listFiles(path.join(dir, e.name), out); }
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.(tsx|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(path.join(dir, e.name));
  }
  return out;
}

const found = [];
let currentFile = '';
function report(node, kind, text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (!t || ALLOWED.has(t)) return;
  found.push({ file: path.relative(process.cwd(), currentFile), line: node.loc.start.line, kind, text: t });
}

const isJsx = (n) => n && (n.type === 'JSXElement' || n.type === 'JSXFragment');
const isT = (n) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && T_NAMES.has(n.callee.name);
const propName = (key) => (key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : '');

// strings inside {...} that end up on screen; nested JSX is visited separately
function scanExpr(node, parent, kind) {
  if (!node || typeof node.type !== 'string') return;
  if (isJsx(node) || isT(node)) return;
  if (node.type === 'StringLiteral' || (node.type === 'TemplateLiteral' && node.expressions.length === 0)) {
    const val = node.type === 'StringLiteral' ? node.value : node.quasis[0].value.cooked;
    const inCompare = parent && parent.type === 'BinaryExpression' && COMPARE_OPS.has(parent.operator);
    const inIndex = parent && parent.type === 'MemberExpression' && parent.computed;
    if (!inCompare && !inIndex && looksVisible(val)) report(node, kind, val);
    return;
  }
  if (node.type === 'TemplateLiteral' && node.quasis[0] && looksVisible(node.quasis[0].value.cooked || '')) {
    report(node, kind, node.quasis[0].value.cooked + '...');
  }
  for (const key of Object.keys(node)) {
    if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && scanExpr(c, node, kind));
    else if (v && typeof v.type === 'string') scanExpr(v, node, kind);
  }
}

function visit(node, parent) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'JSXText') {
    if (hasLetters(node.value)) report(node, 'text on screen', node.value);
  } else if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && VISIBLE_PROPS.has(node.name.name)) {
    const v = node.value;
    if (v && v.type === 'StringLiteral' && hasLetters(v.value)) report(v, `attribute ${node.name.name}`, v.value);
    else if (v && v.type === 'JSXExpressionContainer') scanExpr(v.expression, v, `attribute ${node.name.name}`);
  } else if (node.type === 'JSXExpressionContainer' && parent && isJsx(parent)) {
    scanExpr(node.expression, node, 'text on screen');
  } else if ((node.type === 'ObjectProperty') && VISIBLE_PROPS.has(propName(node.key))) {
    const v = node.value;
    if (v && (v.type === 'StringLiteral') && looksVisible(v.value)) report(v, `list item ${propName(node.key)}`, v.value);
  }
  for (const key of Object.keys(node)) {
    if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, node));
    else if (v && typeof v.type === 'string') visit(v, node);
  }
}

for (const file of listFiles(ROOT)) {
  currentFile = file;
  let ast;
  try { ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'typescript'] }); }
  catch (e) { console.log(`Could not read ${file}: ${e.message}`); continue; }
  visit(ast.program, null);
}

if (!found.length) { console.log('0 found. All visible text goes through t().'); process.exit(0); }
const byFile = new Map();
for (const f of found) { if (!byFile.has(f.file)) byFile.set(f.file, []); byFile.get(f.file).push(f); }
for (const [file, items] of byFile) {
  console.log(`\n${file}  (${items.length})`);
  for (const i of items) console.log(`  line ${i.line} [${i.kind}] ${i.text.length > 90 ? i.text.slice(0, 90) + '...' : i.text}`);
}
console.log(`\nTOTAL: ${found.length} text(s) in ${byFile.size} file(s) still typed directly in code.`);
process.exit(1);
