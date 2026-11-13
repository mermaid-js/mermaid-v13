/**
 * The XY chart facet's completion and hover tables (DESIGN §4.5, D95): what each expected
 * keyword kind is offered as, and the small text helpers both read. Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`).
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import { span } from '@mermaid-js/core/parser-kit/facet';
import { T } from '../parser/tokens.ts';

export { code, span, tokenBefore } from '@mermaid-js/core/parser-kit/facet';

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

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** A range without its leading and trailing blanks. */
export function trimmed(text: string, r: Range): Range {
  let { start, end } = r;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return span(start, end);
}
