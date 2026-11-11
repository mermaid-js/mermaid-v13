/**
 * The ER facet's completion and hover tables (DESIGN §4.5, D95): what each expected token kind
 * is offered as, and what cardinalities, lines and keys mean. Keyword docs are not here: they
 * come from the grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { ErCardinality, ErDirection } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';
import type { KeywordItem } from '@mermaid-js/shared/parser/facet';
export type { KeywordItem } from '@mermaid-js/shared/parser/facet';
export { plural } from '@mermaid-js/shared/parser/facet';
export { tokenBefore } from '@mermaid-js/shared/parser/facet';
export { span } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/** Statement keywords, in the order they are offered. */
export const KEYWORDS: readonly KeywordItem[] = [
  { kind: T.ErDiagram, label: 'erDiagram' },
  { kind: T.Subgraph, label: 'subgraph' },
  { kind: T.End, label: 'end' },
  { kind: T.Style, label: 'style' },
  { kind: T.ClassDef, label: 'classDef' },
  { kind: T.Class, label: 'class' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.DirectionTB, label: 'direction TB' },
  { kind: T.DirectionBT, label: 'direction BT' },
  { kind: T.DirectionLR, label: 'direction LR' },
  { kind: T.DirectionRL, label: 'direction RL' },
];

/** Directions and what they mean. */
export const DIRECTIONS: readonly (readonly [dir: ErDirection, meaning: string])[] = [
  ['TB', 'top to bottom'],
  ['BT', 'bottom to top'],
  ['LR', 'left to right'],
  ['RL', 'right to left'],
];

export const DIRECTION_KINDS: Readonly<Record<number, ErDirection>> = {
  [T.DirectionTB]: 'TB',
  [T.DirectionBT]: 'BT',
  [T.DirectionLR]: 'LR',
  [T.DirectionRL]: 'RL',
};

/** What each cardinality allows, as hover and completion details say it. */
export const CARDINALITY_MEANING: Readonly<Record<ErCardinality, string>> = {
  zeroOrOne: 'zero or one',
  zeroOrMore: 'zero or more',
  oneOrMore: 'one or more',
  onlyOne: 'exactly one',
  mdParent: 'the parent of a parent–child relationship',
};

export const CARDINALITY_KINDS: Readonly<Record<number, ErCardinality>> = {
  [T.ZeroOrOne]: 'zeroOrOne',
  [T.ZeroOrMore]: 'zeroOrMore',
  [T.OneOrMore]: 'oneOrMore',
  [T.OnlyOne]: 'onlyOne',
  [T.MdParent]: 'mdParent',
};

/** Cardinality symbols written before the line (`A |o--`), as the lexer reads them. */
export const LEFT_ENDS: readonly (readonly [symbol: string, card: ErCardinality])[] = [
  ['||', 'onlyOne'],
  ['|o', 'zeroOrOne'],
  ['}|', 'oneOrMore'],
  ['}o', 'zeroOrMore'],
];

/** Cardinality symbols written after the line (`--o{ B`). */
export const RIGHT_ENDS: readonly (readonly [symbol: string, card: ErCardinality])[] = [
  ['||', 'onlyOne'],
  ['o|', 'zeroOrOne'],
  ['|{', 'oneOrMore'],
  ['o{', 'zeroOrMore'],
];

/** Lines between the two cardinalities. */
export const LINES: readonly (readonly [line: string, identifying: boolean])[] = [
  ['--', true],
  ['..', false],
];

export const describeLine = (identifying: boolean): string =>
  identifying ? 'identifying (solid line)' : 'non-identifying (dashed line)';

/** Attribute keys and what they mean. */
export const KEYS: readonly (readonly [key: string, meaning: string])[] = [
  ['PK', 'primary key'],
  ['FK', 'foreign key'],
  ['UK', 'unique key'],
];
