/**
 * The XY chart facet's completion and hover tables (DESIGN §4.5, D95): what each expected
 * keyword kind is offered as, and the small text helpers both read. Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';

/** A keyword item: offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  /** One short line next to the label. */
  readonly detail?: string;
}

/** The header keyword (`xychart-beta` is still read, but not offered). */
export const HEADER: KeywordItem = { kind: T.XyChart, label: 'xychart' };

/** The orientations, right after the header. */
export const ORIENTATIONS: readonly KeywordItem[] = [
  { kind: T.ChartOrientation, label: 'vertical', detail: 'default' },
  { kind: T.ChartOrientation, label: 'horizontal' },
];

/** Statement keywords, offered at the start of a line, in this order. */
export const STATEMENTS: readonly KeywordItem[] = [
  { kind: T.Title, label: 'title', insert: 'title ' },
  { kind: T.XAxis, label: 'x-axis', insert: 'x-axis ' },
  { kind: T.YAxis, label: 'y-axis', insert: 'y-axis ' },
  { kind: T.Bar, label: 'bar', insert: 'bar ' },
  { kind: T.Line, label: 'line', insert: 'line ' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.AccDescrMultilineValue, label: 'accDescr {', insert: 'accDescr {' },
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

/** A range without its leading and trailing blanks. */
export function trimmed(text: string, r: Range): Range {
  let { start, end } = r;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return span(start, end);
}
