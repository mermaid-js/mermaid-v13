// cspell:words squarify squarified
/**
 * d3-hierarchy 3.1.2 as v12's treemap calls it (`renderer.ts:144-161`), with no dependency
 * (R-PERF-2): `hierarchy(root).sum(d => d.value ?? 0).sort((a, b) => b.value - a.value)`, then
 * `treemap().size([w, h]).paddingTop(…).paddingInner(padding)….round(true)` with the default
 * `treemapSquarify` (ratio φ). Every step follows d3's `hierarchy/{index,sum,sort}.js` and
 * `treemap/{index,squarify,dice,slice,round}.js` operation for operation, so the rectangles are
 * d3's to the bit (`packages/conformance/src/treemap/layout-d3.spec.ts`). d3-hierarchy:
 * https://github.com/d3/d3-hierarchy, ISC License, Copyright 2010-2021 Mike Bostock.
 *
 * One change (D402): d3 tiles by `value`, and a value that is not finite (a leaf of 309 digits)
 * or so large its products overflow makes it write NaN or Infinity. Tiling here reads `weight`,
 * which is `value` for every tree whose values add up to less than 1e150; a leaf whose value is
 * not finite and positive weighs 0, and past that total every leaf's weight is scaled by the
 * same power of two, which keeps the proportions. `value` stays d3's: children are sorted and
 * values printed by it.
 */
import type { TreemapNode } from '../model.ts';
import { MAX_TILE_WEIGHT, GOLDEN_RATIO, TREEMAP_METRICS } from './metrics.ts';

