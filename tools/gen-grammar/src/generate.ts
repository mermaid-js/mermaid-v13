/**
 * Every file generated from the grammar files: highlighters next to each grammar (separate
 * artefacts, never imported by a published package), the syntax reference pages and each
 * diagram's runtime kind → category table (D94) and keyword doc table (D93).
 */
import { workspaceDiagrams, type WorkspaceDiagram } from '../../workspace/diagrams.ts';
import { categoriesModule, kindKeys } from './categories.ts';
import type { KindSource } from './categories.ts';
import { docsModule } from './docs.ts';
import { parseGrammar } from './ebnf.ts';
import { lezerGrammar, lezerTokens, monarch, textMate } from './highlight.ts';
import { syntaxDoc } from './syntax-doc.ts';

export interface GrammarTarget {
  /**
   * Diagram type, e.g. `flowchart`: names the generated tables (`flowchartCategories`), so it
   * is an identifier (`railroadEbnf`).
   */
  type: string;
  /**
   * The package, `packages/diagram-<package>`, when it is not `type`: a package whose manifest
   * declares several types carries one grammar per type (D512).
   */
  package?: string;
  /**
   * The grammar file's base name, `grammar/<grammar>.ebnf`, when it is not `type`
   * (`railroad-ebnf`). It also names the highlighters, the syntax doc and, when it is not the
   * package's name, the category and doc tables (`src/generated/<grammar>.categories.ts`).
   */
  grammar?: string;
  /** Page title of the syntax reference. */
  title: string;
  /** The diagram's token kinds, for its kind → category table. */
  kinds: KindSource;
}

