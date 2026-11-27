// Ported from Pele, src/layout/compound.ts at 3a2f075.
// Changes from Pele: split out of `compound.ts` (D596): `crossingsOf` runs as separate phases
// that share one `Segs` record. Its scratch arrays are taken from the same frame. The algorithm is unchanged.
// cspell:ignore segs
//
import { ease, type LayeredOptions } from './layered.ts';
import { pxProfile } from '../units.ts';
import { copy, f64, i32, scratch, u8 } from './scratch.ts';
import type { CEdge, CNode } from './compound.ts';

// Tolerance for collinear points.
export const IN_LINE = 0.5;
const CURVE_PIECES = 3;
const CORNER_PIECES = 2;
// Allow for a step, an S-curve, or a straight segment plus a rounded corner.
const STEP_PIECES = Math.max(3, CURVE_PIECES, CORNER_PIECES + 1);
// Match the renderer's corner handles.
const HANDLE = 0.62;
const MAX_INSERT = 128;
export const Style = { Curved: 0, Stepped: 1, Linear: 2 } as const;
export type Style = (typeof Style)[keyof typeof Style];
export function styleOf(opt: LayeredOptions): Style {
  if (opt.tracks) return Style.Stepped;
  return opt.straight ? Style.Linear : Style.Curved;
}
export function routeCrossings(
  nodes: CNode[],
  edges: CEdge[],
  style: Style = Style.Curved,
  // Crossings within this distance of a shared node are not counted (`LayoutMetrics.fan`).
  fan = pxProfile.engine.fan
): number {
  return scratch(() => crossingsOf(nodes, edges, style, fan));
}

// The straight pieces of every route, as parallel arrays that live in the scratch frame.
interface Segs {
  ax: Float64Array;
  ay: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  low: Float64Array;
  high: Float64Array;
  owner: Int32Array;
  // Endpoint flags: 1 for the first segment, 2 for the last.
  ends: Uint8Array;
  count: number;
  top: number;
  bottom: number;
  // The last piece added, to merge a straight continuation into it.
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  // The edge whose route is being cut.
  edge: number;
  // Where the route being cut is, after the piece just cut.
  atX: number;
  atY: number;
}

function segsFor(edges: CEdge[]): Segs {
  let size = 0;
  for (const e of edges)
    if (e.src !== e.dst && e.route.length > 3) size += (e.route.length / 3 - 1) * STEP_PIECES;
  return {
    ax: f64(size),
    ay: f64(size),
    bx: f64(size),
    by: f64(size),
    low: f64(size),
    high: f64(size),
    owner: i32(size),
    ends: u8(size),
    count: 0,
    top: Infinity,
    bottom: -Infinity,
    fromX: NaN,
    fromY: NaN,
    toX: NaN,
    toY: NaN,
    edge: 0,
    atX: 0,
    atY: 0,
  };
}

function addSeg(s: Segs, part: number, x0: number, y0: number, x1: number, y1: number): void {
  const p = s.count - 1;
  const on =
    x0 === s.toX &&
    y0 === s.toY &&
    ((y1 === y0 && s.fromY === y0) || (x1 === x0 && s.fromX === x0));
  let startX = x0;
  let startY = y0;
  if (
    on &&
    s.owner[p]! === s.edge &&
    s.ends[p]! === part &&
    (x0 - s.fromX) * (x1 - x0) + (y0 - s.fromY) * (y1 - y0) > 0
  ) {
    s.count--;
    startX = s.fromX;
    startY = s.fromY;
  }
  const c = s.count;
  s.fromX = startX;
  s.fromY = startY;
  s.toX = x1;
  s.toY = y1;
  s.ends[c] = part;
  s.ax[c] = Math.min(startX, x1);
  s.bx[c] = Math.max(startX, x1);
  s.ay[c] = startX <= x1 ? startY : y1;
  s.by[c] = startX <= x1 ? y1 : startY;
  s.low[c] = Math.min(startY, y1);
  s.high[c] = Math.max(startY, y1);
  if (s.low[c] < s.top) s.top = s.low[c]!;
  if (s.high[c] > s.bottom) s.bottom = s.high[c]!;
  s.owner[c] = s.edge;
  s.count = c + 1;
}

