/**
 * The pie facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are not
 * here: they come from the grammar file (`generated/docs.ts`).
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
  readonly detail?: string;
}

/** Everything completion offers, in the order it is offered. */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.Pie, label: 'pie', item: 'keyword' },
  { kind: T.ShowData, label: 'showData', item: 'keyword' },
  { kind: T.Title, label: 'title', item: 'keyword', insert: 'title ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', item: 'keyword', insert: 'accDescr: ' },
  { kind: T.String, label: '"', item: 'value', detail: 'a section: "label" : value' },
  { kind: T.Colon, label: ':', item: 'operator', insert: ': ', detail: 'then the value' },
];

/** What may follow `pie` on its own line: `showData` and the title (the usual header). */
export const HEADER_LINE = new Set<number>([T.ShowData, T.Title]);

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
