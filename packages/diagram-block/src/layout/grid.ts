/**
 * v12's block grid (`fa796a943:…/block/layout.ts`), linear in blocks and depth: sizes, then
 * centres, of a tree of blocks whose leaves are already measured. Pure: it reads the tree and
 * `padding`, and writes each node's `w`, `h`, `x` and `y` (v12's `block.size`).
 *
 * **Sizes.** v12's `setBlockSizes(block, siblingWidth, siblingHeight)` sizes a container from its
 * children's sizes: each non-space child's width per column (`w / span`) and height, their
 * largest `maxW × maxH`; every child set to its cell, `span · maxW + (span − 1) · padding` by
 * `maxH`; the container `xSize · (maxW + padding) + padding` by
 * `ySize · (maxH + padding) + padding` (`xSize` is `columns` when set and below the total span, else the child count;
 * `ySize = ⌈total span / xSize⌉`); then stretched where it is narrower than `siblingWidth`
 * (children evened out over the sibling size) or than its own width (children widened). It
 * calls itself on every child twice, once with no sibling size before the cells are set and once
 * with `maxW × maxH` after, so a block at depth d is sized 2^d times, and the repeats are not
 * idempotent (a spanning child grows by `padding · (span − 1) / span` each time). The grid
 * replays those calls, but sizes a block with children at most `maxSizings` times, which keeps
 * it linear and v12's numbers wherever composites nest at most log2(`maxSizings`) deep
 * (GAPS #555).
 *
 * **Centres.** v12's `layoutBlocks`, unchanged: children packed left to right by width from the
 * container's left edge (`−padding` when its centre is at 0, v12's falsy test), wrapping by
 * `columns`, with per-row heights; a block wider than the rest of its row keeps its width and
 * the next one starts a row.
 *
 * D444: a labelled composite has a band of `band` px above its grid; the grid's heights and
 * centres are below it. With no band the numbers are v12's.
 */

/** One block of the grid: what v12's layout reads and writes on a `Block`. */
export interface GridNode {
  /** v12's `type` as far as the grid reads it: spaces are skipped when sizing columns. */
  readonly space: boolean;
  /** v12 `widthInColumns`. */
  readonly span: number;
  /** v12 `columns`: -1 (or undefined) for auto. */
  readonly columns?: number;
  /** A labelled composite's label band (D444), 0 otherwise. */
  readonly band: number;
  readonly children: readonly GridNode[];
  /** The size: the measured size of a leaf before the grid runs, its cell after. */
  w: number;
  h: number;
  /** The centre, set by {@link placeGrid}. */
  x: number;
  y: number;
}

/** v12 `calculateBlockPosition`: the column and row of grid position `position`. */
export function gridPosition(columns: number, position: number): { px: number; py: number } {
  if (columns <= 0) return { px: position, py: 0 };
  if (columns === 1) return { px: 0, py: position };
  return { px: position % columns, py: Math.floor(position / columns) };
}

/**
 * The grid position after a child of `span` columns at `position` (v12's `columnsFilled`): with
 * `columns`, a child wider than the rest of its row takes only the rest, so the next one starts
 * a row.
 */
export function gridAdvance(columns: number, position: number, span: number): number {
  return position + (columns > 0 ? Math.min(span, columns - (position % columns)) : span);
}

/** v12 `getMaxChildSize`: the widest width per column and the tallest height. */
function maxChildSize(node: GridNode): { mW: number; mH: number } {
  let mW = 0;
  let mH = 0;
  for (const child of node.children) {
    if (child.space) continue;
    const perColumn = child.w / child.span;
    if (perColumn > mW) mW = perColumn;
    if (child.h > mH) mH = child.h;
  }
  return { mW, mH };
}

/** v12's cells: each child `span · maxW + (span − 1) · padding` by `maxH`. */
function setCells(node: GridNode, mW: number, mH: number, padding: number): void {
  for (const child of node.children) {
    child.w = mW * child.span + padding * (child.span - 1);
    child.h = mH;
  }
}

interface FinishParts {
  readonly node: GridNode;
  /** The container's own widest width per column and tallest height. */
  readonly max: { readonly mW: number; readonly mH: number };
  /** Its parent's (v12's `siblingWidth`, `siblingHeight`). */
  readonly sibling: { readonly mW: number; readonly mH: number };
  readonly padding: number;
}

/**
 * The end of v12's `setBlockSizes` on a container: its own size from `maxW × maxH`, stretched
 * to `siblingWidth × siblingHeight` when narrower (the children evened out), then to its own
 * width before the call when narrower still (the children widened).
 */