function aligned(r: number[], k: number): boolean {
  return Math.abs(r[k]! - r[k - 3]!) < 0.01 || Math.abs(r[k + 1]! - r[k - 2]!) < 0.01;
}

function legLength(r: number[], k: number): number {
  return Math.abs(r[k]! - r[k - 3]!) + Math.abs(r[k + 1]! - r[k - 2]!);
}

function turns(r: number[], k: number, style: Style): boolean {
  return (
    style === Style.Curved &&
    k > 0 &&
    k < r.length - 3 &&
    aligned(r, k) &&
    aligned(r, k + 3) &&
    legLength(r, k) >= 0.01 &&
    legLength(r, k + 3) >= 0.01 &&
    Math.abs(r[k]! - r[k - 3]!) < 0.01 !== Math.abs(r[k + 3]! - r[k]!) < 0.01
  );
}

// A rounded corner at point `k` (the end of the leg from `x0`, `y0`): the part of the leg before
// it, then the curve, which ends where `s.atX`, `s.atY` say the route goes on from.
function cornerPieces(s: Segs, r: number[], k: number, part: number, style: Style): void {
  const x0 = s.atX;
  const y0 = s.atY;
  const x1 = r[k]!;
  const y1 = r[k + 1]!;
  // Adjacent corners share a leg, so each gets half.
  const before = turns(r, k - 3, style) ? legLength(r, k) / 2 : legLength(r, k);
  const after = turns(r, k + 3, style) ? legLength(r, k + 3) / 2 : legLength(r, k + 3);
  const ux = (x1 - r[k - 3]!) / legLength(r, k);
  const uy = (y1 - r[k - 2]!) / legLength(r, k);
  const vx = (r[k + 3]! - x1) / legLength(r, k + 3);
  const vy = (r[k + 4]! - y1) / legLength(r, k + 3);
  const sx = x1 - ux * before;
  const sy = y1 - uy * before;
  addSeg(s, part, x0, y0, sx, sy);
  const c1x = x1 - ux * before * (1 - HANDLE);
  const c1y = y1 - uy * before * (1 - HANDLE);
  const c2x = x1 + vx * after * (1 - HANDLE);
  const c2y = y1 + vy * after * (1 - HANDLE);
  const endX = x1 + vx * after;
  const endY = y1 + vy * after;
  const turn = part | (k + 3 === r.length - 3 ? 2 : 0);
  let px = sx;
  let py = sy;
  for (let i = 1; i <= CORNER_PIECES; i++) {
    const t = i / CORNER_PIECES;
    const u = 1 - t;
    const x = u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * endX;
    const y = u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * endY;
    addSeg(s, turn, px, py, x, y);
    px = x;
    py = y;
  }
  s.atX = endX;
  s.atY = endY;
}

// An S-curve from (`x0`, `y0`) to (`x1`, `y1`), approximated with straight pieces.
function curvePieces(s: Segs, part: number, r: number[], k: number, x0: number, y0: number): void {
  const x1 = r[k]!;
  const y1 = r[k + 1]!;
  const down = r[k + 2]! === 0;
  const c = down ? ease(x1 - x0, y1 - y0) : ease(y1 - y0, x1 - x0);
  let px = x0;
  let py = y0;
  for (let i = 1; i <= CURVE_PIECES; i++) {
    const t = i / CURVE_PIECES;
    const u = 1 - t;
    const across = t * t * (3 - 2 * t);
    const along = 3 * c * t * u * u + 3 * (1 - c) * t * t * u + t * t * t;
    const x = x0 + (x1 - x0) * (down ? across : along);
    const y = y0 + (y1 - y0) * (down ? along : across);
    addSeg(s, part, px, py, x, y);
    px = x;
    py = y;
  }
}

