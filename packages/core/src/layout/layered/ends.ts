// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`. The algorithm is unchanged.
// cspell:ignore kepano lnode indeg
//
// Where the ends of edges sit along the sides of their nodes, and where labels and bends sit between nodes.

import {
  End,
  IN_LINE,
  isDummy,
  Kind,
  TWIN,
  type Graph,
  type LEdge,
  type LNode,
  type LayeredOptions,
} from './graph.ts';
import { halfRoom } from './position.ts';
import { i32, u8 } from './scratch.ts';

// The room a label or bend keeps from its neighbour: a full gap from a node or between two of a
// kind, half of one otherwise.
function gapBetween(other: number, self: number, nodeSep: number, sep: number): number {
  if (other === Kind.Node) return nodeSep / 2 + sep / 2;
  return other === self ? sep : sep / 2;
}

// The ends of edges that may move along one side of a node (0 the side its edges arrive at, 1 the
// other), ordered by their opposite nodes to avoid crossings. `ids` and `room` must start empty.
// `ids` receives the ends; `room` receives their minimum gaps. Returns the sum of the gaps.
// When there is too little room for a full pitch between each pair, the edges that leave side by
// side move closer together, since they have no arrowheads to keep apart. With less room still,
// neighbours that run the same way share a place, which keeps an arrowhead apart from an edge
// that leaves beside it.
function sideEnds(
  g: Graph,
  v: number,
  side: number,
  span: number,
  ids: number[],
  room: number[]
): number {
  const { M } = g;
  const kinds = (side === 0 ? g.ETK : g.EFK)!;
  const start = side === 0 ? g.predStart : g.succStart;
  const list = side === 0 ? g.predE : g.succE;
  const other = side === 0 ? g.EF : g.ET;
  const pos = g.pos;
  for (let k = start[v]!; k < start[v + 1]!; k++)
    if (kinds[list[k]!]! !== End.Held) ids.push(list[k]!);
  if (ids.length < 2) return 0;
  ids.sort((a, b) => pos[other[a]!]! - pos[other[b]!]! || a - b);
  const fill = (share: (leaves: boolean, same: boolean) => number): number => {
    let total = 0;
    room[0] = 0;
    for (let k = 1; k < ids.length; k++) {
      const same = kinds[ids[k]!]! === kinds[ids[k - 1]!]!;
      room[k] = share(same && kinds[ids[k]!]! === End.Leaves, same);
      total += room[k]!;
    }
    return total;
  };
  let total = fill(() => 1);
  if (span / total < M.minPitch) total = fill((leaves) => (leaves ? 0.5 : 1));
  if (span / total < M.minPitch) total = fill((_leaves, same) => (same ? 0 : 1));
  if (total === 0) return 0;
  const pitch = Math.min(M.portPitch, span / total);
  for (let k = 1; k < ids.length; k++) room[k]! *= pitch;
  return total * pitch;
}

// Gives the edges that meet one side of a node places of their own along it, around its middle.
export function spread(g: Graph, nodes: LNode[]): void {
  const { real, W, EFD, ETD } = g;
  for (let v = 0; v < real; v++) {
    const span = Math.min(nodes[v]!.span, W[v]!);
    if (span <= 0 || nodes[v]!.kind !== Kind.Node) continue;
    for (let side = 0; side < 2; side++) {
      const ids: number[] = [];
      const room: number[] = [];
      const total = sideEnds(g, v, side, span, ids, room);
      if (total === 0) continue;
      const dx = side === 0 ? ETD : EFD;
      let at = -total / 2;
      for (let k = 0; k < ids.length; k++) {
        at += room[k]!;
        dx[ids[k]!] = at;
      }
    }
  }
}

