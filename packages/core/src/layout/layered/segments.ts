// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, where it was the start of `layOut`: `stepOf`,
// `spansOf`, `cutEdges`, `bendGroups`, `adjacency` and `buildGraph`. The algorithm is unchanged.
// cspell:ignore kepano lnode
//
// The graph that gets ordered and positioned: every edge cut into rank-to-rank segments.
import { pxProfile } from '../units.ts';
import { End, Kind, type Graph, type LEdge, type LNode, type LayeredOptions } from './graph.ts';
import { initialOrder, settlePositions } from './order.ts';
import { copy, f64, i32, u8 } from './scratch.ts';

// An edge gets a bend point in every rank it skips. Past this many, the longest edges are
// drawn as one direct curve instead, which keeps huge graphs from exhausting time and memory.
const MAX_DUMMIES = 20000;

// What `buildGraph` has when the edges are cut, before the order of the nodes.
type Cut = Omit<
  Graph,
  'succStart' | 'succE' | 'predStart' | 'predE' | 'layerStart' | 'order' | 'pos'
>;

// Every edge gets a middle rank of its own when labels or parallel edges need the room: 2, else 1.
export function stepOf(edges: LEdge[], real: number): number {
  const seen = new Set<number>();
  for (const e of edges) {
    const a = Math.min(e.tail, e.head);
    const b = Math.max(e.tail, e.head);
    const key = a * real + b;
    if (e.labelW > 0 || seen.has(key)) return 2;
    seen.add(key);
  }
  return 1;
}

// How many ranks each edge spans, which edges are drawn direct, and how many bends the rest need.
function spansOf(nodes: LNode[], edges: LEdge[]): [Int32Array, Uint8Array, number] {
  const m = edges.length;
  const span = i32(m);
  let dummies = 0;
  for (let ei = 0; ei < m; ei++) {
    const e = edges[ei]!;
    span[ei] = Math.abs(nodes[e.head]!.rank - nodes[e.tail]!.rank);
    if (span[ei]! > 1) dummies += span[ei]! - 1;
  }
  const direct = u8(m);
  if (dummies > MAX_DUMMIES) {
    const longest: number[] = [];
    for (let ei = 0; ei < m; ei++) if (span[ei]! > 1) longest.push(ei);
    longest.sort((a, b) => span[b]! - span[a]! || a - b);
    for (const ei of longest) {
      if (dummies <= MAX_DUMMIES) break;
      direct[ei] = 1;
      dummies -= span[ei]! - 1;
    }
  }
  return [span, direct, dummies];
}

// The rank that the label of an edge from rank `ra` to rank `rb` goes in.
function labelRankOf(e: LEdge, ra: number, rb: number, step: number): number {
  // The label goes halfway along. An edge that passes ranks of nodes on its way has its
  // label in one of those, beside the nodes, where it takes no height of its own: the one
  // halfway, or of the two either side of halfway, the one nearer the node the edge starts
  // from, which is the lower when the edge runs against the flow. An edge between two
  // neighbouring ranks has its label in the rank between them.
  let labelRank = ra + ((rb - ra) >> 1);
  if (step === 2 && rb - ra >= 4) {
    if ((labelRank & 1) === 1) labelRank += e.reversed ? 1 : -1;
  } else if (step === 2 && (labelRank & 1) === 0) labelRank += e.reversed ? 1 : -1;
  return labelRank;
}

// Cuts edge `ei` into segments from segment `ce` on, with its bends from node `next` on.
function cutEdge(c: Cut, e: LEdge, ei: number, next: number, ce: number): void {
  const { step, RANK, KEY, W, H, KIND, EF, ET, EFD, ETD, EFH, ETH, EFK, ETK } = c;
  const rev = e.reversed;
  const a = rev ? e.head : e.tail;
  const b = rev ? e.tail : e.head;
  const aDx = rev ? e.headDx : e.tailDx;
  const bDx = rev ? e.tailDx : e.headDx;
  const aFixed = rev ? e.headFixed : e.tailFixed;
  const bFixed = rev ? e.tailFixed : e.headFixed;
  if (aDx !== 0 || bDx !== 0) c.offsets = true;
  const ra = RANK[a]!;
  const rb = RANK[b]!;
  const labelRank = e.labelW > 0 ? labelRankOf(e, ra, rb, step) : -1;
  let prev = a;
  let d = next;
  let at = ce;
  if (rb - ra > 1) c.firstDummy[ei] = next;
  c.firstSeg[ei] = ce;
  EFH[ce] = aFixed ? 1 : 0;
  if (EFK && !aFixed) EFK[ce] = rev ? End.Arrives : End.Leaves;
  for (let r = ra + 1; r < rb; r++, d++) {
    RANK[d] = r;
    KEY[d] = KEY[a]! + ((KEY[b]! - KEY[a]!) * (r - ra)) / (rb - ra);
    if (r === labelRank) {
      W[d] = e.labelW;
      H[d] = e.labelH;
      KIND[d] = Kind.Label;
      c.labelNode[ei] = d;
      c.heads[r]! |= rev ? 2 : 1;
    } else {
      KIND[d] = Kind.Dummy;
    }
    EF[at] = prev;
    ET[at] = d;
    EFD[at] = prev === a ? aDx : 0;
    at++;
    prev = d;
  }
  EF[at] = prev;
  ET[at] = b;
  EFD[at] = prev === a ? aDx : 0;
  ETD[at] = bDx;
  ETH[at] = bFixed ? 1 : 0;
  if (ETK && !bFixed) ETK[at] = rev ? End.Leaves : End.Arrives;
  c.lastSeg[ei] = at;
}

