// The `tree` engine (D280–D285): LayoutGraph → LayoutModel as a two-sided tidy tree. The root
// sits in the middle, its first branches run right and the rest left, and each side is a tidy
// tree whose levels run outwards. The band stacking and the split are ported from Pele's mindmap
// layout (https://github.com/obsidianmd/pele, src/diagrams/mindmap/render.ts, MIT, (c) 2026
// kepano; see THIRD_PARTY_NOTICES): each subtree takes a band across the flow, siblings' bands
// are stacked, and a parent is centred on its first and last child, so nothing overlaps by
// construction and the work is linear. Changed from Pele: plain LayoutGraph input with measured
// sizes, gaps from `spacing` only, edges as route points with ports, and input that is not one
// tree (D285).
import type {
  LayoutEdge,
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelGroup,
  LayoutModelNode,
  Point,
  RoutePoint,
  Side,
} from '../types.ts';
import { checkGraph, checkLabelSizes } from '../check.ts';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The forest and every per-node array, indexed by the node's place in `graph.nodes`. */
interface Forest {
  readonly graph: LayoutGraph;
  readonly index: Map<string, number>;
  /** Each node's tree edge, by edge index; -1 for a root. */
  readonly via: Int32Array;
  /** Children as linked lists in source order: the first child, and each node's next sibling. */
  readonly first: Int32Array;
  readonly next: Int32Array;
  /** Gap from a node out to its children. */
  readonly gap: Float64Array;
  /** Height of the label on a node's tree edge, 0 for none. */
  readonly label: Float64Array;
  readonly w: Float64Array;
  readonly h: Float64Array;
  /** Depth-first order, roots in source order, so going backwards visits children first. */
  readonly order: number[];
}

function check(graph: LayoutGraph): Map<string, number> {
  checkGraph(graph, { edge: checkLabelSizes });
  return new Map(graph.nodes.map((n, i) => [n.id, i]));
}

/**
 * The spanning forest (D285): each node's parent is the source of its first incoming edge in
 * source order. Where those parents make a cycle, the cycle's first node in source order loses
 * its parent and becomes a root.
 */
function treeEdges(graph: LayoutGraph, index: Map<string, number>): Int32Array {
  const n = graph.nodes.length;
  const parent = new Int32Array(n).fill(-1);
  const via = new Int32Array(n).fill(-1);
  graph.edges.forEach((e, k) => {
    const s = index.get(e.source);
    const t = index.get(e.target);
    if (s === undefined || t === undefined || s === t || via[t] !== -1) return;
    parent[t] = s;
    via[t] = k;
  });
  // 0 unseen, 1 on the current walk up, 2 settled.
  const state = new Uint8Array(n);
  const walk: number[] = [];
  for (let i = 0; i < n; i++) {
    walk.length = 0;
    let v = i;
    while (v !== -1 && state[v] === 0) {
      state[v] = 1;
      walk.push(v);
      v = parent[v]!;
    }
    if (v !== -1 && state[v] === 1) {
      // The walk ran into itself: the cycle is the part of the walk from `v` on.
      let root = v;
      for (let k = walk.indexOf(v); k < walk.length; k++) root = Math.min(root, walk[k]!);
      via[root] = -1;
    }
    for (const u of walk) state[u] = 2;
  }
  return via;
}

function forestOf(graph: LayoutGraph): Forest {
  const index = check(graph);
  const n = graph.nodes.length;
  const via = treeEdges(graph, index);
  const w = Float64Array.from(graph.nodes, (d) => d.width);
  const h = Float64Array.from(graph.nodes, (d) => d.height);
  // A node's gap out is the rank gap, or wider to fit the widest label on its children's edges;
  // each label's height is reserved in the parent's band (`Bands`).
  const first = new Int32Array(n).fill(-1);
  const last = new Int32Array(n).fill(-1);
  const next = new Int32Array(n).fill(-1);
  const gap = new Float64Array(n).fill(graph.spacing.rank);
  const label = new Float64Array(n);
  graph.edges.forEach((e, k) => {
    const t = index.get(e.target)!;
    if (via[t] !== k) return;
    const s = index.get(e.source)!;
    if (first[s] === -1) first[s] = t;
    else next[last[s]!] = t;
    last[s] = t;
    if (!e.label) return;
    gap[s] = Math.max(gap[s]!, e.label.width);
    label[t] = e.label.height;
  });
  const order: number[] = [];
  const stack: number[] = [];
  const kids: number[] = [];
  for (let r = 0; r < n; r++) {
    if (via[r] !== -1) continue;
    stack.push(r);
    while (stack.length > 0) {
      const v = stack.pop()!;
      order.push(v);
      kids.length = 0;
      for (let c = first[v]!; c !== -1; c = next[c]!) kids.push(c);
      for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]!);
    }
  }
  return { graph, index, via, first, next, gap, label, w, h, order };
}

