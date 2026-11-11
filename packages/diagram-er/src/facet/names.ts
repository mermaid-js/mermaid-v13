// Which names read back as themselves when written bare (the language facet's rename check and
// completion's quoting both ask).
import { parseEr } from '../parser/index.ts';
import { erTokens } from '../parser/tokens-api.ts';
import { T } from '../parser/tokens.ts';
import { readsBack, shapeReason } from '@mermaid-js/shared/parser/facet';
export { readsBack } from '@mermaid-js/shared/parser/facet';
export { shapeReason } from '@mermaid-js/shared/parser/facet';

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

/** Why `name` cannot be an entity or subgraph name: it must read back alone on a line. */
export function entityReason(name: string): string | undefined {
  const shape = shapeReason(name, 'A name');
  if (shape) return shape;
  const text = `${HEADER}${name}\n`;
  const tokens = erTokens(text).filter(
    (t) => t.range.start >= HEADER.length && t.range.start < HEADER.length + name.length
  );
  if (tokens.length === 1 && KEYWORDS.has(tokens[0]!.kind)) return `'${name}' is a keyword.`;
  if (tokens.some((t) => RELATIONSHIP_WORDS.has(t.kind))) {
    return `'${name}' is read as a cardinality or line.`;
  }
  return readsBack(parseEr(text), HEADER.length, name, 'entity')
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
