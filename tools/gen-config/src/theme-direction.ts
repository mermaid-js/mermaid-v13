/**
 * The theme direction check (D331, spec #414): dependencies between themes and diagrams run one
 * way.
 *
 * 1. Core and the theme specs never name a diagram's own variable: no string literal in the
 *    runtime import graph of `@mermaid-js/core` or `mermaid` holds one as a word, and no
 *    identifier there is one as a property name (`values: { pie1: … }`), a shorthand property
 *    (`{ pie1 }`) or a property access (`t.vars.pie1`). Comments may name them.
 * 2. A diagram never names a theme: no string literal in its runtime import graph is a theme
 *    name, and it never reads `theme.name`. The theme names that are also ordinary words
 *    (`default`, `base`, `dark`, `neutral`) count only where they are compared with an
 *    expression that mentions a theme (`config.theme === 'dark'`, `THEMES.has(theme)`).
 *    Indirection is out of its reach: `const n = config.theme; n === 'dark'` compares with a
 *    name that does not mention a theme, so it passes; review catches it.
 * 3. A diagram's table reads only the shared vocabulary, palette slots and its own variables (a
 *    `palette` variable's rule names a whole shared palette, D545), and writes only its own
 *    variables; its names are none of core's and none of another table's.
 * 4. A package's vocabulary (`src/theme/vocabulary.ts`, spec #414 T0b) and its plugin's table
 *    declare the same variables: the table's `vars` are the vocabulary without `usedBy`.
 *
 * A diagram's names are its vocabulary's and its table's `vars`. A table's `fallback` names a
 * family, not a theme, so rule 2 lets it be `'redux'` or `'neo'`.
 *
 * Files under `src/generated/` are left out of rule 2: they hold a package's generated config
 * defaults, whose `theme` key is the config's default, not a theme the diagram reads.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import {
  PALETTE_VARIABLES,
  parseColor,
  type DiagramThemeTable,
  type DiagramThemeVarDef,
} from '@mermaid-js/core/theme';
import { THEME_FAMILIES } from '../../../packages/core/src/theme/diagram.ts';
import { parseRule, ruleRefs, type Expr } from '../../../packages/core/src/theme/dsl.ts';
import { PALETTE_SLOT } from '../../../packages/core/src/theme/vocabulary.ts';

/** One source file of a runtime import graph: its absolute path and its text. */
export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

/** What the direction check reads: the tables, the shared names and the runtime files. */
export interface DirectionInput {
  /** Each diagram type's theme table. */
  readonly tables: Readonly<Record<string, DiagramThemeTable>>;
  /** Each diagram type's vocabulary (`src/theme/vocabulary.ts`), where it has one. */
  readonly vocabularies?: Readonly<Record<string, Readonly<Record<string, DiagramThemeVarDef>>>>;
  /** Core's vocabulary: the shared names. */
  readonly shared: ReadonlySet<string>;
  /** The theme names (`THEME_NAMES`). */
  readonly themes: readonly string[];
  /** Core's and the `mermaid` entry's runtime files, theme specs included. */
  readonly core: readonly SourceFile[];
  /** Each diagram type's runtime files. */
  readonly diagrams: Readonly<Record<string, readonly SourceFile[]>>;
}

/**
 * One broken rule: which (`core-names-diagram` rule 1; `diagram-names-theme` rule 2;
 * `table-name-collision`, `table-reads-foreign`, `table-writes-foreign` and
 * `table-slot-not-palette` (a `slot()` whose first argument names no palette, D474) rule 3;
 * `table-not-vocabulary` rule 4), where (a file, or a type and the part of its table) and the
 * name at fault.
 */
export interface Violation {
  readonly rule:
    | 'core-names-diagram'
    | 'diagram-names-theme'
    | 'table-name-collision'
    | 'table-reads-foreign'
    | 'table-writes-foreign'
    | 'table-slot-not-palette'
    | 'table-not-vocabulary';
  readonly where: string;
  readonly name: string;
}

