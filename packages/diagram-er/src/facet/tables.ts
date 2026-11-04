/**
 * The ER facet's completion and hover tables (DESIGN §4.5, D95): what each expected token kind
 * is offered as, and what cardinalities, lines and keys mean. Keyword docs are not here: they
 * come from the grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { ErCardinality, ErDirection } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';

/** A keyword item: offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
}

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

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
