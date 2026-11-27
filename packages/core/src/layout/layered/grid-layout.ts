// Changes from Pele: the grid mode (D78, D140) lives here, split out of `layered.ts` and
// `compound.ts`, which reach it through `GridHooks` (grid.ts). The algorithm is unchanged.
// cspell:ignore lnode
//
// What the layered engine does differently on a grid of character cells, while it lays out and
// while it places groups: rounding to cells, one cell for each edge end, one row for each track.
import { Kind, type LNode } from './layered.ts';
import type { CEdge, CNode } from './compound.ts';
import type { LayoutMetrics } from '../units.ts';
import { f64 } from './scratch.ts';

/** What `onGrid` reads of the graph `layered` builds. */
export interface GridGraph {
  n: number;
  real: number;
  W: Float64Array;
  KIND: Uint8Array;
  EFD: Float64Array;
  ETD: Float64Array;
  succStart: Int32Array;
  succE: Int32Array;
  predStart: Int32Array;
  predE: Int32Array;
  M: LayoutMetrics;
}

// Grid helpers (D78): `dropNoise` drops float noise so that values that agree keep agreeing,
// `floorTo`/`ceilTo` round to the grid, `edgeOn` puts a box edge on it and `midCell` puts a
// line in the middle of a cell (ties go up, so equal inputs give equal cells).
const dropNoise = (v: number): number => Math.round(v * 1e6) / 1e6;
export const floorTo = (v: number, grid: number): number => grid * Math.floor(dropNoise(v / grid));
export const ceilTo = (v: number, grid: number): number => grid * Math.ceil(dropNoise(v / grid));
export const edgeOn = (v: number, grid: number): number => grid * Math.round(dropNoise(v / grid));
export const midCell = (v: number, grid: number): number =>
  grid * (Math.round(dropNoise(v / grid - 0.5)) + 0.5);

// Puts the cross-flow positions on the grid (D78, D140): box edges on it, bends and port nodes
// on the middle of a cell, and each edge end on a cell of its own along its node's side (see
// `spreadOnGrid`). Returns the middle of each label's box.
export function onGrid(
  grid: number,
  g: GridGraph,
  nodes: readonly LNode[],
  xs: Float64Array,
  EFH: Uint8Array,
  ETH: Uint8Array
): Float64Array {
  const { n, real, W, KIND, EFD, ETD, succStart, succE, predStart, predE, M } = g;
  const was = f64(n);
  was.set(xs);
  const labelAt = f64(n);
  for (let i = 0; i < n; i++) {
    if (KIND[i]! === Kind.Label) {
      xs[i] = midCell(was[i]!, grid);
      labelAt[i] = edgeOn(xs[i]! - W[i]! / 2, grid) + W[i]! / 2;
    } else if (W[i]! > 0) xs[i] = edgeOn(was[i]! - W[i]! / 2, grid) + W[i]! / 2;
    else xs[i] = midCell(was[i]!, grid);
  }
  const pitch = Math.max(grid, edgeOn(M.portPitch, grid));
  for (let v = 0; v < real; v++) {
    if (W[v]! <= 0 || nodes[v]!.kind !== Kind.Node) continue;
    // The box itself, not the room laid out for it: a self-loop widens that (span = box less
    // its corners).
    const half = Math.min(W[v]! / 2, nodes[v]!.span / 2 + M.corner);
    const lo = xs[v]! - half + 1.5 * grid;
    const hi = Math.max(lo, xs[v]! + half - 1.5 * grid);
    for (let side = 0; side < 2; side++) {
      const start = side === 0 ? predStart : succStart;
      const list = side === 0 ? predE : succE;
      const dx = side === 0 ? ETD : EFD;
      const held = side === 0 ? ETH : EFH;
      const ends: number[] = [];
      for (let k = start[v]!; k < start[v + 1]!; k++) ends.push(list[k]!);
      if (ends.length === 0) continue;
      const want = (e: number): number => midCell(was[v]! + dx[e]!, grid);
      ends.sort((a, b) => want(a) - want(b) || dx[a]! - dx[b]! || a - b);
      // A held end moves with its node: its offset leads to a cell the caller placed.
      const fixed = ends.map((e) => held[e]! === 1);
      const at = ends.map((e, i) =>
        fixed[i] ? xs[v]! + dx[e]! : Math.min(Math.max(want(e), lo), hi)
      );
      spreadOnGrid(at, fixed, lo, hi, pitch, grid);
      ends.forEach((e, i) => (dx[e] = at[i]! - xs[v]!));
    }
  }
  return labelAt;
}

