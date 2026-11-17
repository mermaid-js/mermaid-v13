// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, where it was the end of `layOut`: `placeNodes`,
// `trackYOf` and `emitRoutes`. The algorithm is unchanged.
// cspell:ignore kepano
//
// Where the nodes sit once the ranks do, and the route and label of every edge.
import type { Bands } from './gaps.ts';
import {
  Kind,
  type Graph,
  type LEdge,
  type LNode,
  type LayeredOptions,
  type Pieces,
} from './graph.ts';
import { u8 } from './scratch.ts';

// Gives every node its place, and returns the left and right edges of the drawing. Where edges
// spread along their nodes, a rank whose nodes only send edges on stands on one line, and a rank
// whose nodes only receive them hangs from one, so that the edges of nodes of different heights
// set out from, or arrive at, the same level. In any other rank the nodes are centered.
export function placeNodes(
  g: Graph,
  nodes: LNode[],
  xs: Float64Array,
  b: Bands,
  opt: LayeredOptions
): [number, number] {
  const { n, real, maxRank, W, KIND, RANK, predStart, succStart } = g;
  const hooks = opt.grid;
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
  const arrives = u8(maxRank + 1);
  const leaves = u8(maxRank + 1);
  for (let i = 0; i < real; i++) {
    if (KIND[i]! !== Kind.Node || !g.EFK) continue;
    if (predStart[i + 1]! > predStart[i]!) arrives[RANK[i]!] = 1;
    if (succStart[i + 1]! > succStart[i]!) leaves[RANK[i]!] = 1;
  }
  for (let i = 0; i < real; i++) {
    const node = nodes[i]!;
    const r = node.rank;
    node.x = xs[i]! - minX;
    if (KIND[i]! === Kind.Node && leaves[r]! && !arrives[r]!) node.y = b.bottom[r]! - node.h / 2;
    else if (KIND[i]! === Kind.Node && arrives[r]! && !leaves[r]!) node.y = b.top[r]! + node.h / 2;
    else if (hooks)
      node.y = b.top[r]! + hooks.floor((b.bottom[r]! - b.top[r]! - node.h) / 2) + node.h / 2;
    else node.y = (b.top[r]! + b.bottom[r]!) / 2;
  }
  return [minX, maxX];
}

// What the routes are drawn from.
export interface Draw {
  xs: Float64Array;
  minX: number;
  onLine: Uint8Array;
  pieces: Pieces | undefined;
  // In grid mode, the middle of each label's box.
  labelAt: Float64Array | undefined;
  b: Bands;
  opt: LayeredOptions;
}

// Where a piece runs across its gap, or would on another track of its group: its tracks sit in
// the middle of the gap, the first at the top. In grid mode each track of a gap takes a row of
// its own, clear of the rows the ends use.
function trackYOf(d: Draw): (piece: number, onTrack?: number) => number {
  const { b, opt, pieces } = d;
  const trackAt = (r: number, count: number, onTrack: number): number => {
    const top = b.bottom[r]!;
    const bottom = b.top[b.below[r]!]!;
    const pitch = count > 1 ? Math.min(b.pitch, (bottom - top - 2 * b.margin) / (count - 1)) : 0;
    return (top + bottom) / 2 + (onTrack - (count - 1) / 2) * pitch;
  };
  const gridRow = opt.grid?.tracks(b.top, b.bottom, b.below, trackAt);
  return (piece, onTrack = pieces!.track[piece]!) => {
    const r = pieces!.rank[piece]!;
    const count = opt.tracks ? b.count[r]! : pieces!.levels[piece]!;
    return gridRow ? gridRow(r, count, onTrack) : trackAt(r, count, onTrack);
  };
}

// The part of its rank that an edge runs straight through at a bend or label. A bare bend
// beside labels keeps to the middle half, which leaves the curves either side of it more room
// and still keeps them clear of the labels' corners.
function inset(g: Graph, d: Draw, v: number): number {
  const r = g.RANK[v]!;
  return g.KIND[v]! === Kind.Dummy && d.b.between[r]! && !d.opt.tracks
    ? (d.b.bottom[r]! - d.b.top[r]!) / 4
    : 0;
}

