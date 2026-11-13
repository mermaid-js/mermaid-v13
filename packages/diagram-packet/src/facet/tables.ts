/**
 * The packet facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { CompletionKind } from '@mermaid-js/core/parser-kit';
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

/**
 * Everything completion offers, in the order it is offered, but the next start bit (an `Int`,
 * whose label depends on the fields above the cursor).
 */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.Packet, label: 'packet', item: 'keyword' },
  { kind: T.Title, label: 'title', item: 'keyword', insert: 'title ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', item: 'keyword', insert: 'accDescr: ' },
  { kind: T.Plus, label: '+', item: 'operator', detail: 'a width in bits: +8: "label"' },
  { kind: T.Colon, label: ':', item: 'operator', insert: ': ', detail: 'then the label' },
  { kind: T.String, label: '"', item: 'value', detail: 'a label: "Source Port"' },
];

/** What may follow `packet` on its own line: the title (the usual header). */
export const HEADER_LINE = new Set<number>([T.Title]);
