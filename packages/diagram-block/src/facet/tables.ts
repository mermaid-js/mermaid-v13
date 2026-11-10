/**
 * The block facet's tables (DESIGN §4.5, D95). Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`). The shapes, links and directions are
 * v12's (`blockDB.ts` `typeStr2Type`, `edgeStrToEdgeData`, `blockArrowHelper`).
 */
import type { BlockType } from '../model.ts';

/**
 * The shapes a block id takes, in the order completion offers them: the opener and closer
 * around a quoted label, and the type v12 gives the pair. The block arrow takes directions
 * after its closer.
 */
export const SHAPES: readonly (readonly [open: string, close: string, type: BlockType])[] = [
  ['[', ']', 'square'],
  ['(', ')', 'round'],
  ['((', '))', 'circle'],
  ['(((', ')))', 'doublecircle'],
  ['([', '])', 'stadium'],
  ['[[', ']]', 'subroutine'],
  ['[(', ')]', 'cylinder'],
  ['{', '}', 'diamond'],
  ['{{', '}}', 'hexagon'],
  ['>', ']', 'rect_left_inv_arrow'],
  ['[/', '/]', 'lean_right'],
  ['[\\', '\\]', 'lean_left'],
  ['[/', '\\]', 'trapezoid'],
  ['[\\', '/]', 'inv_trapezoid'],
  ['<[', ']>(right)', 'block_arrow'],
];

/** How hover names each block type. */
export const TYPE_NAMES: Readonly<Record<BlockType, string>> = {
  na: 'square (no shape written)',
  square: 'square, `["…"]`',
  round: 'round, `("…")`',
  circle: 'circle, `(("…"))`',
  doublecircle: 'double circle, `((("…")))`',
  stadium: 'stadium, `(["…"])`',
  subroutine: 'subroutine, `[["…"]]`',
  cylinder: 'cylinder, `[("…")]`',
  diamond: 'diamond, `{"…"}`',
  hexagon: 'hexagon, `{{"…"}}`',
  rect_left_inv_arrow: 'flag, `>"…"]`',
  lean_right: 'leaning right, `[/"…"/]`',
  lean_left: 'leaning left, `[\\"…"\\]`',
  trapezoid: 'trapezoid, `[/"…"\\]`',
  inv_trapezoid: 'inverted trapezoid, `[\\"…"/]`',
  block_arrow: 'block arrow, `<["…"]>(…)`',
  composite: 'composite, `block:id … end`',
  space: 'space',
};

/**
 * The links completion offers, each with what it draws (any number of `-`, `=` or `.` works).
 * No `x--x` or `o--o`: after a blank the id rule comes first, so `a x--x b` is a block `x` and
 * a `--x` link.
 */
export const LINKS: readonly (readonly [link: string, detail: string])[] = [
  ['-->', 'line with an arrow head'],
  ['---', 'line with no head'],
  ['--x', 'line with a cross head'],
  ['--o', 'line with a circle head'],
  ['<-->', 'line with an arrow head at both ends'],
  ['==>', 'thick line with an arrow head'],
  ['===', 'thick line with no head'],
  ['<==>', 'thick line with an arrow head at both ends'],
  ['-.->', 'dotted line with an arrow head'],
  ['-.-', 'dotted line with no head'],
  ['<-.->', 'dotted line with an arrow head at both ends'],
];

/** A block arrow's directions (`blockArrowHelper`), each with where it points. */
export const DIRECTIONS: readonly (readonly [dir: string, detail: string])[] = [
  ['right', 'points right'],
  ['left', 'points left'],
  ['up', 'points up'],
  ['down', 'points down'],
  ['x', 'points left and right'],
  ['y', 'points up and down'],
];
