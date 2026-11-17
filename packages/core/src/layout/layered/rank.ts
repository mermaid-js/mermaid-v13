// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, and `rank` has `balance` and
// `writeRanks` as functions of its own. The algorithm is unchanged.
// cspell:ignore kepano indeg topo
//
// The first phases of the layered layout: which way each edge runs, and the rank of each node.
import { Kind, type LEdge, type LNode } from './graph.ts';
import { copy, i32, u8 } from './scratch.ts';

// Reverses the edges that close a cycle, found by depth-first search in declaration order.
export function orient(nodes: LNode[], edges: LEdge[]): void {
  const n = nodes.length;
  const m = edges.length;
  const start = i32(n + 1);
  for (let i = 0; i < m; i++) {
    const e = edges[i]!;
    e.reversed = nodes[e.head]!.kind === Kind.StartPort || nodes[e.tail]!.kind === Kind.EndPort;
    if (!e.reversed) start[e.tail + 1]!++;
  }
  for (let i = 0; i < n; i++) start[i + 1]! += start[i]!;
  const out = i32(start[n]!);
  {
    const fill = copy(start, n);
    for (let i = 0; i < m; i++) if (!edges[i]!.reversed) out[fill[edges[i]!.tail]!++] = i;
  }
  const state = u8(n);
  const cursor = copy(start, n);
  const stack: number[] = [];
  for (let root = 0; root < n; root++) {
    if (state[root]! !== 0) continue;
    stack.push(root);
    state[root] = 1;
    while (stack.length > 0) {
      const v = stack[stack.length - 1]!;
      if (cursor[v]! < start[v + 1]!) {
        const e = edges[out[cursor[v]!++]!]!;
        const w = e.head;
        if (state[w]! === 1) e.reversed = true;
        else if (state[w]! === 0) {
          state[w] = 1;
          stack.push(w);
        }
      } else {
        state[v] = 2;
        stack.pop();
      }
    }
  }
}

export function rank(nodes: LNode[], edges: LEdge[], step: number): void {
  const n = nodes.length;
  const m = edges.length;
  // The edges once `orient` has run, as arrays: where each runs from and to, how many ranks it
  // spans at least, and each node's edges out and in.
  const from = i32(m);
  const to = i32(m);
  const len = i32(m);
  const outStart = i32(n + 1);
  const inStart = i32(n + 1);
  for (let i = 0; i < m; i++) {
    const e = edges[i]!;
    const a = e.reversed ? e.head : e.tail;
    const b = e.reversed ? e.tail : e.head;
    from[i] = a;
    to[i] = b;
    len[i] = Math.max(1, e.minlen) * step;
    outStart[a + 1]!++;
    inStart[b + 1]!++;
  }
  for (let i = 0; i < n; i++) {
    outStart[i + 1]! += outStart[i]!;
    inStart[i + 1]! += inStart[i]!;
  }
  const outE = i32(m);
  const inE = i32(m);
  {
    const of = copy(outStart, n);
    const inf = copy(inStart, n);
    for (let i = 0; i < m; i++) {
      outE[of[from[i]!]!++] = i;
      inE[inf[to[i]!]!++] = i;
    }
  }

  const r = i32(n);
  // Start ports go above every node later, so they don't push their targets down a rank.
  for (let i = 0; i < n; i++) if (nodes[i]!.kind === Kind.StartPort) r[i] = -step;
  const indeg = i32(n);
  for (let i = 0; i < n; i++) indeg[i] = inStart[i + 1]! - inStart[i]!;
  const topo = i32(n);
  let count = 0;
  for (let i = 0; i < n; i++) if (indeg[i]! === 0) topo[count++] = i;
  for (let q = 0; q < count; q++) {
    const v = topo[q]!;
    for (let k = outStart[v]!; k < outStart[v + 1]!; k++) {
      const ei = outE[k]!;
      const w = to[ei]!;
      if (r[v]! + len[ei]! > r[w]!) r[w] = r[v]! + len[ei]!;
      if (--indeg[w]! === 0) topo[count++] = w;
    }
  }

  // Longest-path ranking leaves loosely attached nodes far from their neighbours.
  // Moves each node toward the side that has more edges.
  const balance = (): void => {
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let q = count - 1; q >= 0; q--) {
        const v = topo[q]!;
        const ins = inStart[v + 1]! - inStart[v]!;
        const outs = outStart[v + 1]! - outStart[v]!;
        if (ins === 0 && outs === 0) continue;
        let lo = -Infinity;
        let hi = Infinity;
        for (let k = inStart[v]!; k < inStart[v + 1]!; k++) {
          const ei = inE[k]!;
          lo = Math.max(lo, r[from[ei]!]! + len[ei]!);
        }
        for (let k = outStart[v]!; k < outStart[v + 1]!; k++) {
          const ei = outE[k]!;
          hi = Math.min(hi, r[to[ei]!]! - len[ei]!);
        }
        let next = r[v]!;
        if (outs > ins && hi !== Infinity) next = hi;
        else if (ins > outs && lo !== -Infinity) next = lo;
        if (next !== r[v]!) {
          r[v] = next;
          changed = true;
        }
      }
      if (!changed) break;
    }
  };
  balance();

  // Puts the start ports above and the end ports below every node, and counts ranks from zero.
  const writeRanks = (): void => {
    let min = Infinity;
    let max = -Infinity;
    let startPorts = false;
    for (let i = 0; i < n; i++) {
      const kind = nodes[i]!.kind;
      if (kind === Kind.StartPort) startPorts = true;
      if (kind === Kind.StartPort || kind === Kind.EndPort) continue;
      if (r[i]! < min) min = r[i]!;
      if (r[i]! > max) max = r[i]!;
    }
    if (min === Infinity) {
      min = 0;
      max = 0;
    }
    for (let i = 0; i < n; i++) {
      if (nodes[i]!.kind === Kind.StartPort) r[i] = min - step;
      else if (nodes[i]!.kind === Kind.EndPort) r[i] = max + step;
    }
    if (startPorts) min -= step;
    for (let i = 0; i < n; i++) nodes[i]!.rank = r[i]! - min;
  };
  writeRanks();
}