/** Theme names that are also ordinary words, checked only in a comparison with a theme. */
const WORDS = new Set(['default', 'base', 'dark', 'neutral']);
/** The families a table's `fallback` may name (`ThemeFamily`). */
const FAMILIES: ReadonlySet<string> = new Set(THEME_FAMILIES);
/** The shared palettes, which only a `palette` variable's rule may name whole (D545). */
const PALETTES: ReadonlySet<string> = new Set(PALETTE_VARIABLES);

/**
 * A file's syntax nodes in tree order. Rules 1 and 2 each read a file twice, so each takes the
 * nodes once per file and hands them to both readers: parsing and walking the repository's 1,400
 * files is the check's time. Nothing keeps them past the file.
 */
function nodesOf(file: SourceFile): readonly ts.Node[] {
  const all: ts.Node[] = [];
  const walk = (node: ts.Node): void => {
    all.push(node);
    ts.forEachChild(node, walk);
  };
  walk(ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true));
  return all;
}

function literals(nodes: readonly ts.Node[], visit: (node: ts.StringLiteralLike) => void): void {
  for (const node of nodes) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) visit(node);
    else if (ts.isTemplateExpression(node)) {
      visit(node.head as unknown as ts.StringLiteralLike);
      for (const span of node.templateSpans) visit(span.literal as unknown as ts.StringLiteralLike);
    }
  }
}

/** Every read of `<…theme>.name` in a file. */
function themeNameReads(nodes: readonly ts.Node[], visit: () => void): void {
  for (const node of nodes)
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'name' &&
      /theme$/i.test(node.expression.getText())
    )
      visit();
}

/**
 * Every identifier a file uses as a property name: an object literal's key (`{ pie1: … }`), a
 * shorthand property (`{ pie1 }`) and a property access (`t.vars.pie1`). Quoted keys are string
 * literals, which {@link literals} visits; comments are not part of the tree.
 */
function propertyNames(nodes: readonly ts.Node[], visit: (name: string) => void): void {
  for (const node of nodes) {
    if (
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      ts.isIdentifier(node.name)
    )
      visit(node.name.text);
    else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name))
      visit(node.name.text);
  }
}

/** Whether a literal is compared with, or looked up beside, an expression naming a theme. */
function comparedWithTheme(node: ts.Node): boolean {
  const mentions = (n: ts.Node | undefined) => n !== undefined && /theme/i.test(n.getText());
  const p = node.parent;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    const eq =
      k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      k === ts.SyntaxKind.EqualsEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsToken;
    return eq && mentions(p.left === node ? p.right : p.left);
  }
  if (ts.isCaseClause(p)) return mentions(p.parent.parent.expression);
  if (ts.isCallExpression(p)) return mentions(p.expression) || p.arguments.some(mentions);
  if (ts.isArrayLiteralExpression(p)) return comparedWithTheme(p) || mentions(p.parent);
  return false;
}

