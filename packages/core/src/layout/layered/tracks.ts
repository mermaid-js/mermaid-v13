// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, and `assignTracks` is `geometry`, `layGap`,
// `sequenceOf`, `giveTracks`, `levelsOf`, `curvedGap` and the helpers they call. The algorithm
// is unchanged.
// cspell:ignore kepano
//
// The tracks and levels that edges turn onto in the gaps between ranks.
import type { LayoutMetrics } from '../units.ts';
import { IN_LINE, type Graph, type LayeredOptions, type Pieces } from './graph.ts';
import { f64, i32, u8 } from './scratch.ts';

// Levels tell apart curves that run alongside each other. Where the curves of a gap cross each
// other more often than that, runs along levels only make the crossings long and shallow, so
// each curve is one plain S instead, and the gap is made this many times as tall as its widest
// curve runs across (and no taller than MAX_GAP allows), for them to cross at a clear angle.
const CROSSED_SLOPE = 0.5;
// Past this many edges across one gap, tracks are given out in a plain order: weighing every
// pair of edges against each other would take too long.
const MAX_WEIGHED = 400;
// Reuse curve-sampling buffers across layouts.
const SAMPLES = 16;
const LINE_A = new Float64Array(2 * SAMPLES + 2);
const LINE_B = new Float64Array(2 * SAMPLES + 2);

// How far along the flow the handles of a plain S reach, as a share of the way it travels along
// it. Half gives an even S. One that runs more than eight times as far across as along turns
// sooner and crosses in a straighter line, down to a quarter at sixteen times. The layout uses
// this to tell how near two curves will pass, and the drawing to draw them.
export function ease(across: number, along: number): number {
  return Math.max(0.25, Math.min(0.5, (4 * Math.abs(along)) / (Math.abs(across) || 1)));
}

// Where each piece begins and ends across the flow, and how two of them relate. The pieces are
// compared pair by pair, so this is worked out once.
interface Geo {
  LO: Float64Array;
  HI: Float64Array;
  mates: (a: number, b: number) => boolean;
  overlap: (a: number, b: number) => boolean;
  // Whether a and b need tracks of their own.
  clash: (a: number, b: number) => boolean;
  // Whether one of a and b could cross the other, depending on which is above.
  meet: (a: number, b: number) => boolean;
  // How often a and b cross with a on the higher track: a's way down through b, and b's way down to itself through a.
  crossings: (a: number, b: number) => number;
  // Returns pairs of list indices, smaller first. Omitted pairs cannot meet or clash.
  nearPairs: (list: number[]) => number[];
}

function geometry(from: number[], to: number[]): Geo {
  const total = from.length;
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
  return {
    LO,
    HI,
    mates,
    overlap,
    clash: (a, b) => overlap(a, b) && !mates(a, b),
    meet: (a, b) =>
      overlap(a, b) ||
      within(to[a]!, b) + within(from[b]!, a) + within(to[b]!, a) + within(from[a]!, b) > 0,
    crossings: (a, b) => within(to[a]!, b) + within(from[b]!, a),
    nearPairs: (list) => {
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
    },
  };
}

function find(group: number[], from: number): number {
  let i = from;
  while (group[i]! !== i) i = group[i] = group[group[i]!]!;
  return i;
}

// The order the pieces of one gap are given tracks in: it follows as many of the wishes that one
// be above another as it can, a piece being placed once all that should be above it are, and when
// none is free, the one with the fewest still waiting. `above[j]` receives the pieces that should
// be above list[j]. Pieces that could meet are joined in `group`.
function sequenceOf(
  list: number[],
  pairs: number[],
  geo: Geo,
  above: number[][],
  group: number[]
): number[] {
  const count = list.length;
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
    if (!geo.meet(a, b)) continue;
    group[find(group, i)] = find(group, j);
    const ab = geo.crossings(a, b);
    const ba = geo.crossings(b, a);
    if (ab === ba) continue;
    const first = ab < ba ? i : j;
    const second = ab < ba ? j : i;
    above[second]!.push(first);
    after[first]!.push(second);
    waiting[second]!++;
  }
  const placed = u8(count);
  const sequence: number[] = [];
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
  return sequence;
}

