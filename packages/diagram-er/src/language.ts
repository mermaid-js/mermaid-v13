/**
 * ER language facet (`@mermaid-js/diagram-er/language`, DESIGN §4.5, R-LANG-8, D89): the parser
 * entry and the tables the language service needs. Nothing reachable from here imports a
 * renderer, layout or plugin code; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { erCompletions } from './facet/completions.ts';
import { erHover } from './facet/hover.ts';
import { erCategories } from './generated/categories.ts';
import { parseEr } from './parser/index.ts';
import type { ErDocument } from './parser/index.ts';
import { erTokens } from './parser/tokens-api.ts';
import { T } from './parser/tokens.ts';

export { erCategories } from './generated/categories.ts';
export { erDocs } from './generated/docs.ts';
export { detectEr, parseEr } from './parser/index.ts';
export { erTokens } from './parser/tokens-api.ts';
export { T as ErTokenKind } from './parser/tokens.ts';
export type * from './parser/index.ts';

const HEADER = 'erDiagram\n';
const KEYWORDS = new Set<number>([
  T.ErDiagram,
  T.Subgraph,
  T.End,
  T.Style,
  T.ClassDef,
  T.Class,
  T.AccTitle,
  T.AccDescr,
  T.DirectionTB,
  T.DirectionBT,
  T.DirectionRL,
  T.DirectionLR,
]);
/** Cardinality and line words (`one`, `many`, `to`, …) lex as relationship parts. */
const RELATIONSHIP_WORDS = new Set<number>([
  T.ZeroOrOne,
  T.ZeroOrMore,
  T.OneOrMore,
  T.OnlyOne,
  T.MdParent,
  T.Identifying,
  T.NonIdentifying,
]);

/** Blank, line-break and space checks every kind of name shares. */
function shapeReason(name: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A name cannot contain a line break.';
  if (/\s/.test(name)) return 'A name cannot contain spaces.';
  return undefined;
}

/**
 * Whether `name` reads back as exactly one `kind` symbol named `name` at `at` when written
 * into `text` (a one-statement probe document).
 */
function readsBack(text: string, at: number, name: string, kind: string): boolean {
  const { diagnostics, symbols } = parseEr(text);
  const hits = symbols.filter((s) => s.kind === kind);
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.name === name &&
    hits[0]!.range.start === at &&
    hits[0]!.range.end === at + name.length
  );
}

/** Why `name` cannot be an entity or subgraph name: it must read back alone on a line. */
function entityReason(name: string): string | undefined {
  const shape = shapeReason(name);
  if (shape) return shape;
  const text = `${HEADER}${name}\n`;
  const tokens = erTokens(text).filter(
    (t) => t.range.start >= HEADER.length && t.range.start < HEADER.length + name.length
  );
  if (tokens.length === 1 && KEYWORDS.has(tokens[0]!.kind)) return `'${name}' is a keyword.`;
  if (tokens.some((t) => RELATIONSHIP_WORDS.has(t.kind))) {
    return `'${name}' is read as a cardinality or line.`;
  }
  return readsBack(text, HEADER.length, name, 'entity')
    ? undefined
    : `'${name}' is not an entity name.`;
}

/** Why `name` cannot be a symbol of `kind` (`entity`/`subgraph`, `class`), if it cannot. */
function invalidReason(name: string, kind = 'entity'): string | undefined {
  if (kind === 'class') {
    const at = HEADER.length + 'classDef '.length;
    const text = `${HEADER}classDef ${name} fill:#000\n`;
    return (
      shapeReason(name) ??
      (readsBack(text, at, name, 'class') ? undefined : `'${name}' is not a class name.`)
    );
  }
  return entityReason(name);
}

/** The ER facet. */
export const erLanguage: LanguageFacet<ErDocument> = {
  id: 'er',
  parse: (text, options) => parseEr(text, options),
  categories: erCategories,
  namespaces: [['entity', 'subgraph'], ['class']],
  isValidId: invalidReason,
  completions: erCompletions,
  hover: erHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { erLanguage as language };
