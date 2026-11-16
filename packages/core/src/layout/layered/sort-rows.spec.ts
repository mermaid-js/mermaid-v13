import { describe, expect, it } from 'vitest';
import { groupArranger, sortLayer } from './layered.ts';

// The row sorts in crossing reduction skip rows that are already in order. These tests compare
// them with the implementations they replaced, kept here as the reference, over generated rows.

// Reference: `arrange` in `reduceCrossings` before rows in order were skipped.
function oldGroupArranger(
  n: number,
  layerStart: Int32Array,
  order: Int32Array,
  pos: Int32Array,
  GRP: Int32Array | undefined,
  groupParent: Int32Array | undefined
): (r: number, key: Float64Array) => void {
  const groups = groupParent ? groupParent.length : 0;
  const depth = new Int32Array(groups);
  for (let gr = 0; gr < groups; gr++) for (let p = gr; p >= 0; p = groupParent![p]!) depth[gr]!++;
  const groupSum = new Float64Array(groups);
  const groupCount = new Int32Array(groups);
  const groupFirst = new Int32Array(groups);
  return (r: number, key: Float64Array): void => {
    const s = layerStart[r]!;
    const e = layerStart[r + 1]!;
    for (let i = s; i < e; i++) {
      for (let gr = GRP![order[i]!]!; gr >= 0; gr = groupParent![gr]!) {
        groupSum[gr] = 0;
        groupCount[gr] = 0;
      }
    }
    for (let i = s; i < e; i++) {
      const v = order[i]!;
      for (let gr = GRP![v]!; gr >= 0; gr = groupParent![gr]!) {
        if (groupCount[gr]! === 0) groupFirst[gr] = i;
        groupSum[gr]! += key[v]!;
        groupCount[gr]!++;
      }
    }
    const value = (item: number): number =>
      item >= n ? groupSum[item - n]! / groupCount[item - n]! : key[item]!;
    const first = (item: number): number => (item >= n ? groupFirst[item - n]! : s + pos[item]!);
    const compare = (a: number, b: number): number => {
      let ia = a;
      let ib = b;
      let ca = GRP![a]!;
      let cb = GRP![b]!;
      let da = ca < 0 ? 0 : depth[ca]!;
      let db = cb < 0 ? 0 : depth[cb]!;
      for (; da > db; da--) {
        ia = n + ca;
        ca = groupParent![ca]!;
      }
      for (; db > da; db--) {
        ib = n + cb;
        cb = groupParent![cb]!;
      }
      while (ca !== cb) {
        ia = n + ca;
        ca = groupParent![ca]!;
        ib = n + cb;
        cb = groupParent![cb]!;
      }
      return value(ia) - value(ib) || first(ia) - first(ib);
    };
    const row = [...order.subarray(s, e)].sort(compare);
    order.set(row, s);
    for (let i = s; i < e; i++) pos[order[i]!] = i - s;
  };
}

// Reference: `sortRank` in `layered` before layers in order were skipped.
function oldSortLayer(
  order: Int32Array,
  s: number,
  e: number,
  key: (v: number) => number
): boolean {
  if (e - s < 2) return false;
  for (let i = s; i < e; i++) if (Number.isNaN(key(order[i]!))) return false;
  const layer = [...order.subarray(s, e)];
  const index = new Map<number, number>();
  layer.forEach((v, i) => index.set(v, i));
  layer.sort((a, b) => key(a) - key(b) || index.get(a)! - index.get(b)!);
  order.set(layer, s);
  return true;
}

// Small deterministic generator (mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ODD = [NaN, Infinity, -Infinity, -0, 0];

function keys(rand: () => number, n: number, mode: number): Float64Array {
  const key = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const x = rand();
    if (mode === 0)
      key[v] = Math.floor(x * 3); // many ties
    else if (mode === 1) key[v] = x * 10;
    else if (mode === 2)
      key[v] = 1.5; // all equal
    else if (mode === 3)
      key[v] = rand() < 0.15 ? ODD[Math.floor(x * ODD.length)]! : Math.floor(x * 4);
    else key[v] = v % 7; // in vertex order
  }
  return key;
}

