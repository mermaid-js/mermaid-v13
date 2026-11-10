// The block diagram's text metrics (D449), in cells: every length the text grid and the router
// use, per `ascii.padding` preset. `block.padding` is px geometry and is never read here.
import type { CellPadding } from '@mermaid-js/core/layout';

export interface TextSpacing {
  /** Cells between a box's side and its label. */
  readonly padX: number;
  /** Blank lines above and below a label inside its box. */
  readonly padY: number;
  /** Cells between two grid columns: room for a line, a turn and an arrowhead. */
  readonly gapX: number;
  /** Lines between two grid rows. */
  readonly gapY: number;
  /** Cells between a composite's frame and its grid, across and down. */
  readonly marginX: number;
  readonly marginY: number;
}

export const BLOCK_TEXT_METRICS = {
  spacing: {
    compact: { padX: 1, padY: 0, gapX: 4, gapY: 2, marginX: 2, marginY: 1 },
    roomy: { padX: 2, padY: 1, gapX: 6, gapY: 3, marginX: 3, marginY: 1 },
  } satisfies Record<CellPadding, TextSpacing>,
  /** The widest a label is drawn, in cells (D438's 40); a longer one is cut with `…`. */
  labelCap: 40,
  /** The narrowest `ascii.maxWidth` may cut a label to, the mark included. */
  minLabel: 2,
  /** A composite's frame around its title: corner, rule and a blank either side. */
  titleFrame: 6,
  /**
   * Blank cells around the drawing that lines may go round it in: `around`, and `perEdge` more
   * per lane, a lane for each edge up to `edges` of them, past that the edges' square root
   * (`draw.ts` `margin`: each line round the outside takes a lane).
   */
  around: 2,
  perEdge: 2,
  edges: 10,
  /** Router costs on top of one a cell: a bend, crossing a frame, crossing another line. */
  turn: 3,
  frame: 2,
  cross: 2,
  /** A port's cost per cell off the middle of its side (well under one cell). */
  offMiddle: 0.01,
  /** Margins the search window grows by around an edge's two boxes; the last is everything. */
  windows: [4, 12, Infinity] as readonly number[],
  /** The most states one search expands before it gives up. */
  maxSearch: 200_000,
  /** How far from its line an edge label is looked for when the line has no room for it. */
  labelReach: 10,
} as const;