// Cuts the leg ending at point `k` of route `r`, from where the route is (`s.atX`, `s.atY`).
function cutLeg(s: Segs, r: number[], k: number, style: Style): void {
  const part = (k === 3 ? 1 : 0) | (k === r.length - 3 ? 2 : 0);
  const x0 = s.atX;
  const y0 = s.atY;
  const x1 = r[k]!;
  const y1 = r[k + 1]!;
  if ((aligned(r, k) || style === Style.Linear) && turns(r, k, style)) {
    cornerPieces(s, r, k, part, style);
    return;
  }
  s.atX = x1;
  s.atY = y1;
  if (aligned(r, k) || style === Style.Linear) {
    addSeg(s, part, x0, y0, x1, y1);
    return;
  }
  const down = r[k + 2]! === 0;
  if (style === Style.Stepped) {
    const mx = down ? x0 : (x0 + x1) / 2;
    const my = down ? (y0 + y1) / 2 : y0;
    addSeg(s, part, x0, y0, mx, my);
    addSeg(s, part, mx, my, down ? x1 : mx, down ? my : y1);
    addSeg(s, part, down ? x1 : mx, down ? my : y1, x1, y1);
    return;
  }
  curvePieces(s, part, r, k, x0, y0);
}

// The pieces in bands of y: `first[p]` is the first band piece `p` is in, `inBand` lists the
// pieces of band `b` from `bandStart[b]` on.
interface Bands {
  count: number;
  first: Int32Array;
  bandStart: Int32Array;
  inBand: Int32Array;
}

// Counts each pair only in the first band shared by both segments.
function bandsOf(s: Segs): Bands {
  const { count, top, bottom, low, high } = s;
  const bands = bottom > top ? Math.round(Math.sqrt(count)) : 1;
  const scale = bottom > top ? bands / (bottom - top) : 0;
  const bandOf = (y: number): number => Math.min(bands - 1, Math.floor((y - top) * scale));
  const first = i32(count);
  const bandStart = i32(bands + 1);
  for (let p = 0; p < count; p++) {
    first[p] = bandOf(low[p]!);
    for (let b = first[p]!, last = bandOf(high[p]!); b <= last; b++) bandStart[b + 1]!++;
  }
  for (let b = 0; b < bands; b++) bandStart[b + 1]! += bandStart[b]!;
  const fill = copy(bandStart, bands);
  const inBand = i32(bandStart[bands]!);
  for (let p = 0; p < count; p++)
    for (let b = first[p]!, last = bandOf(high[p]!); b <= last; b++) inBand[fill[b]!++] = p;
  return { count: bands, first, bandStart, inBand };
}

function inLine(r: number[], a: number, b: number, c: number): boolean {
  return (
    (Math.abs(r[a]! - r[b]!) < IN_LINE && Math.abs(r[a]! - r[c]!) < IN_LINE) ||
    (Math.abs(r[a + 1]! - r[b + 1]!) < IN_LINE && Math.abs(r[a + 1]! - r[c + 1]!) < IN_LINE)
  );
}

// Edges merging into a shared endpoint run do not count as crossings: eight numbers an edge, the
// first and the last run's two ends.
function endRuns(edges: CEdge[]): Float64Array {
  const runs = f64(edges.length * 8);
  for (let ei = 0; ei < edges.length; ei++) {
    const r = edges[ei]!.route;
    if (r.length < 6) continue;
    let k = 3;
    while (k + 3 < r.length && inLine(r, 0, k, k + 3)) k += 3;
    const last = r.length - 3;
    let j = last - 3;
    while (j >= 3 && inLine(r, last, j, j - 3)) j -= 3;
    runs.set([r[0]!, r[1]!, r[k]!, r[k + 1]!, r[j]!, r[j + 1]!, r[last]!, r[last + 1]!], ei * 8);
  }
  return runs;
}

function onRun(runs: Float64Array, ei: number, end: number, x: number, y: number): boolean {
  const o = ei * 8 + (end === 1 ? 0 : 4);
  const x0 = runs[o]!;
  const y0 = runs[o + 1]!;
  const dx = runs[o + 2]! - x0;
  const dy = runs[o + 3]! - y0;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / length)) : 0;
  return Math.hypot(x - x0 - t * dx, y - y0 - t * dy) < IN_LINE;
}

// Puts the pieces of a band in order of their left end.
function sortBand(s: Segs, inBand: Int32Array, from: number, to: number): void {
  const ax = s.ax;
  if (to - from > MAX_INSERT) {
    inBand.subarray(from, to).sort((p, q) => ax[p]! - ax[q]! || p - q);
    return;
  }
  for (let i = from + 1; i < to; i++) {
    const p = inBand[i]!;
    let j = i;
    for (; j > from && ax[inBand[j - 1]!]! > ax[p]!; j--) inBand[j] = inBand[j - 1]!;
    inBand[j] = p;
  }
}