/** A property's name as written, without quotes. */
const propName = (p: ts.PropertyAssignment): string => p.name.getText().replace(/['"`]/g, '');

/**
 * Whether a literal names a family where a table may (D331): a `fallback: '<family>'` value,
 * through `as const`, `satisfies` or parentheses, or a quoted family key of `families`.
 */
function isFallback(node: ts.StringLiteralLike): boolean {
  if (!FAMILIES.has(node.text)) return false;
  let value: ts.Node = node;
  while (
    ts.isAsExpression(value.parent) ||
    ts.isSatisfiesExpression(value.parent) ||
    ts.isParenthesizedExpression(value.parent)
  )
    value = value.parent;
  const p = value.parent;
  if (ts.isPropertyAssignment(p) && p.initializer === value) return propName(p) === 'fallback';
  // `families: { 'redux': { … } }`: the key of an entry of the table's `families`.
  const owner = p.parent;
  return (
    ts.isPropertyAssignment(p) &&
    p.name === node &&
    ts.isObjectLiteralExpression(owner) &&
    ts.isPropertyAssignment(owner.parent) &&
    propName(owner.parent) === 'families'
  );
}

/** A variable's declaration as a table's `vars` holds it, for comparing with its vocabulary row. */
const declared = (d: { alias: string; kind: string; nested?: string } | undefined) =>
  d && JSON.stringify([d.alias, d.kind, d.nested ?? null]);

/**
 * A rule's reads (`ruleRefs`), with the palette a `slot(palette, n, fallback)` call names (D474)
 * in `palettes` instead (a table's own palette variable among its reads): the call reads that
 * palette's slot `n`, or its fallback. A `slot()` of anything else is in `badSlots`.
 */
function refs(e: Expr, out: TableReads, own: (name: string) => boolean): void {
  if (e.k === 'call' && e.fn === 'slot') {
    const [p, , fallback] = e.args;
    if (p?.k === 'ref' && PALETTES.has(p.name)) out.palettes.push(p.name);
    else if (p?.k === 'ref' && own(p.name)) out.reads.push(p.name);
    else out.badSlots.push(p?.k === 'ref' ? p.name : String(p?.k));
    if (fallback) refs(fallback, out, own);
    return;
  }
  if (e.k === 'call') for (const a of e.args) refs(a, out, own);
  else ruleRefs(e, (n) => parseColor(n) === undefined, out.reads);
}

interface TableReads {
  reads: string[];
  writes: string[];
  palettes: string[];
  /** What a `slot()` names in its palette's place when that is no palette. */
  badSlots: string[];
}

/**
 * What a table's rules read and its entries write. A `palette` variable's rule that names a shared
 * palette (D545) is in `palettes`, not `reads`: only such a rule, or a `slot()` call (D474), may
 * name a whole palette.
 */
function tableReads(table: DiagramThemeTable): TableReads {
  const out: TableReads = { reads: [], writes: [], palettes: [], badSlots: [] };
  const { writes, palettes } = out;
  // The table's own palette variables (D545) are palettes a `slot()` may name too.
  const ownPalette = (name: string) => table.vars[name]?.kind === 'palette';
  const rules = (r: Readonly<Record<string, string>> | undefined) => {
    for (const [name, rule] of Object.entries(r ?? {})) {
      writes.push(name);
      const whole = rule.trim();
      if (table.vars[name]?.kind === 'palette' && PALETTES.has(whole)) palettes.push(whole);
      else refs(parseRule(rule), out, ownPalette);
    }
  };
  const lits = (v: Readonly<Record<string, unknown>> | undefined) =>
    writes.push(...Object.keys(v ?? {}));
  rules(table.rules.light);
  rules(table.rules.dark);
  for (const f of Object.values(table.families ?? {}))
    for (const e of [f, f.dark]) {
      rules(e?.rules);
      lits(e?.values);
      lits(e?.tokens);
    }
  return out;
}

/**
 * The shared inputs (D332) no table reads: an input counts as read when a table's rule names it
 * or, for a palette, one of its slots (`seriesColorArray3`). The oracle specs leave the inputs
 * out of their v12 comparison, so an input nothing reads would be compared nowhere.
 */
export function unreadInputs(
  tables: Readonly<Record<string, DiagramThemeTable>>,
  inputs: readonly string[]
): string[] {
  const read = new Set<string>();
  for (const table of Object.values(tables)) {
    const { reads, palettes } = tableReads(table);
    for (const name of [...reads, ...palettes]) read.add(PALETTE_SLOT.exec(name)?.[1] ?? name);
  }
  return inputs.filter((name) => !read.has(name));
}

/** Every violation of the four direction rules (D331) in `input`; empty when they all hold. */
export function checkThemeDirection(input: DirectionInput): Violation[] {
  const out: Violation[] = [];
  const owner = new Map<string, string>();
  const own = (type: string, names: Iterable<string>, where: string) => {
    for (const name of names) {
      const other = owner.get(name);
      if (other === type) continue;
      if (input.shared.has(name) || other !== undefined)
        out.push({ rule: 'table-name-collision', where: `${type} ${where}`, name });
      owner.set(name, type);
    }
  };
  for (const [type, vocabulary] of Object.entries(input.vocabularies ?? {}))
    own(type, Object.keys(vocabulary), 'vocabulary');
  for (const [type, table] of Object.entries(input.tables))
    own(type, Object.keys(table.vars), 'vars');

  // 1. Core names no diagram variable: in a string literal, a property name or a property access.
  const named = (where: string, word: string) => {
    if (owner.has(word) && !input.shared.has(word))
      out.push({ rule: 'core-names-diagram', where, name: word });
  };
  for (const file of input.core) {
    const nodes = nodesOf(file);
    literals(nodes, (node) => {
      for (const word of node.text.split(/[^A-Za-z0-9_]+/)) named(file.path, word);
    });
    propertyNames(nodes, (word) => named(file.path, word));
  }

  // 2. Diagrams name no theme.
  const themes = new Set(input.themes);
  for (const [type, files] of Object.entries(input.diagrams))
    for (const file of files) {
      if (/[\\/]src[\\/]generated[\\/]/.test(file.path)) continue;
      const nodes = nodesOf(file);
      literals(nodes, (node) => {
        const text = node.text.trim();
        if (isFallback(node)) return;
        if (themes.has(text) && (!WORDS.has(text) || comparedWithTheme(node)))
          out.push({ rule: 'diagram-names-theme', where: `${type}: ${file.path}`, name: text });
      });
      themeNameReads(nodes, () =>
        out.push({
          rule: 'diagram-names-theme',
          where: `${type}: ${file.path}`,
          name: 'theme.name',
        })
      );
    }

  // 3. A table reads shared names, palette slots and its own (and a `palette` variable's rule a
  // whole palette, D545, which `tableReads` keeps apart); it writes only its own.
  for (const [type, table] of Object.entries(input.tables)) {
    const { reads, writes, badSlots } = tableReads(table);
    for (const name of badSlots)
      out.push({ rule: 'table-slot-not-palette', where: `${type} rules`, name });
    for (const name of reads)
      if (!input.shared.has(name) && !Object.hasOwn(table.vars, name) && !PALETTE_SLOT.test(name))
        out.push({ rule: 'table-reads-foreign', where: `${type} rules`, name });
    for (const name of writes)
      if (!Object.hasOwn(table.vars, name))
        out.push({ rule: 'table-writes-foreign', where: `${type} entries`, name });
  }
  // 4. A plugin's table declares its vocabulary's variables.
  for (const [type, vocabulary] of Object.entries(input.vocabularies ?? {})) {
    const table = input.tables[type];
    if (!table) continue;
    for (const name of new Set([...Object.keys(vocabulary), ...Object.keys(table.vars)]))
      if (declared(table.vars[name]) !== declared(vocabulary[name]))
        out.push({ rule: 'table-not-vocabulary', where: `${type} vars`, name });
  }
  return out;
}

const RE_IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

/**
 * The runtime import graph of a package: every file reachable by relative imports from the
 * `mermaid-source` entries of its `exports`, apart from test helpers (`testing` entries).
 */
export function packageGraph(dir: string): SourceFile[] {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, { 'mermaid-source'?: string } | string>;
  };
  const entries = Object.entries(pkg.exports ?? {})
    .filter(([key]) => !key.includes('testing'))
    .map(([, v]) => (typeof v === 'string' ? undefined : v['mermaid-source']))
    .filter((p): p is string => p?.endsWith('.ts') === true)
    .map((p) => resolve(dir, p));
  const seen = new Map<string, string>();
  const todo = [...entries];
  while (todo.length) {
    const path = todo.pop()!;
    if (seen.has(path) || !existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    seen.set(path, text);
    for (const m of text.matchAll(RE_IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec?.startsWith('.')) todo.push(resolve(dirname(path), spec));
    }
  }
  return [...seen].map(([path, text]) => ({ path, text }));
}
