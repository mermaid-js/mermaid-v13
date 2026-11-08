/**
 * The venn facet's tables and shared helpers (DESIGN §4.5, D95): the statement keywords
 * completion offers, the style keys v12 reads with their docs, and token helpers. Keyword docs
 * are not here: they come from the grammar file (`generated/docs.ts`).
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { CompletionKind, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';

/** A keyword offered when the parser expects one of `kinds`. */
export interface KeywordItem {
  readonly kinds: readonly number[];
  readonly label: string;
  readonly item: CompletionKind;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  /** The `generated/docs.ts` entry shown with it. */
  readonly doc: number;
}

/** The statement keywords, in the order they are offered (all at a line start). */
export const KEYWORDS: readonly KeywordItem[] = [
  { kinds: [T.Venn], label: 'venn-beta', item: 'keyword', doc: T.Venn },
  { kinds: [T.Set], label: 'set', item: 'keyword', insert: 'set ', doc: T.Set },
  { kinds: [T.Union], label: 'union', item: 'keyword', insert: 'union ', doc: T.Union },
  {
    kinds: [T.Text, T.IndentTextKeyword],
    label: 'text',
    item: 'keyword',
    insert: 'text ',
    doc: T.Text,
  },
  { kinds: [T.Style], label: 'style', item: 'keyword', insert: 'style ', doc: T.Style },
  // v12 takes a title only with its text (`title\s[^#\n;]+`): `title ` alone is no statement.
  { kinds: [T.Title], label: 'title', item: 'keyword', insert: 'title Title', doc: T.Title },
];

/**
 * The style keys v12's renderer reads (`vennRenderer.ts`), in the order offered, with what each
 * does. Any other key is kept in the model and not drawn.
 */
export const STYLE_KEYS: readonly (readonly [key: string, doc: string])[] = [
  [
    'fill',
    "The fill of a set's circle (its outline too, unless `stroke` is given) or of an overlap, which is transparent without one, as in `fill: #f00`.",
  ],
  [
    'fill-opacity',
    "How opaque a set's fill is, from 0 to 1 (0.1 when not given), as in `fill-opacity: 0.3`.",
  ],
  [
    'stroke',
    "The outline colour of a set's circle (its fill colour when not given), as in `stroke: #333`.",
  ],
  ['stroke-width', "The outline width of a set's circle, as in `stroke-width: 2px`."],
  ['color', 'The colour of the label of a set or overlap, or of a text node, as in `color: #fff`.'],
];

/** Kinds a statement's context is not read from: trivia, line breaks and the end. */
const SKIPPED = new Set<number>([
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  Kind.Newline,
  Kind.EOF,
  T.Eof,
]);

/** The offset where `at`'s line starts. */
export function lineStartOf(text: string, at: number): number {
  let k = at;
  while (k > 0 && !/[\r\n]/.test(text.charAt(k - 1))) k--;
  return k;
}

/** The significant tokens from the start of `at`'s line up to `at` (exclusive), by index. */
export function lineTokens(text: string, tokens: TokenStream, at: number): number[] {
  const lineStart = lineStartOf(text, at);
  const out: number[] = [];
  for (let j = tokenBefore(tokens, lineStart); j < tokens.length; j++) {
    if (j < 0) continue;
    const start = tokens.start[j] ?? 0;
    if (start >= at) break;
    if (start < lineStart || SKIPPED.has(tokens.kind[j] ?? Kind.EOF)) continue;
    out.push(j);
  }
  return out;
}

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