function finish({ node, max, sibling, padding }: FinishParts): void {
  const { mW, mH } = max;
  const { mW: sw, mH: sh } = sibling;
  const columns = node.columns ?? -1;
  const kids = node.children;
  let numItems = 0;
  for (const child of kids) numItems += child.span;
  const xSize = columns > 0 && columns < numItems ? columns : kids.length;
  const ySize = Math.ceil(numItems / xSize);
  let width = xSize * (mW + padding) + padding;
  let height = ySize * (mH + padding) + padding + node.band;
  if (width < sw) {
    width = sw;
    height = sh;
    const cw = (sw - xSize * padding - padding) / xSize;
    // Never below 0 (D445): a label band (D444) taller than the sibling height leaves no room.
    const ch = Math.max(0, (sh - node.band - ySize * padding - padding) / ySize);
    for (const child of kids) {
      child.w = cw;
      child.h = ch;
    }
  }
  if (width < (node.w || 0)) {
    width = node.w || 0;
    const num = columns > 0 ? Math.min(kids.length, columns) : kids.length;
    const cw = (width - num * padding - padding) / num;
    for (const child of kids) child.w = cw;
  }
  node.w = width;
  node.h = height;
}

/** The tree in pre-order (parents before children), without recursion. */
function preOrder(root: GridNode): GridNode[] {
  const out: GridNode[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
  }
  return out;
}

/** One `setBlockSizes` call in progress: the explicit stack's frame. */
interface Sizing {
  readonly node: GridNode;
  readonly sibling: { readonly mW: number; readonly mH: number };
  /** The next child to size, and whether the cells are set (the second round of calls). */
  next: number;
  second: boolean;
  /** The container's own widest width per column and tallest height, once the cells are set. */
  max: { mW: number; mH: number };
}

/**
 * Sizes every block of the tree under `root`: v12's `setBlockSizes(root)`, call for call, with
 * an explicit stack, except that a block with children is sized at most `maxSizings` times.
 * v12 sizes a block at depth d (the root's children at 1) 2^d times, so the two agree wherever
 * composites nest at most log2(`maxSizings`) deep; past that, a block keeps what its first
 * `maxSizings` sizings gave it. Each sizing costs its children, so the whole is linear in
 * blocks and depth. A leaf's calls (the size given by its sibling when it has none) are never
 * skipped.
 */
export function sizeGrid(root: GridNode, padding: number, maxSizings: number): void {
  const sizings = new Map<GridNode, number>();
  const stack: Sizing[] = [];
  const call = (node: GridNode, sibling: Sizing['sibling']): void => {
    if (node.children.length > 0) {
      const done = sizings.get(node) ?? 0;
      if (done >= maxSizings) return;
      sizings.set(node, done + 1);
    }
    if (!node.w) {
      node.w = sibling.mW;
      node.h = sibling.mH;
    }
    if (node.children.length > 0) {
      stack.push({ node, sibling, next: 0, second: false, max: { mW: 0, mH: 0 } });
    }
  };
  // v12's root block has no size: its first step gives it 0 × 0.
  root.w = 0;
  call(root, { mW: 0, mH: 0 });
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const kids = top.node.children;
    if (top.next < kids.length) {
      call(kids[top.next++]!, top.second ? top.max : { mW: 0, mH: 0 });
    } else if (!top.second) {
      top.max = maxChildSize(top.node);
      setCells(top.node, top.max.mW, top.max.mH, padding);
      top.second = true;
      top.next = 0;
    } else {
      stack.pop();
      finish({ node: top.node, max: top.max, sibling: top.sibling, padding });
    }
  }
}

/** v12 `layoutBlocks(root)`: every block's centre, from the sizes, top down. */
export function placeGrid(root: GridNode, padding: number): void {
  root.x = 0;
  root.y = 0;
  for (const node of preOrder(root)) {
    if (node.children.length === 0) continue;
    const columns = node.columns ?? -1;
    // Per-row heights, so rows of different heights do not overlap (v12).
    const rowHeights: number[] = [];
    let pos = 0;
    for (const child of node.children) {
      const { py } = gridPosition(columns, pos);
      if (child.h > (rowHeights[py] ?? 0)) rowHeights[py] = child.h;
      pos = gridAdvance(columns, pos, child.span);
    }
    const rowOffsets: number[] = [];
    let offset = 0;
    for (let row = 0; row < rowHeights.length; row++) {
      // A row v12's map never saw (every block in it of height 0) takes no room.
      if (rowHeights[row] === undefined) continue;
      rowOffsets[row] = offset;
      offset += rowHeights[row]! + padding;
    }
    const left = (): number => (node.x ? node.x + (-node.w / 2 || 0) : -padding);
    let startX = left();
    let rowPos = 0;
    pos = 0;
    for (const child of node.children) {
      const { py } = gridPosition(columns, pos);
      if (py !== rowPos) {
        rowPos = py;
        startX = left();
      }
      child.x = startX + padding + child.w / 2;
      startX = child.x + child.w / 2;
      const rowHeight = rowHeights[py] ?? child.h;
      child.y = node.y - node.h / 2 + node.band + (rowOffsets[py] ?? 0) + rowHeight / 2 + padding;
      pos = gridAdvance(columns, pos, child.span);
    }
  }
}
