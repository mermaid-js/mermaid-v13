// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: `const enum`s are `as const` objects, and index reads carry `!` for
// noUncheckedIndexedAccess. `NODE_INPUTS`/`EDGE_INPUTS`/`layoutInputs` are new. Length
// constants come from `opt.metrics` (D77), and `opt.grid` puts the layout on a grid (D140).
// The algorithm is otherwise unchanged.
// cspell:ignore kepano lnode lnodes indeg topo cand maxs Köpf
//
// Layered (Sugiyama-style) layout of one flat graph. Ranks run down the y axis; callers
// rotate the result for other directions.
//
// What the layout of edges aims for, most important first. Where two aims pull apart, the one
// higher up decides, and each names where it is carried out.
//
// 1. Lines can be told apart. No two touch or run along each other, and none runs through a
//    node or a label. Ends on one side of a node have places of their own (`spread`), and
//    curves that would pass within a few pixels turn at levels of their own (`assignTracks`).
// 2. Lines cross as little as the order of the nodes allows (`reduceCrossings`, and the order
//    of the levels in `assignTracks`).
// 3. An edge takes the shortest and simplest way: straight if it can, else one curve, else a
//    curve with a level run. One that passes several ranks runs in line with one of its ends
//    and turns once, at the other (`alignLabels`, `straighten`). Ends slide along their sides,
//    and nodes move a little, where that makes an edge straight (`settle`, `snap`).
// 4. An edge meets the middle of a side. An end with a side to itself stays there, and ends
//    that share a side sit around the middle in the order of where they lead. An end moves off
//    the middle only for the aims above (`settle`).
// 5. The drawing is balanced, and what is alike is drawn alike. A label sits midway along the
//    line that shows, the curves either side of it have much the same room to turn in, and a gap
//    whose curves mostly cross has them all as the same plain curve rather than each on a
//    level of its own (`headRoom` in `layered`, the crossed gaps in `assignTracks`).
// 6. An edge leaves and reaches a node square to it, and an arrowhead points straight at the
//    node (`routePath` in svg/edges.ts, which draws the routes).
// 7. Nodes keep the order they were written in, where nothing above says otherwise.
// 8. The drawing stays compact. A gap between ranks grows only to hold the levels in it, or
//    to let curves that cross do so at a clear angle.

import { pxProfile } from '../units.ts';
import { copy, f64, i32, scratch, u8 } from './scratch.ts';
import {
  End,
  IN_LINE,
  Kind,
  type Graph,
  type LEdge,
  type LNode,
  type LayeredOptions,
  type LayeredResult,
  type Pieces,
} from './graph.ts';
import type { LayoutMetrics } from '../units.ts';
import { alignLabels, alignPorts, freeEnds, settle, snap, spread, writeBackEnds } from './ends.ts';
import { emptyRanks, pastLabels, straighten } from './bends.ts';
import { reduceCrossings, settlePositions, sortLayer } from './order.ts';
import { position } from './position.ts';
import { orient, rank } from './rank.ts';
export { orient, rank } from './rank.ts';
export { groupArranger, sortLayer } from './order.ts';
export { Kind, type LEdge, type LNode, type LayeredOptions, type LayeredResult } from './graph.ts';

/** The fields of {@link LNode} and {@link LEdge} that `layered` reads. The others are its output. */
export const NODE_INPUTS = [
  'w',
  'h',
  'kind',
  'pin',
  'hint',
  'key',
  'span',
] as const satisfies readonly (keyof LNode)[];
export const EDGE_INPUTS = [
  'tail',
  'head',
  'minlen',
  'labelW',
  'labelH',
  'tailDx',
  'headDx',
  'tailFixed',
  'headFixed',
  'tailEnd',
  'headEnd',
] as const satisfies readonly (keyof LEdge)[];

/** Every input `layered` reads from `nodes` and `edges`. Equal inputs and options give equal layouts. */
export function layoutInputs(nodes: readonly LNode[], edges: readonly LEdge[]): number[] {
  const inputs: number[] = [];
  for (const n of nodes) for (const f of NODE_INPUTS) inputs.push(n[f]);
  for (const e of edges) for (const f of EDGE_INPUTS) inputs.push(+e[f]);
  return inputs;
}

export function lnode(w: number, h: number, kind: Kind = Kind.Node): LNode {
  return { w, h, kind, pin: 0, hint: NaN, key: NaN, span: 0, x: 0, y: 0, rank: 0 };
}

export function ledge(tail: number, head: number, minlen = 1, labelW = 0, labelH = 0): LEdge {
  return {
    tail,
    head,
    minlen,
    labelW,
    labelH,
    tailDx: 0,
    headDx: 0,
    tailFixed: false,
    headFixed: false,
    tailEnd: 0,
    headEnd: 0,
    reversed: false,
    points: [],
    labelX: 0,
    labelY: 0,
  };
}

// An edge gets a bend point in every rank it skips. Past this many, the longest edges are
// drawn as one direct curve instead, which keeps huge graphs from exhausting time and memory.
const MAX_DUMMIES = 20000;

// Length constants come from `LayoutMetrics` (D77): `opt.metrics`, or the px profile's. Their
// px values are Pele's. `portPitch`/`minPitch`: the room between two edges that meet one side
// of a node, and the least that keeps their arrowheads apart.

// Where edges are not given levels, a gap between ranks grows to keep the edges that cross it at
// least this steep, up to this many times its usual height. Shallower than that, the edges of a
// wide rank are hard to tell apart.
const MIN_SLOPE = 0.125;
const MAX_GAP = 3;

