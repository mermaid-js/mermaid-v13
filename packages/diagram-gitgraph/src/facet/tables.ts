/**
 * The gitGraph facet's completion tables and shared helpers (DESIGN §4.5, D95). Keyword docs
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
  /** What follows the label when the text after it holds no blank (`branch `, `id: `). */
  readonly separator?: string;
  readonly detail?: string;
}

/** The header, offered where the parser expects it (an empty text). */
export const HEADER_ITEMS: readonly KeywordItem[] = [
  { kind: T.GitGraph, label: 'gitGraph', item: 'keyword' },
  { kind: T.GitGraph, label: 'gitGraph LR:', item: 'keyword', detail: 'left to right' },
  { kind: T.GitGraph, label: 'gitGraph TB:', item: 'keyword', detail: 'top to bottom' },
  { kind: T.GitGraph, label: 'gitGraph BT:', item: 'keyword', detail: 'bottom to top' },
];

/** After `gitGraph` on its line: a direction and its colon. */
export const DIRECTION_ITEMS: readonly KeywordItem[] = [
  { kind: T.LR, label: 'LR:', item: 'constant', detail: 'left to right' },
  { kind: T.TB, label: 'TB:', item: 'constant', detail: 'top to bottom' },
  { kind: T.BT, label: 'BT:', item: 'constant', detail: 'bottom to top' },
];

/** The colon after a direction. */
export const COLON_ITEM: KeywordItem = { kind: T.Colon, label: ':', item: 'operator' };

/** The statements, in the order completion offers them. */
export const STATEMENT_ITEMS: readonly KeywordItem[] = [
  { kind: T.Commit, label: 'commit', item: 'keyword' },
  { kind: T.Branch, label: 'branch', item: 'keyword', separator: ' ' },
  { kind: T.Merge, label: 'merge', item: 'keyword', separator: ' ' },
  { kind: T.Checkout, label: 'checkout', item: 'keyword', separator: ' ' },
  { kind: T.Switch, label: 'switch', item: 'keyword', separator: ' ' },
  { kind: T.CherryPick, label: 'cherry-pick', item: 'keyword', separator: ' ' },
  { kind: T.Title, label: 'title', item: 'keyword', separator: ' ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', separator: ': ' },
  { kind: T.AccDescr, label: 'accDescr', item: 'keyword', separator: ': ' },
];

/** The options of `commit`, `merge`, `cherry-pick` and `branch`, offered where expected. */
export const OPTION_ITEMS: readonly KeywordItem[] = [
  { kind: T.Id, label: 'id:', item: 'keyword', separator: ' ' },
  { kind: T.Msg, label: 'msg:', item: 'keyword', separator: ' ' },
  { kind: T.Parent, label: 'parent:', item: 'keyword', separator: ' ' },
  { kind: T.Tag, label: 'tag:', item: 'keyword', separator: ' ' },
  { kind: T.Type, label: 'type:', item: 'keyword', separator: ' ' },
  { kind: T.Order, label: 'order:', item: 'keyword', separator: ' ' },
];

/** The commit types after `type:`. */
export const TYPE_ITEMS: readonly KeywordItem[] = [
  { kind: T.Normal, label: 'NORMAL', item: 'constant' },
  { kind: T.Reverse, label: 'REVERSE', item: 'constant' },
  { kind: T.Highlight, label: 'HIGHLIGHT', item: 'constant' },
];

/**
 * Tokens that hold the text after their keyword (`title Release`, `accTitle: …`): hover
 * explains the keyword only.
 */
export const TEXT_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/**
 * `value` as a quoted text that reads back as it (`\` escapes the next character): in
 * `prefer` (`"` or `'`), else in the other quote when the value holds `prefer`, else in
 * `prefer` with escapes.
 */
export function quoted(value: string, prefer = '"'): string {
  const other = prefer === '"' ? "'" : '"';
  const plain = !value.includes('\\');
  if (plain && !value.includes(prefer)) return `${prefer}${value}${prefer}`;
  if (plain && !value.includes(other)) return `${other}${value}${other}`;
  return `${prefer}${value.replace(/[\\"']/g, (c) => `\\${c}`)}${prefer}`;
}
