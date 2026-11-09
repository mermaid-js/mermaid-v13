/**
 * d3-sankey 0.12.3's layout (https://github.com/d3/d3-sankey, `src/sankey.js`, `src/align.js`;
 * Copyright 2015 Mike Bostock, BSD 3-Clause License: see THIRD_PARTY_NOTICES in
 * \@mermaid-js/diagram-sankey), re-implemented step for step with no dependency, as v12
 * configures it (`sankeyRenderer.ts:121-134`): node ids, no `nodeSort`, no `linkSort`, d3's 6
 * iterations. Node boxes and link breadths equal d3's
 * (`packages/conformance/src/sankey/layout-d3.spec.ts`), down to the order of every float
 * operation and of every stable sort. d3-array 2.12.1's (https://github.com/d3/d3-array,
 * Copyright 2010-2020 Mike Bostock, BSD 3-Clause License) `sum`, `min` and `max` are copied
 * with their semantics: `sum` skips 0 and NaN, `min`/`max` skip `undefined` and NaN.
 *
 * What changed, each only where d3 writes NaN (D394: never draw NaN):
 *
 * - Flows are scaled by a power of two first, so the largest is in [1, 2) and no sum
 *   overflows. Every product, quotient and sum then scales exactly, so the boxes are d3's to
 *   the bit wherever d3 has no overflow.
 * - When every column's flows sum to 0, d3's `ky` is Infinity (or `undefined`) and its boxes
 *   NaN; here `ky` is 0, so the nodes are 0 high and spread as d3 spreads them.
 * - When the extent is 0 high and no column holds two nodes, d3's padding is `0 / 0`; here it
 *   is `nodePadding`, its limit as the height goes to 0.
 * - With a single layer d3's column step is `… / 0`; here it is 0.
 *
 * Node depths and heights come from one pass in topological order, not d3's repeated sweeps:
 * the same values in linear time (`longestPaths`).
 *
 * d3 threw `circular link` on a cycle; so does this. A render never gets here with one: the
 * parser rejects cycles (D393).
 */
import type { SankeyAlignment } from './types.ts';