// The segment of an edge that reaches the next point held in place, on the way up from segment
// `e` (side 0) or down: past the bends in ranks that hold nothing else.
function follow(g: Graph, empty: Uint8Array | undefined, from: number, side: number): number {
  let e = from;
  if (!empty) return e;
  const { KIND, RANK, EF, ET, succStart, succE, predStart, predE } = g;
  for (let hops = 0; hops < 100000; hops++) {
    const u = side === 0 ? EF[e]! : ET[e]!;
    if (KIND[u]! !== Kind.Dummy || !empty[RANK[u]!]!) break;
    e = side === 0 ? predE[predStart[u]!]! : succE[succStart[u]!]!;
  }
  return e;
}

// Aligns border ports with the ends on their nodes so edges run straight across the gap.
// Ports are kept `edgeSep` apart while placed, more than ends on a short side get, so
// without this an edge turns outside the border and again in the gap.
// Leaves a rank alone unless every port can move without passing or meeting its neighbors.
export function alignPorts(g: Graph, xs: Float64Array, empty: Uint8Array | undefined): void {
  const { maxRank, KIND, EF, ET, EFD, ETD, succStart, succE, predStart, predE, layerStart, order } =
    g;
  for (const [r, kind] of [
    [0, Kind.StartPort],
    [maxRank, Kind.EndPort],
  ] as const) {
    const s = layerStart[r]!;
    const end = layerStart[r + 1]!;
    const to: number[] = [];
    for (let i = s; i < end; i++) {
      const v = order[i]!;
      const start = kind === Kind.StartPort;
      if (
        KIND[v]! !== kind ||
        (start ? succStart[v + 1]! - succStart[v]! : predStart[v + 1]! - predStart[v]!) !== 1
      )
        break;
      const e = follow(
        g,
        empty,
        start ? succE[succStart[v]!]! : predE[predStart[v]!]!,
        start ? 1 : 0
      );
      const at = start ? xs[ET[e]!]! + ETD[e]! : xs[EF[e]!]! + EFD[e]!;
      if (to.length > 0 && at < to[to.length - 1]! + TWIN) break;
      to.push(at);
    }
    if (to.length === 0 || to.length !== end - s) continue;
    for (let i = s; i < end; i++) xs[order[i]!] = to[i - s]!;
  }
}

// How many ends that may move along it each node has on the side its edges arrive at, and on
// the other. An end that has a side to itself keeps to the middle; ends that share one cannot
// all be there, so those may move.
export function freeEnds(g: Graph): [Int32Array, Int32Array] {
  const EFK = g.EFK!;
  const ETK = g.ETK!;
  const free: [Int32Array, Int32Array] = [i32(g.n), i32(g.n)];
  for (let e = 0; e < g.EF.length; e++) {
    if (ETK[e]! !== End.Held) free[0][g.ET[e]!]!++;
    if (EFK[e]! !== End.Held) free[1][g.EF[e]!]!++;
  }
  return free;
}

