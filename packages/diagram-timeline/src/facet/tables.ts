/**
 * The timeline facet's completion tables and shared helpers (DESIGN §4.5, D95). Keyword docs
 * are not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { CompletionKind, Range } from '@mermaid-js/core/parser-kit';
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

/** What may start a line: the header, then the statements, in the order they are offered. */
export const LINE_ITEMS: readonly KeywordItem[] = [
  { kind: T.Timeline, label: 'timeline', item: 'keyword' },
  { kind: T.TimelineLR, label: 'timeline LR', item: 'keyword', detail: 'left to right' },
  { kind: T.TimelineTD, label: 'timeline TD', item: 'keyword', detail: 'top to bottom' },
  { kind: T.Title, label: 'title', item: 'keyword', insert: 'title ' },
  { kind: T.Section, label: 'section', item: 'keyword', insert: 'section ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', item: 'keyword', insert: 'accDescr: ' },
];

/** After `timeline` on its line: the direction words (`timeline LR` is one token). */
export const DIRECTION_ITEMS: readonly KeywordItem[] = [
  { kind: T.TimelineLR, label: 'LR', item: 'constant', detail: 'left to right' },
  { kind: T.TimelineTD, label: 'TD', item: 'constant', detail: 'top to bottom' },
];

/**
 * Tokens that hold the text after their keyword (`title History`, `section Web`): hover
 * explains the keyword only.
 */
export const TEXT_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.Section]: 'section',
};

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** The text of `at`'s line before `at`. */
export function lineBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && !/[\n\r]/.test(text.charAt(start - 1))) start--;
  return text.slice(start, at);
}
