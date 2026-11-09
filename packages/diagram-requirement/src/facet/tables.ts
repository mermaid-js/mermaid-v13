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

/** A keyword item: offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  /** One short line next to the label. */
  readonly detail?: string;
}

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

/** Index of the last token of `tokens` starting at or before `offset`, or -1. */
export function tokenBefore(tokens: TokenStream, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