describe('groupArranger', () => {
  it('orders rows exactly as the sort it replaced', () => {
    let rows = 0;
    let inOrder = 0;
    let oneWide = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const rand = rng(seed);
      const groups = Math.floor(rand() * 6);
      const groupParent = new Int32Array(groups);
      for (let gr = 0; gr < groups; gr++)
        groupParent[gr] = gr === 0 || rand() < 0.4 ? -1 : Math.floor(rand() * gr);
      const ranks = 1 + Math.floor(rand() * 5);
      const widths = Array.from({ length: ranks }, () =>
        rand() < 0.2 ? Math.floor(rand() * 2) : Math.floor(rand() * 12)
      );
      const n = widths.reduce((a, b) => a + b, 0);
      const layerStart = new Int32Array(ranks + 1);
      for (let r = 0; r < ranks; r++) layerStart[r + 1] = layerStart[r]! + widths[r]!;
      const GRP = new Int32Array(n);
      for (let v = 0; v < n; v++)
        GRP[v] = groups > 0 && rand() < 0.7 ? Math.floor(rand() * groups) : -1;
      const order = new Int32Array(n);
      for (let v = 0; v < n; v++) order[v] = v;
      for (let r = 0; r < ranks; r++) {
        // Shuffle, reverse or keep each rank.
        const s = layerStart[r]!;
        const e = layerStart[r + 1]!;
        const how = rand();
        if (how < 0.4) {
          for (let i = e - 1; i > s; i--) {
            const j = s + Math.floor(rand() * (i - s + 1));
            [order[i], order[j]] = [order[j]!, order[i]!];
          }
        } else if (how < 0.6) order.subarray(s, e).reverse();
      }
      const pos = new Int32Array(n);
      const stale = rand() < 0.15;
      for (let r = 0; r < ranks; r++)
        for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++)
          pos[order[i]!] = stale ? Math.floor(rand() * 4) : i - layerStart[r]!;
      const oldOrder = order.slice();
      const oldPos = pos.slice();
      const next = groupArranger(n, layerStart, order, pos, GRP, groupParent);
      const prev = oldGroupArranger(n, layerStart, oldOrder, oldPos, GRP, groupParent);
      // Several passes so that rows come back already in order, as in the sweeps.
      for (let pass = 0; pass < 4; pass++) {
        const key = keys(rand, n, Math.floor(rand() * 5));
        for (let r = 0; r < ranks; r++) {
          const before = oldOrder.slice(layerStart[r], layerStart[r + 1]);
          prev(r, key);
          next(r, key);
          rows++;
          if (before.length < 2) oneWide++;
          else if (before.every((v, i) => v === oldOrder[layerStart[r]! + i])) inOrder++;
          expect([...order]).toEqual([...oldOrder]);
          expect([...pos]).toEqual([...oldPos]);
        }
      }
    }
    // The generated rows cover each case.
    expect(rows).toBeGreaterThan(10000);
    expect(oneWide).toBeGreaterThan(1000);
    expect(inOrder).toBeGreaterThan(1000);
    expect(rows - oneWide - inOrder).toBeGreaterThan(1000);
  });
});

describe('sortLayer', () => {
  it('orders layers exactly as the sort it replaced', () => {
    let sorted = 0;
    let inOrder = 0;
    let skipped = 0;
    for (let seed = 1; seed <= 6000; seed++) {
      const rand = rng(seed);
      const n =
        rand() < 0.1 ? Math.floor(rand() * 2) : Math.floor(rand() * (rand() < 0.1 ? 300 : 20));
      const mode = Math.floor(rand() * 7);
      const values = new Float64Array(n);
      for (let v = 0; v < n; v++) {
        const x = rand();
        if (mode === 0)
          values[v] = Math.floor(x * 3); // many ties
        else if (mode === 1) values[v] = x * 10;
        else if (mode === 2)
          values[v] = 2; // all equal
        else if (mode === 3)
          values[v] = rand() < 0.2 ? ODD[Math.floor(x * ODD.length)]! : Math.floor(x * 4);
        else if (mode === 4)
          values[v] = v; // in vertex order
        else if (mode === 5)
          values[v] = n - v; // reversed
        else values[v] = rand() < 0.2 ? [Infinity, -Infinity, -0, 0][Math.floor(x * 4)]! : x;
      }
      const key = (v: number): number => values[v]!;
      const order = new Int32Array(n);
      for (let v = 0; v < n; v++) order[v] = v;
      if (rand() < 0.5) {
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [order[i], order[j]] = [order[j]!, order[i]!];
        }
      }
      // Sort a slice so that items outside it must stay put.
      const s = n > 2 && rand() < 0.3 ? 1 : 0;
      const e = n > 2 && rand() < 0.3 ? n - 1 : n;
      const oldOrder = order.slice();
      const before = order.slice();
      const done = sortLayer(order, s, e, key);
      expect(done).toBe(oldSortLayer(oldOrder, s, e, key));
      expect([...order]).toEqual([...oldOrder]);
      if (!done) skipped++;
      else if (before.every((v, i) => v === oldOrder[i])) inOrder++;
      else sorted++;
      // A second pass meets the layer in order.
      expect(sortLayer(order, s, e, key)).toBe(oldSortLayer(oldOrder, s, e, key));
      expect([...order]).toEqual([...oldOrder]);
    }
    expect(Math.min(sorted, inOrder, skipped)).toBeGreaterThan(300);
  });

  it('keeps the given order between keys that compare as equal', () => {
    const order = Int32Array.from([5, 4, 3, 2, 1, 0]);
    const values = [1, Infinity, 0, Infinity, -0, 1];
    expect(sortLayer(order, 0, 6, (v) => values[v]!)).toBe(true);
    expect([...order]).toEqual([4, 2, 5, 0, 3, 1]);
    expect(sortLayer(order, 0, 6, (v) => (v === 3 ? NaN : 0))).toBe(false);
  });
});
