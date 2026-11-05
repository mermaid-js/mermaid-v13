/**
 * The flowchart facet's completion tables (DESIGN §4.5, D95): what each expected token kind is
 * offered as. Keyword docs are not here: they come from the grammar file (`generated/docs.ts`).
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

/** Statement and clause keywords, in the order they are offered. */
export const KEYWORDS: readonly KeywordItem[] = [
  { kind: T.Graph, label: 'flowchart' },
  { kind: T.Graph, label: 'graph' },
  { kind: T.Graph, label: 'flowchart-elk' },
  { kind: T.Graph, label: 'swimlane-beta' },
  { kind: T.Subgraph, label: 'subgraph' },
  { kind: T.End, label: 'end' },
  { kind: T.Style, label: 'style' },
  { kind: T.ClassDef, label: 'classDef' },
  { kind: T.Class, label: 'class' },
  { kind: T.LinkStyle, label: 'linkStyle' },
  { kind: T.Click, label: 'click' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.DirectionTB, label: 'direction TB' },
  { kind: T.DirectionTD, label: 'direction TD' },
  { kind: T.DirectionBT, label: 'direction BT' },
  { kind: T.DirectionLR, label: 'direction LR' },
  { kind: T.DirectionRL, label: 'direction RL' },
  { kind: T.Default, label: 'default' },
  { kind: T.Interpolate, label: 'interpolate' },
  { kind: T.Href, label: 'href' },
  { kind: T.CallbackName, label: 'call' },
];

/** Header directions and what they mean (v12 reads `TD` as `TB`). */
export const DIRECTIONS: readonly (readonly [dir: string, meaning: string])[] = [
  ['TB', 'top to bottom'],
  ['TD', 'top down (same as TB)'],
  ['BT', 'bottom to top'],
  ['LR', 'left to right'],
  ['RL', 'right to left'],
];

/** `click … "url"` targets. */
export const LINK_TARGETS = ['_self', '_blank', '_parent', '_top'];

/** Arrow forms offered where a link may start. */
export const ARROWS = [
  '-->',
  '---',
  '-.->',
  '-.-',
  '==>',
  '===',
  '~~~',
  '--o',
  '--x',
  '<-->',
  'o--o',
  'x--x',
];

/** Bracket shapes: opener, closer and v12's name for the shape. */
export const BRACKET_SHAPES: readonly (readonly [open: string, close: string, name: string])[] = [
  ['[', ']', 'square'],
  ['(', ')', 'round'],
  ['([', '])', 'stadium'],
  ['[[', ']]', 'subroutine'],
  ['[(', ')]', 'cylinder'],
  ['((', '))', 'circle'],
  ['(((', ')))', 'doublecircle'],
  ['>', ']', 'odd'],
  ['{', '}', 'diamond'],
  ['{{', '}}', 'hexagon'],
  ['[/', '/]', 'lean_right'],
  ['[\\', '\\]', 'lean_left'],
  ['[/', '\\]', 'trapezoid'],
  ['[\\', '/]', 'inv_trapezoid'],
  ['(-', '-)', 'ellipse'],
];

/**
 * The rest of an arrow inside edge text, by how the link was opened (`--`, `==`, `-.`): the
 * forms v12's closing link patterns accept.
 */
export const CLOSERS: Readonly<Record<string, readonly string[]>> = {
  '--': ['-->', '---', '--o', '--x'],
  '==': ['==>', '===', '==o', '==x'],
  '-.': ['.->', '.-', '.-o', '.-x'],
};

/** Curve names (`linkStyle … interpolate`, edge `curve:`): the config schema's `flowchart.curve`. */
export const CURVES = [
  'basis',
  'bumpX',
  'bumpY',
  'cardinal',
  'catmullRom',
  'linear',
  'monotoneX',
  'monotoneY',
  'natural',
  'step',
  'stepAfter',
  'stepBefore',
  'rounded',
];

/** Keys of an edge's `@{ … }` data that the model reads, with the values it accepts. */
export const EDGE_DATA: Readonly<Record<string, readonly string[]>> = {
  animate: ['true', 'false'],
  animation: ['fast', 'slow'],
  curve: CURVES,
};

/** Keys of a node's `@{ … }` shape data that the model reads. */
export const NODE_DATA_KEYS = [
  'shape',
  'label',
  'labelType',
  'icon',
  'form',
  'pos',
  'img',
  'constraint',
  'w',
  'h',
];

/** What an arrow draws, from its type and stroke as the model records them. */
export function describeLink(type: string, stroke: string, length?: number): string {
  const base = type.replace(/^double_/, '');
  const head =
    {
      arrow_point: 'an arrow head',
      arrow_circle: 'a circle head',
      arrow_cross: 'a cross head',
      arrow_open: 'no head',
    }[base] ?? base;
  const where = type.startsWith('double_') ? ' at both ends' : '';
  const line = stroke === 'invisible' ? 'invisible link' : `${stroke} line`;
  const len = length !== undefined && length > 1 ? `, length ${length}` : '';
  return `${line} with ${head}${where}${len}`;
}

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

/** `range` widened to the end of `[start, end)`. */
export const span = (start: number, end: number): Range => ({ start, end });
