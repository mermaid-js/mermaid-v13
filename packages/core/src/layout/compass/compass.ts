// The `compass` engine (D326, D327, D501): LayoutGraph → LayoutModel by Pele's grid placement
// (`grid.ts`), its pixel pass (here) and its orthogonal router (`route.ts`), ported from Pele
// (https://github.com/obsidianmd/pele, src/diagrams/architecture/render.ts:27-32 and 214-410,
// MIT, (c) 2026 kepano; see THIRD_PARTY_NOTICES). Empty rows and columns rank away, cells are
// sized from the node boxes and edge labels, groups are inset for their padding and titles, and
// each edge end sits on the side it names.
//
// Changed from Pele: plain LayoutGraph input with measured sizes (no label layout, icons or
// drawing here), the lengths in `metrics.ts` (v12's `iconSize` 80 and `padding` 40), group
// padding from the graph, sides from `direction` where an edge names none (D327), ends that are
// groups, nodes in a row lined up on their `anchorY` (the middle by default) rather than by their
// tops, self-loop ends kept on their side, edge labels moved off any node a route passes and end
// labels (D102) placed, junction dots and wires left to the renderer, and the pass split into
// methods of one class. The output is route points with ports.
import type {
  LayoutEdge,
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelGroup,
  Point,
  Side,
} from '../types.ts';
import { BOTTOM, DX, DY, LEFT, placeOnGrid, RIGHT, TOP, type Grid } from './grid.ts';
import { METRICS as M } from './metrics.ts';
import { titleAlign, titleLow } from '../title.ts';
import { clearSpot, hits, route, simplify, Space, toRoute, type Port, type Rect } from './route.ts';

export { METRICS } from './metrics.ts';

/** How many spots an end label tries before it takes the last. */
const END_LABEL_TRIES = 64;

const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom'];
const SIDE_INDEX: Readonly<Record<Side, number>> = {
  left: LEFT,
  right: RIGHT,
  top: TOP,
  bottom: BOTTOM,
};

/** The sides an edge takes from `direction` when it names none (D327): `LR` gives R→L. */
const DERIVED: Readonly<Record<LayoutGraph['direction'], readonly [number, number]>> = {
  LR: [RIGHT, LEFT],
  RL: [LEFT, RIGHT],
  TB: [BOTTOM, TOP],
  BT: [TOP, BOTTOM],
};

function finite(v: number, what: string): void {
  if (!Number.isFinite(v) || v < 0)
    throw new RangeError(`layout: ${what} must be a finite number >= 0, got ${v}`);
}

function sized(s: { width: number; height: number } | undefined, what: string): void {
  if (!s) return;
  finite(s.width, `${what} width`);
  finite(s.height, `${what} height`);
}

function checkEdges(graph: LayoutGraph, ids: Set<string>): void {
  const edges = new Set<string>();
  for (const e of graph.edges) {
    if (edges.has(e.id)) throw new Error(`layout: duplicate edge id '${e.id}'`);
    edges.add(e.id);
    if (!ids.has(e.source))
      throw new Error(`layout: edge '${e.id}' has unknown source '${e.source}'`);
    if (!ids.has(e.target))
      throw new Error(`layout: edge '${e.id}' has unknown target '${e.target}'`);
    finite(e.minLen, `minLen of edge '${e.id}'`);
    sized(e.label, `label of edge '${e.id}'`);
    sized(e.startLabel, `start label of edge '${e.id}'`);
    sized(e.endLabel, `end label of edge '${e.id}'`);
    for (const [end, m] of [
      ['start', e.startMarker],
      ['end', e.endMarker],
    ] as const) {
      if (!m) continue;
      finite(m.length, `${end} marker length of edge '${e.id}'`);
      finite(m.width, `${end} marker width of edge '${e.id}'`);
    }
    for (const side of [e.sides?.source, e.sides?.target]) {
      if (side !== undefined && !Object.hasOwn(SIDE_INDEX, side))
        throw new RangeError(`layout: edge '${e.id}' has unknown side '${String(side)}'`);
    }
  }
}

