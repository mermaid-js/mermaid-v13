/**
 * The treemap facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { CompletionKind, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { TreemapDocument, TreemapStatementNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
export { inside } from '@mermaid-js/shared/parser/facet';
export { tokenBefore } from '@mermaid-js/shared/parser/facet';
export { span } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/** Where an item is offered, besides the parser expecting its kind. */
export type ItemPlace = 'header' | 'lineStart' | 'afterName';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  readonly place: ItemPlace;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  readonly detail?: string;
}

const statement = (kind: number, label: string, insert: string): KeywordItem => ({
  kind,
  label,
  item: 'keyword',
  place: 'lineStart',
  insert,
});

/** Everything completion offers but class names, in the order it is offered. */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.TreemapKeyword, label: 'treemap', item: 'keyword', place: 'header' },
  { kind: T.TreemapKeyword, label: 'treemap-beta', item: 'keyword', place: 'header' },
  statement(T.ClassDef, 'classDef', 'classDef '),
  statement(T.Title, 'title', 'title '),
  statement(T.AccTitle, 'accTitle', 'accTitle: '),
  // `accDescr` takes one line or a block: both forms are offered.
  statement(T.AccDescr, 'accDescr:', 'accDescr: '),
  statement(T.AccDescr, 'accDescr {', 'accDescr { }'),
  {
    kind: T.String,
    label: '"',
    item: 'value',
    place: 'lineStart',
    detail: 'a row: "Section", or "Leaf": value',
  },
  {
    kind: T.Separator,
    label: ':',
    item: 'operator',
    place: 'afterName',
    insert: ': ',
    detail: 'then the value: a leaf',
  },
  {
    kind: T.StyleSeparator,
    label: ':::',
    item: 'operator',
    place: 'afterName',
    detail: 'then a class name',
  },
];

/** The statement of `doc` whose range holds `offset` (its ends included), if any. */
export function statementAt(
  doc: TreemapDocument,
  offset: number
): TreemapStatementNode | undefined {
  const list = doc.children;
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid]?.range.start ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const n = list[found];
  return n && offset <= n.range.end ? n : undefined;
}