// The bend at `v` as points: down into its rank and out of it again.
function pushBend(g: Graph, d: Draw, v: number, x: number, pts: number[]): void {
  const r = g.RANK[v]!;
  const top = d.b.top[r]!;
  const bottom = d.b.bottom[r]!;
  pts.push(x, top + inset(g, d, v));
  if (bottom > top) pts.push(x, bottom - inset(g, d, v));
}

// The points of edge `ei` that its pieces run through, in the order of the pieces.
function pieceBends(
  g: Graph,
  d: Draw,
  pieces: Pieces,
  trackY: (piece: number, onTrack?: number) => number,
  ei: number,
  pts: number[]
): void {
  const { xs, minX, opt } = d;
  for (let k = pieces.start[ei]!; k < pieces.start[ei + 1]!; k++) {
    if (pieces.track[k]! >= 0 && (opt.tracks || pieces.wide[k]! === 1)) {
      const across = trackY(k);
      pts.push(pieces.from[k]! - minX, across, pieces.to[k]! - minX, across);
    } else if (pieces.track[k]! > 0) {
      // A short piece among levels runs straight until it is past the level before its
      // own, and turns in one S from there, so that it crosses none of them.
      pts.push(pieces.from[k]! - minX, trackY(k, pieces.track[k]! - 1));
    }
    const v = pieces.lower[k]!;
    if (v >= 0) pushBend(g, d, v, xs[v]! - minX, pts);
  }
}

function edgePoints(
  g: Graph,
  d: Draw,
  trackY: (piece: number, onTrack?: number) => number,
  nodes: LNode[],
  e: LEdge,
  ei: number
): number[] {
  const { pieces, xs, minX, onLine } = d;
  const rev = e.reversed;
  const first = nodes[rev ? e.head : e.tail]!;
  const last = nodes[rev ? e.tail : e.head]!;
  const pts: number[] = [first.x + (rev ? e.headDx : e.tailDx), first.y + first.h / 2];
  const d0 = g.firstDummy[ei]!;
  if (pieces && pieces.start[ei + 1]! > pieces.start[ei]!)
    pieceBends(g, d, pieces, trackY, ei, pts);
  else if (d0 >= 0)
    for (let v = d0, end = d0 + g.span[ei]! - 1; v < end; v++)
      if (!onLine[v]!) pushBend(g, d, v, xs[v]! - minX, pts);
  pts.push(last.x + (rev ? e.tailDx : e.headDx), last.y - last.h / 2);
  if (rev) {
    for (let i = 0, j = pts.length - 2; i < j; i += 2, j -= 2) {
      const tx = pts[i]!;
      const ty = pts[i + 1]!;
      pts[i] = pts[j]!;
      pts[i + 1] = pts[j + 1]!;
      pts[j] = tx;
      pts[j + 1] = ty;
    }
  }
  return pts;
}

// Gives an edge's label its place: in its rank of labels, or midway along the line.
function placeLabel(g: Graph, d: Draw, e: LEdge, ei: number, pts: number[]): void {
  const ln = g.labelNode[ei]!;
  if (ln >= 0) {
    const top = d.b.top[g.RANK[ln]!]!;
    const bottom = d.b.bottom[g.RANK[ln]!]!;
    e.labelX = (d.labelAt ? d.labelAt[ln]! : d.xs[ln]!) - d.minX;
    e.labelY = (top + bottom) / 2;
    if (d.opt.grid) e.labelY = top + d.opt.grid.floor((bottom - top - e.labelH) / 2) + e.labelH / 2;
  } else if (e.labelW > 0) {
    e.labelX = (pts[0]! + pts[pts.length - 2]!) / 2;
    e.labelY = (pts[1]! + pts[pts.length - 1]!) / 2;
  }
}

// Writes the points and the label place of every edge.
export function emitRoutes(g: Graph, nodes: LNode[], edges: LEdge[], d: Draw): void {
  const trackY = trackYOf(d);
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei]!;
    e.points = edgePoints(g, d, trackY, nodes, e, ei);
    placeLabel(g, d, e, ei, e.points);
  }
}
