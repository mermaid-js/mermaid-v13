/**
 * The theme direction check (D331, spec #414): dependencies between themes and diagrams run one
 * way.
 *
 * 1. Core and the theme specs never name a diagram's own variable: no string literal in the
 *    runtime import graph of `@mermaid-js/core` or `mermaid` holds one as a word.
 * 2. A diagram never names a theme: no string literal in its runtime import graph is a theme
 *    name, and it never reads `theme.name`. The theme names that are also ordinary words
 *    (`default`, `base`, `dark`, `neutral`) count only where they are compared with an
 *    expression that mentions a theme (`config.theme === 'dark'`, `THEMES.has(theme)`).
 * 3. A diagram's table reads only the shared vocabulary, palette slots and its own variables, and
 *    writes only its own variables; its names are none of core's and none of another table's.
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
import type {
  DiagramThemeTable,
  DiagramThemeVarDef,
} from '../../../packages/core/src/theme/diagram.ts';
import { parseRule, ruleRefs } from '../../../packages/core/src/theme/dsl.ts';
import { parseColor } from '../../../packages/core/src/theme/color.ts';
import { PALETTE_VARIABLES } from '../../../packages/core/src/theme/vocabulary.ts';

export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

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

export interface Violation {
  readonly rule:
    | 'core-names-diagram'
    | 'diagram-names-theme'
    | 'table-reads-foreign'
    | 'table-not-vocabulary';
  readonly where: string;
  readonly name: string;
}

/** Theme names that are also ordinary words, checked only in a comparison with a theme. */
const WORDS = new Set(['default', 'base', 'dark', 'neutral']);
/** The families a table's `fallback` may name (`ThemeFamily`). */
const FAMILIES = new Set(['classic', 'redux', 'neo']);
const RE_SLOT = new RegExp(`^(${PALETTE_VARIABLES.join('|')})(0|[1-9]\\d?)$`);

function literals(file: SourceFile, visit: (node: ts.StringLiteralLike) => void): void {
  const sf = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
  const walk = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) visit(node);
    else if (ts.isTemplateExpression(node)) {
      visit(node.head as unknown as ts.StringLiteralLike);
      for (const span of node.templateSpans) visit(span.literal as unknown as ts.StringLiteralLike);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
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

/** Whether a literal is a table's `fallback: '<family>'`. */
function isFallback(node: ts.StringLiteralLike): boolean {
  const p = node.parent;
  return (
    FAMILIES.has(node.text) &&
    ts.isPropertyAssignment(p) &&
    p.initializer === node &&
    p.name.getText().replace(/['"]/g, '') === 'fallback'
  );
}

/** A variable's declaration as a table's `vars` holds it, for comparing with its vocabulary row. */
const declared = (d: { alias: string; kind: string; nested?: string } | undefined) =>
  d && JSON.stringify([d.alias, d.kind, d.nested ?? null]);

function tableReads(table: DiagramThemeTable): { reads: string[]; writes: string[] } {
  const reads: string[] = [];
  const writes: string[] = [];
  const rules = (r: Readonly<Record<string, string>> | undefined) => {
    for (const [name, rule] of Object.entries(r ?? {})) {
      writes.push(name);
      ruleRefs(parseRule(rule), (n) => parseColor(n) === undefined, reads);
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
  return { reads, writes };
}

export function checkThemeDirection(input: DirectionInput): Violation[] {
  const out: Violation[] = [];
  const owner = new Map<string, string>();
  const own = (type: string, names: Iterable<string>, where: string) => {
    for (const name of names) {
      const other = owner.get(name);
      if (other === type) continue;
      if (input.shared.has(name) || other !== undefined)
        out.push({ rule: 'table-reads-foreign', where: `${type} ${where}`, name });
      owner.set(name, type);
    }
  };
  for (const [type, vocabulary] of Object.entries(input.vocabularies ?? {}))
    own(type, Object.keys(vocabulary), 'vocabulary');
  for (const [type, table] of Object.entries(input.tables))
    own(type, Object.keys(table.vars), 'vars');

  // 1. Core names no diagram variable.
  for (const file of input.core)
    literals(file, (node) => {
      for (const word of node.text.split(/[^A-Za-z0-9_]+/))
        if (owner.has(word) && !input.shared.has(word))
          out.push({ rule: 'core-names-diagram', where: file.path, name: word });
    });

  // 2. Diagrams name no theme.
  const themes = new Set(input.themes);
  for (const [type, files] of Object.entries(input.diagrams))
    for (const file of files) {
      if (/[\\/]src[\\/]generated[\\/]/.test(file.path)) continue;
      literals(file, (node) => {
        const text = node.text.trim();
        if (isFallback(node)) return;
        if (themes.has(text) && (!WORDS.has(text) || comparedWithTheme(node)))
          out.push({ rule: 'diagram-names-theme', where: `${type}: ${file.path}`, name: text });
      });
      const sf = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
      const walk = (node: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === 'name' &&
          /theme$/i.test(node.expression.getText())
        )
          out.push({
            rule: 'diagram-names-theme',
            where: `${type}: ${file.path}`,
            name: 'theme.name',
          });
        ts.forEachChild(node, walk);
      };
      walk(sf);
    }

  // 3. A table reads shared names, palette slots and its own; it writes only its own.
  for (const [type, table] of Object.entries(input.tables)) {
    const { reads, writes } = tableReads(table);
    for (const name of reads)
      if (!input.shared.has(name) && !Object.hasOwn(table.vars, name) && !RE_SLOT.test(name))
        out.push({ rule: 'table-reads-foreign', where: `${type} rules`, name });
    for (const name of writes)
      if (!Object.hasOwn(table.vars, name))
        out.push({ rule: 'table-reads-foreign', where: `${type} entries`, name });
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