// Brings the labels and bends of each edge into line with an end of the edge, so that it runs
// straight from that end and turns once, at the other: with the end that has fewer edges beside
// it on its node, which is the one nearer the middle of its side, or else with the other, and
// as near to that as what is beside them in their ranks leaves room. The other end may then move
// along its node to meet the line. Bends in ranks that hold nothing else are left to `straighten`.
// An edge with no one line that all of its labels and bends have room on has each brought into
// line with the nearest point above or below that is held in place.
export function alignLabels(
  g: Graph,
  nodes: LNode[],
  xs: Float64Array,
  free: [Int32Array, Int32Array],
  opt: LayeredOptions,
  empty: Uint8Array | undefined
): void {
  const sep = opt.edgeSep;
  const {
    n,
    real,
    maxRank,
    KIND,
    RANK,
    W,
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
  } = g;
  const placed = (v: number): boolean =>
    KIND[v]! === Kind.Label ||
    (KIND[v]! === Kind.Dummy && !(empty !== undefined && empty[RANK[v]!]! === 1));
  // Where segment `e` ends on the way up (side 0) or down, and how many ends share that side of
  // the node there: none for a point that is not on a node.
  const end = (e: number, side: number): [number, number] => {
    const u = side === 0 ? EF[e]! : ET[e]!;
    const x = side === 0 ? xs[u]! + EFD[e]! : xs[u]! + ETD[e]!;
    return [x, u < real && nodes[u]!.kind === Kind.Node ? free[1 - side]![u]! : 0];
  };
  // The room the neighbours in its rank leave a label or bend: a full gap from a node or between
  // two labels, half of one between a label and a line that passes it.
  const room = (v: number): [number, number] => {
    const s = layerStart[RANK[v]!]!;
    const i = s + pos[v]!;
    const clear = (other: number): number =>
      W[other]! / 2 + W[v]! / 2 + gapBetween(KIND[other]!, KIND[v]!, opt.nodeSep, sep);
    return [
      i > s ? xs[order[i - 1]!]! + clear(order[i - 1]!) : -Infinity,
      i + 1 < layerStart[RANK[v]! + 1]! ? xs[order[i + 1]!]! - clear(order[i + 1]!) : Infinity,
    ];
  };
  // The place between `lo` and `hi` that is in line with one of two ends, or else nearest the first choice.
  const choose = (
    x: number,
    up: [number, number],
    down: [number, number],
    lo: number,
    hi: number
  ): number => {
    const upFirst =
      up[1] !== down[1] ? up[1] < down[1] : Math.abs(up[0] - x) <= Math.abs(down[0] - x);
    const choices = upFirst ? [up[0], down[0]] : [down[0], up[0]];
    return (
      choices.find((choice) => choice >= lo && choice <= hi) ??
      Math.max(lo, Math.min(hi, choices[0]!))
    );
  };
  const done = u8(n);
  const chain: number[] = [];
  for (let r = 1; r < maxRank; r++) {
    for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) {
      if (!placed(order[i]!) || done[order[i]!]!) continue;
      // The edge's labels and bends from its first node to its last, and the room they share.
      let top = order[i]!;
      while (isDummy(KIND[EF[predE[predStart[top]!]!]!]!)) top = EF[predE[predStart[top]!]!]!;
      let bottom = top;
      let lo = -Infinity;
      let hi = Infinity;
      chain.length = 0;
      for (let d = top; isDummy(KIND[d]!); d = ET[succE[succStart[d]!]!]!) {
        bottom = d;
        if (!placed(d)) continue;
        done[d] = 1;
        chain.push(d);
        const [least, most] = room(d);
        if (least > lo) lo = least;
        if (most < hi) hi = most;
      }
      if (lo <= hi) {
        const x = choose(
          xs[chain[0]!]!,
          end(predE[predStart[top]!]!, 0),
          end(succE[succStart[bottom]!]!, 1),
          lo,
          hi
        );
        for (const d of chain) xs[d] = x;
        continue;
      }
      for (const d of chain) {
        const [least, most] = room(d);
        if (least > most) continue;
        xs[d] = choose(
          xs[d]!,
          end(follow(g, empty, predE[predStart[d]!]!, 0), 0),
          end(follow(g, empty, succE[succStart[d]!]!, 1), 1),
          least,
          most
        );
      }
    }
  }
}

// One side of a node whose ends may move: its free ends in order and the room between them, and
// all its ends in order.
interface Side {
  v: number;
  side: number;
  span: number;
  ids: number[];
  room: number[];
  all: number[];
}

