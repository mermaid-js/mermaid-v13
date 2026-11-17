// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, and `position` is `sortNeighbours`,
// `markConflicts` and `medianOf`, with `alignBlocks` and `placeBlocks` inside `position`. The algorithm is unchanged.
// cspell:ignore kepano indeg topo cand maxs Köpf
//
// The cross-flow position of every node and bend once the order is fixed.
import { isDummy, Kind, type Graph, type LayeredOptions } from './graph.ts';
import { f64, i32, u8 } from './scratch.ts';

// Half the room a node, bend or port takes across the flow, with its share of the gap beside it.
// A port on a group's border is a point that an edge passes through, and needs no more than a bend.
export function halfRoom(g: Graph, opt: LayeredOptions, v: number): number {
  return g.W[v]! / 2 + (g.KIND[v]! === Kind.Node ? opt.nodeSep : opt.edgeSep) / 2;
}

function sortRange(
  list: Int32Array,
  from: number,
  to: number,
  key: Int32Array | Float64Array
): void {
  for (let i = from + 1; i < to; i++) {
    const item = list[i]!;
    const k = key[item]!;
    let j = i - 1;
    while (j >= from && (key[list[j]!]! > k || (key[list[j]!]! === k && list[j]! > item))) {
      list[j + 1] = list[j]!;
      j--;
    }
    list[j + 1] = item;
  }
}

// Puts the edges at each node in left-to-right order, so the medians can be read off directly.
function sortNeighbours(g: Graph): void {
  const { n, EF, ET, pos, succStart, succE, predStart, predE } = g;
  const key = i32(EF.length);
  for (let e = 0; e < EF.length; e++) key[e] = pos[ET[e]!]!;
  for (let v = 0; v < n; v++)
    if (succStart[v + 1]! - succStart[v]! > 1)
      sortRange(succE, succStart[v]!, succStart[v + 1]!, key);
  for (let e = 0; e < EF.length; e++) key[e] = pos[EF[e]!]!;
  for (let v = 0; v < n; v++)
    if (predStart[v + 1]! - predStart[v]! > 1)
      sortRange(predE, predStart[v]!, predStart[v + 1]!, key);
}

// Marks the edges into the nodes `order[from..to]` that lie outside `k0..k1` of the rank above.
function markRun(g: Graph, conflict: Uint8Array, from: number, to: number, k0: number, k1: number) {
  const { KIND, EF, predStart, predE, order, pos } = g;
  for (let j = from; j <= to; j++) {
    const w = order[j]!;
    const wDummy = isDummy(KIND[w]!);
    for (let k = predStart[w]!; k < predStart[w + 1]!; k++) {
      const e = predE[k]!;
      const up = pos[EF[e]!]!;
      if ((up < k0 || k1 < up) && !(wDummy && isDummy(KIND[EF[e]!]!))) conflict[e] = 1;
    }
  }
}

// An edge between two real nodes may not cross a dummy-to-dummy segment; marks those that would.
function markConflicts(g: Graph): Uint8Array {
  const { maxRank, KIND, EF, predStart, predE, layerStart, order, pos } = g;
  const conflict = u8(EF.length);
  for (let r = 1; r <= maxRank; r++) {
    const prevLen = layerStart[r]! - layerStart[r - 1]!;
    const s = layerStart[r]!;
    const end = layerStart[r + 1]!;
    let k0 = 0;
    let scan = s;
    for (let i = s; i < end; i++) {
      const v = order[i]!;
      let inner = -1;
      if (isDummy(KIND[v]!)) {
        const u = EF[predE[predStart[v]!]!]!;
        if (isDummy(KIND[u]!)) inner = u;
      }
      const k1 = inner >= 0 ? pos[inner]! : prevLen;
      if (inner >= 0 || i === end - 1) {
        markRun(g, conflict, scan, i, k0, k1);
        scan = i + 1;
        k0 = k1;
      }
    }
  }
  return conflict;
}

// Moves the four layouts so that the narrowest one's left sides (for the two that align left) or
// right sides (for the others) meet.
function alignLayouts(g: Graph, results: Float64Array[]): void {
  const { n, W } = g;
  let narrowest = 0;
  let bestWidth = Infinity;
  const mins: number[] = [];
  const maxs: number[] = [];
  for (let k = 0; k < 4; k++) {
    let lo = Infinity;
    let hi = -Infinity;
    const xs = results[k]!;
    for (let i = 0; i < n; i++) {
      const half = W[i]! / 2;
      if (xs[i]! - half < lo) lo = xs[i]! - half;
      if (xs[i]! + half > hi) hi = xs[i]! + half;
    }
    mins.push(lo);
    maxs.push(hi);
    if (hi - lo < bestWidth) {
      bestWidth = hi - lo;
      narrowest = k;
    }
  }
  for (let k = 0; k < 4; k++) {
    const delta = (k & 1) === 0 ? mins[narrowest]! - mins[k]! : maxs[narrowest]! - maxs[k]!;
    if (delta !== 0) {
      const xs = results[k]!;
      for (let i = 0; i < n; i++) xs[i]! += delta;
    }
  }
}

// The mean of the two middle values of the four layouts, for every node.
function medianOf(n: number, results: Float64Array[]): Float64Array {
  const out = f64(n);
  for (let i = 0; i < n; i++) {
    let a = results[0]![i]!;
    let b = results[1]![i]!;
    let c = results[2]![i]!;
    let d = results[3]![i]!;
    let t: number;
    if (a > b) {
      t = a;
      a = b;
      b = t;
    }
    if (c > d) {
      t = c;
      c = d;
      d = t;
    }
    if (a > c) {
      t = a;
      a = c;
      c = t;
    }
    if (b > d) b = d;
    if (b > c) {
      t = b;
      b = c;
      c = t;
    }
    out[i] = (b + c) / 2;
  }
  return out;
}

