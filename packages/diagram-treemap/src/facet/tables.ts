/**
 * The treemap facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { TypedKeywordItem } from '@mermaid-js/shared/parser/facet';
import { T } from '../parser/tokens.ts';
export { inside } from '@mermaid-js/shared/parser/facet';
export { tokenBefore } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/** Where an item is offered, besides the parser expecting its kind. */
export type ItemPlace = 'header' | 'lineStart' | 'afterName';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem extends TypedKeywordItem {
  readonly place: ItemPlace;
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
