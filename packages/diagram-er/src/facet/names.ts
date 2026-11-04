// Which names read back as themselves when written bare (the language facet's rename check and
// completion's quoting both ask).
import { parseEr } from '../parser/index.ts';
import { erTokens } from '../parser/tokens-api.ts';
import { T } from '../parser/tokens.ts';

export const HEADER = 'erDiagram\n';
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
export function shapeReason(name: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A name cannot contain a line break.';
  if (/\s/.test(name)) return 'A name cannot contain spaces.';
  return undefined;
}

/**
 * Whether `name` reads back as exactly one `kind` symbol named `name` at `at` when written
 * into `text` (a one-statement probe document).
 */
export function readsBack(text: string, at: number, name: string, kind: string): boolean {
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
export function entityReason(name: string): string | undefined {
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

/**
 * `name` as it is written where an entity name goes: bare when it reads back as itself, else in
 * double quotes; undefined when neither reads back (a quote, `%`, `\\`, a line break).
 */
export function writtenName(name: string): string | undefined {
  if (entityReason(name) === undefined) return name;
  const quoted = `"${name}"`;
  // The symbol's range takes in the quotes.
  const { diagnostics, symbols } = parseEr(`${HEADER}${quoted}\n`);
  const hits = symbols.filter((s) => s.kind === 'entity');
  const ok =
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.name === name &&
    hits[0]!.range.end - hits[0]!.range.start === quoted.length;
  return ok ? quoted : undefined;
}