// Tracks (`trackMargin`, `trackPitch`, `trackSpread`): the room kept clear between a rank and the
// nearest track, the room between two tracks when the gap has to grow to hold them, and the most
// they spread to when it has room to spare.
// A curve is one plain S unless it runs more than this many times as far across as the gap is
// high, and so does another that it would run along. Then each turns onto a level of its own
// to run across on. The levels of a gap keep this far from its ranks, to leave room to turn
// in (`levelMargin`), and from each other (`levelPitch`).
const LEVEL_WIDE = 2;
// Two plain curves that would pass too near each other turn at levels of their own as well:
// nearer than `levelClear` where one of them runs far across, since it stays near the other for
// a long way, and otherwise nearer than `levelTouch`. `levelLead` is the room a plain curve is
// taken to keep straight at each end of its gap.
// Levels tell apart curves that run alongside each other. Where the curves of a gap cross each
// other more often than that, runs along levels only make the crossings long and shallow, so
// each curve is one plain S instead, and the gap is made this many times as tall as its widest
// curve runs across (and no taller than MAX_GAP allows), for them to cross at a clear angle.
const CROSSED_SLOPE = 0.5;
// `snap`: a node, with whatever it is already in line with, moves this far at most to bring one
// more of its edges into line. `bendSnap`: bends with no node in line with them move this far at
// most to bring an edge into line. `leanClear`: an end that cannot be brought into line leans
// towards where its edge goes, but keeps this far from the ends of the part of its side that
// edges spread along. On a narrow node that leaves it in the middle.
// Past this many edges across one gap, tracks are given out in a plain order: weighing every
// pair of edges against each other would take too long.
const MAX_WEIGHED = 400;
// Reuse curve-sampling buffers across layouts.
const SAMPLES = 16;
const LINE_A = new Float64Array(2 * SAMPLES + 2);
const LINE_B = new Float64Array(2 * SAMPLES + 2);

// Its scratch arrays live until it returns (see scratch.ts); none is kept in what it gives back.
export function layered(nodes: LNode[], edges: LEdge[], opt: LayeredOptions): LayeredResult {
  return scratch(() => layOut(nodes, edges, opt));
}