// Where along piece `p` it crosses piece `q`, 0 to 1, or NaN where it does not.
function crossAt(s: Segs, p: number, q: number): number {
  const { ax, ay, bx, by } = s;
  const dx = bx[p]! - ax[p]!;
  const dy = by[p]! - ay[p]!;
  const d1 = dx * (ay[q]! - ay[p]!) - dy * (ax[q]! - ax[p]!);
  const d2 = dx * (by[q]! - ay[p]!) - dy * (bx[q]! - ax[p]!);
  // Treat points on the line as one side to count segment-boundary crossings once.
  if (d1 > 0 === d2 > 0) return NaN;
  const ex = bx[q]! - ax[q]!;
  const ey = by[q]! - ay[q]!;
  const d3 = ex * (ay[p]! - ay[q]!) - ey * (ax[p]! - ax[q]!);
  const d4 = ex * (by[p]! - ay[q]!) - ey * (bx[p]! - ax[q]!);
  if (d3 > 0 === d4 > 0) return NaN;
  return d3 / (d3 - d4);
}

interface Counting {
  s: Segs;
  bands: Bands;
  runs: Float64Array;
  nodes: CNode[];
  edges: CEdge[];
  fan: number;
}

// Whether the crossing at (`x`, `y`) of pieces `p` and `q` is fan-in or fan-out at a shared node.
function fannedAt(c: Counting, p: number, q: number, x: number, y: number): boolean {
  const { s, runs, nodes, edges, fan } = c;
  const ep = edges[s.owner[p]!]!;
  const eq = edges[s.owner[q]!]!;
  const fanned = (v: number, pe: number, qe: number): boolean =>
    ((s.ends[p]! & pe) !== 0 && (s.ends[q]! & qe) !== 0) ||
    (Math.abs(x - nodes[v]!.x) < nodes[v]!.w / 2 + fan &&
      Math.abs(y - nodes[v]!.y) < nodes[v]!.h / 2 + fan) ||
    (onRun(runs, s.owner[p]!, pe, x, y) && onRun(runs, s.owner[q]!, qe, x, y));
  if (ep.src === eq.src && fanned(ep.src, 1, 1)) return true;
  if (ep.src === eq.dst && fanned(ep.src, 1, 2)) return true;
  if (ep.dst === eq.src && fanned(ep.dst, 2, 1)) return true;
  return ep.dst === eq.dst && fanned(ep.dst, 2, 2);
}

function countBand(c: Counting, band: number): number {
  const { s, bands } = c;
  const { first, bandStart, inBand } = bands;
  const bandEnd = bandStart[band + 1]!;
  sortBand(s, inBand, bandStart[band]!, bandEnd);
  let total = 0;
  for (let i = bandStart[band]!; i < bandEnd; i++) {
    const p = inBand[i]!;
    const here = first[p]! === band;
    for (let t = i + 1; t < bandEnd; t++) {
      const q = inBand[t]!;
      if (s.ax[q]! > s.bx[p]!) break;
      if (
        s.high[q]! < s.low[p]! ||
        s.low[q]! > s.high[p]! ||
        s.owner[p]! === s.owner[q]! ||
        (!here && first[q]! !== band)
      )
        continue;
      const at = crossAt(s, p, q);
      if (Number.isNaN(at)) continue;
      const x = s.ax[p]! + at * (s.bx[p]! - s.ax[p]!);
      const y = s.ay[p]! + at * (s.by[p]! - s.ay[p]!);
      if (!fannedAt(c, p, q, x, y)) total++;
    }
  }
  return total;
}

// Its scratch arrays live until it returns (see scratch.ts).
function crossingsOf(nodes: CNode[], edges: CEdge[], style: Style, fan: number): number {
  const s = segsFor(edges);
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei]!;
    if (e.src === e.dst) continue;
    const r = e.route;
    s.edge = ei;
    s.atX = r[0]!;
    s.atY = r[1]!;
    for (let k = 3; k < r.length; k += 3) cutLeg(s, r, k, style);
  }
  const bands = bandsOf(s);
  const c: Counting = { s, bands, runs: endRuns(edges), nodes, edges, fan };
  let total = 0;
  for (let band = 0; band < bands.count; band++) total += countBand(c, band);
  return total;
}
