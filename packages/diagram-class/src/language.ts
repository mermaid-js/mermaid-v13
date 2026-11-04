/**
 * Class language facet (`@mermaid-js/diagram-class/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports layout or rendering code; the bench's language bundle spec holds that in place.
 */
import type { FacetParseOptions, LanguageFacet } from '@mermaid-js/core/parser-kit';
import { classCompletions } from './facet/completions.ts';
import { classHover } from './facet/hover.ts';
import { classCategories } from './generated/categories.ts';
import { classTokens, parseClass } from './parser/index.ts';
import type { ClassDocument, ClassParseResult } from './parser/index.ts';

export { classCategories } from './generated/categories.ts';
export { classDocs } from './generated/docs.ts';
export { ClassTokenKind, classTokens, detectClass, parseClass } from './parser/index.ts';
export type * from './parser/index.ts';

const HEADER = 'classDiagram\n';

/** Blank, line-break and space checks every kind of name shares. */
function shapeReason(name: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A name cannot contain a line break.';
  if (/\s/.test(name)) return 'A name cannot contain spaces.';
  return undefined;
}

/** `'name' is a keyword.` when `name` alone on a line lexes as one keyword. */
function keywordReason(name: string): string | undefined {
  const tokens = classTokens(`${HEADER}${name}\n`).filter(
    (t) => t.range.start >= HEADER.length && t.range.start < HEADER.length + name.length
  );
  return tokens.length === 1 && classCategories[tokens[0]!.kind] === 'Keyword'
    ? `'${name}' is a keyword.`
    : undefined;
}

/**
 * Whether `name` reads back as exactly one `kind` symbol named `name` at `at` of `text` (a
 * one-statement probe document), with no error.
 */
function readsBack(text: string, at: number, name: string, kind: string): boolean {
  const { diagnostics, symbols } = parseClass(text);
  const hits = symbols.filter((s) => s.kind === kind && s.name === name);
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.range.start === at &&
    hits[0]!.range.end === at + name.length
  );
}

/** Where each symbol kind is written in its probe document, and what it is called. */
const PROBES: Readonly<Record<string, readonly [before: string, after: string, noun: string]>> = {
  class: ['class ', '\n', 'a class name'],
  interface: ['', ' ()-- Z\n', 'an interface name'],
  namespace: ['namespace ', ' {\nclass Z\n}\n', 'a namespace name'],
  cssClass: ['classDef ', ' fill:#000\n', 'a style class name'],
};

/** Why `name` cannot be a symbol of `kind` (`class` by default), if it cannot (D92). */
function invalidReason(name: string, kind = 'class'): string | undefined {
  const shape = shapeReason(name) ?? keywordReason(name);
  if (shape) return shape;
  if (kind === 'namespace' && name.includes('.')) {
    return 'A namespace name cannot contain `.`: `A.B` makes namespace `B` inside `A`.';
  }
  const known = kind in PROBES ? kind : 'class';
  const [before, after, noun] = PROBES[known]!;
  const reads = (b: string, a: string) =>
    readsBack(`${HEADER}${b}${name}${a}`, HEADER.length + b.length, name, known);
  // A class name is also checked alone on a line, where keywords start statements.
  const ok = reads(before, after) && (known !== 'class' || reads('', '\n'));
  return ok ? undefined : `'${name}' is not ${noun}.`;
}

/**
 * The parse the service reads: {@link parseClass}, less the namespace symbols a rename would
 * change the namespace tree with. A dotted id (`namespace A.B`) makes its ancestors (`A`) too,
 * so neither it nor an ancestor (also written on its own, `namespace A`) can be renamed as a
 * name: those get no definition, references or rename, as a nested namespace (whose
 * qualified id is not its text) already does.
 */
function parse(text: string, options: FacetParseOptions): ClassParseResult {
  const result = parseClass(text, options);
  const tree = new Set<string>();
  for (const s of result.symbols) {
    if (s.kind !== 'namespace' || !text.slice(s.range.start, s.range.end).includes('.')) continue;
    const parts = s.name.split('.');
    for (let i = 1; i <= parts.length; i++) tree.add(parts.slice(0, i).join('.'));
  }
  if (tree.size === 0) return result;
  const symbols = result.symbols.filter((s) => s.kind !== 'namespace' || !tree.has(s.name));
  return { ...result, symbols };
}

/** The class facet. */
export const classLanguage: LanguageFacet<ClassDocument> = {
  id: 'class',
  parse,
  categories: classCategories,
  namespaces: [['class'], ['interface'], ['namespace'], ['cssClass']],
  isValidId: invalidReason,
  completions: classCompletions,
  hover: classHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { classLanguage as language };
