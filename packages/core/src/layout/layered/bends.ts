// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`. The algorithm is unchanged.
// cspell:ignore kepano
//
// Bends in ranks that hold only bends, or labels, and which of them the route leaves out.

import { Kind, TWIN, type Graph } from './graph.ts';
import { f64, u8 } from './scratch.ts';

// Marks the ranks that hold nothing but the bends of edges, if there are any.
export function emptyRanks(g: Graph): Uint8Array | undefined {
  const { maxRank, KIND, layerStart, order } = g;
  const empty = u8(maxRank + 1);
  let any = false;
  for (let r = 1; r < maxRank; r++) {
    let only = layerStart[r + 1]! > layerStart[r]!;
    for (let i = layerStart[r]!; only && i < layerStart[r + 1]!; i++)
      if (KIND[order[i]!]! !== Kind.Dummy) only = false;
    if (only) {
      empty[r] = 1;
      any = true;
    }
  }
  return any ? empty : undefined;
}

// Moves the bends in ranks that hold only bends onto the straight line between the nearest points
// of their edges that are held in place, and marks the ones that can be left out of the route.
// `firstDummy` and `span` give each edge's run of bends, one in every rank. `sep` is the room
// kept between the bends of twin edges, or 0 to leave those out as well.
export function straighten(
  g: Graph,
  xs: Float64Array,
  empty: Uint8Array,
  sep: number,
  onLine: Uint8Array
): void {
  const {
    maxRank,
    firstDummy,
    span,
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
  } = g;

  const want = f64(xs.length);
  // The points that each bend's edge runs between, across the ranks that hold only bends.
  const from = f64(xs.length);
  const to = f64(xs.length);
  for (let ei = 0; ei < firstDummy.length; ei++) {
    const d0 = firstDummy[ei]!;
    if (d0 < 0) continue;
    const end = d0 + span[ei]! - 1;
    // A bend's rank is its place in the run, counted from the rank after the edge's first node.
    const base = g.RANK[d0]!;
    for (let d = d0; d < end; d++) {
      if (!empty[base + d - d0]!) continue;
      let last = d;
      while (last + 1 < end && empty[base + last + 1 - d0]!) last++;
      const above = predE[predStart[d]!]!;
      const below = succE[succStart[last]!]!;
      const x0 = xs[EF[above]!]! + EFD[above]!;
      const x1 = xs[ET[below]!]! + ETD[below]!;
      const steps = last - d + 2;
      for (let k = d; k <= last; k++) {
        want[k] = x0 + ((x1 - x0) * (k - d + 1)) / steps;
        from[k] = x0;
        to[k] = x1;
      }
      d = last;
    }
  }

  // Nothing in such a rank is in a bend's way, so each one goes onto its line and out of the
  // route. Only twins stay: bends of edges that run between the same two points, which would
  // otherwise be drawn as one. They take places a little apart, around the line.
  const twins: number[] = [];
  for (let r = 1; r < maxRank; r++) {
    if (!empty[r]!) continue;
    const s = layerStart[r]!;
    const end = layerStart[r + 1]!;
    const row = [...order.subarray(s, end)].sort(
      (a, b) => from[a]! - from[b]! || to[a]! - to[b]! || a - b
    );
    for (let i = 0; i < row.length; ) {
      twins.length = 0;
      let j = i;
      for (
        ;
        j < row.length &&
        Math.abs(from[row[j]!]! - from[row[i]!]!) < TWIN &&
        Math.abs(to[row[j]!]! - to[row[i]!]!) < TWIN;
        j++
      )
        twins.push(row[j]!);
      // The twins keep the order the rank gave them, so that two edges do not swap sides on the way.
      twins.sort((a, b) => g.pos[a]! - g.pos[b]!);
      for (let k = 0; k < twins.length; k++) {
        const d = twins[k]!;
        xs[d] = want[d]! + (k - (twins.length - 1) / 2) * sep;
        if (twins.length === 1 || sep === 0) onLine[d] = 1;
      }
      i = j;
    }
  }
}

// In a rank that holds labels and bends but no nodes, a bend is there to take its edge straight
// through between the labels. Where the edge would pass clear of every label anyway, the bend
// is left out, and the edge turns in the whole height between the ranks on either side.
export function pastLabels(g: Graph, xs: Float64Array, clear: number, onLine: Uint8Array): void {
  const {
    maxRank,
    firstDummy,
    span,
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
  } = g;
  const labelled = u8(maxRank + 1);
  let any = false;
  for (let r = 1; r < maxRank; r++) {
    let labels = false;
    let others = false;
    for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) {
      const kind = KIND[order[i]!]!;
      if (kind === Kind.Label) labels = true;
      else if (kind !== Kind.Dummy) others = true;
    }
    if (labels && !others) {
      labelled[r] = 1;
      any = true;
    }
  }
  if (!any) return;
  for (let ei = 0; ei < firstDummy.length; ei++) {
    const d0 = firstDummy[ei]!;
    if (d0 < 0) continue;
    for (let d = d0, end = d0 + span[ei]! - 1; d < end; d++) {
      if (KIND[d]! !== Kind.Dummy || !labelled[RANK[d]!]!) continue;
      // The points on either side that the edge is held at, past any bends already left out.
      let first = d;
      let last = d;
      while (first > d0 && onLine[first - 1]!) first--;
      while (last + 1 < end && onLine[last + 1]!) last++;
      const above = predE[predStart[first]!]!;
      const below = succE[succStart[last]!]!;
      const from = xs[EF[above]!]! + EFD[above]!;
      const to = xs[ET[below]!]! + ETD[below]!;
      const lo = Math.min(from, to) - clear;
      const hi = Math.max(from, to) + clear;
      let free = true;
      const r = RANK[d]!;
      for (let i = layerStart[r]!; free && i < layerStart[r + 1]!; i++) {
        const label = order[i]!;
        if (
          KIND[label]! === Kind.Label &&
          xs[label]! + W[label]! / 2 > lo &&
          xs[label]! - W[label]! / 2 < hi
        )
          free = false;
      }
      if (!free) continue;
      onLine[d] = 1;
      // The bends left out between the two points lie on the line between them.
      const steps = last - first + 2;
      for (let k = first; k <= last; k++) xs[k] = from + ((to - from) * (k - first + 1)) / steps;
    }
  }
}
