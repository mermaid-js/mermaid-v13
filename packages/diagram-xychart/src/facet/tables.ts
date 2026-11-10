/**
 * The XY chart facet's completion and hover tables (DESIGN §4.5, D95): what each expected
 * keyword kind is offered as, and the small text helpers both read. Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';
import { span } from '@mermaid-js/core/parser-kit/facet';
import type { DetailedKeywordItem as KeywordItem } from '@mermaid-js/core/parser-kit/facet';
export type { DetailedKeywordItem as KeywordItem } from '@mermaid-js/core/parser-kit/facet';
export { plural } from '@mermaid-js/core/parser-kit/facet';
export { trimmed } from '@mermaid-js/core/parser-kit/facet';
export { tokenBefore } from '@mermaid-js/core/parser-kit/facet';
export { span } from '@mermaid-js/core/parser-kit/facet';
export { code } from '@mermaid-js/core/parser-kit/facet';

/** The header keyword (`xychart-beta` is still read, but not offered). */
export const HEADER: KeywordItem = { kind: T.XyChart, label: 'xychart' };

/** The orientations, right after the header. */
export const ORIENTATIONS: readonly KeywordItem[] = [
  { kind: T.ChartOrientation, label: 'vertical', detail: 'default' },
  { kind: T.ChartOrientation, label: 'horizontal' },
];

/** Statement keywords, offered at the start of a line, in this order. */
export const STATEMENTS: readonly KeywordItem[] = [
  { kind: T.Title, label: 'title', insert: 'title ' },
  { kind: T.XAxis, label: 'x-axis', insert: 'x-axis ' },
  { kind: T.YAxis, label: 'y-axis', insert: 'y-axis ' },
  { kind: T.Bar, label: 'bar', insert: 'bar ' },
  { kind: T.Line, label: 'line', insert: 'line ' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.AccDescrMultilineValue, label: 'accDescr {', insert: 'accDescr {' },
];
