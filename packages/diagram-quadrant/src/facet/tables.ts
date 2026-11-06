/**
 * The quadrant facet's completion and hover tables (DESIGN §4.5, D95): what each expected
 * keyword kind is offered as, and the point style keys. Keyword docs are not here: they come
 * from the grammar file (`generated/docs.ts`).
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

/** Statement keywords, in the order they are offered. */
export const KEYWORDS: readonly KeywordItem[] = [
  { kind: T.Title, label: 'title', insert: 'title ' },
  { kind: T.XAxis, label: 'x-axis', insert: 'x-axis ' },
  { kind: T.YAxis, label: 'y-axis', insert: 'y-axis ' },
  { kind: T.Quadrant1, label: 'quadrant-1', insert: 'quadrant-1 ', detail: 'top right' },
  { kind: T.Quadrant2, label: 'quadrant-2', insert: 'quadrant-2 ', detail: 'top left' },
  { kind: T.Quadrant3, label: 'quadrant-3', insert: 'quadrant-3 ', detail: 'bottom left' },
  { kind: T.Quadrant4, label: 'quadrant-4', insert: 'quadrant-4 ', detail: 'bottom right' },
  { kind: T.ClassDef, label: 'classDef', insert: 'classDef ' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.AccDescr, label: 'accDescr {', insert: 'accDescr {' },
];

/** The quadrant each `quadrant-N` kind labels, for hover. */
export const QUADRANT_PLACES: Readonly<Record<number, string>> = {
  [T.Quadrant1]: 'top right',
  [T.Quadrant2]: 'top left',
  [T.Quadrant3]: 'bottom left',
  [T.Quadrant4]: 'bottom right',
};

/**
 * Point and `classDef` style keys (v12's `parseStyles`): what each inserts, a valid example
 * value the writer then edits (a key without a value is an error), and what it takes.
 */
export const STYLE_KEYS: readonly (readonly [key: string, insert: string, takes: string])[] = [
  ['radius', 'radius: 10', 'a whole number'],
  ['color', 'color: #ff0000', 'a hex colour'],
  ['stroke-color', 'stroke-color: #ff0000', 'a hex colour'],
  ['stroke-width', 'stroke-width: 2px', 'a size in pixels'],
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