// The same checks as `layered`'s (`layered/index.ts`), plus compass's own fields. One shared
// check for every engine is a follow-up (GAPS.md, T0 #590).
function check(graph: LayoutGraph): void {
  const ids = new Set<string>();
  const add = (id: string, what: string): void => {
    if (ids.has(id)) throw new Error(`layout: duplicate ${what} id '${id}'`);
    ids.add(id);
  };
  for (const n of graph.nodes) {
    add(n.id, 'node');
    finite(n.width, `width of node '${n.id}'`);
    finite(n.height, `height of node '${n.id}'`);
    if (n.span !== undefined) finite(n.span, `span of node '${n.id}'`);
    if (n.anchorY !== undefined) finite(n.anchorY, `anchorY of node '${n.id}'`);
  }
  for (const g of graph.groups) {
    add(g.id, 'group');
    for (const v of [g.padding.top, g.padding.right, g.padding.bottom, g.padding.left])
      finite(v, `padding of group '${g.id}'`);
    sized(g.title, `title of group '${g.id}'`);
  }
  checkEdges(graph, ids);
  finite(graph.spacing.node, 'spacing.node');
  finite(graph.spacing.rank, 'spacing.rank');
  finite(graph.spacing.edge, 'spacing.edge');
  finite(graph.diagramPadding ?? 0, 'diagramPadding');
  if (graph.headRoom !== undefined) finite(graph.headRoom, 'headRoom');
}

/**
 * Each group's parent group index, -1 for none: a parent that is missing, the group itself, or
 * on a cycle of parents counts as none, for every group on the cycle.
 */
function groupParents(graph: LayoutGraph): Int32Array {
  const index = new Map<string, number>();
  graph.groups.forEach((g, i) => index.set(g.id, i));
  const up = Int32Array.from(graph.groups, (g) => index.get(g.parent ?? '') ?? -1);
  // 0 unseen, 1 on the current walk up, 2 settled.
  const state = new Uint8Array(up.length);
  const walk: number[] = [];
  for (let i = 0; i < up.length; i++) {
    walk.length = 0;
    let v = i;
    while (v >= 0 && state[v] === 0) {
      state[v] = 1;
      walk.push(v);
      v = up[v]!;
    }
    // The walk ran into itself: every group from `v` on is on the cycle.
    if (v >= 0 && state[v] === 1)
      for (let k = walk.indexOf(v); k < walk.length; k++) up[walk[k]!] = -1;
    for (const u of walk) state[u] = 2;
  }
  return up;
}

/**
 * Groups with every parent before its children, otherwise in source order, so a graph that
 * already lists parents first keeps its order, with each group's parent as an index into that
 * order (`groupParents`).
 */
function groupOrder(graph: LayoutGraph): { order: number[]; parentOf: Int32Array } {
  const up = groupParents(graph);
  const order: number[] = [];
  const done = new Uint8Array(up.length);
  const chain: number[] = [];
  for (let i = 0; i < up.length; i++) {
    // The unplaced ancestors, innermost first, then placed outermost first.
    chain.length = 0;
    for (let v = i; v >= 0 && !done[v]; v = up[v]!) {
      done[v] = 1;
      chain.push(v);
    }
    for (let k = chain.length - 1; k >= 0; k--) order.push(chain[k]!);
  }
  const at = new Int32Array(up.length);
  order.forEach((g, k) => (at[g] = k));
  const parentOf = Int32Array.from(order, (g) => (up[g]! < 0 ? -1 : at[up[g]!]!));
  return { order, parentOf };
}

// Maps the grid lines in use to consecutive indexes, so empty rows and columns take no room.
function rank(values: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const value of values.sort((a, b) => a - b)) if (!out.has(value)) out.set(value, out.size);
  return out;
}

/** The value of a side index along one axis: `lo` for -1, `hi` for 1, `mid` for 0. */
const pick = (d: number, lo: number, mid: number, hi: number): number => {
  if (d < 0) return lo;
  return d > 0 ? hi : mid;
};

/** Moves `end` (on a group's side) along that side to be in line with `other`, if it fits. */
function inLine(end: Port, other: Port): void {
  if (end.dx !== 0) end.y = Math.min(end.y1, Math.max(end.y0, other.y));
  else end.x = Math.min(end.x1, Math.max(end.x0, other.x));
}

