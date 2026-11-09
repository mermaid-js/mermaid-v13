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
 * with `maxW × maxH` after, so a block at depth d is sized 2^d times. Here each block is sized
 * twice: {@link naturalPass} is v12's first call (bottom up, no sibling size), and the stretch
 * pass is its second (top down, with the sibling size, at the point v12 makes it: after the
 * parent's cells, before the parent's own stretch). That is v12's result exactly while no
 * composite holds a composite (v12's repeats then change nothing), and on every corpus
 * fixture; where composites nest, v12's repeats can grow a spanning child by
 * `padding · (span − 1) / span` per repeat, and v13 takes one (GAPS #555).
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

/**
 * The end of v12's `setBlockSizes` on a container: its own size from `maxW × maxH`, stretched
 * to `siblingWidth × siblingHeight` when narrower (the children evened out), then to its own
 * width before the call when narrower still (the children widened).
 */
function finish(node: GridNode, mW: number, mH: number, sw: number, sh: number, padding: number) {
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

/** v12's first `setBlockSizes` call on each block below `root`: bottom up, no sibling size. */
function naturalPass(order: readonly GridNode[], padding: number): void {
  for (let i = order.length - 1; i >= 1; i--) {
    const node = order[i]!;
    if (!node.w) {
      node.w = 0;
      node.h = 0;
    }
    if (node.children.length === 0) continue;
    const { mW, mH } = maxChildSize(node);
    setCells(node, mW, mH, padding);
    finish(node, mW, mH, 0, 0, padding);
  }
}

/**
 * Sizes every block of the tree under `root` (v12 `setBlockSizes(root)`), in two passes: the
 * natural pass, then the stretch pass. The stretch pass sets each container's cells top down
 * (its sibling size is its parent's `maxW × maxH` as the parent computed them), and finishes
 * each container bottom up, after its children, as v12's recursion did.
 */
export function sizeGrid(root: GridNode, padding: number): void {
  const order = preOrder(root);
  root.w = 0;
  root.h = 0;
  naturalPass(order, padding);
  const sibling = new Map<GridNode, { mW: number; mH: number }>();
  sibling.set(root, { mW: 0, mH: 0 });
  const own = new Map<GridNode, { mW: number; mH: number }>();
  for (const node of order) {
    const { mW: sw, mH: sh } = sibling.get(node)!;
    if (!node.w) {
      node.w = sw;
      node.h = sh;
    }
    if (node.children.length === 0) continue;
    const size = maxChildSize(node);
    setCells(node, size.mW, size.mH, padding);
    own.set(node, size);
    for (const child of node.children) sibling.set(child, size);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i]!;
    const size = own.get(node);
    if (!size) continue;
    const { mW: sw, mH: sh } = sibling.get(node)!;
    finish(node, size.mW, size.mH, sw, sh, padding);
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
      pos += columns > 0 ? Math.min(child.span, columns - (pos % columns)) : child.span;
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
      pos += columns > 0 ? Math.min(child.span, columns - (pos % columns)) : child.span;
    }
  }
}