/**
 * Each subtree's band across the flow: `extent` its height, `rel` its offset among its siblings,
 * `own` the node's top inside it, and `kids` where its children's bands start. The band also
 * holds the labels on the edges to the node's children: each sits in the gap out from the node,
 * halfway between the node's middle and its child's, where nothing else is.
 */
class Bands {
  readonly extent: Float64Array;
  readonly rel: Float64Array;
  readonly own: Float64Array;
  readonly kids: Float64Array;
  /** Height of the run of siblings `stack` stacked last. */
  private stacked = 0;

  constructor(private readonly f: Forest) {
    const n = f.w.length;
    this.extent = new Float64Array(n);
    this.rel = new Float64Array(n);
    this.own = new Float64Array(n);
    this.kids = new Float64Array(n);
    const { order, via, first, next, h, label } = f;
    for (let k = order.length - 1; k >= 0; k--) {
      const v = order[k]!;
      if (via[v] === -1) continue;
      if (first[v] === -1) {
        this.extent[v] = h[v]!;
        continue;
      }
      const middle = this.stack(first[v]!, -1);
      const top = middle - h[v]! / 2;
      let low = Math.min(0, top);
      let high = Math.max(this.stacked, top + h[v]!);
      for (let c = first[v]!; c !== -1; c = next[c]!) {
        if (label[c] === 0) continue;
        const mid = (middle + this.rel[c]! + this.own[c]! + h[c]! / 2) / 2;
        low = Math.min(low, mid - label[c]! / 2);
        high = Math.max(high, mid + label[c]! / 2);
      }
      this.extent[v] = high - low;
      this.own[v] = top - low;
      this.kids[v] = -low;
    }
  }

  /**
   * Stacks the siblings from `from` up to (not including) `to`, a node gap apart, and returns
   * where their parent's middle belongs: halfway between the middles of the first and the last.
   */
  stack(from: number, to: number): number {
    const { next, h } = this.f;
    const across = this.f.graph.spacing.node;
    let y = 0;
    let end = from;
    for (let c = from; c !== to; c = next[c]!) {
      this.rel[c] = y;
      y += this.extent[c]! + across;
      end = c;
    }
    this.stacked = y - across;
    const mid = (c: number): number => this.rel[c]! + this.own[c]! + h[c]! / 2;
    return (mid(from) + mid(end)) / 2;
  }
}

/**
 * D283: the first branches go right and the rest left, cut where the sides' heights are closest
 * (the earlier cut on a tie). Returns the first left branch, or -1 when every branch goes right.
 */
function split(f: Forest, b: Bands, root: number): number {
  const { first, next } = f;
  const across = f.graph.spacing.node;
  let count = 0;
  let total = 0;
  for (let c = first[root]!; c !== -1; c = next[c]!) {
    count++;
    total += b.extent[c]!;
  }
  let cut = -1;
  let best = Infinity;
  let right = 0;
  let k = 0;
  for (let c = first[root]!; c !== -1 && next[c] !== -1; c = next[c]!) {
    right += b.extent[c]!;
    k++;
    const diff = Math.abs(2 * right - total + (2 * k - count) * across);
    if (diff < best) {
      best = diff;
      cut = next[c]!;
    }
  }
  return cut;
}