function cutEdges(nodes: LNode[], edges: LEdge[], step: number, opt: LayeredOptions): Cut {
  const real = nodes.length;
  const m = edges.length;
  const [span, direct, dummies] = spansOf(nodes, edges);
  const n = real + dummies;
  const W = f64(n);
  const H = f64(n);
  const KIND = u8(n);
  const RANK = i32(n);
  const KEY = f64(n).fill(NaN);
  let maxRank = 0;
  let spans = false;
  for (let i = 0; i < real; i++) {
    const node = nodes[i]!;
    W[i] = node.w;
    H[i] = node.h;
    KIND[i] = node.kind;
    RANK[i] = node.rank;
    KEY[i] = node.key;
    if (node.rank > maxRank) maxRank = node.rank;
    if (node.span > 0 && node.kind === Kind.Node) spans = true;
  }
  let segments = 0;
  for (let ei = 0; ei < m; ei++) if (!direct[ei]!) segments += span[ei]!;
  const c: Cut = {
    n,
    real,
    maxRank,
    W,
    H,
    KIND,
    RANK,
    KEY,
    EF: i32(segments),
    ET: i32(segments),
    EFD: f64(segments),
    ETD: f64(segments),
    EFH: u8(segments),
    ETH: u8(segments),
    // What each segment's end is to the node it meets, for the ends that may move along the node's side.
    EFK: spans ? u8(segments) : undefined,
    ETK: spans ? u8(segments) : undefined,
    span,
    direct,
    firstDummy: i32(m).fill(-1),
    firstSeg: i32(m).fill(-1),
    lastSeg: i32(m).fill(-1),
    labelNode: i32(m).fill(-1),
    heads: u8(maxRank + 1),
    offsets: false,
    fixed: u8(maxRank + 1),
    GRP: undefined,
    groupParent: opt.groups?.parent,
    step,
    M: opt.metrics ?? pxProfile.engine,
  };
  let next = real;
  let ce = 0;
  for (let ei = 0; ei < m; ei++) {
    if (direct[ei]!) continue;
    cutEdge(c, edges[ei]!, ei, next, ce);
    next += span[ei]! - 1;
    ce += span[ei]!;
  }
  return c;
}

// The innermost group that holds both groups `a` and `b`.
function commonGroup(parent: Int32Array, a: number, b: number): number {
  let x = a;
  let y = b;
  let dx = 0;
  let dy = 0;
  for (let gr = a; gr >= 0; gr = parent[gr]!) dx++;
  for (let gr = b; gr >= 0; gr = parent[gr]!) dy++;
  for (; dx > dy; dx--) x = parent[x]!;
  for (; dy > dx; dy--) y = parent[y]!;
  while (x !== y) {
    x = parent[x]!;
    y = parent[y]!;
  }
  return x;
}

// Bends belong to the innermost group containing both edge endpoints.
function bendGroups(c: Cut, edges: LEdge[], of: Int32Array, parent: Int32Array): void {
  const { n, real, firstDummy, span } = c;
  const GRP = i32(n);
  for (let i = 0; i < real; i++) GRP[i] = of[i]!;
  for (let ei = 0; ei < edges.length; ei++) {
    if (firstDummy[ei]! < 0) continue;
    const e = edges[ei]!;
    const gr = commonGroup(parent, of[e.tail]!, of[e.head]!);
    for (let d = firstDummy[ei]!, end = d + span[ei]! - 1; d < end; d++) GRP[d] = gr;
  }
  c.GRP = GRP;
}

// The segments that leave and reach each node, as runs in one array each.
function adjacency(c: Cut): Pick<Graph, 'succStart' | 'succE' | 'predStart' | 'predE'> {
  const { n, EF, ET } = c;
  const segments = EF.length;
  const succStart = i32(n + 1);
  const predStart = i32(n + 1);
  for (let e = 0; e < segments; e++) {
    succStart[EF[e]! + 1]!++;
    predStart[ET[e]! + 1]!++;
  }
  for (let i = 0; i < n; i++) {
    succStart[i + 1]! += succStart[i]!;
    predStart[i + 1]! += predStart[i]!;
  }
  const succE = i32(segments);
  const predE = i32(segments);
  const sf = copy(succStart, n);
  const pf = copy(predStart, n);
  for (let e = 0; e < segments; e++) {
    succE[sf[EF[e]!]!++] = e;
    predE[pf[ET[e]!]!++] = e;
  }
  return { succStart, succE, predStart, predE };
}

// The graph with its nodes in their first order, and their places in it.
export function buildGraph(
  nodes: LNode[],
  edges: LEdge[],
  step: number,
  opt: LayeredOptions
): Graph {
  const c = cutEdges(nodes, edges, step, opt);
  if (opt.groups) bendGroups(c, edges, opt.groups.of, opt.groups.parent);
  const { n, maxRank, RANK } = c;
  const layerStart = i32(maxRank + 2);
  for (let i = 0; i < n; i++) layerStart[RANK[i]! + 1]!++;
  for (let r = 0; r <= maxRank; r++) layerStart[r + 1]! += layerStart[r]!;
  const g: Graph = { ...c, ...adjacency(c), layerStart, order: i32(n), pos: i32(n) };
  initialOrder(g, nodes);
  settlePositions(g);
  return g;
}