// Gives the pieces in `sequence` the lowest track that is below those that should be above them
// and clear of those they clash with. Returns the number of tracks.
function giveTracks(
  list: number[],
  sequence: number[],
  above: number[][],
  clashes: number[][] | undefined,
  clash: Geo['clash'],
  track: number[]
): number {
  const taken = new Set<number>();
  const onTrack: number[][] = [];
  let rows = 0;
  for (const at of sequence) {
    const k = list[at]!;
    let t = 0;
    for (const i of above[at] ?? []) if (track[list[i]!]! >= t) t = track[list[i]!]! + 1;
    if (clashes) {
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
  return rows;
}

// Gives each piece the number of tracks that the pieces it has to do with take between them,
// counting its own from the first of those.
function levelsOf(
  list: number[],
  group: number[],
  rows: number,
  pieces: Pieces,
  curved: boolean
): void {
  const { track, levels } = pieces;
  const count = list.length;
  const first = i32(count).fill(rows);
  const last = i32(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const root = find(group, i);
    first[root] = Math.min(first[root]!, track[list[i]!]!);
    last[root] = Math.max(last[root]!, track[list[i]!]!);
  }
  for (let i = 0; i < count; i++) {
    const root = find(group, i);
    levels[list[i]!] = last[root]! - first[root]! + 1;
    if (curved) track[list[i]!]! -= first[root]!;
  }
}

// Gives the pieces of one gap in `list` their tracks, and each the number of tracks that the
// pieces it has to do with take between them, counting its own from the first of those.
// Returns the number of tracks. The pieces come without tracks.
function layGap(list: number[], geo: Geo, pieces: Pieces, curved: boolean): number {
  const { LO, HI } = geo;
  // A plain order to start from, and to keep where nothing says otherwise: the pieces that
  // reach furthest go first, so that those of one fan nest.
  list.sort((a, b) => HI[b]! - LO[b]! - (HI[a]! - LO[a]!) || LO[a]! - LO[b]! || a - b);
  const count = list.length;
  const above: number[][] = [];
  const group = list.map((_, i) => i);
  const weighed = count <= MAX_WEIGHED;
  // Avoid storing quadratically many pairs in dense gaps.
  const pairs = weighed ? geo.nearPairs(list) : [];
  const clashes = weighed ? list.map((): number[] => []) : undefined;
  for (let p = 0; clashes && p < pairs.length; p += 2) {
    const i = pairs[p]!;
    const j = pairs[p + 1]!;
    if (!geo.clash(list[i]!, list[j]!)) continue;
    clashes[i]!.push(j);
    clashes[j]!.push(i);
  }
  const sequence = weighed ? sequenceOf(list, pairs, geo, above, group) : list.map((_, i) => i);
  const rows = giveTracks(list, sequence, above, clashes, geo.clash, pieces.track);
  levelsOf(list, group, rows, pieces, curved);
  return rows;
}

// The curve of piece `k` from where it leaves to where it arrives over a gap `h` high, sampled.
function sample(from: number[], to: number[], k: number, h: number, out: Float64Array): void {
  const c = ease(to[k]! - from[k]!, h);
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const u = 1 - t;
    out[2 * i] = from[k]! + (to[k]! - from[k]!) * t * t * (3 - 2 * t);
    out[2 * i + 1] = h * (3 * c * t * u * u + 3 * (1 - c) * t * t * u + t * t * t);
  }
}

function reaches(points: Float64Array, line: Float64Array, limit: number): boolean {
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
}

// Whether the plain curves of pieces a and b pass within `limit` of each other in a gap `height` high.
function near(p: Pieces, a: number, b: number, height: number, limit: number, M: LayoutMetrics) {
  const h = Math.max(height / 2, height - 2 * M.levelLead);
  sample(p.from, p.to, a, h, LINE_A);
  sample(p.from, p.to, b, h, LINE_B);
  return reaches(LINE_A, LINE_B, limit) || reaches(LINE_B, LINE_A, limit);
}

// Gives the pieces of one gap that run alongside or near each other, and the short ones that
// could cross them, levels to turn onto. Returns the height that the gap should have if its curves
// mostly cross each other instead (else 0), and the number of levels it takes (else 0).
function curvedGap(
  all: number[],
  pieces: Pieces,
  geo: Geo,
  height: number,
  M: LayoutMetrics
): [number, number] {
  const { from, to, track, levels, wide } = pieces;
  const { LO, HI } = geo;
  // The pieces that turn onto levels: first those that run far across and have another such
  // piece to be told apart from, then any two that would pass too near each other as plain
  // curves.
  const far = all.filter((k) => wide[k]! === 1);
  layGap(far, geo, pieces, true);
  const level = new Set(far.filter((k) => levels[k]! > 1));
  const pairs = geo.nearPairs(all);
  for (let p = 0; p < pairs.length; p += 2) {
    const a = all[pairs[p]!]!;
    const b = all[pairs[p + 1]!]!;
    if (
      (level.has(a) && level.has(b)) ||
      !geo.clash(a, b) ||
      from[a]! < to[a]! !== from[b]! < to[b]!
    )
      continue;
    if (
      near(pieces, a, b, height, wide[a]! === 1 || wide[b]! === 1 ? M.levelClear : M.levelTouch, M)
    )
      level.add(a).add(b);
  }
  for (const k of far) {
    track[k] = -1;
    levels[k] = 0;
  }
  if (level.size === 0) return [0, 0];
  let crossing = 0;
  let alongside = 0;
  const beside = new Set<number>();
  for (let p = 0; p < pairs.length; p += 2) {
    const a = all[pairs[p]!]!;
    const b = all[pairs[p + 1]!]!;
    if (level.has(a) && level.has(b)) {
      if (!geo.overlap(a, b)) continue;
      if (from[a]! < to[a]! !== from[b]! < to[b]!) crossing++;
      else if (!geo.mates(a, b)) alongside++;
    } else if ((level.has(a) || level.has(b)) && geo.meet(a, b)) beside.add(a).add(b);
  }
  if (crossing > alongside) {
    let tallest = 0;
    for (const k of all)
      if ((HI[k]! - LO[k]!) * CROSSED_SLOPE > tallest) tallest = (HI[k]! - LO[k]!) * CROSSED_SLOPE;
    return [tallest, 0];
  }
  // With them go the short pieces that could cross one of them, so that each has its place
  // among the levels and crosses none.
  const members = all.filter((k) => level.has(k) || (wide[k]! !== 1 && beside.has(k)));
  layGap(members, geo, pieces, true);
  let most = 0;
  for (const k of members) if (levels[k]! > most) most = levels[k]!;
  return [0, most];
}

// Gives every piece that does not run straight down a track across its gap, and counts the
// tracks of each gap. Two pieces in one gap share a track only where they cannot be mistaken
// for each other: where they do not overlap, or where they leave from or arrive at the same
// point, as the branches of a tree do. Which of two goes above the other is whichever makes
// them cross less. With `curved`, the tracks are levels for curves to turn onto, and only the
// pieces that would run along or too near another get one: each group of those counts its
// tracks from its own first. `room` is the height of the gap under each rank, and `tall`
// receives the height that a gap whose curves mostly cross each other should have instead of levels.
export function assignTracks(
  pieces: Pieces,
  trackCount: Int32Array,
  curved: boolean,
  room: Float64Array,
  tall: Float64Array,
  M: LayoutMetrics
): void {
  const { from, to, rank, track, levels } = pieces;
  const byRank = new Map<number, number[]>();
  for (let k = 0; k < from.length; k++) {
    track.push(-1);
    levels.push(0);
    if (Math.abs(from[k]! - to[k]!) < IN_LINE) continue;
    const list = byRank.get(rank[k]!);
    if (list) list.push(k);
    else byRank.set(rank[k]!, [k]);
  }
  if (byRank.size === 0) return;
  const geo = geometry(from, to);
  for (const [r, all] of byRank) {
    if (!curved) trackCount[r] = layGap(all, geo, pieces, false);
    else if (all.length <= MAX_WEIGHED) {
      const [tallest, most] = curvedGap(all, pieces, geo, room[r]!, M);
      if (tallest > 0) tall[r] = tallest;
      if (most > 0) trackCount[r] = most;
    }
  }
}

// Whether the bends of edge `ei` stay to keep it clear of its twin: an edge that keeps a bend is
// drawn through the bend, as it is, and so is one that has a bend left out in a rank of labels,
// because its curve crosses that rank.
function hasTwin(
  g: Graph,
  empty: Uint8Array | undefined,
  onLine: Uint8Array,
  tracks: boolean | undefined,
  ei: number
): boolean {
  const d0 = g.firstDummy[ei]!;
  for (let d = d0, end = d0 < 0 ? d0 : d0 + g.span[ei]! - 1; d < end; d++) {
    const bare = empty !== undefined && empty[g.RANK[d]!]! === 1;
    if (!tracks && bare !== (onLine[d]! === 1)) return true;
  }
  return false;
}

// Cuts edge `ei` where it passes a rank that holds something: one piece for each gap it crosses.
function cutPieces(
  g: Graph,
  xs: Float64Array,
  empty: Uint8Array | undefined,
  pieces: Pieces,
  ei: number
): void {
  const { RANK, EF, firstSeg, lastSeg } = g;
  const d0 = g.firstDummy[ei]!;
  let x = xs[EF[firstSeg[ei]!]!]! + g.EFD[firstSeg[ei]!]!;
  let rank = RANK[EF[firstSeg[ei]!]!]!;
  for (let d = d0, end = d0 < 0 ? d0 : d0 + g.span[ei]! - 1; d < end; d++) {
    if (empty?.[RANK[d]!]) continue;
    pieces.from.push(x);
    pieces.to.push(xs[d]!);
    pieces.rank.push(rank);
    pieces.lower.push(d);
    x = xs[d]!;
    rank = RANK[d]!;
  }
  pieces.from.push(x);
  pieces.to.push(xs[g.ET[lastSeg[ei]!]!]! + g.ETD[lastSeg[ei]!]!);
  pieces.rank.push(rank);
  pieces.lower.push(-1);
}

// An edge is cut where it passes a rank that holds something, and each piece crosses one gap.
// With `tracks`, every piece that does not run straight gets a track to run across on at
// right angles. Otherwise, where edges spread along their nodes, a piece gets one only if it
// needs a level to turn onto. `start` gives every edge's run of pieces.
export function buildPieces(
  g: Graph,
  xs: Float64Array,
  empty: Uint8Array | undefined,
  onLine: Uint8Array,
  opt: LayeredOptions
): Pieces | undefined {
  if (!opt.tracks && !(g.EFK && !opt.straight)) return undefined;
  const m = g.direct.length;
  const pieces: Pieces = {
    from: [],
    to: [],
    rank: [],
    lower: [],
    track: [],
    levels: [],
    wide: [],
    start: i32(m + 1),
  };
  for (let ei = 0; ei < m; ei++) {
    pieces.start[ei] = pieces.from.length;
    if (g.direct[ei]! || hasTwin(g, empty, onLine, opt.tracks, ei)) continue;
    cutPieces(g, xs, empty, pieces, ei);
  }
  pieces.start[m] = pieces.from.length;
  return pieces;
}