// The sides that `settle` fits. End order and spacing stay fixed across passes.
function sideLists(g: Graph, nodes: LNode[]): Side[] {
  const { real, W, EF, ET, succStart, succE, predStart, predE, pos } = g;
  const sides: Side[] = [];
  for (let v = 0; v < real; v++) {
    const span = Math.min(nodes[v]!.span, W[v]!);
    if (span <= 0 || nodes[v]!.kind !== Kind.Node) continue;
    for (let side = 0; side < 2; side++) {
      const other = side === 0 ? EF : ET;
      const start = side === 0 ? predStart : succStart;
      const list = side === 0 ? predE : succE;
      const ids: number[] = [];
      const room: number[] = [];
      sideEnds(g, v, side, span, ids, room);
      if (ids.length === 0) continue;
      if (ids.length === 1) room[0] = 0;
      const all: number[] = [];
      for (let k = start[v]!; k < start[v + 1]!; k++) all.push(list[k]!);
      all.sort((a, b) => pos[other[a]!]! - pos[other[b]!]! || a - b);
      sides.push({ v, side, span, ids, room, all });
    }
  }
  return sides;
}

// Once the nodes have their places, moves an end along its side when that lets its edge run
// straight: when the point the edge runs to, or some part of the side it runs to, is in line
// with the end's own side. Any other end leans towards the point its edge runs to, where its
// side is long enough, and an end with a side to itself stays in the middle. On a group, the
// ends keep clear of the points where other edges pass through its border.
export function settle(
  g: Graph,
  nodes: LNode[],
  xs: Float64Array,
  free: [Int32Array, Int32Array],
  empty: Uint8Array | undefined
): void {
  const { real, W, EF, ET, EFD, ETD, M } = g;
  const EFK = g.EFK!;
  const ETK = g.ETK!;
  // Where the end of segment `e` on node `v` should be, from the middle of its side. The edge is
  // followed up from the segment (side 0) or down, past the bends in ranks that hold nothing
  // else, to where it next comes to a point that is held in place or to another node's side.
  const wanted = (from: number, side: number, v: number, span: number, again: boolean): number => {
    if (free[side]![v]! < 2) return 0;
    const e = follow(g, empty, from, side);
    const u = side === 0 ? EF[e]! : ET[e]!;
    const point = side === 0 ? xs[u]! + EFD[e]! : xs[u]! + ETD[e]!;
    // Once the other end has its place, this one comes into line with it if it can.
    if (again && Math.abs(point - xs[v]!) <= span / 2 + IN_LINE)
      return Math.max(-span / 2, Math.min(span / 2, point - xs[v]!));
    // The part of the other side that its end may move along, if it may move.
    let middle = point;
    let width = 0;
    if (
      u < real &&
      nodes[u]!.kind === Kind.Node &&
      (side === 0 ? EFK : ETK)[e]! !== End.Held &&
      free[1 - side]![u]! >= 2
    ) {
      width = Math.max(0, Math.min(nodes[u]!.span, W[u]!));
      if (width > 0) middle = xs[u]!;
    }
    const lo = Math.max(xs[v]! - span / 2, middle - width / 2);
    const hi = Math.min(xs[v]! + span / 2, middle + width / 2);
    // Two sides with no part in line: the end leans towards the other, if its side is long enough.
    if (lo > hi + IN_LINE) {
      const lean = Math.max(0, span / 2 - M.leanClear);
      return Math.max(-lean, Math.min(lean, point - xs[v]!));
    }
    // Both ends settle on one place in the part the two sides share: nearer the middle of the narrower.
    const place = (xs[v]! * width + middle * span) / (width + span);
    return Math.max(lo, Math.min(hi, place)) - xs[v]!;
  };
  // Moves the free ends `k..k + size` of one side into `lo..hi`, keeping their order and spacing.
  // Returns whether one moved.
  const fit = (
    s: Side,
    k: number,
    size: number,
    lo: number,
    hi: number,
    again: boolean
  ): boolean => {
    const { v, side, span, ids, room } = s;
    const dx = side === 0 ? ETD : EFD;
    let moved = false;
    // Isotonic fitting preserves order and spacing by pooling neighbours that are too close.
    const sum: number[] = [];
    const count: number[] = [];
    let before = 0;
    for (let j = 0; j < size; j++) {
      if (j > 0) before += room[k + j]!;
      sum.push(wanted(ids[k + j]!, side, v, span, again) - before);
      count.push(1);
      // Keep ends together when spacing forced them to share a place.
      let together = j > 0 && room[k + j]! === 0;
      while (
        sum.length > 1 &&
        (together ||
          sum[sum.length - 2]! / count[count.length - 2]! >
            sum[sum.length - 1]! / count[count.length - 1]!)
      ) {
        together = false;
        const top = sum.pop()!;
        const pooled = count.pop()!;
        sum[sum.length - 1]! += top;
        count[count.length - 1]! += pooled;
      }
    }
    const total = before;
    let j = 0;
    before = 0;
    for (let b = 0; b < sum.length; b++) {
      // Center the run if it cannot fit between held ends.
      const level =
        hi - total < lo
          ? (lo + hi - total) / 2
          : Math.max(lo, Math.min(hi - total, sum[b]! / count[b]!));
      for (let c = 0; c < count[b]!; c++, j++) {
        if (j > 0) before += room[k + j]!;
        if (Math.abs(dx[ids[k + j]!]! - level - before) > 0.01) moved = true;
        dx[ids[k + j]!] = level + before;
      }
    }
    return moved;
  };
  // Held ends divide the free ends of a side into runs, each fitted between the held ends round it.
  const fitSide = (s: Side, again: boolean): boolean => {
    const { side, span, all } = s;
    const kinds = side === 0 ? ETK : EFK;
    const dx = side === 0 ? ETD : EFD;
    let moved = false;
    let k = 0;
    let lo = -span / 2;
    for (let i = 0; i <= all.length; i++) {
      const held = i < all.length && kinds[all[i]!]! === End.Held;
      if (i < all.length && !held) continue;
      // Free ends since the last held end occupy ids[k..k + size).
      let size = 0;
      for (let j = i - 1; j >= 0 && kinds[all[j]!]! !== End.Held; j--) size++;
      const hi = held ? dx[all[i]!]! - M.portPitch : span / 2;
      if (size > 0) {
        if (fit(s, k, size, lo, hi, again)) moved = true;
        k += size;
      }
      if (held) lo = dx[all[i]!]! + M.portPitch;
    }
    return moved;
  };
  const sides = sideLists(g, nodes);
  // The ends of an edge follow each other, so the nodes are gone over until none moves: a few
  // times at most, in practice.
  for (let pass = 0, moved = true; moved && pass < 6; pass++) {
    moved = false;
    for (const s of sides) if (fitSide(s, pass > 0)) moved = true;
  }
}

