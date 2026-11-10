/**
 * The C4 grid (D454), ported from Pele's `src/diagrams/c4/layout.ts`
 * (https://github.com/obsidianmd/pele at commit 3a2f075, MIT, (c) 2026 kepano): v12's model, each
 * boundary's elements in rows of `c4ShapeInRow` in statement order and then the boundaries inside
 * it in rows of `c4BoundaryInRow`, each boundary sized bottom-up around its contents with its
 * header reserved inside its frame, then placed top-down.
 *
 * Changed in the port: v12's config lengths are the gaps and margins (elements `2·c4ShapeMargin`
 * apart, as v12's packer put them; boundaries `diagramMarginX` apart across and
 * `c4ShapeMargin + diagramMarginY` down; contents `c4ShapeMargin` inside a frame; rows after the
 * first `nextLinePaddingX` in), shapes keep their own height in a row as v12's did (Pele
 * stretched them), the header is v12's (centred; label, `[type]`, description at v12's offsets),
 * and a boundary on a parent cycle is drawn at the top level (D454) instead of not at all.
 */
// cspell:ignore kepano
import type { C4Boundary, C4Model } from '../model.ts';

/** A box the grid places: its size is set before, its top-left corner by the grid. */
export interface GridBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An element to place, sized. */
export interface GridNode extends GridBox {
  readonly index: number;
}

/** A boundary (or the top level, `index` -1) and what it holds. */
export interface GridGroup extends GridBox {
  readonly index: number;
  readonly boundary?: C4Boundary;
  readonly parent: number;
  depth: number;
  readonly kids: GridGroup[];
  readonly nodes: GridNode[];
  /** The header's height from the frame's top, and its width; set by `header`. */
  head: number;
  headW: number;
}

/** The gaps and margins the grid uses (from the `c4` config). */
export interface GridSpacing {
  readonly shapeGapX: number;
  readonly shapeGapY: number;
  readonly groupGapX: number;
  readonly groupGapY: number;
  /** Contents inside a frame, every side; the top below the header. */
  readonly pad: number;
  readonly nextLinePaddingX: number;
  readonly headPadX: number;
  readonly shapeInRow: number;
  readonly boundaryInRow: number;
}

/**
 * The top-level boundaries' parents with every parent cycle broken (D454): on each cycle, the
 * boundary first in the model is moved to the top level. Returns the parents and the boundaries
 * moved.
 */
export function brokenCycles(model: Pick<C4Model, 'boundaries'>): {
  parents: number[];
  moved: number[];
} {
  const n = model.boundaries.length;
  const parents = model.boundaries.map((b) => (b.parent >= 0 && b.parent < n ? b.parent : -1));
  // 0 unvisited, 1 on the walk now, 2 reaches the top level.
  const state = new Array<number>(n).fill(0);
  const moved: number[] = [];
  for (let start = 0; start < n; start++) {
    if (state[start] !== 0) continue;
    const walk: number[] = [];
    let at = start;
    while (at >= 0 && state[at] === 0) {
      state[at] = 1;
      walk.push(at);
      at = parents[at]!;
    }
    if (at >= 0 && state[at] === 1) {
      // `at` is on a cycle in this walk: move the first of it in the model to the top level.
      const cycle = walk.slice(walk.indexOf(at));
      const first = Math.min(...cycle);
      parents[first] = -1;
      moved.push(first);
    }
    for (const i of walk) state[i] = 2;
  }
  return { parents, moved };
}

/** How a run of boxes is put in rows. */
interface Rows {
  readonly perRow: number;
  readonly gapX: number;
  readonly gapY: number;
  /** How far rows after the first move right (left when negative). */
  readonly indent: number;
}

/** Places boxes left to right in rows from (0, 0); returns the width and height they take. */
function rows(boxes: readonly GridBox[], { perRow, gapX, gapY, indent }: Rows): [number, number] {
  // A negative indent moves the first row right instead, so no row starts left of 0.
  const least = boxes.length > perRow ? Math.min(0, indent) : 0;
  let width = 0;
  let y = 0;
  for (let from = 0, row = 0; from < boxes.length; from += perRow, row++) {
    const to = Math.min(boxes.length, from + perRow);
    let x = (row === 0 ? 0 : indent) - least;
    let rowH = 0;
    for (let i = from; i < to; i++) rowH = Math.max(rowH, boxes[i]!.h);
    for (let i = from; i < to; i++) {
      const box = boxes[i]!;
      box.x = x;
      box.y = y;
      x += box.w + gapX;
    }
    width = Math.max(width, x - gapX);
    y += rowH + gapY;
  }
  return [width, boxes.length > 0 ? y - gapY : 0];
}

/**
 * Lays out the groups: `order` is parents before children, `order[0]` the top level. `header`
 * measures a boundary's header for the width its contents take and sets `head` and `headW`.
 */
export function placeGrid(
  order: readonly GridGroup[],
  s: GridSpacing,
  header: (group: GridGroup, contentWidth: number) => void
): void {
  const kidsTop = new Map<GridGroup, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const group = order[i]!;
    const top = group.index < 0;
    const [gridW, gridH] = rows(group.nodes, {
      perRow: s.shapeInRow,
      gapX: s.shapeGapX,
      gapY: s.shapeGapY,
      indent: s.nextLinePaddingX,
    });
    const [kidsW, kidsH] = rows(group.kids, {
      perRow: s.boundaryInRow,
      gapX: s.groupGapX,
      gapY: s.groupGapY,
      indent: 0,
    });
    const between = gridH > 0 && kidsH > 0 ? s.groupGapY : 0;
    kidsTop.set(group, gridH + between);
    const contentW = Math.max(gridW, kidsW);
    if (top) {
      group.w = contentW;
      group.h = gridH + between + kidsH;
      continue;
    }
    header(group, contentW);
    group.w = Math.max(contentW + 2 * s.pad, group.headW + 2 * s.headPadX);
    group.h = group.head + s.pad + gridH + between + kidsH + s.pad;
  }
  for (const group of order) {
    const top = group.index < 0;
    const left = group.x + (top ? 0 : s.pad);
    const first = group.y + (top ? 0 : group.head + s.pad);
    for (const node of group.nodes) {
      node.x += left;
      node.y += first;
    }
    for (const kid of group.kids) {
      kid.x += left;
      kid.y += first + kidsTop.get(group)!;
      kid.depth = group.depth + 1;
    }
  }
}