class Pixels {
  readonly graph: LayoutGraph;
  readonly groups: LayoutGroup[];
  readonly groupParent: Int32Array;
  readonly nodeParent: Int32Array;
  readonly N: number;
  readonly G: number;
  readonly E: number;
  // Each edge's ends as grid items (a node, or N + a group) and their side indexes.
  readonly endA: Int32Array;
  readonly endB: Int32Array;
  readonly sideA: Int32Array;
  readonly sideB: Int32Array;
  readonly grid: Grid;
  readonly anchor: Float64Array;
  // Cells: column widths, and each row's reach above (`rowA`) and below (`rowD`) its anchor line.
  colOf = new Map<number, number>();
  rowOf = new Map<number, number>();
  colW = new Float64Array(0);
  rowA = new Float64Array(0);
  rowD = new Float64Array(0);
  rowH = new Float64Array(0);
  gapX = new Float64Array(0);
  gapY = new Float64Array(0);
  nodeCol = new Int32Array(0);
  nodeRow = new Int32Array(0);
  // Groups: their first and last rows and columns, insets and title sizes.
  c0 = new Int32Array(0);
  c1 = new Int32Array(0);
  r0 = new Int32Array(0);
  r1 = new Int32Array(0);
  insL = new Float64Array(0);
  insR = new Float64Array(0);
  insT = new Float64Array(0);
  insB = new Float64Array(0);
  headW = new Float64Array(0);
  headH = new Float64Array(0);
  colL = new Float64Array(0);
  colR = new Float64Array(0);
  rowT = new Float64Array(0);
  rowB = new Float64Array(0);
  X = new Float64Array(0);
  Y = new Float64Array(0);
  nodeRects: Rect[] = [];
  // What is drawn, which an edge that has to go around a node can push past the grid.
  bounds: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  // Node boxes; labels placed so far and markers; every edge's runs (owned by the edge).
  nodeSpace = new Space(1);
  clutter = new Space(1);
  lines = new Space(1);
  // Vertical runs of the edges, to keep group titles out from under them.
  readonly runs: number[] = [];

  constructor(graph: LayoutGraph) {
    this.graph = graph;
    const { order, parentOf } = groupOrder(graph);
    this.groups = order.map((g) => graph.groups[g]!);
    this.groupParent = parentOf;
    const N = (this.N = graph.nodes.length);
    this.G = this.groups.length;
    this.E = graph.edges.length;
    const nodeIndex = new Map<string, number>();
    const groupIndex = new Map<string, number>();
    graph.nodes.forEach((n, i) => nodeIndex.set(n.id, i));
    this.groups.forEach((g, i) => groupIndex.set(g.id, i));
    this.nodeParent = Int32Array.from(graph.nodes, (n) => groupIndex.get(n.parent ?? '') ?? -1);
    const item = (id: string): number => nodeIndex.get(id) ?? N + groupIndex.get(id)!;
    const derived = DERIVED[graph.direction];
    this.endA = Int32Array.from(graph.edges, (e) => item(e.source));
    this.endB = Int32Array.from(graph.edges, (e) => item(e.target));
    this.sideA = Int32Array.from(graph.edges, (e) =>
      e.sides?.source ? SIDE_INDEX[e.sides.source] : derived[0]
    );
    this.sideB = Int32Array.from(graph.edges, (e) =>
      e.sides?.target ? SIDE_INDEX[e.sides.target] : derived[1]
    );
    const hints: { row: boolean; a: number; b: number }[] = [];
    for (const hint of graph.align ?? []) {
      for (let i = 1; i < hint.members.length; i++) {
        const a = nodeIndex.get(hint.members[i - 1]!);
        const b = nodeIndex.get(hint.members[i]!);
        if (a !== undefined && b !== undefined) hints.push({ row: hint.axis === 'row', a, b });
      }
    }
    const edges = graph.edges.map((_, k) => ({
      a: this.endA[k]!,
      b: this.endB[k]!,
      sa: this.sideA[k]!,
      sb: this.sideB[k]!,
    }));
    const { nodeParent, groupParent } = this;
    this.grid = placeOnGrid({ nodes: N, nodeParent, groupParent, edges, hints });
    this.anchor = Float64Array.from(graph.nodes, (n) =>
      Math.min(n.height, n.anchorY ?? n.height / 2)
    );
  }

