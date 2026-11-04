/**
 * The state facet's tables (DESIGN §4.5, D95): what each expected token kind is offered as,
 * and the helpers completion and hover share. Keyword docs are not here: they come from the
 * grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
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
  { kind: T.CompositeState, label: 'state' },
  { kind: T.Note, label: 'note' },
  { kind: T.ClassDef, label: 'classDef' },
  { kind: T.Class, label: 'class' },
  { kind: T.Style, label: 'style' },
  { kind: T.DirectionTB, label: 'direction TB' },
  { kind: T.DirectionBT, label: 'direction BT' },
  { kind: T.DirectionLR, label: 'direction LR' },
  { kind: T.DirectionRL, label: 'direction RL' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.Click, label: 'click' },
  { kind: T.HideEmpty, label: 'hide empty description' },
  { kind: T.Scale, label: 'scale' },
];

/** The two headers (D101: one package, both keywords). */
export const HEADERS = ['stateDiagram-v2', 'stateDiagram'];

/** Directions and what they mean (state has no `TD`). */
export const DIRECTIONS: readonly (readonly [dir: string, meaning: string])[] = [
  ['TB', 'top to bottom'],
  ['BT', 'bottom to top'],
  ['LR', 'left to right'],
  ['RL', 'right to left'],
];

/** Pseudo-state markers after `state <name> `, both spellings. */
export const MARKERS: readonly (readonly [angle: string, square: string, kind: string])[] = [
  ['<<fork>>', '[[fork]]', 'fork'],
  ['<<join>>', '[[join]]', 'join'],
  ['<<choice>>', '[[choice]]', 'choice'],
];

/** What a state of each model kind is called. */
export const KIND_NAMES: Readonly<Record<string, string>> = {
  plain: 'state',
  composite: 'composite state',
  fork: 'fork pseudo-state',
  join: 'join pseudo-state',
  choice: 'choice pseudo-state',
  start: 'start state',
  end: 'end state',
};

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
