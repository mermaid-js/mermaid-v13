/**
 * The state facet's tables (DESIGN §4.5, D95): what each expected token kind is offered as,
 * and the helpers completion and hover share. Keyword docs are not here: they come from the
 * grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';
import type { KeywordItem } from '@mermaid-js/core/parser-kit/facet';
export type { KeywordItem } from '@mermaid-js/core/parser-kit/facet';
export { plural } from '@mermaid-js/core/parser-kit/facet';
export { tokenBefore } from '@mermaid-js/core/parser-kit/facet';
export { span } from '@mermaid-js/core/parser-kit/facet';
export { code } from '@mermaid-js/core/parser-kit/facet';

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