/** Node centres and sides (1 right, -1 left); returns the bottom of the last tree. */
function place(f: Forest, b: Bands, x: Float64Array, y: Float64Array, side: Int8Array): number {
  const { order, via, first, next, w, h, gap, label } = f;
  const band = new Float64Array(w.length);
  let cursor = 0;
  // Trees in source order, stacked down the page a node gap apart, roots on one vertical line.
  for (let start = 0, end = 1; start < order.length; start = end, end = start + 1) {
    while (end < order.length && via[order[end]!] !== -1) end++;
    const root = order[start]!;
    const cut = split(f, b, root);
    for (const [from, to, dir] of [
      [first[root]!, cut, 1],
      [cut, -1, -1],
    ] as const) {
      if (from === -1 || from === to) continue;
      const middle = b.stack(from, to);
      for (let c = from; c !== to; c = next[c]!) {
        band[c] = b.rel[c]! - middle;
        side[c] = dir;
      }
    }
    let top = -h[root]! / 2;
    let bottom = h[root]! / 2;
    for (let k = start; k < end; k++) {
      const v = order[k]!;
      if (v !== root) {
        y[v] = band[v]! + b.own[v]! + h[v]! / 2;
        top = Math.min(top, band[v]! + b.own[v]!);
        bottom = Math.max(bottom, y[v] + h[v]! / 2);
      }
      for (let c = first[v]!; c !== -1; c = next[c]!) {
        if (v !== root) {
          side[c] = side[v]!;
          band[c] = band[v]! + b.kids[v]! + b.rel[c]!;
        }
        x[c] = x[v]! + side[c]! * (w[v]! / 2 + gap[v]! + w[c]! / 2);
      }
    }
    // The root's edge labels sit outside every band, halfway out to its branches (root at 0).
    for (let c = first[root]!; c !== -1; c = next[c]!) {
      top = Math.min(top, y[c]! / 2 - label[c]! / 2);
      bottom = Math.max(bottom, y[c]! / 2 + label[c]! / 2);
    }
    const shift = start === 0 ? 0 : cursor - top;
    for (let k = start; k < end; k++) y[order[k]!]! += shift;
    cursor = bottom + shift + f.graph.spacing.node;
  }
  return cursor;
}

function grow(into: Map<string, Rect>, id: string, r: Rect): void {
  const c = into.get(id);
  if (!c) into.set(id, { ...r });
  else {
    c.x0 = Math.min(c.x0, r.x0);
    c.y0 = Math.min(c.y0, r.y0);
    c.x1 = Math.max(c.x1, r.x1);
    c.y1 = Math.max(c.y1, r.y1);
  }
}

/**
 * Each group's nesting depth (1 at the top), memoised so a deep chain costs linear time. A
 * cycle of `parent`s counts from where the walk met itself.
 */
function groupDepths(groups: LayoutGraph['groups']): Map<string, number> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const depth = new Map<string, number>();
  const chain: string[] = [];
  const onChain = new Set<string>();
  for (const g of groups) {
    chain.length = 0;
    onChain.clear();
    let at: string | undefined = g.id;
    while (at !== undefined && byId.has(at) && !depth.has(at) && !onChain.has(at)) {
      chain.push(at);
      onChain.add(at);
      at = byId.get(at)!.parent;
    }
    let d = at !== undefined && depth.has(at) ? depth.get(at)! : 0;
    for (let k = chain.length - 1; k >= 0; k--) depth.set(chain[k]!, ++d);
  }
  return depth;
}

/**
 * Group boxes (D285): their content's bounds plus padding, inner groups first, at least as wide
 * as the title. A group with no nodes in it is stacked below everything else, from `below` or
 * the bottom of the other groups' boxes, whichever is lower; the groups around it then grow to
 * hold it.
 */