const TARGET_KEYS = new Set(['type', 'grammar', 'title', 'kinds']);
const KIND_KEYS = new Set(['module', 'object', 'unnamed', 'mixed', 'documented']);
const UNNAMED_KEYS = new Set(['mode', 'pattern', 'docOf', 'terminal']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

/** The `kinds.unnamed` map of a grammar entry: each rule is `{ mode, pattern, docOf?, terminal? }`. */
function checkUnnamed(where: string, unnamed: unknown): void {
  if (!isRecord(unnamed)) throw new Error(`${where}: \`kinds.unnamed\` must map kinds`);
  for (const [kind, rule] of Object.entries(unnamed)) {
    const ok =
      isRecord(rule) &&
      typeof rule.mode === 'string' &&
      typeof rule.pattern === 'string' &&
      Object.keys(rule).every((k) => UNNAMED_KEYS.has(k)) &&
      ['docOf', 'terminal'].every((k) => rule[k] === undefined || typeof rule[k] === 'string');
    if (!ok)
      throw new Error(
        `${where}: \`kinds.unnamed.${kind}\` must be { mode, pattern, docOf?, terminal? }`
      );
  }
}

/** `kinds.mixed` and `kinds.documented` are lists of names. */
function checkKindLists(where: string, kinds: Record<string, unknown>): void {
  for (const key of ['mixed', 'documented'] as const)
    if (kinds[key] !== undefined && !isStrings(kinds[key]))
      throw new Error(`${where}: \`kinds.${key}\` must be a list of names`);
}

/** The `kinds` of a grammar entry, or the reason it is malformed. */
function checkKinds(where: string, kinds: unknown): void {
  if (!isRecord(kinds) || typeof kinds.module !== 'string' || typeof kinds.object !== 'string')
    throw new Error(`${where}: \`kinds\` needs a string \`module\` and \`object\``);
  for (const key of Object.keys(kinds))
    if (!KIND_KEYS.has(key)) throw new Error(`${where}: unknown kinds key "${key}"`);
  checkKindLists(where, kinds);
  if (kinds.unnamed !== undefined) checkUnnamed(where, kinds.unnamed);
}

/**
 * One `grammars` entry of `<dir>/workspace.yaml` as a target, or the reason it is not one. The
 * package is where the file is: an entry names `package` only by its place, never as a key.
 */
export function grammarTarget(pkg: string, entry: unknown): GrammarTarget {
  const where = `packages/diagram-${pkg}/workspace.yaml grammars`;
  if (!isRecord(entry)) throw new Error(`${where}: each entry must be a mapping`);
  for (const key of Object.keys(entry))
    if (!TARGET_KEYS.has(key)) throw new Error(`${where}: unknown key "${key}"`);
  const { type, grammar, title, kinds } = entry;
  if (typeof type !== 'string' || typeof title !== 'string')
    throw new Error(`${where}: an entry needs a string \`type\` and \`title\``);
  if (grammar !== undefined && typeof grammar !== 'string')
    throw new Error(`${where} ${type}: \`grammar\` must be a string`);
  checkKinds(`${where} ${type}`, kinds);
  return {
    type,
    ...(type !== pkg && { package: pkg }),
    ...(grammar !== undefined && { grammar }),
    title,
    kinds: kinds as KindSource,
  };
}

/**
 * The grammar targets of `packages`: each diagram package's `workspace.yaml` `grammars`, in
 * package order, a pre-manifest package's too (its T2 writes the grammar before T5 adds the
 * manifest). A port adds its own entries there; no list here names it.
 */
export function grammarTargets(
  packages: readonly WorkspaceDiagram[] = workspaceDiagrams()
): GrammarTarget[] {
  return packages.flatMap((p) => (p.wiring.grammars ?? []).map((g) => grammarTarget(p.type, g)));
}

/**
 * Every grammar file in the workspace, `packages/diagram-<pkg>/grammar/<grammar>.ebnf`, with its
 * target: what each package's `workspace.yaml` declares under `grammars`.
 */
export const GRAMMARS: GrammarTarget[] = grammarTargets();
/** The grammar file of `grammar` in `packages/diagram-<pkg>`. */
export const grammarPath = (grammar: string, pkg: string = grammar): string =>
  `packages/diagram-${pkg}/grammar/${grammar}.ebnf`;
/** The highlighters' folder of `packages/diagram-<pkg>`. */
export const generatedDir = (pkg: string): string => `packages/diagram-${pkg}/grammar/generated`;
/** The diagram package's source dir. */
export const sourceDir = (pkg: string): string => `packages/diagram-${pkg}/src`;

/** Where one target's grammar file is, and what it generates (repo-relative paths). */
export interface TargetPaths {
  /** The package, `packages/diagram-<pkg>`. */
  pkg: string;
  /** The grammar file's base name. */
  grammar: string;
  /** The grammar file. */
  file: string;
  /** The token-kind module. */
  kinds: string;
  /** The folder of the highlighters. */
  highlighters: string;
  syntaxDoc: string;
  categories: string;
  docs: string;
}

/** Where one target's grammar file is, and what it generates. */
export function targetPaths(target: GrammarTarget): TargetPaths {
  const { type } = target;
  const pkg = target.package ?? type;
  if (!/^[A-Za-z_$][\w$]*$/.test(type)) throw new Error(`type ${type} is not an identifier`);
  // A second type of a package names its grammar file (`railroad-ebnf`, not `railroadEbnf`).
  if (type !== pkg && target.grammar === undefined) {
    throw new Error(`type ${type} of package ${pkg} names no grammar file`);
  }
  const grammar = target.grammar ?? type;
  // The package's own type keeps the plain table names; each other one prefixes them.
  const table = type === pkg ? '' : `${grammar}.`;
  const generated = `${sourceDir(pkg)}/generated`;
  return {
    pkg,
    grammar,
    file: grammarPath(grammar, pkg),
    kinds: `${sourceDir(pkg)}/${target.kinds.module}`,
    highlighters: generatedDir(pkg),
    syntaxDoc: `v13/docs/syntax/${grammar}.md`,
    categories: `${generated}/${table}categories.ts`,
    docs: `${generated}/${table}docs.ts`,
  };
}

/** Repo-relative path → content, for one grammar file's text and its token-kind module's. */
export function generateFor(
  target: GrammarTarget,
  text: string,
  kindsText: string
): Map<string, string> {
  const { type } = target;
  const paths = targetPaths(target);
  const { grammar } = paths;
  const g = parseGrammar(text);
  const names = { id: `mermaid-${grammar}`, extensions: ['mmd', 'mermaid'] };
  const dir = paths.highlighters;
  const json = (v: object) => `${JSON.stringify(v, null, 2)}\n`;
  return new Map([
    [`${dir}/${grammar}.tmLanguage.json`, json(textMate(g, names))],
    [`${dir}/${grammar}.monarch.json`, json(monarch(g, names))],
    [`${dir}/${grammar}.grammar`, lezerGrammar(g, names, `./${grammar}.tokens.js`)],
    [`${dir}/${grammar}.tokens.js`, lezerTokens(g, names, `./${grammar}.parser.terms.js`)],
    [paths.syntaxDoc, syntaxDoc(g, target.title, paths.file)],
    [paths.categories, categoriesModule(g, type, paths.file, kindsText, target.kinds)],
    [
      paths.docs,
      docsModule(g, type, paths.file, kindKeys(kindsText, target.kinds.object), target.kinds),
    ],
  ]);
}

export function generate(
  read: (path: string) => string | undefined,
  targets: readonly GrammarTarget[] = GRAMMARS
): Map<string, string> {
  const files = new Map<string, string>();
  for (const target of targets) {
    const paths = targetPaths(target);
    const text = read(paths.file);
    if (text === undefined) throw new Error(`missing ${paths.file}`);
    const kindsText = read(paths.kinds);
    if (kindsText === undefined) throw new Error(`missing ${paths.kinds}`);
    for (const [k, v] of generateFor(target, text, kindsText)) {
      if (files.has(k)) throw new Error(`two grammars generate ${k}`);
      files.set(k, v);
    }
  }
  return files;
}