// Brings edges that are nearly straight into line, by moving a node or bend a little across the
// flow along with everything it is in line with already, where the nodes beside them leave room.
// What is in line stays in line, so each move leaves one more edge straight.
export function snap(
  g: Graph,
  xs: Float64Array,
  empty: Uint8Array | undefined,
  opt: LayeredOptions
): void {
  const { n, KIND, RANK, EF, ET, EFD, ETD, layerStart, order, pos, M } = g;
  const passed = (u: number): boolean =>
    empty !== undefined && KIND[u]! === Kind.Dummy && empty[RANK[u]!]! === 1;
  // Each edge from one point that is held in place to the next, past the bends in ranks that hold nothing else.
  const a: number[] = [];
  const b: number[] = [];
  const da: number[] = [];
  const db: number[] = [];
  for (let e = 0; e < EF.length; e++) {
    if (passed(EF[e]!)) continue;
    const f = follow(g, empty, e, 1);
    a.push(EF[e]!);
    b.push(ET[f]!);
    da.push(EFD[e]!);
    db.push(ETD[f]!);
  }
  const off = (k: number): number => xs[b[k]!]! + db[k]! - xs[a[k]!]! - da[k]!;
  // The nodes in line with each other move as one.
  const block = i32(n);
  const members: number[][] = [];
  for (let i = 0; i < n; i++) {
    block[i] = i;
    members.push([i]);
  }
  const join = (x: number, y: number): void => {
    let keep = block[x]!;
    let drop = block[y]!;
    if (keep === drop) return;
    if (members[keep]!.length < members[drop]!.length) [keep, drop] = [drop, keep];
    for (const v of members[drop]!) {
      block[v] = keep;
      members[keep]!.push(v);
    }
    members[drop] = [];
  };
  const near: number[] = [];
  for (let k = 0; k < a.length; k++) {
    const d = Math.abs(off(k));
    if (d < 0.01) join(a[k]!, b[k]!);
    else if (d <= M.bendSnap) near.push(k);
  }
  if (near.length === 0) return;
  near.sort((x, y) => Math.abs(off(x)) - Math.abs(off(y)) || x - y);
  const gap = (v: number): number => halfRoom(g, opt, v);
  // Whether every node of a block can move by `shift` and keep its room from those beside it.
  const free = (id: number, shift: number): boolean => {
    for (const v of members[id]!) {
      const s = layerStart[RANK[v]!]!;
      const end = layerStart[RANK[v]! + 1]!;
      const i = s + pos[v]!;
      if (
        i > s &&
        block[order[i - 1]!]! !== id &&
        xs[v]! + shift - xs[order[i - 1]!]! < gap(v) + gap(order[i - 1]!) - 0.01
      )
        return false;
      if (
        i + 1 < end &&
        block[order[i + 1]!]! !== id &&
        xs[order[i + 1]!]! - xs[v]! - shift < gap(v) + gap(order[i + 1]!) - 0.01
      )
        return false;
    }
    return true;
  };
  for (const k of near) {
    const d = off(k);
    if (Math.abs(d) < 0.01) {
      join(a[k]!, b[k]!);
      continue;
    }
    if (Math.abs(d) > M.bendSnap || block[a[k]!]! === block[b[k]!]!) continue;
    // The smaller of the two blocks moves, if it can; else the other.
    const upper = block[a[k]!]!;
    const lower = block[b[k]!]!;
    const first = members[upper]!.length <= members[lower]!.length ? upper : lower;
    for (const id of [first, first === upper ? lower : upper]) {
      const shift = id === upper ? d : -d;
      if (Math.abs(d) > M.snap && !members[id]!.every((v) => KIND[v]! === Kind.Dummy)) continue;
      if (!free(id, shift)) continue;
      for (const v of members[id]!) xs[v]! += shift;
      join(a[k]!, b[k]!);
      break;
    }
  }
}

