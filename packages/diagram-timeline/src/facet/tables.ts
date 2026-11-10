/**
 * The timeline facet's completion tables and shared helpers (DESIGN §4.5, D95). Keyword docs
 * are not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { CompletionKind, Range } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';
export { lineBefore } from '@mermaid-js/core/parser-kit/facet';
export { span } from '@mermaid-js/core/parser-kit/facet';
export { code } from '@mermaid-js/core/parser-kit/facet';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  /** What follows the label when the text after it holds none (`section `, `accTitle: `). */
  readonly separator?: string;
  /** The token kinds the inserted text may lex as, when not just `kind`. */
  readonly reads?: readonly number[];
  readonly detail?: string;
}

/** The header, offered where the parser expects it (an empty text). */
export const HEADER_ITEMS: readonly KeywordItem[] = [
  { kind: T.Timeline, label: 'timeline', item: 'keyword' },
  { kind: T.TimelineLR, label: 'timeline LR', item: 'keyword', detail: 'left to right' },
  { kind: T.TimelineTD, label: 'timeline TD', item: 'keyword', detail: 'top to bottom' },
];

/** The statements completion offers, in the order it offers them. */
export const STATEMENT_ITEMS: readonly KeywordItem[] = [
  { kind: T.Title, label: 'title', item: 'keyword', separator: ' ' },
  { kind: T.Section, label: 'section', item: 'keyword', separator: ' ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', separator: ': ' },
  {
    kind: T.AccDescr,
    label: 'accDescr',
    item: 'keyword',
    separator: ': ',
    reads: [T.AccDescr, T.AccDescrMultiline],
  },
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
