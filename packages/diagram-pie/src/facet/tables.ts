/**
 * The pie facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are not
 * here: they come from the grammar file (`generated/docs.ts`).
 */
import { T } from '../parser/tokens.ts';
import type { TypedKeywordItem as KeywordItem } from '@mermaid-js/shared/parser/facet';
export type { TypedKeywordItem as KeywordItem } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

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