/** One node of the tiled tree: d3's `HierarchyRectangularNode`. */
export interface Tile {
  /** The model row; undefined for the hidden root that holds the top-level rows. */
  readonly node: TreemapNode | undefined;
  /** d3's depth: 0 for the hidden root, so a model row's depth plus one. */
  readonly depth: number;
  readonly parent: Tile | undefined;
  /** The children in d3's order (by value, descending, stable); undefined when there are none. */
  children: Tile[] | undefined;
  /** d3's `value`: the node's own value (`+v || 0`) plus its children's. */
  value: number;
  /** What the tiling divides the area by: `value`, but never NaN or Infinity. */
  weight: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TileOptions {
  readonly width: number;
  readonly height: number;
  /** `paddingInner`: the gap between siblings. */
  readonly padding: number;
}

export interface TiledTree {
  readonly root: Tile;
  /** The nodes with children, the root first, in d3's `descendants()` order (breadth first). */
  readonly branches: readonly Tile[];
  /** The nodes without children, in d3's `leaves()` order (depth first). */
  readonly leaves: readonly Tile[];
}

/** d3's `hierarchy` over the hidden root, then `sum` and `sort`, then the treemap. */
export function tileTreemap(roots: readonly TreemapNode[], options: TileOptions): TiledTree {
  const root = hierarchy(roots);
  const depthFirst = eachBefore(root);
  sum(depthFirst);
  for (const t of depthFirst) t.children?.sort((a, b) => b.value - a.value);
  position(eachBefore(root), options);
  return { root, branches: breadthFirst(root).filter(hasChildren), leaves: leavesOf(root) };
}

const hasChildren = (t: Tile): boolean => t.children !== undefined;

function tile(node: TreemapNode | undefined, depth: number, parent: Tile | undefined): Tile {
  return {
    node,
    depth,
    parent,
    children: undefined,
    value: 0,
    weight: 0,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
  };
}

/** `hierarchy(root)`: a node's children are its model children; an empty list is none. */
function hierarchy(roots: readonly TreemapNode[]): Tile {
  const root = tile(undefined, 0, undefined);
  const stack: [Tile, readonly TreemapNode[]][] = [[root, roots]];
  for (let top = stack.pop(); top; top = stack.pop()) {
    const [parent, rows] = top;
    if (rows.length === 0) continue;
    parent.children = rows.map((row) => {
      const child = tile(row, parent.depth + 1, parent);
      stack.push([child, row.children]);
      return child;
    });
  }
  return root;
}

/** d3's `eachBefore` order: a node, then each child's subtree in order. */
function eachBefore(root: Tile): Tile[] {
  const out: Tile[] = [];
  const stack = [root];
  for (let t = stack.pop(); t; t = stack.pop()) {
    out.push(t);
    const c = t.children;
    if (c) for (let i = c.length - 1; i >= 0; i--) stack.push(c[i]!);
  }
  return out;
}

/** d3's node iterator (`descendants()`): level by level. */
function breadthFirst(root: Tile): Tile[] {
  const out: Tile[] = [root];
  // The loop reads what it appends.
  for (const t of out) out.push(...(t.children ?? []));
  return out;
}

function leavesOf(root: Tile): Tile[] {
  return eachBefore(root).filter((t) => !hasChildren(t));
}

/** A leaf's own weight: its value when finite and positive, else 0. */
const ownWeight = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * `sum(d => d.value ?? 0)`: `+value || 0` plus the children's, after them. The weights add up
 * the same way. When their total passes {@link MAX_TILE_WEIGHT}, every leaf weight is scaled by one
 * power of two so the total stays below it: the tiling divides weights by weights, so that
 * scale changes no rectangle, and below the limit (every value under 1e150) nothing is scaled.
 */
function sum(depthFirst: readonly Tile[]): void {
  let leaves = 0;
  let largest = 0;
  for (let i = depthFirst.length - 1; i >= 0; i--) {
    const t = depthFirst[i]!;
    let value = +(t.node?.value ?? 0) || 0;
    let weight = 0;
    const c = t.children;
    if (c)
      for (let j = c.length - 1; j >= 0; j--) {
        value += c[j]!.value;
        weight += c[j]!.weight;
      }
    else {
      weight = ownWeight(value);
      largest = Math.max(largest, weight);
      leaves++;
    }
    t.value = value;
    t.weight = weight;
  }
  if (depthFirst[0]!.weight <= MAX_TILE_WEIGHT) return;
  const scale =
    2 **
    (Math.log2(MAX_TILE_WEIGHT) - Math.ceil(Math.log2(largest)) - Math.ceil(Math.log2(leaves)));
  for (let i = depthFirst.length - 1; i >= 0; i--) {
    const t = depthFirst[i]!;
    t.weight = t.children ? t.children.reduce((s, child) => s + child.weight, 0) : t.weight * scale;
  }
}

/** v12's paddings: a node with children has a header band and a margin. */
const PAD = TREEMAP_METRICS.sectionPadding;
const PAD_TOP = TREEMAP_METRICS.sectionHeader + TREEMAP_METRICS.sectionPadding;

/** d3's `treemap(root)`: `positionNode` for every node in `eachBefore` order, then rounding. */
function position(depthFirst: readonly Tile[], options: TileOptions): void {
  const root = depthFirst[0]!;
  root.x0 = root.y0 = 0;
  root.x1 = options.width;
  root.y1 = options.height;
  const inner = options.padding / 2;
  for (const t of depthFirst) {
    const p = t.depth === 0 ? 0 : inner;
    let x0 = t.x0 + p;
    let y0 = t.y0 + p;
    let x1 = t.x1 - p;
    let y1 = t.y1 - p;
    if (x1 < x0) x0 = x1 = (x0 + x1) / 2;
    if (y1 < y0) y0 = y1 = (y0 + y1) / 2;
    t.x0 = x0;
    t.y0 = y0;
    t.x1 = x1;
    t.y1 = y1;
    if (t.children) {
      const area = {
        x0: x0 + (PAD - inner),
        y0: y0 + (PAD_TOP - inner),
        x1: x1 - (PAD - inner),
        y1: y1 - (PAD - inner),
      };
      if (area.x1 < area.x0) area.x0 = area.x1 = (area.x0 + area.x1) / 2;
      if (area.y1 < area.y0) area.y0 = area.y1 = (area.y0 + area.y1) / 2;
      squarify(t, area);
    }
  }
  for (const t of depthFirst) {
    t.x0 = Math.round(t.x0);
    t.y0 = Math.round(t.y0);
    t.x1 = Math.round(t.x1);
    t.y1 = Math.round(t.y1);
  }
}

/** A rectangle by its edges, as d3 passes it. */
interface Span {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One row of a squarified tiling: `nodes[i0…i1)`, of total weight `value`. */
interface Row {
  readonly nodes: readonly Tile[];
  readonly i0: number;
  readonly i1: number;
  readonly value: number;
}

/** `squarifyRatio(φ, parent, x0, y0, x1, y1)`, over `area`, which it uses up. */
function squarify(parent: Tile, area: Span): void {
  const nodes = parent.children!;
  const n = nodes.length;
  let value = parent.weight;
  let i0 = 0;
  let i1 = 0;
  while (i0 < n) {
    const dx = area.x1 - area.x0;
    const dy = area.y1 - area.y0;
    // Find the next non-empty node.
    let sumValue: number;
    do sumValue = nodes[i1++]!.weight;
    while (!sumValue && i1 < n);
    let minValue = sumValue;
    let maxValue = sumValue;
    const alpha = Math.max(dy / dx, dx / dy) / (value * GOLDEN_RATIO);
    let beta = sumValue * sumValue * alpha;
    let minRatio = Math.max(maxValue / beta, beta / minValue);
    // Keep adding nodes while the aspect ratio holds or improves.
    for (; i1 < n; ++i1) {
      const nodeValue = nodes[i1]!.weight;
      sumValue += nodeValue;
      if (nodeValue < minValue) minValue = nodeValue;
      if (nodeValue > maxValue) maxValue = nodeValue;
      beta = sumValue * sumValue * alpha;
      const newRatio = Math.max(maxValue / beta, beta / minValue);
      if (newRatio > minRatio) {
        sumValue -= nodeValue;
        break;
      }
      minRatio = newRatio;
    }
    const row: Row = { nodes, i0, i1, value: sumValue };
    if (dx < dy) {
      const end = value ? area.y0 + (dy * sumValue) / value : area.y1;
      dice(row, { ...area, y1: end });
      if (value) area.y0 = end;
    } else {
      const end = value ? area.x0 + (dx * sumValue) / value : area.x1;
      slice(row, { ...area, x1: end });
      if (value) area.x0 = end;
    }
    value -= sumValue;
    i0 = i1;
  }
}

/** `treemapDice`: the row side by side in x. */
function dice(row: Row, span: Span): void {
  const k = row.value && (span.x1 - span.x0) / row.value;
  let x = span.x0;
  for (let i = row.i0; i < row.i1; i++) {
    const node = row.nodes[i]!;
    node.y0 = span.y0;
    node.y1 = span.y1;
    node.x0 = x;
    node.x1 = x += node.weight * k;
  }
}

/** `treemapSlice`: the row stacked in y. */
function slice(row: Row, span: Span): void {
  const k = row.value && (span.y1 - span.y0) / row.value;
  let y = span.y0;
  for (let i = row.i0; i < row.i1; i++) {
    const node = row.nodes[i]!;
    node.x0 = span.x0;
    node.x1 = span.x1;
    node.y0 = y;
    node.y1 = y += node.weight * k;
  }
}