// Spreads the ends along one side, in order, between the cells `lo` and `hi` (the side less its
// corners): at `pitch` where every free end fits between the held ones, else one cell apart
// (D140; the caller grows a side that is still too short and lays out again).
function spreadOnGrid(
  at: number[],
  fixed: boolean[],
  lo: number,
  hi: number,
  pitch: number,
  grid: number
): void {
  const fits = (step: number): { fit: number[]; ok: boolean } => {
    const fit = [...at];
    for (let i = 1; i < fit.length; i++)
      if (!fixed[i] && fit[i]! < fit[i - 1]! + step) fit[i] = fit[i - 1]! + step;
    let ok = true;
    for (let i = fit.length - 1; i >= 0; i--) {
      if (fixed[i]) continue;
      const cap = i + 1 < fit.length ? Math.min(hi, fit[i + 1]! - step) : hi;
      fit[i] = Math.min(fit[i]!, cap);
      if (fit[i]! < lo || (i > 0 && fit[i]! < fit[i - 1]! + step)) ok = false;
    }
    return { fit, ok };
  };
  const wide = pitch > grid ? fits(pitch) : undefined;
  const { fit } = wide?.ok ? wide : fits(grid);
  for (let i = 0; i < at.length; i++) if (!fixed[i]) at[i] = Math.max(lo, Math.min(hi, fit[i]!));
}

// The middle of a cell on the top side of `b`, off its corners, nearest the middle and at least
// `pitch` (else one cell) from where other routes already end there.
export function freeTop(b: CNode, edges: CEdge[], grid: number, pitch: number): number {
  const top = b.y - b.h / 2;
  const lo = b.x - b.w / 2 + 1.5 * grid;
  const hi = b.x + b.w / 2 - 1.5 * grid;
  const used: number[] = [];
  for (const e of edges) {
    const r = e.route;
    for (const k of r.length >= 6 ? [0, r.length - 3] : [])
      if (Math.abs(r[k + 1]! - top) < 1e-6 && r[k]! >= lo && r[k]! <= hi) used.push(r[k]!);
  }
  const mid = midCell(b.x, grid);
  const cells: number[] = [];
  for (let x = lo; x <= hi + 1e-6; x += grid) cells.push(x);
  cells.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q);
  for (const gap of [Math.max(pitch, grid), grid])
    for (const x of cells) if (used.every((u) => Math.abs(u - x) >= gap - 1e-6)) return x;
  return mid;
}

/**
 * Gives each track of a gap a row of its own, clear of the rows the ends use. `ideal` is the
 * px profile's row for a track; the rows of a gap are worked out once, when first asked for.
 */
export function trackRows(
  grid: number,
  bandTop: Float64Array,
  bandBottom: Float64Array,
  below: Int32Array,
  ideal: (r: number, count: number, onTrack: number) => number
): (r: number, count: number, onTrack: number) => number {
  const rows = new Map<number, number[]>();
  return (r, count, onTrack) => {
    const key = r * 65536 + count;
    let list = rows.get(key);
    if (!list) {
      list = [];
      const lo = bandBottom[r]! + 1.5 * grid;
      const hi = bandTop[below[r]!]! - 1.5 * grid;
      for (let t = 0; t < count; t++) {
        const at = Math.min(Math.max(midCell(ideal(r, count, t), grid), lo), hi);
        list.push(t > 0 && at < list[t - 1]! + grid ? list[t - 1]! + grid : at);
      }
      for (let t = count - 1; t >= 0; t--) if (list[t]! > hi) list[t] = hi - (count - 1 - t) * grid;
      rows.set(key, list);
    }
    return list[onTrack]!;
  };
}

/** The box width, at least `boxW`, that keeps the labels' right edge `right` a cell inside the frame. */
export function widenOnGrid(grid: number, boxW: number, contentW: number, right: number): number {
  let w = boxW;
  while (floorTo((w - contentW) / 2, grid) + right > w - grid + 1e-9) w += 2 * grid;
  return w;
}