function groupBoxes(graph: LayoutGraph, boxes: Map<string, Rect>, below: number): void {
  const byId = new Map(graph.groups.map((g) => [g.id, g]));
  const content = new Map<string, Rect>();
  for (const n of graph.nodes)
    if (n.parent !== undefined && byId.has(n.parent)) grow(content, n.parent, boxes.get(n.id)!);
  const depth = groupDepths(graph.groups);
  const inner = graph.groups
    .map((g, k) => ({ g, k, d: depth.get(g.id)! }))
    .sort((a, b) => b.d - a.d || a.k - b.k)
    .map(({ g }) => g);
  const close = (g: LayoutGroup, c: Rect): void => {
    const pad = g.padding;
    const r = {
      x0: c.x0 - pad.left,
      y0: c.y0 - pad.top,
      x1: c.x1 + pad.right,
      y1: c.y1 + pad.bottom,
    };
    const short = (g.title?.width ?? 0) + pad.left + pad.right - (r.x1 - r.x0);
    if (short > 0) {
      r.x0 -= short / 2;
      r.x1 += short / 2;
    }
    boxes.set(g.id, r);
    if (g.parent !== undefined && g.parent !== g.id && byId.has(g.parent))
      grow(content, g.parent, r);
  };
  const empty = new Set<LayoutGroup>();
  for (const g of inner) {
    const c = content.get(g.id);
    if (c) close(g, c);
    else empty.add(g);
  }
  if (empty.size === 0) return;
  let cursor = below;
  for (const g of graph.groups) {
    const r = boxes.get(g.id);
    if (r) cursor = Math.max(cursor, r.y1 + graph.spacing.node);
  }
  for (const g of empty) {
    let c = content.get(g.id);
    if (!c) {
      const pad = g.padding;
      c = { x0: 0, y0: cursor + pad.top, x1: 0, y1: cursor + pad.top };
      cursor += pad.top + pad.bottom + graph.spacing.node;
    }
    close(g, c);
  }
  // The groups closed first, again, now that their content may hold an empty group.
  for (const g of inner) if (!empty.has(g)) close(g, content.get(g.id)!);
}

// Where the line from a box's centre towards (dx, dy), not both 0, leaves it, and through which
// side. A direction along an axis never reaches the sides parallel to it (no 0 / 0 for a box of
// no width or height).
function exit(r: Rect, dx: number, dy: number): { p: RoutePoint; side: Side } {
  const hw = (r.x1 - r.x0) / 2;
  const hh = (r.y1 - r.y0) / 2;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const flat = tx <= ty;
  const t = Math.min(tx, ty);
  let side: Side = dy > 0 ? 'bottom' : 'top';
  if (flat) side = dx > 0 ? 'right' : 'left';
  return { p: { x: r.x0 + hw + t * dx, y: r.y0 + hh + t * dy, axis: flat ? 'h' : 'v' }, side };
}

/** A straight route between two boxes' borders; a loop off the right side for one box. */
function straight(from: Rect, to: Rect, loop: number): LayoutModelEdge {
  if (from === to) {
    const q = (from.y1 - from.y0) / 4;
    const cy = (from.y0 + from.y1) / 2;
    return {
      points: [
        { x: from.x1, y: cy - q, axis: 'h' },
        { x: from.x1 + loop, y: cy - q, axis: 'h' },
        { x: from.x1 + loop, y: cy + q, axis: 'v' },
        { x: from.x1, y: cy + q, axis: 'h' },
      ],
      ports: { source: 'right', target: 'right' },
    };
  }
  let dx = (to.x0 + to.x1 - from.x0 - from.x1) / 2;
  const dy = (to.y0 + to.y1 - from.y0 - from.y1) / 2;
  if (dx === 0 && dy === 0) dx = 1;
  const a = exit(from, dx, dy);
  const b = exit(to, -dx, -dy);
  return { points: [a.p, { ...b.p, axis: a.p.axis }], ports: { source: a.side, target: b.side } };
}

/**
 * A tree edge leaves its parent on the side facing the child and enters the child's near side;
 * any other edge runs straight between the two boxes' borders. The middle label sits halfway
 * along, end labels a quarter of the way from their ends.
 */
function route(
  f: Forest,
  e: LayoutEdge,
  k: number,
  at: { x: Float64Array; y: Float64Array; side: Int8Array },
  boxes: Map<string, Rect>
): LayoutModelEdge {
  const t = f.index.get(e.target);
  let r: LayoutModelEdge;
  if (t !== undefined && f.via[t] === k) {
    const s = f.index.get(e.source)!;
    const dir = at.side[t]!;
    r = {
      points: [
        { x: at.x[s]! + (dir * f.w[s]!) / 2, y: at.y[s]!, axis: 'h' },
        { x: at.x[t]! - (dir * f.w[t]!) / 2, y: at.y[t]!, axis: 'h' },
      ],
      ports: dir > 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' },
    };
  } else r = straight(boxes.get(e.source)!, boxes.get(e.target)!, f.graph.spacing.rank / 2);
  const a = r.points[0]!;
  const b = r.points[r.points.length - 1]!;
  const along = (u: number): Point => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  if (e.label) r.label = along(0.5);
  if (e.startLabel) r.startLabel = along(0.25);
  if (e.endLabel) r.endLabel = along(0.75);
  return r;
}

