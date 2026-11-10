/**
 * The requirement facet's completion and hover tables (DESIGN §4.5, D95): how each keyword kind
 * is offered, and small helpers. Keyword docs are not here: they come from the grammar file
 * (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { RelationshipKind } from '../model.ts';
import {
  DIRECTION_OF,
  DIRECTIONS,
  ELEMENT_FIELDS,
  METHODS,
  REL_OF,
  RELS,
  REQ_FIELDS,
  REQ_KINDS,
  RISKS,
} from '../parser/syntax.ts';
import { KEYWORD_SPELLINGS, T } from '../parser/tokens.ts';
import type { DetailedKeywordItem as KeywordItem } from '@mermaid-js/core/parser-kit';
export type { DetailedKeywordItem as KeywordItem } from '@mermaid-js/core/parser-kit';
export { plural } from '@mermaid-js/core/parser-kit';
export { tokenBefore } from '@mermaid-js/core/parser-kit';
export { span } from '@mermaid-js/core/parser-kit';
export { code } from '@mermaid-js/core/parser-kit';

const SPELLING: ReadonlyMap<number, string> = new Map(KEYWORD_SPELLINGS);

/** How v12's syntax page spells the keyword `kind` (`KEYWORD_SPELLINGS`). */
export const spelling = (kind: number): string => SPELLING.get(kind) ?? '';

const keyword = (kind: number): KeywordItem => ({ kind, label: spelling(kind) });

/** Statement keywords, in the order they are offered. */
export const STATEMENT_KEYWORDS: readonly KeywordItem[] = [
  ...[...REQ_KINDS, T.Element, T.Style, T.ClassDef, T.Class].map(keyword),
  ...DIRECTIONS.map((kind) => ({ kind, label: `direction ${DIRECTION_OF[kind] ?? ''}` })),
  // The `acc…` openers are no keyword rule: the lexer reads them with their `:` or `{`.
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
];

/** Body fields, inserted with their `: `. */
export const FIELDS: readonly KeywordItem[] = [...REQ_FIELDS, ...ELEMENT_FIELDS].map((kind) => ({
  kind,
  label: spelling(kind),
  insert: `${spelling(kind)}: `,
}));

/** Field values with a fixed set: the risks and the verification methods. */
export const VALUES: readonly KeywordItem[] = [...RISKS, ...METHODS].map(keyword);

/** What each relationship says of the source and the target (v12's syntax page). */
const RELATION_MEANING: Readonly<Record<RelationshipKind, string>> = {
  contains: 'the source contains the target',
  copies: 'the source copies the target',
  derives: 'the source derives from the target',
  satisfies: 'the source satisfies the target',
  verifies: 'the source verifies the target',
  refines: 'the source refines the target',
  traces: 'the source traces to the target',
};

/** The relationship kinds, each with its meaning as the detail. */
export const RELATIONSHIPS: readonly KeywordItem[] = RELS.map((kind) => {
  const rel = REL_OF[kind];
  return { ...keyword(kind), ...(rel ? { detail: RELATION_MEANING[rel] } : {}) };
});

/** The operators of a relation and the class shorthand. */
export const OPERATORS: readonly KeywordItem[] = [
  { kind: T.Line, label: '-', insert: '- ' },
  { kind: T.EndArrowL, label: '<-', insert: '<- ' },
  { kind: T.EndArrowR, label: '->', insert: '-> ' },
  { kind: T.StyleSeparator, label: ':::' },
];