// Writes the offsets the ends settled on back to the edges that run through segments.
function writeBackEnds(edges: readonly LEdge[], g: Graph): void {
  const { EFD, ETD, direct, firstSeg, lastSeg } = g;
  for (let ei = 0; ei < edges.length; ei++) {
    if (direct[ei]!) continue;
    const e = edges[ei]!;
    const aDx = EFD[firstSeg[ei]!]!;
    const bDx = ETD[lastSeg[ei]!]!;
    e.tailDx = e.reversed ? bDx : aDx;
    e.headDx = e.reversed ? aDx : bDx;
  }
}

// Settles the ends of the edges along their nodes, and lines border ports up with them. In grid
// mode a label's line runs through the middle of a cell inside the label's box, and the box
// itself sits on the grid: returns the box's middle.
export function placeEnds(
  g: Graph,
  nodes: LNode[],
  edges: LEdge[],
  xs: Float64Array,
  empty: Uint8Array | undefined,
  opt: LayeredOptions
): Float64Array | undefined {
  if (g.EFK && g.ETK) {
    const free = freeEnds(g);
    alignLabels(g, nodes, xs, free, opt, empty);
    settle(g, nodes, xs, free, empty);
    snap(g, xs, empty, opt);
    writeBackEnds(edges, g);
  }
  alignPorts(g, xs, empty);
  const labelAt = opt.grid?.cross(g, nodes, xs, g.EFH, g.ETH);
  if (labelAt) writeBackEnds(edges, g);
  return labelAt;
}