  /** Ranks the rows and columns in use and sizes each from the boxes in it. */
  sizeCells(): void {
    const { grid, N, G, anchor } = this;
    const nodes = this.graph.nodes;
    const colValues: number[] = [...grid.col];
    const rowValues: number[] = [...grid.row];
    for (let g = 0; g < G; g++) {
      if (!grid.groupEmpty[g]) continue;
      colValues.push(grid.groupCol[g]!);
      rowValues.push(grid.groupRow[g]!);
    }
    const colOf = (this.colOf = rank(colValues));
    const rowOf = (this.rowOf = rank(rowValues));
    const C = colOf.size;
    const R = rowOf.size;
    const colW = (this.colW = new Float64Array(C));
    const rowA = (this.rowA = new Float64Array(R));
    const rowD = (this.rowD = new Float64Array(R));
    const rowH = (this.rowH = new Float64Array(R));
    this.gapX = new Float64Array(C).fill(M.gap);
    this.gapY = new Float64Array(R).fill(M.gap);
    this.nodeCol = new Int32Array(N);
    this.nodeRow = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const c = (this.nodeCol[i] = colOf.get(grid.col[i]!)!);
      const r = (this.nodeRow[i] = rowOf.get(grid.row[i]!)!);
      colW[c] = Math.max(colW[c]!, nodes[i]!.width);
      rowA[r] = Math.max(rowA[r]!, anchor[i]!);
      rowD[r] = Math.max(rowD[r]!, nodes[i]!.height - anchor[i]!);
    }
    for (let r = 0; r < R; r++) rowH[r] = rowA[r]! + rowD[r]!;
    for (let g = 0; g < G; g++) {
      if (!grid.groupEmpty[g]) continue;
      const c = colOf.get(grid.groupCol[g]!)!;
      const r = rowOf.get(grid.groupRow[g]!)!;
      colW[c] = Math.max(colW[c]!, M.iconSize);
      rowH[r] = Math.max(rowH[r]!, M.emptyHeight);
    }
  }

  /** The first and last columns and rows an edge end spans: its node's cell, or its group's. */
  cells(end: number): [number, number, number, number] {
    if (end < this.N) {
      const c = this.nodeCol[end]!;
      const r = this.nodeRow[end]!;
      return [c, c, r, r];
    }
    const g = end - this.N;
    return [this.c0[g]!, this.c1[g]!, this.r0[g]!, this.r1[g]!];
  }

  // An edge label needs the gap its edge crosses to be wide enough to hold it. An end on a group
  // spans the group's columns and rows, so the gap widened is the one outside its border.
  labelGaps(): void {
    const { N, nodeCol, nodeRow, colW, gapX, gapY } = this;
    for (let k = 0; k < this.E; k++) {
      const label = this.graph.edges[k]!.label;
      const a = this.endA[k]!;
      const b = this.endB[k]!;
      if (!label || label.width === 0) continue;
      if (a >= N || b >= N) {
        this.groupLabelGap(a, b, label);
        continue;
      }
      if (nodeCol[a] !== nodeCol[b]) {
        const c = Math.min(nodeCol[a]!, nodeCol[b]!);
        gapX[c] = Math.max(gapX[c]!, Math.ceil(label.width) + M.labelGapX);
        continue;
      }
      const c = nodeCol[a]!;
      colW[c] = Math.max(colW[c]!, 2 * Math.ceil(label.width / 2) + M.labelPad);
      if (nodeRow[a] !== nodeRow[b]) {
        const r = Math.min(nodeRow[a]!, nodeRow[b]!);
        gapY[r] = Math.max(gapY[r]!, Math.ceil(label.height) + M.labelGapY);
      }
    }
  }

  /** As `labelGaps`, for an edge with an end on a group: the gap between the two ends' spans. */
  groupLabelGap(a: number, b: number, label: { width: number; height: number }): void {
    const [ac0, ac1, ar0, ar1] = this.cells(a);
    const [bc0, bc1, br0, br1] = this.cells(b);
    const wide = Math.ceil(label.width) + M.labelGapX;
    const tall = Math.ceil(label.height) + M.labelGapY;
    if (ac1 < bc0) this.gapX[ac1] = Math.max(this.gapX[ac1]!, wide);
    else if (bc1 < ac0) this.gapX[bc1] = Math.max(this.gapX[bc1]!, wide);
    else if (ar1 < br0) this.gapY[ar1] = Math.max(this.gapY[ar1]!, tall);
    else if (br1 < ar0) this.gapY[br1] = Math.max(this.gapY[br1]!, tall);
  }

  /** Each group's first and last columns and rows. */
  groupCells(): void {
    const { G, grid, colOf, rowOf } = this;
    this.c0 = new Int32Array(G);
    this.c1 = new Int32Array(G);
    this.r0 = new Int32Array(G);
    this.r1 = new Int32Array(G);
    for (let g = 0; g < G; g++) {
      this.c0[g] = colOf.get(grid.groupCol[g]!)!;
      this.c1[g] = colOf.get(grid.groupCol[g]! + grid.groupCols[g]! - 1)!;
      this.r0[g] = rowOf.get(grid.groupRow[g]!)!;
      this.r1[g] = rowOf.get(grid.groupRow[g]! + grid.groupRows[g]! - 1)!;
    }
  }

  // Room around each group, kept on the rows and columns at its edges. A group that shares an
  // edge with a group inside it stands that much further out. Children come after their parents,
  // so walking backwards settles every group before the one that holds it.
  insetGroups(): void {
    const { G, colOf, rowOf } = this;
    this.insL = new Float64Array(G);
    this.insR = new Float64Array(G);
    this.insT = new Float64Array(G);
    this.insB = new Float64Array(G);
    this.headW = new Float64Array(G);
    this.headH = new Float64Array(G);
    this.colL = new Float64Array(colOf.size);
    this.colR = new Float64Array(colOf.size);
    this.rowT = new Float64Array(rowOf.size);
    this.rowB = new Float64Array(rowOf.size);
    for (let g = 0; g < G; g++) {
      this.headW[g] = this.groups[g]!.title?.width ?? 0;
      this.headH[g] = this.groups[g]!.title?.height ?? 0;
    }
    for (let g = G - 1; g >= 0; g--) this.inset(g);
  }

  inset(g: number): void {
    const { c0, c1, r0, r1, insL, insR, insT, insB, headW, headH } = this;
    const pad = this.groups[g]!.padding;
    const left = pad.left + insL[g]!;
    let right = pad.right + insR[g]!;
    // The title's band: the padding of its side, or the title and its gap where that is more.
    const low = titleLow(this.groups[g]!);
    const band = (own: number): number =>
      headH[g]! > 0 ? Math.max(own, headH[g]! + M.titleGap) : own;
    const top = (low ? pad.top : band(pad.top)) + insT[g]!;
    const bottom = (low ? band(pad.bottom) : pad.bottom) + insB[g]!;
    if (headW[g]! > 0) {
      let inner = left + right;
      for (let c = c0[g]!; c <= c1[g]!; c++) {
        inner +=
          this.colW[c]! + (c < c1[g]! ? this.colR[c]! + this.gapX[c]! + this.colL[c + 1]! : 0);
      }
      if (headW[g]! + M.titleRoom > inner) right += Math.ceil(headW[g]! + M.titleRoom - inner);
    }
    insL[g] = left;
    insR[g] = right;
    insT[g] = top;
    insB[g] = bottom;
    this.colL[c0[g]!] = Math.max(this.colL[c0[g]!]!, left);
    this.colR[c1[g]!] = Math.max(this.colR[c1[g]!]!, right);
    this.rowT[r0[g]!] = Math.max(this.rowT[r0[g]!]!, top);
    this.rowB[r1[g]!] = Math.max(this.rowB[r1[g]!]!, bottom);
    const p = this.groupParent[g]!;
    if (p < 0) return;
    if (c0[p] === c0[g]) insL[p] = Math.max(insL[p]!, left);
    if (c1[p] === c1[g]) insR[p] = Math.max(insR[p]!, right);
    if (r0[p] === r0[g]) insT[p] = Math.max(insT[p]!, top);
    if (r1[p] === r1[g]) insB[p] = Math.max(insB[p]!, bottom);
  }

  /** Each row's and column's position, then each node's box. */
  position(): void {
    const C = this.colW.length;
    const R = this.rowH.length;
    this.X = new Float64Array(C);
    this.Y = new Float64Array(R);
    let innerW = 0;
    for (let c = 0; c < C; c++) {
      this.X[c] = innerW + this.colL[c]!;
      innerW = this.X[c]! + this.colW[c]! + this.colR[c]! + (c < C - 1 ? this.gapX[c]! : 0);
    }
    let innerH = 0;
    for (let r = 0; r < R; r++) {
      this.Y[r] = innerH + this.rowT[r]!;
      innerH = this.Y[r]! + this.rowH[r]! + this.rowB[r]! + (r < R - 1 ? this.gapY[r]! : 0);
    }
    this.bounds = { x0: 0, y0: 0, x1: innerW, y1: innerH };
    this.nodeRects = this.graph.nodes.map((n, i) => {
      const c = this.nodeCol[i]!;
      const r = this.nodeRow[i]!;
      const cx = this.X[c]! + this.colW[c]! / 2;
      const top = this.Y[r]! + this.rowA[r]! - this.anchor[i]!;
      return { x0: cx - n.width / 2, y0: top, x1: cx + n.width / 2, y1: top + n.height };
    });
    // Buckets about a cell across, so a label or line meets only the few boxes near it.
    let mean = 0;
    for (const w of this.colW) mean += w / C;
    this.nodeSpace = new Space(M.gap + mean);
    this.clutter = new Space(M.gap + mean);
    this.lines = new Space(M.gap + mean);
    for (const r of this.nodeRects) this.nodeSpace.add(r);
  }

  grow(r: Rect): void {
    const b = this.bounds;
    b.x0 = Math.min(b.x0, r.x0);
    b.y0 = Math.min(b.y0, r.y0);
    b.x1 = Math.max(b.x1, r.x1);
    b.y1 = Math.max(b.y1, r.y1);
  }

  groupRect(g: number): Rect {
    const { X, Y, c0, c1, r0, r1 } = this;
    return {
      x0: X[c0[g]!]! - this.insL[g]!,
      y0: Y[r0[g]!]! - this.insT[g]!,
      x1: X[c1[g]!]! + this.colW[c1[g]!]! + this.insR[g]!,
      y1: Y[r1[g]!]! + this.rowH[r1[g]!]! + this.insB[g]!,
    };
  }

  // An end on a node meets its side: `left`/`right` on the anchor line, `top`/`bottom` at the
  // middle. An end on a group, or with `border` set, meets the group's border instead.
  port(end: number, side: number, border: boolean | undefined): Port {
    const dx = DX[side]!;
    const dy = DY[side]!;
    let g = border ? this.nodeParent[end]! : -1;
    if (end >= this.N) g = end - this.N;
    const r = g >= 0 ? this.groupRect(g) : this.nodeRects[end]!;
    const midY = end >= this.N ? (r.y0 + r.y1) / 2 : this.nodeRects[end]!.y0 + this.anchor[end]!;
    const node = end < this.N ? this.nodeRects[end]! : r;
    const midX = (node.x0 + node.x1) / 2;
    return {
      x: pick(dx, r.x0, midX, r.x1),
      y: pick(dy, r.y0, midY, r.y1),
      dx,
      dy,
      ...r,
    };
  }

  routeEdge(k: number): LayoutModelEdge {
    const edge = this.graph.edges[k]!;
    const s = this.port(this.endA[k]!, this.sideA[k]!, edge.border?.source);
    const e = this.port(this.endB[k]!, this.sideB[k]!, edge.border?.target);
    // An end on a group meets the side it faces in line with the other end where it can.
    if (s.dx === -e.dx && s.dy === -e.dy) {
      if (this.endA[k]! >= this.N && this.endB[k]! < this.N) inLine(s, e);
      else if (this.endB[k]! >= this.N && this.endA[k]! < this.N) inLine(e, s);
    }
    if (s.x === e.x && s.y === e.y && s.dx === e.dx) {
      // An edge from a side back to the same side: part the two ends so it shows as a loop,
      // each staying on the side.
      if (s.dx !== 0) {
        s.y = Math.max(s.y0, s.y - M.loopPart);
        e.y = Math.min(e.y1, e.y + M.loopPart);
      } else {
        s.x = Math.max(s.x0, s.x - M.loopPart);
        e.x = Math.min(e.x1, e.x + M.loopPart);
      }
    }
    const points = simplify(route(s, e));
    if (points.length < 4) points.push(e.x, e.y);
    const m = M.routeMargin;
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i]!;
      const y = points[i + 1]!;
      this.grow({ x0: x - m, y0: y - m, x1: x + m, y1: y + m });
    }
    const placed: LayoutModelEdge = {
      points: toRoute(points),
      ports: { source: SIDES[this.sideA[k]!]!, target: SIDES[this.sideB[k]!]! },
    };
    this.addLines(k, edge, points);
    const label = this.placeLabel(edge, points, [s, e]);
    if (label) placed.label = label;
    return placed;
  }

  /** Records an edge's runs (owned by it) and its markers, for end labels to keep clear of. */
  addLines(k: number, edge: LayoutEdge, points: number[]): void {
    for (let i = 0; i + 3 < points.length; i += 2) {
      const [x0, x1] = [points[i]!, points[i + 2]!].sort((p, q) => p - q);
      const [y0, y1] = [points[i + 1]!, points[i + 3]!].sort((p, q) => p - q);
      this.lines.add({ x0: x0!, y0: y0!, x1: x1!, y1: y1! }, k);
    }
    const n = points.length;
    const ends = [
      [edge.startMarker, 0, 2],
      [edge.endMarker, n - 2, n - 4],
    ] as const;
    for (const [marker, at, to] of ends) {
      if (!marker) continue;
      const px = points[at]!;
      const py = points[at + 1]!;
      const len = Math.hypot(points[to]! - px, points[to + 1]! - py) || 1;
      const ux = (points[to]! - px) / len;
      const uy = (points[to + 1]! - py) / len;
      const cx = px + (ux * marker.length) / 2;
      const cy = py + (uy * marker.length) / 2;
      const w = Math.abs(ux) * marker.length + Math.abs(uy) * marker.width;
      const h = Math.abs(uy) * marker.length + Math.abs(ux) * marker.width;
      this.clutter.add({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });
    }
  }

  /** The longest run, and the longest flat one; records the upright runs for group titles. */
  longestRuns(points: number[]): { best: number; flat: number; flatLength: number } {
    let best = -1;
    let bestLength = -1;
    let flat = -1;
    let flatLength = -1;
    for (let i = 0; i + 3 < points.length; i += 2) {
      const horizontal = Math.abs(points[i + 1]! - points[i + 3]!) < 0.01;
      const length =
        Math.abs(points[i]! - points[i + 2]!) + Math.abs(points[i + 1]! - points[i + 3]!);
      if (!horizontal) {
        const lo = Math.min(points[i + 1]!, points[i + 3]!);
        this.runs.push(points[i]!, lo, Math.max(points[i + 1]!, points[i + 3]!));
      }
      if (length > bestLength) {
        best = i;
        bestLength = length;
      }
      if (horizontal && length > flatLength) {
        flat = i;
        flatLength = length;
      }
    }
    return { best, flat, flatLength };
  }

  placeLabel(edge: LayoutEdge, points: number[], ends: Port[]): Point | undefined {
    const runs = this.longestRuns(points);
    const label = edge.label;
    if (!label) return undefined;
    const at = runs.flatLength >= label.width + M.labelPad ? runs.flat : runs.best;
    let x = (points[at]! + points[at + 2]!) / 2;
    let y = (points[at + 1]! + points[at + 3]!) / 2;
    const w = label.width + M.labelPad;
    const h = label.height;
    const upright = Math.abs(points[at]! - points[at + 2]!) < 0.01;
    // On a short run next to a node the label would land on the node, so it moves off to the side.
    for (const p of ends) {
      if (!hits(p, { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 })) continue;
      if (upright) {
        x = x >= (p.x0 + p.x1) / 2 ? p.x1 + w / 2 + M.labelClear : p.x0 - w / 2 - M.labelClear;
      } else {
        y = y >= (p.y0 + p.y1) / 2 ? p.y1 + h / 2 + M.labelClear : p.y0 - h / 2 - M.labelClear;
      }
    }
    // Pele clears only the two end boxes. A route on another graph type can pass a third node,
    // so a label that lands on one takes the first clear spot along the route instead.
    const spot = clearSpot(points, { x, y }, { w, h }, upright, this.nodeSpace);
    const r = { x0: spot.x - w / 2, y0: spot.y - h / 2, x1: spot.x + w / 2, y1: spot.y + h / 2 };
    this.grow(r);
    this.clutter.add(r);
    return spot;
  }

  // End labels (D102, a class multiplicity): beside the route's first or last run, outside the
  // box, on the first side of the line where they clear every node and label placed so far.
  endLabel(k: number, placed: LayoutModelEdge, atStart: boolean): Point | undefined {
    const edge = this.graph.edges[k]!;
    const size = atStart ? edge.startLabel : edge.endLabel;
    if (!size) return undefined;
    const pts = placed.points;
    const p = atStart ? pts[0]! : pts[pts.length - 1]!;
    const q = atStart ? pts[1]! : pts[pts.length - 2]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    const marker = atStart ? edge.startMarker : edge.endMarker;
    const along = (Math.abs(ux) * size.width + Math.abs(uy) * size.height) / 2 + M.endLabelGap;
    const across = (Math.abs(uy) * size.width + Math.abs(ux) * size.height) / 2 + M.endLabelGap;
    const base = along + (marker?.length ?? 0);
    // Beside the line on one side, then the other, then further out across it. Every spot lies
    // past the side the end meets, so none is on the end's own box. The first spot clear of every
    // node, label, marker and other edge's runs; else the first clear of all but the runs.
    const tries = Math.min(END_LABEL_TRIES, 2 * (this.N + this.E + 1));
    const spot = (step: number): Rect => {
      const sign = step % 2 === 0 ? 1 : -1;
      const off = across + (marker?.width ?? 0) / 2 + Math.floor(step / 2) * (2 * across);
      const cx = p.x + ux * base - uy * off * sign;
      const cy = p.y + uy * base + ux * off * sign;
      const { width: w, height: h } = size;
      return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
    };
    const free = (r: Rect): boolean => !this.nodeSpace.hit(r) && !this.clutter.hit(r);
    let r: Rect | undefined;
    for (let step = 0; step < tries && !r; step++) {
      const at = spot(step);
      if (free(at) && !this.lines.hit(at, k)) r = at;
    }
    for (let step = 0; step < tries && !r; step++) {
      const at = spot(step);
      if (free(at)) r = at;
    }
    r ??= spot(tries - 1);
    this.grow(r);
    this.clutter.add(r);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  }

  /**
   * A group's box and its title's centre: at the left, or after the edges that come down there.
   * A `titlePosition` moves it: to the bottom, and to the middle or the right as written.
   */
  groupBox(g: number): [Rect, Point] {
    const r = this.groupRect(g);
    const { x0: x, y0: y } = r;
    const w = r.x1 - r.x0;
    const headW = this.headW[g]!;
    const group = this.groups[g]!;
    const low = titleLow(group);
    const side = group.titlePosition ? titleAlign(group) : -1;
    // The band the title is in, from `lo` to `hi`.
    const depth = this.headH[g]! + M.titleGap;
    const [lo, hi] = low ? [r.y1 - depth, r.y1] : [y, y + depth];
    const crossings: number[] = [];
    for (let i = 0; i < this.runs.length; i += 3) {
      const [rx, from, to] = [this.runs[i]!, this.runs[i + 1]!, this.runs[i + 2]!];
      if (from < hi && to > lo && rx > x && rx < x + w) crossings.push(rx);
    }
    crossings.sort((a, b) => a - b);
    crossings.push(x + w - M.titleRight);
    let start = x + M.titleLeft;
    for (const crossing of crossings) {
      if (crossing - M.titleClear - start >= headW) break;
      start = Math.max(start, crossing + M.titleClear);
    }
    if (start + headW > x + w - M.titleRight) start = x + M.titleLeft;
    if (side === 0) start = x + (w - headW) / 2;
    if (side > 0) start = x + w - M.titleLeft - headW;
    this.grow(r);
    const drop = M.titleTop + this.headH[g]! / 2;
    return [r, { x: start + headW / 2, y: low ? r.y1 - drop : y + drop }];
  }

  model(): LayoutModel {
    const edges = new Map<string, LayoutModelEdge>();
    for (let k = 0; k < this.E; k++) edges.set(this.graph.edges[k]!.id, this.routeEdge(k));
    for (let k = 0; k < this.E; k++) {
      const placed = edges.get(this.graph.edges[k]!.id)!;
      const start = this.endLabel(k, placed, true);
      const end = this.endLabel(k, placed, false);
      if (start) placed.startLabel = start;
      if (end) placed.endLabel = end;
    }
    const boxes = new Map<string, [Rect, Point]>();
    for (let g = 0; g < this.G; g++) boxes.set(this.groups[g]!.id, this.groupBox(g));
    const pad = this.graph.diagramPadding ?? 0;
    const ox = pad - this.bounds.x0;
    const oy = pad - this.bounds.y0;
    const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2 + ox, y: (r.y0 + r.y1) / 2 + oy });
    const groups = new Map<string, LayoutModelGroup>();
    // Groups in the graph's order.
    for (const group of this.graph.groups) {
      const [r, title] = boxes.get(group.id)!;
      const size = { width: r.x1 - r.x0, height: r.y1 - r.y0 };
      groups.set(group.id, { ...centre(r), ...size, title: { x: title.x + ox, y: title.y + oy } });
    }
    for (const e of edges.values()) {
      for (const p of [...e.points, e.label, e.startLabel, e.endLabel]) {
        if (!p) continue;
        p.x += ox;
        p.y += oy;
      }
    }
    return {
      width: this.bounds.x1 - this.bounds.x0 + 2 * pad,
      height: this.bounds.y1 - this.bounds.y0 + 2 * pad,
      nodes: new Map(
        this.graph.nodes.map((n, i) => [
          n.id,
          { ...centre(this.nodeRects[i]!), width: n.width, height: n.height },
        ])
      ),
      edges,
      groups,
      direction: this.graph.direction,
    };
  }
}

export function layoutCompass(graph: LayoutGraph): LayoutModel {
  check(graph);
  const pixels = new Pixels(graph);
  pixels.sizeCells();
  pixels.groupCells();
  pixels.labelGaps();
  pixels.insetGroups();
  pixels.position();
  return pixels.model();
}