// Brandes-Köpf horizontal coordinate assignment: four aligned layouts, balanced.
export function position(g: Graph, opt: LayeredOptions): Float64Array {
  const { n, maxRank, layerStart, order, pos } = g;
  const gap = f64(n);
  for (let i = 0; i < n; i++) gap[i] = halfRoom(g, opt, i);
  sortNeighbours(g);
  const conflict = markConflicts(g);
  // The arrays of one aligned layout, taken once and made again for each of the four.
  const root = i32(n);
  const align = i32(n);
  // Offset of each node from its block's root, so that aligned edges meet at their attachment points.
  const shift = f64(n);
  const eFrom = i32(n);
  const eTo = i32(n);
  const eW = f64(n);
  const indeg = i32(n);
  const outStart = i32(n + 1);
  const outE = i32(n);
  const fill = i32(n);
  const topo = i32(n);
  const x = f64(n);

  // Aligns each node with a median neighbour in the rank next to it where no conflict stands in the
  // way, walking the ranks away from `up` or towards it, and the ranks from the `right` end or the left.
  const alignBlocks = (up: boolean, right: boolean): void => {
    const start = up ? g.predStart : g.succStart;
    const list = up ? g.predE : g.succE;
    const other = up ? g.EF : g.ET;
    const ownDx = up ? g.ETD : g.EFD;
    const otherDx = up ? g.EFD : g.ETD;
    for (let step = 0; step <= maxRank; step++) {
      const r = up ? step : maxRank - step;
      const s = layerStart[r]!;
      const end = layerStart[r + 1]!;
      const adjacent = up ? r - 1 : r + 1;
      const adjacentLast =
        adjacent >= 0 && adjacent <= maxRank
          ? layerStart[adjacent + 1]! - layerStart[adjacent]! - 1
          : 0;
      let prevIdx = -1;
      for (let i = right ? end - 1 : s; right ? i >= s : i < end; right ? i-- : i++) {
        const v = order[i]!;
        const from = start[v]!;
        const d = start[v + 1]! - from;
        if (d === 0) continue;
        const lo = from + ((d - 1) >> 1);
        const hi = from + (d >> 1);
        for (let pass = 0; pass < 2; pass++) {
          if (pass === 1 && lo === hi) break;
          const e = list[(pass === 0) !== right ? lo : hi]!;
          const w = other[e]!;
          const idx = right ? adjacentLast - pos[w]! : pos[w]!;
          if (align[v]! === v && prevIdx < idx && conflict[e]! === 0) {
            align[w] = v;
            align[v] = root[v] = root[w]!;
            shift[v] = shift[w]! + otherDx[e]! - ownDx[e]!;
            prevIdx = idx;
          }
        }
      }
    }
  };

  // Gives the blocks places across the flow, each clear of its neighbours in a rank, and returns
  // the position of every node.
  const placeBlocks = (right: boolean): Float64Array => {
    let blockEdges = 0;
    for (let r = 0; r <= maxRank; r++) {
      const s = layerStart[r]!;
      const end = layerStart[r + 1]!;
      for (let i = s + 1; i < end; i++) {
        const a = right ? order[i]! : order[i - 1]!;
        const c = right ? order[i - 1]! : order[i]!;
        const sep = gap[a]! + gap[c]!;
        eFrom[blockEdges] = root[a]!;
        eTo[blockEdges] = root[c]!;
        eW[blockEdges] = right ? sep - shift[a]! + shift[c]! : sep + shift[a]! - shift[c]!;
        indeg[root[c]!]!++;
        outStart[root[a]! + 1]!++;
        blockEdges++;
      }
    }
    for (let i = 0; i < n; i++) outStart[i + 1]! += outStart[i]!;
    for (let i = 0; i < n; i++) fill[i] = outStart[i]!;
    for (let e = 0; e < blockEdges; e++) outE[fill[eFrom[e]!]!++] = e;

    let count = 0;
    for (let i = 0; i < n; i++) if (root[i]! === i && indeg[i]! === 0) topo[count++] = i;
    for (let q = 0; q < count; q++) {
      const v = topo[q]!;
      for (let k = outStart[v]!; k < outStart[v + 1]!; k++) {
        const e = outE[k]!;
        const w = eTo[e]!;
        if (x[v]! + eW[e]! > x[w]!) x[w] = x[v]! + eW[e]!;
        if (--indeg[w]! === 0) topo[count++] = w;
      }
    }
    for (let q = count - 1; q >= 0; q--) {
      const v = topo[q]!;
      let min = Infinity;
      for (let k = outStart[v]!; k < outStart[v + 1]!; k++) {
        const e = outE[k]!;
        const cand = x[eTo[e]!]! - eW[e]!;
        if (cand < min) min = cand;
      }
      if (min !== Infinity && min > x[v]!) x[v] = min;
    }
    const xs = f64(n);
    for (let i = 0; i < n; i++) xs[i] = (right ? -x[root[i]!]! : x[root[i]!]!) + shift[i]!;
    return xs;
  };

  const results: Float64Array[] = [];
  for (let variant = 0; variant < 4; variant++) {
    for (let i = 0; i < n; i++) {
      root[i] = i;
      align[i] = i;
      shift[i] = 0;
      indeg[i] = 0;
      outStart[i + 1] = 0;
      x[i] = 0;
    }
    alignBlocks(variant < 2, (variant & 1) === 1);
    results.push(placeBlocks((variant & 1) === 1));
  }
  alignLayouts(g, results);
  return medianOf(n, results);
}
