// Hand-built `Graph`s, the ranked graph `layered` works on, for specs that call its steps
// directly. Test-only: excluded from the build.
// cspell:ignore lnode
import { pxProfile } from '../units.ts';
import { Kind, lnode, type Graph, type LNode } from './layered.ts';

/** A segment from node `from` to node `to` in the next rank, its ends `fromDx`/`toDx` off middle. */
export interface Segment {
  from: number;
  to: number;
  fromDx?: number;
  toDx?: number;
}

export interface GraphSpec {
  // The widths of the nodes in each rank, left to right. Nodes are numbered rank by rank.
  ranks: number[][];
  segments: Segment[];
  // Each node's kind, by number; all `Kind.Node` when absent.
  kinds?: Kind[];
  offsets?: boolean;
}

/** The graph `spec` gives, in its given order, with the `LNode`s that `reduceCrossings` reads. */
export function graphOf(spec: GraphSpec): { g: Graph; nodes: LNode[] } {
  const widths = spec.ranks.flat();
  const n = widths.length;
  const m = spec.segments.length;
  const KIND = new Uint8Array(n);
  const RANK = new Int32Array(n);
  const pos = new Int32Array(n);
  const layerStart = new Int32Array(spec.ranks.length + 1);
  let v = 0;
  spec.ranks.forEach((rank, r) => {
    layerStart[r] = v;
    rank.forEach((_w, i) => {
      RANK[v] = r;
      pos[v] = i;
      KIND[v] = spec.kinds?.[v] ?? Kind.Node;
      v++;
    });
  });
  layerStart[spec.ranks.length] = n;
  const EF = Int32Array.from(spec.segments, (s) => s.from);
  const ET = Int32Array.from(spec.segments, (s) => s.to);
  for (let e = 0; e < m; e++)
    if (RANK[ET[e]!] !== RANK[EF[e]!]! + 1) throw new Error(`segment ${e} skips a rank`);
  // Each node's segments, in the order given.
  const lists = (end: Int32Array): [Int32Array, Int32Array] => {
    const start = new Int32Array(n + 1);
    for (let e = 0; e < m; e++) start[end[e]! + 1]!++;
    for (let i = 0; i < n; i++) start[i + 1]! += start[i]!;
    const fill = start.slice();
    const list = new Int32Array(m);
    for (let e = 0; e < m; e++) list[fill[end[e]!]!++] = e;
    return [start, list];
  };
  const [succStart, succE] = lists(EF);
  const [predStart, predE] = lists(ET);
  const g: Graph = {
    n,
    real: n,
    maxRank: spec.ranks.length - 1,
    W: Float64Array.from(widths),
    KIND,
    RANK,
    EF,
    ET,
    EFD: Float64Array.from(spec.segments, (s) => s.fromDx ?? 0),
    ETD: Float64Array.from(spec.segments, (s) => s.toDx ?? 0),
    succStart,
    succE,
    predStart,
    predE,
    layerStart,
    order: Int32Array.from({ length: n }, (_, i) => i),
    pos,
    offsets: spec.offsets ?? false,
    fixed: new Uint8Array(spec.ranks.length),
    M: pxProfile.engine,
  };
  return { g, nodes: widths.map((w, i) => lnode(w, 20, spec.kinds?.[i] ?? Kind.Node)) };
}
