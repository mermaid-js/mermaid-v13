/**
 * The flowchart facet's completion tables (DESIGN §4.5, D95): what each expected token kind is
 * offered as. Keyword docs are not here: they come from the grammar file (`generated/docs.ts`);
 * the tables flowchart shares with the grammars cut from it are the flow family's
 * (`@mermaid-js/shared/parser/flow-facet`).
 */
import { flowKeywordItems } from '@mermaid-js/shared/parser/flow-facet';
import { T } from '../parser/tokens.ts';

/** Statement and clause keywords, in the order they are offered. */
export const KEYWORDS = /* @__PURE__ */ flowKeywordItems(T, [
  { kind: T.Graph, label: 'flowchart' },
  { kind: T.Graph, label: 'graph' },
  { kind: T.Graph, label: 'flowchart-elk' },
  { kind: T.Graph, label: 'swimlane-beta' },
  { kind: T.Subgraph, label: 'subgraph' },
]);

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
