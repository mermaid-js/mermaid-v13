/**
 * The radar facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { CompletionKind, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  /** Offered only as the first word of its line (the statements). */
  readonly lineStart?: true;
}

const statement = (kind: number, label: string, insert = `${label} `): KeywordItem => ({
  kind,
  label,
  item: 'keyword',
  insert,
  lineStart: true,
});

/** Everything completion offers but axis names, in the order it is offered. */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.RadarBeta, label: 'radar-beta', item: 'keyword' },
  statement(T.Axis, 'axis'),
  statement(T.Curve, 'curve'),
  statement(T.Title, 'title'),
  statement(T.AccTitle, 'accTitle', 'accTitle: '),
  statement(T.AccDescr, 'accDescr', 'accDescr: '),
  statement(T.ShowLegend, 'showLegend'),
  statement(T.Ticks, 'ticks'),
  statement(T.Max, 'max'),
  statement(T.Min, 'min'),
  statement(T.Graticule, 'graticule'),
  { kind: T.Boolean, label: 'true', item: 'constant' },
  { kind: T.Boolean, label: 'false', item: 'constant' },
  { kind: T.GraticuleValue, label: 'circle', item: 'constant' },
  { kind: T.GraticuleValue, label: 'polygon', item: 'constant' },
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
