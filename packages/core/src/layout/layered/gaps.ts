// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, where it was the middle of `layOut`:
// `rankBands`, `baseGaps`, `headShift` and `trackGaps`. The algorithm is unchanged.
// cspell:ignore kepano
//
// The height of each rank and of the gap under it, and so where each rank sits.
import { Kind, type Graph, type LEdge, type LayeredOptions, type Pieces } from './graph.ts';
import { f64, i32, u8 } from './scratch.ts';
import { assignTracks } from './tracks.ts';

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

// Where each rank sits down the flow, and how its gap is crossed.
export interface Bands {
  top: Float64Array;
  bottom: Float64Array;
  // The rank that the pieces leaving each rank arrive at, past any that hold only bends.
  below: Int32Array;
  // The number of tracks (or levels) in the gap under each rank.
  count: Int32Array;
  // A rank between two ranks of nodes, which holds labels and bends only.
  between: Uint8Array;
  // The tracks of a gap keep `margin` from its ranks, and between the least pitch and `pitch` from each other.
  margin: number;
  pitch: number;
  height: number;
}

// Ranks that hold only border ports or their pass-through dummies need little room of their own.
function portOnly(g: Graph, r: number, kind: Kind): boolean {
  const { KIND, layerStart, order } = g;
  let found = false;
  for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) {
    const k = KIND[order[i]!]!;
    if (k === kind) found = true;
    else if (k !== Kind.Dummy) return false;
  }
  return found;
}

// The room under each rank. Edges that are not cut into pieces need more where they run far across.
function baseGaps(g: Graph, xs: Float64Array, opt: LayeredOptions, cut: boolean): Float64Array {
  const { maxRank, EF, ET, EFD, ETD, RANK, step } = g;
  const startRanks = portOnly(g, 0, Kind.StartPort) ? step : 0;
  const endRanks = portOnly(g, maxRank, Kind.EndPort) ? step : 0;
  // The longest way across that any edge travels in the gap below each rank.
  const run = f64(maxRank + 1);
  for (let e = 0; e < EF.length; e++) {
    const across = Math.abs(xs[EF[e]!]! + EFD[e]! - xs[ET[e]!]! - ETD[e]!);
    if (across > run[RANK[EF[e]!]!]!) run[RANK[EF[e]!]!] = across;
  }
  const usual = (r: number): number =>
    (r < startRanks || r >= maxRank - endRanks ? opt.portSep : opt.rankSep) / step;
  const gapUnder = f64(maxRank + 1);
  for (let r = 0; r < maxRank; r++) {
    gapUnder[r] = cut
      ? usual(r)
      : Math.max(usual(r), Math.min((MAX_GAP * opt.rankSep) / step, run[r]! * MIN_SLOPE));
  }
  return gapUnder;
}

// A rank of labels whose edges all head the same way sits half the marker's room nearer their tails.
function headShift(g: Graph, gapUnder: Float64Array, between: Uint8Array, opt: LayeredOptions) {
  const { maxRank, heads } = g;
  for (let r = 1; r < maxRank; r++) {
    if (opt.tracks || !between[r]! || (heads[r]! !== 1 && heads[r]! !== 2)) continue;
    const shift = Math.min((opt.headRoom ?? 0) / 2, gapUnder[heads[r]! === 1 ? r - 1 : r]! / 2);
    gapUnder[r - 1]! += heads[r]! === 1 ? -shift : shift;
    gapUnder[r]! += heads[r]! === 1 ? shift : -shift;
  }
}

// Gives the pieces their tracks, and grows each gap to hold them. `b.below` gets the rank that the
// pieces leaving each rank arrive at, and the room between the two, which grows to hold the gap's
// tracks or levels.
function trackGaps(
  g: Graph,
  pieces: Pieces,
  empty: Uint8Array | undefined,
  gapUnder: Float64Array,
  opt: LayeredOptions,
  b: Bands
): void {
  const { maxRank, M } = g;
  const { below, count } = b;
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
  assignTracks(pieces, count, !opt.tracks, room, tall, M);
  const leastPitch = opt.tracks ? M.trackPitch : M.levelPitch;
  for (let r = 0; r < maxRank; r++) {
    if (count[r]! > 0)
      gapUnder[r]! += Math.max(0, 2 * b.margin + (count[r]! - 1) * leastPitch - room[r]!);
    else if (tall[r]! > 0)
      gapUnder[r]! += Math.max(0, Math.min(MAX_GAP * opt.rankSep, tall[r]!) - room[r]!);
  }
}

export function rankBands(
  g: Graph,
  xs: Float64Array,
  empty: Uint8Array | undefined,
  pieces: Pieces | undefined,
  edges: LEdge[],
  opt: LayeredOptions
): Bands {
  const { maxRank, real, RANK, H, layerStart, order, M } = g;
  const between = u8(maxRank + 1).fill(1);
  for (let i = 0; i < real; i++) between[RANK[i]!] = 0;
  const b: Bands = {
    top: f64(maxRank + 1),
    bottom: f64(maxRank + 1),
    below: i32(maxRank + 1),
    count: i32(maxRank + 1),
    between,
    margin: opt.tracks ? M.trackMargin : M.levelMargin,
    pitch: opt.tracks ? M.trackSpread : M.levelPitch,
    height: 0,
  };
  const gapUnder = baseGaps(g, xs, opt, pieces !== undefined);
  headShift(g, gapUnder, between, opt);
  if (pieces) trackGaps(g, pieces, empty, gapUnder, opt, b);
  roomForEnds(edges, g, empty, gapUnder);
  const hooks = opt.grid;
  if (hooks) for (let r = 0; r < maxRank; r++) gapUnder[r] = hooks.ceil(gapUnder[r]!);
  let y = 0;
  for (let r = 0; r <= maxRank; r++) {
    let h = 0;
    for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++)
      if (H[order[i]!]! > h) h = H[order[i]!]!;
    b.top[r] = y;
    b.bottom[r] = y + h;
    y += h + gapUnder[r]!;
  }
  b.height = y;
  return b;
}

// Edge-end labels (D102) sit beside an edge next to its ends, each in the stretch of gaps between
// its end's rank and the next rank that holds more than bends. A stretch too short for its
// labels grows, at the gap next to the end. Graphs without end labels are left as they are.
function roomForEnds(
  edges: readonly LEdge[],
  g: Graph,
  empty: Uint8Array | undefined,
  gapUnder: Float64Array
): void {
  const { RANK, direct } = g;
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