function layOut(nodes: LNode[], edges: LEdge[], opt: LayeredOptions): LayeredResult {
  const M = opt.metrics ?? pxProfile.engine;
  const real = nodes.length;
  if (real === 0) return { width: 0, height: 0 };
  const m = edges.length;
  if (real === 1 && m === 0 && nodes[0]!.kind === Kind.Node) {
    const node = nodes[0]!;
    node.rank = 0;
    node.x = node.w / 2;
    node.y = node.h / 2;
    return { width: node.w, height: node.h };
  }

  // Every edge gets a middle rank of its own when labels or parallel edges need the room.
  let step = 1;
  if (m > 0) {
    const seen = new Set<number>();
    for (const e of edges) {
      const a = Math.min(e.tail, e.head);
      const b = Math.max(e.tail, e.head);
      const key = a * real + b;
      if (e.labelW > 0 || seen.has(key)) {
        step = 2;
        break;
      }
      seen.add(key);
    }
  }

  orient(nodes, edges);
  rank(nodes, edges, step);

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

  const n = real + dummies;
  const W = f64(n);
  const H = f64(n);
  const KIND = u8(n);
  const RANK = i32(n);
  let maxRank = 0;
  for (let i = 0; i < real; i++) {
    const node = nodes[i]!;
    W[i] = node.w;
    H[i] = node.h;
    KIND[i] = node.kind;
    RANK[i] = node.rank;
    if (node.rank > maxRank) maxRank = node.rank;
  }

  // The graph that gets ordered and positioned: every edge cut into rank-to-rank segments.
  let segments = 0;
  for (let ei = 0; ei < m; ei++) if (!direct[ei]!) segments += span[ei]!;
  const EF = i32(segments);
  const ET = i32(segments);
  const EFD = f64(segments);
  const ETD = f64(segments);
  const firstDummy = i32(m).fill(-1);
  // Which way the edges with a label in each rank head: 1 down, 2 up, 3 both.
  const heads = u8(maxRank + 1);
  const labelNode = i32(m).fill(-1);
  let spans = false;
  for (let i = 0; i < real; i++)
    if (nodes[i]!.span > 0 && nodes[i]!.kind === Kind.Node) spans = true;
  // What each segment's end is to the node it meets, for the ends that may move along the node's side.
  const EFK = spans ? u8(segments) : undefined;
  const ETK = spans ? u8(segments) : undefined;
  const firstSeg = i32(m).fill(-1);
  const lastSeg = i32(m).fill(-1);
  // Segment ends held where their offset puts them (grid mode moves only the others).
  const EFH = u8(segments);
  const ETH = u8(segments);
  const KEY = f64(n).fill(NaN);
  for (let i = 0; i < real; i++) KEY[i] = nodes[i]!.key;
  let offsets = false;
  {
    let next = real;
    let ce = 0;
    for (let ei = 0; ei < m; ei++) {
      if (direct[ei]!) continue;
      const e = edges[ei]!;
      const a = e.reversed ? e.head : e.tail;
      const b = e.reversed ? e.tail : e.head;
      const aDx = e.reversed ? e.headDx : e.tailDx;
      const bDx = e.reversed ? e.tailDx : e.headDx;
      if (aDx !== 0 || bDx !== 0) offsets = true;
      const ra = RANK[a]!;
      const rb = RANK[b]!;
      let labelRank = -1;
      if (e.labelW > 0) {
        // The label goes halfway along. An edge that passes ranks of nodes on its way has its
        // label in one of those, beside the nodes, where it takes no height of its own: the one
        // halfway, or of the two either side of halfway, the one nearer the node the edge starts
        // from, which is the lower when the edge runs against the flow. An edge between two
        // neighbouring ranks has its label in the rank between them.
        labelRank = ra + ((rb - ra) >> 1);
        if (step === 2 && rb - ra >= 4) {
          if ((labelRank & 1) === 1) labelRank += e.reversed ? 1 : -1;
        } else if (step === 2 && (labelRank & 1) === 0) labelRank += e.reversed ? 1 : -1;
      }
      let prev = a;
      if (rb - ra > 1) firstDummy[ei] = next;
      firstSeg[ei] = ce;
      EFH[ce] = (e.reversed ? e.headFixed : e.tailFixed) ? 1 : 0;
      if (EFK && !(e.reversed ? e.headFixed : e.tailFixed))
        EFK[ce] = e.reversed ? End.Arrives : End.Leaves;
      for (let r = ra + 1; r < rb; r++) {
        const d = next++;
        RANK[d] = r;
        KEY[d] = KEY[a]! + ((KEY[b]! - KEY[a]!) * (r - ra)) / (rb - ra);
        if (r === labelRank) {
          W[d] = e.labelW;
          H[d] = e.labelH;
          KIND[d] = Kind.Label;
          labelNode[ei] = d;
          heads[r]! |= e.reversed ? 2 : 1;
        } else {
          KIND[d] = Kind.Dummy;
        }
        EF[ce] = prev;
        ET[ce] = d;
        EFD[ce] = prev === a ? aDx : 0;
        ce++;
        prev = d;
      }
      EF[ce] = prev;
      ET[ce] = b;
      EFD[ce] = prev === a ? aDx : 0;
      ETD[ce] = bDx;
      ETH[ce] = (e.reversed ? e.tailFixed : e.headFixed) ? 1 : 0;
      if (ETK && !(e.reversed ? e.tailFixed : e.headFixed))
        ETK[ce] = e.reversed ? End.Leaves : End.Arrives;
      lastSeg[ei] = ce;
      ce++;
    }
  }

  // Bends belong to the innermost group containing both edge endpoints.
  let GRP: Int32Array | undefined;
  if (opt.groups) {
    const { of, parent } = opt.groups;
    GRP = i32(n);
    for (let i = 0; i < real; i++) GRP[i] = of[i]!;
    const depth = (gr: number): number => {
      let d = 0;
      for (; gr >= 0; gr = parent[gr]!) d++;
      return d;
    };
    const lca = (x: number, y: number): number => {
      let dx = depth(x);
      let dy = depth(y);
      for (; dx > dy; dx--) x = parent[x]!;
      for (; dy > dx; dy--) y = parent[y]!;
      while (x !== y) {
        x = parent[x]!;
        y = parent[y]!;
      }
      return x;
    };
    for (let ei = 0; ei < m; ei++) {
      if (firstDummy[ei]! < 0) continue;
      const e = edges[ei]!;
      const gr = lca(of[e.tail]!, of[e.head]!);
      for (let d = firstDummy[ei]!, end = d + span[ei]! - 1; d < end; d++) GRP[d] = gr;
    }
  }

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
  {
    const sf = copy(succStart, n);
    const pf = copy(predStart, n);
    for (let e = 0; e < segments; e++) {
      succE[sf[EF[e]!]!++] = e;
      predE[pf[ET[e]!]!++] = e;
    }
  }

  const layerStart = i32(maxRank + 2);
  for (let i = 0; i < n; i++) layerStart[RANK[i]! + 1]!++;
  for (let r = 0; r <= maxRank; r++) layerStart[r + 1]! += layerStart[r]!;
  const order = i32(n);
  const pos = i32(n);

  // Initial order: depth-first from the top so that subtrees start out contiguous.
  {
    const byRank = i32(n);
    const fill = copy(layerStart, maxRank + 1);
    for (let i = 0; i < n; i++) byRank[fill[RANK[i]!]!++] = i;
    for (let r = 0; r <= maxRank; r++) fill[r] = layerStart[r]!;
    const visited = u8(n);
    const stack: number[] = [];
    for (let k = 0; k < n; k++) {
      if (visited[byRank[k]!]!) continue;
      stack.push(byRank[k]!);
      while (stack.length > 0) {
        const v = stack.pop()!;
        if (visited[v]!) continue;
        visited[v] = 1;
        order[fill[RANK[v]!]!++] = v;
        for (let j = succStart[v + 1]! - 1; j >= succStart[v]!; j--) {
          const w = ET[succE[j]!]!;
          if (!visited[w]!) stack.push(w);
        }
      }
    }
  }

  const sortRank = (r: number, key: (v: number) => number): boolean =>
    sortLayer(order, layerStart[r]!, layerStart[r + 1]!, key);
  for (let r = 0; r <= maxRank; r++) sortRank(r, (v) => KEY[v]!);

  let pinned = false;
  for (let i = 0; i < real; i++) if (nodes[i]!.pin !== 0) pinned = true;
  if (pinned) {
    for (let r = 0; r <= maxRank; r++) {
      const layer = Array.from(order.subarray(layerStart[r], layerStart[r + 1]));
      const index = new Map<number, number>();
      layer.forEach((v, i) => index.set(v, i));
      const pinOf = (v: number): number => (v < real ? nodes[v]!.pin : 0);
      layer.sort((a, b) => pinOf(a) - pinOf(b) || index.get(a)! - index.get(b)!);
      order.set(layer, layerStart[r]);
    }
  }
  // Preserve port order to avoid crossings outside the group.
  const fixed = u8(maxRank + 1);
  const hint = (v: number): number =>
    v < real && (nodes[v]!.kind === Kind.StartPort || nodes[v]!.kind === Kind.EndPort)
      ? nodes[v]!.hint
      : NaN;
  for (const r of [0, maxRank]) if (sortRank(r, hint)) fixed[r] = 1;

  const g: Graph = {
    n,
    real,
    maxRank,
    W,
    KIND,
    RANK,
    EF,
    ET,
    EFD,
    ETD,
    succStart,
    succE,
    predStart,
    predE,
    layerStart,
    order,
    pos,
    offsets,
    fixed,
    span,
    direct,
    firstDummy,
    EFK,
    ETK,
    GRP,
    groupParent: opt.groups?.parent,
    M,
  };
  settlePositions(g);

  let crossings = 0;
  let declared = 0;
  if (segments > 0 && maxRank > 0) {
    [crossings, declared] = reduceCrossings(g, nodes);
    settlePositions(g);
  }
  if (opt.orderOnly) {
    // Points are (rank, cross-flow position) pairs.
    const at = position(g, opt);
    for (let i = 0; i < real; i++) nodes[i]!.x = at[i]!;
    for (let ei = 0; ei < m; ei++) {
      const e = edges[ei]!;
      const a = e.reversed ? e.head : e.tail;
      const b = e.reversed ? e.tail : e.head;
      const pts = [RANK[a]!, at[a]!];
      if (!direct[ei]! && firstDummy[ei]! >= 0)
        for (let d = firstDummy[ei]!, end = d + span[ei]! - 1; d < end; d++)
          pts.push(RANK[d]!, at[d]!);
      pts.push(RANK[b]!, at[b]!);
      e.points = pts;
    }
    return { width: 0, height: 0, crossings, declared };
  }

  if (EFK && ETK) spread(g, nodes);

  const xs = position(g, opt);

  const empty = emptyRanks(g);
  if (EFK && ETK) {
    const free = freeEnds(g);
    alignLabels(g, nodes, xs, free, opt, empty);
    settle(g, nodes, xs, free, empty);
    snap(g, xs, empty, opt);
    writeBackEnds(edges, direct, firstSeg, lastSeg, g);
  }

  alignPorts(g, xs, empty);
  const hooks = opt.grid;
  // In grid mode a label's line runs through the middle of a cell inside the label's box, and the
  // box itself sits on the grid: `labelAt` holds the box's middle.
  const labelAt = hooks?.cross(g, nodes, xs, EFH, ETH);
  if (labelAt) writeBackEnds(edges, direct, firstSeg, lastSeg, g);

  // A rank that holds nothing but the bends of edges is only there because some other edge has a
  // label or a twin. Its bends move onto the straight line between the ends of their edges, and
  // one that gets there is left out of the route, so that the edge is drawn as a single curve.
  const onLine = u8(n);
  if (empty && !opt.tracks) straighten(g, xs, empty, opt.apart ? 0 : opt.edgeSep, onLine);
  if (!opt.tracks) pastLabels(g, xs, opt.edgeSep, onLine);
  // An edge is cut where it passes a rank that holds something, and each piece crosses one gap.
  // With `tracks`, every piece that does not run straight gets a track to run across on at
  // right angles. Otherwise, where edges spread along their nodes, a piece gets one only if it
  // needs a level to turn onto. `pieceStart` gives every edge's run of pieces.
  const pieceStart = i32(m + 1);
  const pieces: Pieces | undefined =
    opt.tracks || (EFK && !opt.straight)
      ? { from: [], to: [], rank: [], lower: [], track: [], levels: [], wide: [] }
      : undefined;
  const trackCount = i32(maxRank + 1);
  if (pieces) {
    for (let ei = 0; ei < m; ei++) {
      pieceStart[ei] = pieces.from.length;
      if (direct[ei]!) continue;
      const d0 = firstDummy[ei]!;
      // An edge that keeps a bend to stay clear of its twin is drawn through the bend, as it is.
      let twin = false;
      for (let d = d0, end = d0 < 0 ? d0 : d0 + span[ei]! - 1; d < end; d++) {
        // So is one that has a bend left out in a rank of labels: its curve crosses that rank.
        const bare = empty !== undefined && empty[RANK[d]!]! === 1;
        if (!opt.tracks && bare !== (onLine[d]! === 1)) twin = true;
      }
      if (twin) continue;
      let x = xs[EF[firstSeg[ei]!]!]! + EFD[firstSeg[ei]!]!;
      let rank = RANK[EF[firstSeg[ei]!]!]!;
      for (let d = d0, end = d0 < 0 ? d0 : d0 + span[ei]! - 1; d < end; d++) {
        if (empty?.[RANK[d]!]) continue;
        pieces.from.push(x);
        pieces.to.push(xs[d]!);
        pieces.rank.push(rank);
        pieces.lower.push(d);
        x = xs[d]!;
        rank = RANK[d]!;
      }
      pieces.from.push(x);
      pieces.to.push(xs[ET[lastSeg[ei]!]!]! + ETD[lastSeg[ei]!]!);
      pieces.rank.push(rank);
      pieces.lower.push(-1);
    }
    pieceStart[m] = pieces.from.length;
  }

  // Ranks that hold only border ports or their pass-through dummies need little room of their own.
  const portOnly = (r: number, kind: Kind): boolean => {
    let found = false;
    for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) {
      const k = KIND[order[i]!]!;
      if (k === kind) found = true;
      else if (k !== Kind.Dummy) return false;
    }
    return found;
  };
  const startRanks = portOnly(0, Kind.StartPort) ? step : 0;
  const endRanks = portOnly(maxRank, Kind.EndPort) ? step : 0;
  // The longest way across that any edge travels in the gap below each rank.
  const run = f64(maxRank + 1);
  for (let e = 0; e < segments; e++) {
    const across = Math.abs(xs[EF[e]!]! + EFD[e]! - xs[ET[e]!]! - ETD[e]!);
    if (across > run[RANK[EF[e]!]!]!) run[RANK[EF[e]!]!] = across;
  }
  const bandTop = f64(maxRank + 1);
  const bandBottom = f64(maxRank + 1);
  const usual = (r: number): number =>
    (r < startRanks || r >= maxRank - endRanks ? opt.portSep : opt.rankSep) / step;
  // The room under each rank. Edges that are not cut into pieces need more where they run far across.
  const gapUnder = f64(maxRank + 1);
  for (let r = 0; r < maxRank; r++) {
    gapUnder[r] = pieces
      ? usual(r)
      : Math.max(usual(r), Math.min((MAX_GAP * opt.rankSep) / step, run[r]! * MIN_SLOPE));
  }
  // A rank between two ranks of nodes, which holds labels and bends only.
  const between = u8(maxRank + 1).fill(1);
  for (let i = 0; i < real; i++) between[RANK[i]!] = 0;
  for (let r = 1; r < maxRank; r++) {
    if (opt.tracks || !between[r]! || (heads[r]! !== 1 && heads[r]! !== 2)) continue;
    const shift = Math.min((opt.headRoom ?? 0) / 2, gapUnder[heads[r]! === 1 ? r - 1 : r]! / 2);
    gapUnder[r - 1]! += heads[r]! === 1 ? -shift : shift;
    gapUnder[r]! += heads[r]! === 1 ? shift : -shift;
  }
  // The part of its rank that an edge runs straight through at a bend or label. A bare bend
  // beside labels keeps to the middle half, which leaves the curves either side of it more room
  // and still keeps them clear of the labels' corners.
  const inset = (d: number): number =>
    KIND[d]! === Kind.Dummy && between[RANK[d]!]! && !opt.tracks
      ? (bandBottom[RANK[d]!]! - bandTop[RANK[d]!]!) / 4
      : 0;
  // The rank that the pieces leaving each rank arrive at, past any that hold only bends, and
  // the room between the two, which grows to hold the gap's tracks or levels: these keep
  // `margin` from the ranks, and between `leastPitch` and `mostPitch` from each other.
  const margin = opt.tracks ? M.trackMargin : M.levelMargin;
  const leastPitch = opt.tracks ? M.trackPitch : M.levelPitch;
  const mostPitch = opt.tracks ? M.trackSpread : M.levelPitch;
  const below = i32(maxRank + 1);
  if (pieces) {
    const room = f64(maxRank + 1);
    for (let r = 0; r < maxRank; r++) {
      if (empty?.[r]) continue;
      let next = r + 1;
      room[r] = gapUnder[r]!;
      while (next < maxRank && empty?.[next]) room[r]! += gapUnder[next++]!;
      below[r] = next;
    }
    for (let k = 0; k < pieces.from.length; k++)
      pieces.wide.push(
        Math.abs(pieces.from[k]! - pieces.to[k]!) > LEVEL_WIDE * room[pieces.rank[k]!]! ? 1 : 0
      );
    const tall = f64(maxRank + 1);
    assignTracks(pieces, trackCount, !opt.tracks, room, tall, M);
    for (let r = 0; r < maxRank; r++) {
      if (trackCount[r]! > 0)
        gapUnder[r]! += Math.max(0, 2 * margin + (trackCount[r]! - 1) * leastPitch - room[r]!);
      else if (tall[r]! > 0)
        gapUnder[r]! += Math.max(0, Math.min(MAX_GAP * opt.rankSep, tall[r]!) - room[r]!);
    }
  }
  roomForEnds(edges, RANK, direct, empty, gapUnder);
  if (hooks) for (let r = 0; r < maxRank; r++) gapUnder[r] = hooks.ceil(gapUnder[r]!);
  let y = 0;
  for (let r = 0; r <= maxRank; r++) {
    let h = 0;
    for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++)
      if (H[order[i]!]! > h) h = H[order[i]!]!;
    bandTop[r] = y;
    bandBottom[r] = y + h;
    y += h + gapUnder[r]!;
  }
  const height = y;
  // Where a piece runs across its gap, or would on another track of its group: its tracks sit
  // in the middle of the gap, the first at the top.
  const trackAt = (r: number, count: number, onTrack: number): number => {
    const top = bandBottom[r]!;
    const bottom = bandTop[below[r]!]!;
    const pitch = count > 1 ? Math.min(mostPitch, (bottom - top - 2 * margin) / (count - 1)) : 0;
    return (top + bottom) / 2 + (onTrack - (count - 1) / 2) * pitch;
  };
  // In grid mode each track of a gap takes a row of its own, clear of the rows the ends use.
  const gridRow = hooks?.tracks(bandTop, bandBottom, below, trackAt);
  const trackY = (piece: number, onTrack = pieces!.track[piece]!): number => {
    const r = pieces!.rank[piece]!;
    const count = opt.tracks ? trackCount[r]! : pieces!.levels[piece]!;
    return gridRow ? gridRow(r, count, onTrack) : trackAt(r, count, onTrack);
  };

  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    const half = W[i]! / 2;
    if (xs[i]! - half < minX) minX = xs[i]! - half;
    if (xs[i]! + half > maxX) maxX = xs[i]! + half;
  }
  if (hooks) {
    minX = hooks.floor(minX);
    maxX = hooks.ceil(maxX);
  }
  // Where edges spread along their nodes, a rank whose nodes only send edges on stands on one
  // line, and a rank whose nodes only receive them hangs from one, so that the edges of nodes of
  // different heights set out from, or arrive at, the same level. In any other rank the nodes
  // are centered.
  const arrives = u8(maxRank + 1);
  const leaves = u8(maxRank + 1);
  for (let i = 0; i < real; i++) {
    if (KIND[i]! !== Kind.Node || !EFK) continue;
    if (predStart[i + 1]! > predStart[i]!) arrives[RANK[i]!] = 1;
    if (succStart[i + 1]! > succStart[i]!) leaves[RANK[i]!] = 1;
  }
  for (let i = 0; i < real; i++) {
    const node = nodes[i]!;
    const r = node.rank;
    node.x = xs[i]! - minX;
    if (KIND[i]! === Kind.Node && leaves[r]! && !arrives[r]!) node.y = bandBottom[r]! - node.h / 2;
    else if (KIND[i]! === Kind.Node && arrives[r]! && !leaves[r]!)
      node.y = bandTop[r]! + node.h / 2;
    else if (hooks)
      node.y = bandTop[r]! + hooks.floor((bandBottom[r]! - bandTop[r]! - node.h) / 2) + node.h / 2;
    else node.y = (bandTop[r]! + bandBottom[r]!) / 2;
  }

  for (let ei = 0; ei < m; ei++) {
    const e = edges[ei]!;
    const first = nodes[e.reversed ? e.head : e.tail]!;
    const last = nodes[e.reversed ? e.tail : e.head]!;
    const pts: number[] = [first.x + (e.reversed ? e.headDx : e.tailDx), first.y + first.h / 2];
    const d0 = firstDummy[ei]!;
    if (pieces && pieceStart[ei + 1]! > pieceStart[ei]!) {
      for (let k = pieceStart[ei]!; k < pieceStart[ei + 1]!; k++) {
        if (pieces.track[k]! >= 0 && (opt.tracks || pieces.wide[k]! === 1)) {
          const across = trackY(k);
          pts.push(pieces.from[k]! - minX, across, pieces.to[k]! - minX, across);
        } else if (pieces.track[k]! > 0) {
          // A short piece among levels runs straight until it is past the level before its
          // own, and turns in one S from there, so that it crosses none of them.
          pts.push(pieces.from[k]! - minX, trackY(k, pieces.track[k]! - 1));
        }
        const d = pieces.lower[k]!;
        if (d < 0) continue;
        pts.push(xs[d]! - minX, bandTop[RANK[d]!]! + inset(d));
        if (bandBottom[RANK[d]!]! > bandTop[RANK[d]!]!)
          pts.push(xs[d]! - minX, bandBottom[RANK[d]!]! - inset(d));
      }
    } else if (d0 >= 0) {
      for (let d = d0, end = d0 + span[ei]! - 1; d < end; d++) {
        if (onLine[d]!) continue;
        const x = xs[d]! - minX;
        const top = bandTop[RANK[d]!]!;
        const bottom = bandBottom[RANK[d]!]!;
        pts.push(x, top + inset(d));
        if (bottom > top) pts.push(x, bottom - inset(d));
      }
    }
    pts.push(last.x + (e.reversed ? e.tailDx : e.headDx), last.y - last.h / 2);
    if (e.reversed) {
      for (let i = 0, j = pts.length - 2; i < j; i += 2, j -= 2) {
        const tx = pts[i]!;
        const ty = pts[i + 1]!;
        pts[i] = pts[j]!;
        pts[i + 1] = pts[j + 1]!;
        pts[j] = tx;
        pts[j + 1] = ty;
      }
    }
    e.points = pts;
    const ln = labelNode[ei]!;
    if (ln >= 0) {
      e.labelX = (labelAt ? labelAt[ln]! : xs[ln]!) - minX;
      e.labelY = (bandTop[RANK[ln]!]! + bandBottom[RANK[ln]!]!) / 2;
      if (hooks) {
        const top = bandTop[RANK[ln]!]!;
        e.labelY = top + hooks.floor((bandBottom[RANK[ln]!]! - top - e.labelH) / 2) + e.labelH / 2;
      }
    } else if (e.labelW > 0) {
      e.labelX = (pts[0]! + pts[pts.length - 2]!) / 2;
      e.labelY = (pts[1]! + pts[pts.length - 1]!) / 2;
    }
  }

  return { width: maxX - minX, height };
}