/** A node of the layout graph, as d3 builds it on its input objects. */
export interface D3Node {
  readonly index: number;
  readonly sourceLinks: D3Link[];
  readonly targetLinks: D3Link[];
  /** `max(sum(out), sum(in))` of the scaled flows. */
  value: number;
  depth: number;
  height: number;
  layer: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A link of the layout graph. */
export interface D3Link {
  readonly index: number;
  readonly source: D3Node;
  readonly target: D3Node;
  /** The scaled flow. */
  readonly value: number;
  width: number;
  /** The link's centre line at its source and at its target. */
  y0: number;
  y1: number;
}

/** A link to lay out: its source and target by node index, and the flow it draws. */
export interface D3LinkInput {
  readonly source: number;
  readonly target: number;
  readonly flow: number;
}

export interface D3SankeyOptions {
  readonly nodeWidth: number;
  readonly nodePadding: number;
  readonly align: SankeyAlignment;
  /** `[[x0, y0], [x1, y1]]`. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly iterations: number;
  readonly decay: number;
  readonly collision: number;
}

export interface D3SankeyGraph {
  readonly nodes: readonly D3Node[];
  readonly links: readonly D3Link[];
  /** The factor the flows were scaled by (a power of two). */
  readonly scale: number;
  /** d3's `py`: the padding between the nodes of a column, `nodePadding` or less. */
  readonly padding: number;
}

/** d3-array 2's `sum`: skips 0 and NaN. */
function sum<T>(values: Iterable<T>, valueof: (d: T) => number): number {
  let s = 0;
  for (const d of values) {
    const v = +valueof(d);
    if (v) s += v;
  }
  return s;
}

/** d3-array 2's `min` over numbers: skips NaN; `undefined` when nothing is left. */
function min<T>(values: Iterable<T>, valueof: (d: T) => number): number | undefined {
  let m: number | undefined;
  for (const d of values) {
    const v = valueof(d);
    if (v >= v && (m === undefined || m > v)) m = v;
  }
  return m;
}

/** d3-array 2's `max` over numbers: skips NaN; `undefined` when nothing is left. */
function max<T>(values: Iterable<T>, valueof: (d: T) => number): number | undefined {
  let m: number | undefined;
  for (const d of values) {
    const v = valueof(d);
    if (v >= v && (m === undefined || m < v)) m = v;
  }
  return m;
}

const value = (d: { value: number }): number => d.value;

/** `align.js`. */
const ALIGN: Readonly<Record<SankeyAlignment, (node: D3Node, n: number) => number>> = {
  left: (node) => node.depth,
  right: (node, n) => n - 1 - node.height,
  justify: (node, n) => (node.sourceLinks.length ? node.depth : n - 1),
  center: (node) => {
    if (node.targetLinks.length) return node.depth;
    if (node.sourceLinks.length) return min(node.sourceLinks, (l) => l.target.depth)! - 1;
    return 0;
  },
};

function ascendingBreadth(a: D3Node, b: D3Node): number {
  return a.y0 - b.y0;
}

function ascendingSourceBreadth(a: D3Link, b: D3Link): number {
  return ascendingBreadth(a.source, b.source) || a.index - b.index;
}

function ascendingTargetBreadth(a: D3Link, b: D3Link): number {
  return ascendingBreadth(a.target, b.target) || a.index - b.index;
}

/** The power of two that brings the largest flow into [1, 2) (1 when every flow is 0). */
function flowScale(flows: readonly number[]): number {
  let top = 0;
  for (const f of flows) if (f > top) top = f;
  if (!(top > 0) || !Number.isFinite(top)) return 1;
  // 2 ** -e must stay a finite, non-zero number: e in [-1022, 1023].
  const e = Math.min(1023, Math.max(-1022, Math.floor(Math.log2(top))));
  return 2 ** -e;
}

/** computeNodeLinks (L126-147), with the scaled flows. */
function buildGraph(
  nodeCount: number,
  links: readonly D3LinkInput[],
  scale: number
): { nodes: D3Node[]; links: D3Link[] } {
  const nodes: D3Node[] = [];
  for (let i = 0; i < nodeCount; i++)
    nodes.push({
      index: i,
      sourceLinks: [],
      targetLinks: [],
      value: 0,
      depth: 0,
      height: 0,
      layer: 0,
      x0: 0,
      x1: 0,
      y0: 0,
      y1: 0,
    });
  const out = links.map((l, index) => {
    const source = nodes[l.source]!;
    const target = nodes[l.target]!;
    const link: D3Link = { index, source, target, value: l.flow * scale, width: 0, y0: 0, y1: 0 };
    source.sourceLinks.push(link);
    target.targetLinks.push(link);
    return link;
  });
  return { nodes, links: out };
}

/**
 * computeNodeDepths (L157-173) and computeNodeHeights (L175-191): `set` each node's length of
 * the longest path to it along `next`. d3 sweeps the whole node set once per step of the
 * longest path (quadratic on a long chain); a node ends with the last step that reaches it,
 * which is that longest path's length, so one pass in topological order gives the same values
 * in linear time. A cycle leaves nodes unvisited: `circular link`, as d3 threw.
 */
function longestPaths(
  nodes: readonly D3Node[],
  set: (node: D3Node, x: number) => void,
  next: (node: D3Node) => D3Node[]
): void {
  const after = nodes.map(next);
  const waiting = nodes.map(() => 0);
  for (const targets of after) for (const t of targets) waiting[t.index]!++;
  const x = nodes.map(() => 0);
  const queue = nodes.filter((n) => waiting[n.index] === 0);
  // The queue grows while it is read: a for-of reads its length afresh each step.
  for (const node of queue) {
    for (const t of after[node.index]!) {
      x[t.index] = Math.max(x[t.index]!, x[node.index]! + 1);
      if (--waiting[t.index]! === 0) queue.push(t);
    }
  }
  if (queue.length < nodes.length) throw new Error('circular link');
  for (const node of nodes) set(node, x[node.index]!);
}

/** computeNodeLayers (L193-209). */
function computeNodeLayers(nodes: readonly D3Node[], o: D3SankeyOptions): D3Node[][] {
  const align = ALIGN[o.align];
  const layers = max(nodes, (d) => d.depth)! + 1;
  // d3 divides by 0 for a single layer (a graph without links: the parser builds none, as
  // every node comes from a link); every node is then in layer 0, at x0.
  const kx = layers > 1 ? (o.x1 - o.x0 - o.nodeWidth) / (layers - 1) : 0;
  const columns: D3Node[][] = Array.from({ length: layers }, () => []);
  for (const node of nodes) {
    const i = Math.max(0, Math.min(layers - 1, Math.floor(align(node, layers))));
    node.layer = i;
    node.x0 = o.x0 + i * kx;
    node.x1 = node.x0 + o.nodeWidth;
    columns[i]!.push(node);
  }
  return columns;
}

/** reorderLinks (L331-338). */
function reorderLinks(column: readonly D3Node[]): void {
  for (const { sourceLinks, targetLinks } of column) {
    sourceLinks.sort(ascendingTargetBreadth);
    targetLinks.sort(ascendingSourceBreadth);
  }
}

/** reorderNodeLinks (L320-329). */
function reorderNodeLinks({ sourceLinks, targetLinks }: D3Node): void {
  for (const link of targetLinks) link.source.sourceLinks.sort(ascendingTargetBreadth);
  for (const link of sourceLinks) link.target.targetLinks.sort(ascendingSourceBreadth);
}

/** The column state the breadth passes share: d3's `py` and the vertical extent. */
interface Breadths {
  readonly py: number;
  readonly y0: number;
  readonly y1: number;
  readonly collision: number;
}

/** initializeNodeBreadths (L211-231). */
function initializeNodeBreadths(columns: readonly D3Node[][], b: Breadths): void {
  const { py, y0, y1 } = b;
  const least = min(columns, (c) => (y1 - y0 - (c.length - 1) * py) / sum(c, value));
  const ky = least !== undefined && least < Infinity ? least : 0;
  for (const column of columns) {
    let y = y0;
    for (const node of column) {
      node.y0 = y;
      node.y1 = y + node.value * ky;
      y = node.y1 + py;
      for (const link of node.sourceLinks) link.width = link.value * ky;
    }
    y = (y1 - y + py) / (column.length + 1);
    for (let i = 0; i < column.length; ++i) {
      const node = column[i]!;
      node.y0 += y * (i + 1);
      node.y1 += y * (i + 1);
    }
    reorderLinks(column);
  }
}

/** targetTop (L341-352): the `target.y0` that makes the link from `source` ideal. */
function targetTop(source: D3Node, target: D3Node, py: number): number {
  let y = source.y0 - ((source.sourceLinks.length - 1) * py) / 2;
  for (const { target: node, width } of source.sourceLinks) {
    if (node === target) break;
    y += width + py;
  }
  for (const { source: node, width } of target.targetLinks) {
    if (node === source) break;
    y -= width;
  }
  return y;
}

/** sourceTop (L355-366): the `source.y0` that makes the link to `target` ideal. */
function sourceTop(source: D3Node, target: D3Node, py: number): number {
  let y = target.y0 - ((target.targetLinks.length - 1) * py) / 2;
  for (const { source: node, width } of target.targetLinks) {
    if (node === source) break;
    y += width + py;
  }
  for (const { target: node, width } of source.sourceLinks) {
    if (node === target) break;
    y -= width;
  }
  return y;
}

/** resolveCollisionsTopToBottom (L301-308): push overlapping nodes down. */
function topToBottom(
  column: D3Node[],
  top: number,
  from: number,
  alpha: number,
  b: Breadths
): void {
  let y = top;
  for (let i = from; i < column.length; ++i) {
    const node = column[i]!;
    const d = (y - node.y0) * alpha;
    if (d > b.collision) {
      node.y0 += d;
      node.y1 += d;
    }
    y = node.y1 + b.py;
  }
}

/** resolveCollisionsBottomToTop (L311-318): push overlapping nodes up. */
function bottomToTop(
  column: D3Node[],
  bottom: number,
  from: number,
  alpha: number,
  b: Breadths
): void {
  let y = bottom;
  for (let i = from; i >= 0; --i) {
    const node = column[i]!;
    const d = (node.y1 - y) * alpha;
    if (d > b.collision) {
      node.y0 -= d;
      node.y1 -= d;
    }
    y = node.y0 - b.py;
  }
}

/** resolveCollisions (L291-298), after the column is sorted by `y0` (no `nodeSort`). */
function resolveCollisions(column: D3Node[], alpha: number, b: Breadths): void {
  column.sort(ascendingBreadth);
  const i = column.length >> 1;
  const subject = column[i]!;
  bottomToTop(column, subject.y0 - b.py, i - 1, alpha, b);
  topToBottom(column, subject.y1 + b.py, i + 1, alpha, b);
  bottomToTop(column, b.y1, column.length - 1, alpha, b);
  topToBottom(column, b.y0, 0, alpha, b);
}

/** Moves `node` `alpha` of the way to the weighted ideal `y / w`, if it has a weight. */
function relax(node: D3Node, y: number, w: number, alpha: number): void {
  if (!(w > 0)) return;
  const d = (y / w - node.y0) * alpha;
  node.y0 += d;
  node.y1 += d;
  reorderNodeLinks(node);
}

/** relaxLeftToRight (L246-266): each node toward its incoming links. */
function relaxLeftToRight(columns: D3Node[][], alpha: number, beta: number, b: Breadths): void {
  for (let i = 1, n = columns.length; i < n; ++i) {
    const column = columns[i]!;
    for (const target of column) {
      let y = 0;
      let w = 0;
      for (const { source, value: flow } of target.targetLinks) {
        const v = flow * (target.layer - source.layer);
        y += targetTop(source, target, b.py) * v;
        w += v;
      }
      relax(target, y, w, alpha);
    }
    resolveCollisions(column, beta, b);
  }
}

/** relaxRightToLeft (L269-289): each node toward its outgoing links. */
function relaxRightToLeft(columns: D3Node[][], alpha: number, beta: number, b: Breadths): void {
  for (let i = columns.length - 2; i >= 0; --i) {
    const column = columns[i]!;
    for (const source of column) {
      let y = 0;
      let w = 0;
      for (const { target, value: flow } of source.sourceLinks) {
        const v = flow * (target.layer - source.layer);
        y += sourceTop(source, target, b.py) * v;
        w += v;
      }
      relax(source, y, w, alpha);
    }
    resolveCollisions(column, beta, b);
  }
}

/** computeLinkBreadths (L39-52). */
function computeLinkBreadths(nodes: readonly D3Node[]): void {
  for (const node of nodes) {
    let ys = node.y0;
    let yt = ys;
    for (const link of node.sourceLinks) {
      link.y0 = ys + link.width / 2;
      ys += link.width;
    }
    for (const link of node.targetLinks) {
      link.y1 = yt + link.width / 2;
      yt += link.width;
    }
  }
}

/**
 * Lays out `nodeCount` nodes (by index) and `links` between them (by node index, with the
 * flow to draw), as d3-sankey 0.12.3's `sankey()` does (L66-75).
 */
export function d3Sankey(
  nodeCount: number,
  links: readonly D3LinkInput[],
  options: D3SankeyOptions
): D3SankeyGraph {
  const scale = flowScale(links.map((l) => l.flow));
  const graph = buildGraph(nodeCount, links, scale);
  const { nodes } = graph;
  if (nodes.length === 0) return { ...graph, scale, padding: options.nodePadding };

  // computeNodeValues (L149-155).
  for (const node of nodes)
    node.value = Math.max(sum(node.sourceLinks, value), sum(node.targetLinks, value));
  longestPaths(
    nodes,
    (node, x) => (node.depth = x),
    (node) => node.sourceLinks.map((l) => l.target)
  );
  longestPaths(
    nodes,
    (node, x) => (node.height = x),
    (node) => node.targetLinks.map((l) => l.source)
  );

  // computeNodeBreadths (L233-243).
  const columns = computeNodeLayers(nodes, options);
  const { y0, y1, nodePadding: dy, iterations } = options;
  const py = Math.min(dy, (y1 - y0) / (max(columns, (c) => c.length)! - 1));
  const b: Breadths = { py: Number.isNaN(py) ? dy : py, y0, y1, collision: options.collision };
  initializeNodeBreadths(columns, b);
  for (let i = 0; i < iterations; ++i) {
    const alpha = Math.pow(options.decay, i);
    const beta = Math.max(1 - alpha, (i + 1) / iterations);
    relaxRightToLeft(columns, alpha, beta, b);
    relaxLeftToRight(columns, alpha, beta, b);
  }
  computeLinkBreadths(nodes);
  return { ...graph, scale, padding: b.py };
}
