/**
 * The C4 grid (D454): v12's model, each
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
 *
 * A `direction` (#730, amending D452) sets the fill order of a group's contents. In TB, the
 * default and the order above, a line is a row of `c4ShapeInRow`, its members run left to right
 * and the lines go down, with the child boundaries below the elements. In LR a line is a column:
 * its members run top to bottom, the lines go right and the child boundaries sit right of the
 * elements. BT and RL are TB and LR with the lines (and the elements against the child
 * boundaries) in the opposite order, so the first statement comes last. Gaps keep their
 * physical axis: a horizontal gap is the X one wherever it falls.
 */
import type { C4Boundary, C4Direction, C4Model } from '../model.ts';

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
  /**
   * How far below its top the middle of the part relations reach from the side lies, when that
   * is not its whole box (a person figure's body, D679). A row holding such a shape lines up
   * every member's middle of that part (another shape's own middle) instead of their tops.
   */
  readonly portMiddle?: number;
  /**
   * The least gap to the next member of its row, where labelled relations join the two (D679);
   * the row's own gap when that is wider.
   */
  gapAfter?: number;
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
  /** The fill order of its contents (TB when absent): its own `direction`, else its parent's. */
  direction?: C4Direction;
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
 * Gives each group its fill order (#730): its own `direction`, else its parent's, the top level's
 * the last one at the top level (TB when none). `order` has parents before children.
 */
export function setDirections(order: readonly GridGroup[], top: C4Direction | undefined): void {
  const byIndex = new Map(order.map((g) => [g.index, g]));
  for (const g of order) {
    const direction =
      g.boundary?.direction ?? (g.index < 0 ? top : byIndex.get(g.parent)?.direction);
    if (direction) g.direction = direction;
  }
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
  /** Between members of a line, and between lines (each on its physical axis). */
  readonly gapX: number;
  readonly gapY: number;
  /** How far lines after the first move along the members' axis (back when negative). */
  readonly indent: number;
}

/** What a fill order does: which axis the members run on, and whether the lines go back. */
interface Flow {
  /** LR and RL: a line is a column. */
  readonly columns: boolean;
  /** BT and RL: the first line comes last. */
  readonly reversed: boolean;
}

const FLOWS: Readonly<Record<C4Direction, Flow>> = {
  TB: { columns: false, reversed: false },
  BT: { columns: false, reversed: true },
  LR: { columns: true, reversed: false },
  RL: { columns: true, reversed: true },
};

/** A group's fill order. */
const flowOf = (group: GridGroup): Flow => FLOWS[group.direction ?? 'TB'];

/**
 * Places boxes in lines from (0, 0): the members left to right in rows (TB), or top to bottom
 * in columns (LR); a reversed flow puts the lines in the opposite order (BT reverses the rows,
 * RL mirrors the columns). Returns the width and height they take.
 */
function rows(boxes: readonly GridBox[], layout: Rows, flow: Flow): [number, number] {
  if (!flow.columns) return horizontal(boxes, layout, flow.reversed);
  const size = columns(boxes, layout);
  if (flow.reversed) mirror(boxes, size);
  return size;
}

/** A row's members, `from` to `to` (exclusive), and the line they line up on. */
interface Line {
  readonly from: number;
  readonly to: number;
  /** How far below the row's top the members' port middles lie; undefined: tops line up. */
  readonly middle: number | undefined;
  readonly h: number;
}

/** A member's port middle below its top: its own middle unless it says otherwise. */
const middleOf = (box: GridBox): number => (box as GridNode).portMiddle ?? box.h / 2;

/**
 * The row from `from`: its members line up their tops, or, when one has a port middle of its
 * own (a person, D679), their port middles; it is as tall as that makes it.
 */
function lineAt(boxes: readonly GridBox[], from: number, to: number): Line {
  const members = boxes.slice(from, to);
  const aligned = members.some((b) => (b as GridNode).portMiddle !== undefined);
  const middle = aligned ? Math.max(...members.map(middleOf)) : undefined;
  const h = Math.max(
    0,
    ...members.map((b) => (middle === undefined ? 0 : middle - middleOf(b)) + b.h)
  );
  return { from, to, middle, h };
}

/**
 * The members of each line run left to right, each `gapX` (or its own `gapAfter`) from the
 * next, and the lines go down, or up when `reversed`. In a reversed row whose tops line up, a
 * box shorter than its row sits at the row's bottom, as mirrored rows did.
 */
function horizontal(
  boxes: readonly GridBox[],
  { perRow, gapX, gapY, indent }: Rows,
  reversed = false
): [number, number] {
  // A negative indent moves the first row right instead, so no row starts left of 0.
  const least = boxes.length > perRow ? Math.min(0, indent) : 0;
  const lines: Line[] = [];
  let width = 0;
  for (let from = 0; from < boxes.length; from += perRow) {
    const to = Math.min(boxes.length, from + perRow);
    width = Math.max(width, placeAcross(boxes, from, to, (from === 0 ? 0 : indent) - least, gapX));
    lines.push(lineAt(boxes, from, to));
  }
  let y = 0;
  for (const line of reversed ? [...lines].reverse() : lines) {
    for (let i = line.from; i < line.to; i++) boxes[i]!.y = y + offsetIn(line, boxes[i]!, reversed);
    y += line.h + gapY;
  }
  return [width, boxes.length > 0 ? y - gapY : 0];
}

/** Places a row's members across from `x`; returns where its last one ends. */
function placeAcross(
  boxes: readonly GridBox[],
  from: number,
  to: number,
  x: number,
  gapX: number
): number {
  let at = x;
  for (let i = from; i < to; i++) {
    const box = boxes[i]!;
    box.x = at;
    at += box.w + (i + 1 < to ? Math.max(gapX, (box as GridNode).gapAfter ?? 0) : 0);
  }
  return at;
}

/** A member's distance below its row's top. */
function offsetIn(line: Line, box: GridBox, reversed: boolean): number {
  if (line.middle !== undefined) return line.middle - middleOf(box);
  return reversed ? line.h - box.h : 0;
}

/** `horizontal` with the axes swapped: members top to bottom, lines going right. */
function columns(boxes: readonly GridBox[], layout: Rows): [number, number] {
  const swapped = boxes.map((box) => ({ x: box.y, y: box.x, w: box.h, h: box.w }));
  const [height, width] = horizontal(swapped, {
    ...layout,
    gapX: layout.gapY,
    gapY: layout.gapX,
  });
  boxes.forEach((box, i) => {
    box.x = swapped[i]!.y;
    box.y = swapped[i]!.x;
  });
  return [width, height];
}

/**
 * The columns in the opposite order: the boxes mirrored across within the run's own extent (a
 * box narrower than its column ends up at the column's far side).
 */
function mirror(boxes: readonly GridBox[], [width]: [number, number]): void {
  for (const box of boxes) box.x = width - box.x - box.w;
}

/** Where a group's elements and its child boundaries start inside its contents' area. */
interface Offsets {
  readonly nodesX: number;
  readonly nodesY: number;
  readonly kidsX: number;
  readonly kidsY: number;
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
  const offsets = new Map<GridGroup, Offsets>();
  for (let i = order.length - 1; i >= 0; i--) sizeGroup(order[i]!, s, header, offsets);
  for (const group of order) {
    const top = group.index < 0;
    const left = group.x + (top ? 0 : s.pad);
    const first = group.y + (top ? 0 : group.head + s.pad);
    const at = offsets.get(group)!;
    for (const node of group.nodes) {
      node.x += left + at.nodesX;
      node.y += first + at.nodesY;
    }
    for (const kid of group.kids) {
      kid.x += left + at.kidsX;
      kid.y += first + at.kidsY;
      kid.depth = group.depth + 1;
    }
  }
}

/**
 * Places a group's elements and then its child boundaries in lines, sizes the group around them
 * (the contents of a TB or BT group stack down, those of an LR or RL group side by side), and
 * records where each part starts.
 */
function sizeGroup(
  group: GridGroup,
  s: GridSpacing,
  header: (group: GridGroup, contentWidth: number) => void,
  offsets: Map<GridGroup, Offsets>
): void {
  const flow = flowOf(group);
  const [gridW, gridH] = rows(
    group.nodes,
    { perRow: s.shapeInRow, gapX: s.shapeGapX, gapY: s.shapeGapY, indent: s.nextLinePaddingX },
    flow
  );
  const [kidsW, kidsH] = rows(
    group.kids,
    { perRow: s.boundaryInRow, gapX: s.groupGapX, gapY: s.groupGapY, indent: 0 },
    flow
  );
  const gap = flow.columns ? s.groupGapX : s.groupGapY;
  const nodesSize = flow.columns ? gridW : gridH;
  const kidsSize = flow.columns ? kidsW : kidsH;
  const between = nodesSize > 0 && kidsSize > 0 ? gap : 0;
  offsets.set(group, partOffsets(flow, nodesSize + between, kidsSize + between));
  const contentW = flow.columns ? gridW + between + kidsW : Math.max(gridW, kidsW);
  if (group.index < 0) {
    group.w = contentW;
    group.h = flow.columns ? Math.max(gridH, kidsH) : gridH + between + kidsH;
    return;
  }
  header(group, contentW);
  group.w = Math.max(contentW + 2 * s.pad, group.headW + 2 * s.headPadX);
  group.h = flow.columns
    ? group.head + s.pad + Math.max(gridH, kidsH) + s.pad
    : group.head + s.pad + gridH + between + kidsH + s.pad;
}

/**
 * The starts of the elements and the child boundaries: the boundaries after the elements in TB
 * and LR, before them in BT and RL. `afterNodes` and `afterKids` are each part's size and the
 * gap.
 */
function partOffsets(flow: Flow, afterNodes: number, afterKids: number): Offsets {
  const [nodes, kids] = flow.reversed ? [afterKids, 0] : [0, afterNodes];
  return flow.columns
    ? { nodesX: nodes, nodesY: 0, kidsX: kids, kidsY: 0 }
    : { nodesX: 0, nodesY: nodes, kidsX: 0, kidsY: kids };
}