// Edge-end labels (D102) sit beside an edge next to its ends, each in the stretch of gaps between
// its end's rank and the next rank that holds more than bends. A stretch too short for its
// labels grows, at the gap next to the end. Graphs without end labels are left as they are.
function roomForEnds(
  edges: readonly LEdge[],
  RANK: Int32Array,
  direct: Uint8Array,
  empty: Uint8Array | undefined,
  gapUnder: Float64Array
): void {
  const room = (lo: number, hi: number): number => {
    let sum = 0;
    for (let r = lo; r < hi; r++) sum += gapUnder[r]!;
    return sum;
  };
  const grow = (lo: number, hi: number, need: number, at: number): void => {
    const short = need - room(lo, hi);
    if (short > 0) gapUnder[at]! += short;
  };
  // The labels at the ends below and above each node may have to stand one past the other (the
  // placement moves a label out past one in its way), so each end makes room for all of them.
  const below = new Map<number, number>();
  const above = new Map<number, number>();
  const add = (m: Map<number, number>, node: number, v: number): void => {
    if (v > 0) m.set(node, (m.get(node) ?? 0) + v);
  };
  edges.forEach((e, ei) => {
    if (direct[ei]!) return;
    add(below, e.reversed ? e.head : e.tail, e.reversed ? e.headEnd : e.tailEnd);
    add(above, e.reversed ? e.tail : e.head, e.reversed ? e.tailEnd : e.headEnd);
  });
  edges.forEach((e, ei) => {
    if (direct[ei]! || (e.tailEnd <= 0 && e.headEnd <= 0)) return;
    const a = e.reversed ? e.head : e.tail;
    const b = e.reversed ? e.tail : e.head;
    const ra = RANK[a]!;
    const rb = RANK[b]!;
    // Every edge runs from a lower rank to a higher one once `orient` has run.
    if (rb <= ra) return;
    const upper = below.get(a) ?? 0;
    const lower = above.get(b) ?? 0;
    let next = ra + 1;
    while (next < rb && empty?.[next]) next++;
    let prev = rb - 1;
    while (prev > ra && empty?.[prev]) prev--;
    if (next === rb) grow(ra, rb, upper + lower, ra);
    else {
      grow(ra, next, upper, ra);
      grow(prev, rb, lower, rb - 1);
    }
  });
}