/** Everything's bounds: boxes, route points and labels. */
function bounds(graph: LayoutGraph, boxes: Map<string, Rect>, routes: LayoutModelEdge[]): Rect {
  const all: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const take = (x: number, y: number, hw = 0, hh = 0): void => {
    all.x0 = Math.min(all.x0, x - hw);
    all.y0 = Math.min(all.y0, y - hh);
    all.x1 = Math.max(all.x1, x + hw);
    all.y1 = Math.max(all.y1, y + hh);
  };
  for (const r of boxes.values())
    take((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, (r.x1 - r.x0) / 2, (r.y1 - r.y0) / 2);
  graph.edges.forEach((e, k) => {
    const r = routes[k]!;
    for (const p of r.points) take(p.x, p.y);
    for (const [size, p] of [
      [e.label, r.label],
      [e.startLabel, r.startLabel],
      [e.endLabel, r.endLabel],
    ] as const)
      if (size && p) take(p.x, p.y, size.width / 2, size.height / 2);
  });
  return all.x0 > all.x1 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : all;
}

export function layoutTree(graph: LayoutGraph): LayoutModel {
  const f = forestOf(graph);
  const n = graph.nodes.length;
  const at = { x: new Float64Array(n), y: new Float64Array(n), side: new Int8Array(n) };
  const cursor = place(f, new Bands(f), at.x, at.y, at.side);
  const { w, h } = f;
  const boxes = new Map<string, Rect>();
  graph.nodes.forEach((d, i) => {
    const [cx, cy] = [at.x[i]!, at.y[i]!];
    boxes.set(d.id, {
      x0: cx - w[i]! / 2,
      y0: cy - h[i]! / 2,
      x1: cx + w[i]! / 2,
      y1: cy + h[i]! / 2,
    });
  });
  groupBoxes(graph, boxes, cursor);
  const routes = graph.edges.map((e, k) => route(f, e, k, at, boxes));

  // Everything moved in by the diagram padding.
  const pad = graph.diagramPadding ?? 0;
  const all = bounds(graph, boxes, routes);
  const dx = pad - all.x0;
  const dy = pad - all.y0;
  const move = <P extends Point>(p: P): P => ({ ...p, x: p.x + dx, y: p.y + dy });
  const nodes = new Map<string, LayoutModelNode>();
  graph.nodes.forEach((d, i) =>
    nodes.set(d.id, { x: at.x[i]! + dx, y: at.y[i]! + dy, width: w[i]!, height: h[i]! })
  );
  const groups = new Map<string, LayoutModelGroup>();
  for (const g of graph.groups) {
    const r = boxes.get(g.id)!;
    const cx = (r.x0 + r.x1) / 2 + dx;
    groups.set(g.id, {
      x: cx,
      y: (r.y0 + r.y1) / 2 + dy,
      width: r.x1 - r.x0,
      height: r.y1 - r.y0,
      title: { x: cx, y: r.y0 + g.padding.top / 2 + dy },
    });
  }
  const edges = new Map<string, LayoutModelEdge>();
  graph.edges.forEach((e, k) => {
    const r = routes[k]!;
    edges.set(e.id, {
      points: r.points.map(move),
      ports: r.ports,
      ...(r.label ? { label: move(r.label) } : {}),
      ...(r.startLabel ? { startLabel: move(r.startLabel) } : {}),
      ...(r.endLabel ? { endLabel: move(r.endLabel) } : {}),
    });
  });
  return {
    width: all.x1 - all.x0 + 2 * pad,
    height: all.y1 - all.y0 + 2 * pad,
    nodes,
    edges,
    groups,
    direction: graph.direction,
  };
}
