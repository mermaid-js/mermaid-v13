/**
 * The event modeling facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword
 * docs are not here: they come from the grammar file (`generated/docs.ts`).
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { CompletionKind, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { tokenBefore } from '@mermaid-js/core/parser-kit/facet';
import type { EventModelDocument, EventModelFrameNode } from '../parser/ast.ts';
import {
  DATA_TYPES,
  EVENTMODELING_TRIVIA,
  KEYWORDS,
  KIND_LIST,
  KINDS,
  T,
} from '../parser/tokens.ts';
import { defaultLaneLabel } from '../structure.ts';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  /** One short line next to the label. */
  readonly detail?: string;
  /**
   * A `title`, `accTitle` or `accDescr`: offered only after a blank that follows an earlier
   * token on its line, the one place the lexer reads them (at a line start they are names).
   */
  readonly afterBlank?: true;
}

/** A keyword's word, from the lexer's table. */
const word = (kind: number): string => [...KEYWORDS].find(([, k]) => k === kind)?.[0] ?? '';

const keyword = (kind: number, detail?: string): KeywordItem => ({
  kind,
  label: word(kind),
  item: 'keyword',
  insert: `${word(kind)} `,
  ...(detail === undefined ? {} : { detail }),
});

const constant = (kind: number, detail: string): KeywordItem => ({
  kind,
  label: word(kind),
  item: 'constant',
  detail,
});

/** A kind keyword's item: its detail names the default lane it picks. */
const kindItem = (k: number): KeywordItem => {
  const short = KINDS[k];
  return keyword(k, short === undefined ? undefined : `${defaultLaneLabel(short)} lane`);
};

/**
 * Everything completion offers but frame ids, data names and entity names, in the order it is
 * offered: the header, the statements, the kinds, `->>`, the data types and a `gwt`'s parts.
 */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.Header, label: 'eventmodeling', item: 'keyword' },
  keyword(T.Tf, 'frame'),
  keyword(T.Rf, 'reset frame'),
  keyword(T.Timeframe, 'frame'),
  keyword(T.Resetframe, 'reset frame'),
  keyword(T.Entity),
  keyword(T.Data),
  keyword(T.Note),
  keyword(T.Gwt),
  { kind: T.Title, label: 'title', item: 'keyword', insert: 'title ', afterBlank: true },
  { kind: T.AccTitle, label: 'accTitle:', item: 'keyword', insert: 'accTitle: ', afterBlank: true },
  { kind: T.AccDescr, label: 'accDescr:', item: 'keyword', insert: 'accDescr: ', afterBlank: true },
  ...KIND_LIST.map(kindItem),
  { kind: T.Arrow, label: '->>', item: 'operator', insert: '->> ', detail: 'source frame' },
  ...DATA_TYPES.map((k) => constant(k, 'data type')),
  keyword(T.Given),
  keyword(T.When),
  keyword(T.Then),
];

/** The kind keywords. */
export const KIND_KINDS: ReadonlySet<number> = new Set(KIND_LIST);

/** The completed frames, in source order. */
export const frameNodes = (doc: EventModelDocument): EventModelFrameNode[] =>
  doc.children.filter((n): n is EventModelFrameNode => n.type === 'Frame');

/** The kinds of the significant tokens ending at or before `at`, last first (at most `n`). */
export function kindsBefore(tokens: TokenStream | undefined, at: number, n: number): number[] {
  const out: number[] = [];
  if (!tokens) return out;
  for (let j = tokenBefore(tokens, at); j >= 0 && out.length < n; j--) {
    // A token at `at` or past it (the end, the next word) is not before it.
    if ((tokens.start[j] ?? 0) >= at || (tokens.end[j] ?? 0) > at) continue;
    const k = tokens.kind[j] ?? Kind.EOF;
    if (EVENTMODELING_TRIVIA[k] !== 1) out.push(k);
  }
  return out;
}

/** Whether `offset` is in `r`, its ends included. */
export const inside = (offset: number, r: Range): boolean => r.start <= offset && offset <= r.end;

/** `a`, `a and b`, `a, b and c`. */
export function list(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}