// How far along the flow the handles of a plain S reach, as a share of the way it travels along
// it. Half gives an even S. One that runs more than eight times as far across as along turns
// sooner and crosses in a straighter line, down to a quarter at sixteen times. The layout uses
// this to tell how near two curves will pass, and the drawing to draw them.
export function ease(across: number, along: number): number {
  return Math.max(0.25, Math.min(0.5, (4 * Math.abs(along)) / (Math.abs(across) || 1)));
}

// Gives every piece that does not run straight down a track across its gap, and counts the
// tracks of each gap. Two pieces in one gap share a track only where they cannot be mistaken
// for each other: where they do not overlap, or where they leave from or arrive at the same
// point, as the branches of a tree do. Which of two goes above the other is whichever makes
// them cross less. With `curved`, the tracks are levels for curves to turn onto, and only the
// pieces that would run along or too near another get one: each group of those counts its
// tracks from its own first. `room` is the height of the gap under each rank, and `tall`
// receives the height that a gap whose curves mostly cross each other should have instead of levels.
function assignTracks(
  pieces: Pieces,
  trackCount: Int32Array,
  curved: boolean,
  room: Float64Array,
  tall: Float64Array,
  M: LayoutMetrics
): void {
  const { from, to, rank, track, levels, wide } = pieces;
  const total = from.length;
  const byRank = new Map<number, number[]>();
  for (let k = 0; k < total; k++) {
    track.push(-1);
    levels.push(0);
    if (Math.abs(from[k]! - to[k]!) < IN_LINE) continue;
    const list = byRank.get(rank[k]!);
    if (list) list.push(k);
    else byRank.set(rank[k]!, [k]);
  }
  if (byRank.size === 0) return;
  // The pieces are compared pair by pair, so where each begins and ends across the flow is worked out once.
  const LO = f64(total);
  const HI = f64(total);
  for (let k = 0; k < total; k++) {
    LO[k] = Math.min(from[k]!, to[k]!);
    HI[k] = Math.max(from[k]!, to[k]!);
  }
  const within = (x: number, k: number): number =>
    x >= LO[k]! - IN_LINE && x <= HI[k]! + IN_LINE ? 1 : 0;
  const mates = (a: number, b: number): boolean =>
    Math.abs(from[a]! - from[b]!) < IN_LINE || Math.abs(to[a]! - to[b]!) < IN_LINE;
  const overlap = (a: number, b: number): boolean =>
    LO[a]! < HI[b]! - IN_LINE && LO[b]! < HI[a]! - IN_LINE;
  // Whether a and b need tracks of their own.
  const clash = (a: number, b: number): boolean => overlap(a, b) && !mates(a, b);
  // Whether one of a and b could cross the other, depending on which is above.
  const meet = (a: number, b: number): boolean =>
    overlap(a, b) ||
    within(to[a]!, b) + within(from[b]!, a) + within(to[b]!, a) + within(from[a]!, b) > 0;
  // How often a and b cross with a on the higher track: a's way down through b, and b's way down to itself through a.
  const crossings = (a: number, b: number): number => within(to[a]!, b) + within(from[b]!, a);
  // Returns pairs of list indices, smaller first. Omitted pairs cannot meet or clash.
  const nearPairs = (list: number[]): number[] => {
    const byLo = list.map((_, i) => i).sort((a, b) => LO[list[a]!]! - LO[list[b]!]!);
    const pairs: number[] = [];
    for (let x = 0; x < byLo.length; x++) {
      const i = byLo[x]!;
      const reach = HI[list[i]!]! + 4 * IN_LINE;
      for (let y = x + 1; y < byLo.length && LO[list[byLo[y]!]!]! <= reach; y++) {
        const j = byLo[y]!;
        pairs.push(Math.min(i, j), Math.max(i, j));
      }
    }
    return pairs;
  };

  // Gives the pieces of one gap in `list` their tracks, and each the number of tracks that the
  // pieces it has to do with take between them, counting its own from the first of those.
  // Returns the number of tracks. The pieces come without tracks.
  const lay = (list: number[]): number => {
    // A plain order to start from, and to keep where nothing says otherwise: the pieces that
    // reach furthest go first, so that those of one fan nest.
    list.sort((a, b) => HI[b]! - LO[b]! - (HI[a]! - LO[a]!) || LO[a]! - LO[b]! || a - b);
    const count = list.length;
    const above: number[][] = [];
    const group = list.map((_, i) => i);
    const find = (i: number): number => {
      while (group[i]! !== i) i = group[i] = group[group[i]!]!;
      return i;
    };
    const weighed = count <= MAX_WEIGHED;
    // Avoid storing quadratically many pairs in dense gaps.
    const pairs = weighed ? nearPairs(list) : [];
    const clashes: number[][] = weighed ? list.map(() => []) : [];
    for (let p = 0; p < pairs.length; p += 2) {
      const i = pairs[p]!;
      const j = pairs[p + 1]!;
      if (!clash(list[i]!, list[j]!)) continue;
      clashes[i]!.push(j);
      clashes[j]!.push(i);
    }
    let sequence = list.map((_, i) => i);
    if (weighed) {
      // above[j] lists the pieces that should be above list[j]. The order follows as many of
      // these as it can: a piece is placed once all that should be above it are, and when
      // none is free, the one with the fewest still waiting.
      const waiting = i32(count);
      const after: number[][] = [];
      for (let i = 0; i < count; i++) {
        above.push([]);
        after.push([]);
      }
      for (let p = 0; p < pairs.length; p += 2) {
        const i = pairs[p]!;
        const j = pairs[p + 1]!;
        const a = list[i]!;
        const b = list[j]!;
        if (!meet(a, b)) continue;
        group[find(i)] = find(j);
        const ab = crossings(a, b);
        const ba = crossings(b, a);
        if (ab === ba) continue;
        const first = ab < ba ? i : j;
        const second = ab < ba ? j : i;
        above[second]!.push(first);
        after[first]!.push(second);
        waiting[second]!++;
      }
      const placed = u8(count);
      sequence = [];
      for (let done = 0; done < count; done++) {
        let pick = -1;
        for (let i = 0; i < count; i++) {
          if (placed[i]!) continue;
          if (pick < 0 || waiting[i]! < waiting[pick]!) pick = i;
          if (waiting[i]! === 0) break;
        }
        placed[pick] = 1;
        sequence.push(pick);
        for (const j of after[pick]!) waiting[j]!--;
      }
    }
    const taken = new Set<number>();
    const onTrack: number[][] = [];
    let rows = 0;
    for (const at of sequence) {
      const k = list[at]!;
      let t = 0;
      for (const i of above[at]! ?? []) if (track[list[i]!]! >= t) t = track[list[i]!]! + 1;
      if (weighed) {
        taken.clear();
        for (const i of clashes[at]!) taken.add(track[list[i]!]!);
        while (taken.has(t)) t++;
      } else {
        while (onTrack[t]?.some((other) => clash(k, other))) t++;
        (onTrack[t] ??= []).push(k);
      }
      track[k] = t;
      if (t >= rows) rows = t + 1;
    }
    const first = i32(count).fill(rows);
    const last = i32(count).fill(-1);
    for (let i = 0; i < count; i++) {
      const root = find(i);
      first[root] = Math.min(first[root]!, track[list[i]!]!);
      last[root] = Math.max(last[root]!, track[list[i]!]!);
    }
    for (let i = 0; i < count; i++) {
      const root = find(i);
      levels[list[i]!] = last[root]! - first[root]! + 1;
      if (curved) track[list[i]!]! -= first[root]!;
    }
    return rows;
  };

  const sample = (k: number, h: number, out: Float64Array): void => {
    const c = ease(to[k]! - from[k]!, h);
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      out[2 * i] = from[k]! + (to[k]! - from[k]!) * t * t * (3 - 2 * t);
      out[2 * i + 1] = h * (3 * c * t * u * u + 3 * (1 - c) * t * t * u + t * t * t);
    }
  };
  const reaches = (points: Float64Array, line: Float64Array, limit: number): boolean => {
    // Allow rounding error in the cheap distance check before calling Math.hypot.
    const bound = limit * limit * (1 + 1e-9);
    for (let i = 0; i <= SAMPLES; i++) {
      const px = points[2 * i]!;
      const py = points[2 * i + 1]!;
      for (let j = 0; j < SAMPLES; j++) {
        const dx = line[2 * j + 2]! - line[2 * j]!;
        const dy = line[2 * j + 3]! - line[2 * j + 1]!;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((px - line[2 * j]!) * dx + (py - line[2 * j + 1]!) * dy) / (dx * dx + dy * dy || 1)
          )
        );
        const ex = px - line[2 * j]! - t * dx;
        const ey = py - line[2 * j + 1]! - t * dy;
        if (ex * ex + ey * ey < bound && Math.hypot(ex, ey) < limit) return true;
      }
    }
    return false;
  };
  const near = (a: number, b: number, height: number, limit: number): boolean => {
    const h = Math.max(height / 2, height - 2 * M.levelLead);
    sample(a, h, LINE_A);
    sample(b, h, LINE_B);
    return reaches(LINE_A, LINE_B, limit) || reaches(LINE_B, LINE_A, limit);
  };

  for (const [r, all] of byRank) {
    if (!curved) {
      trackCount[r] = lay(all);
      continue;
    }
    if (all.length > MAX_WEIGHED) continue;
    // The pieces that turn onto levels: first those that run far across and have another such
    // piece to be told apart from, then any two that would pass too near each other as plain
    // curves.
    const far = all.filter((k) => wide[k]! === 1);
    lay(far);
    const level = new Set(far.filter((k) => levels[k]! > 1));
    const pairs = nearPairs(all);
    for (let p = 0; p < pairs.length; p += 2) {
      const a = all[pairs[p]!]!;
      const b = all[pairs[p + 1]!]!;
      if ((level.has(a) && level.has(b)) || !clash(a, b) || from[a]! < to[a]! !== from[b]! < to[b]!)
        continue;
      if (near(a, b, room[r]!, wide[a]! === 1 || wide[b]! === 1 ? M.levelClear : M.levelTouch))
        level.add(a).add(b);
    }
    for (const k of far) {
      track[k] = -1;
      levels[k] = 0;
    }
    if (level.size === 0) continue;
    let crossing = 0;
    let alongside = 0;
    const beside = new Set<number>();
    for (let p = 0; p < pairs.length; p += 2) {
      const a = all[pairs[p]!]!;
      const b = all[pairs[p + 1]!]!;
      if (level.has(a) && level.has(b)) {
        if (!overlap(a, b)) continue;
        if (from[a]! < to[a]! !== from[b]! < to[b]!) crossing++;
        else if (!mates(a, b)) alongside++;
      } else if ((level.has(a) || level.has(b)) && meet(a, b)) beside.add(a).add(b);
    }
    if (crossing > alongside) {
      for (const k of all)
        if ((HI[k]! - LO[k]!) * CROSSED_SLOPE > tall[r]!)
          tall[r] = (HI[k]! - LO[k]!) * CROSSED_SLOPE;
      continue;
    }
    // With them go the short pieces that could cross one of them, so that each has its place
    // among the levels and crosses none.
    const members = all.filter((k) => level.has(k) || (wide[k]! !== 1 && beside.has(k)));
    lay(members);
    let most = 0;
    for (const k of members) if (levels[k]! > most) most = levels[k]!;
    trackCount[r] = most;
  }
}
