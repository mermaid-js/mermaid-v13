import { beforeAll, describe, expect, it } from 'vitest';
import { bandScale, linePath, linearScale, ticks } from '@mermaid-js/diagram-xychart/testing';
import { loadD3, type D3 } from './d3.ts';

/**
 * The XY chart's d3 re-implementations equal d3 7.9 itself (spec #426 §Package, #509's second
 * criterion): `ticks` equals `scaleLinear().domain([a, b]).ticks()` (count 10, as v12's
 * `linearAxis.ts` calls it) value for value, `Object.is`, over a generated table of ranges:
 * negative, reversed, tiny, huge, equal ends, and the domains v12 sees (data ranges, the
 * reversed y domain of a left axis). The scales and `line()` are checked on the same table.
 */
let d3: D3;
beforeAll(async () => {
  d3 = await loadD3();
});

/** A seeded LCG, so the table is the same on every run. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Domain ends: hand-picked edges, then random magnitudes from 1e-12 to 1e12, both signs. */
function domains(): [number, number][] {
  const fixed: [number, number][] = [
    [0, 10],
    [0, 1],
    [0, 198.2],
    [4000, 11000],
    [3000, 12000],
    [-3, 2.5],
    [-100, -1],
    [10, 0],
    [12000, 3000],
    [0, -0.001],
    [5, 5],
    [0, 0],
    [-7.25, -7.25],
    [1e-12, 3e-12],
    [0, 1e-9],
    [1e15, 1e15 + 3],
    [0, 1e300],
    [-1e300, 1e300],
    [0.1, 0.3],
    [0.30000000000000004, 0.7],
    [1, 2],
    [1, 12],
    [0, 2],
    [-0.5, 0.5],
    [3.8, 540],
    [Number.MIN_VALUE, 1],
  ];
  const next = random(509);
  const out = [...fixed];
  for (let i = 0; i < 4000; i++) {
    const mag = 10 ** (next() * 24 - 12);
    const a = (next() - 0.5) * 2 * mag;
    // Spans from a hundred-millionth of the value to many times it, either way round.
    const span = mag * 10 ** (next() * 10 - 8) * (next() < 0.5 ? -1 : 1);
    out.push(next() < 0.05 ? [a, a] : [a, a + span]);
  }
  for (let i = 0; i < 1000; i++) {
    // Integer-ish data ranges like v12's inferred ones.
    const lo = Math.round((next() - 0.5) * 2000);
    out.push([lo, lo + Math.round(next() * 5000)]);
  }
  return out;
}

const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

describe('xychart d3 re-implementations equal d3 7.9', () => {
  it('is d3 7.9.0', () => {
    expect(d3.version).toBe('7.9.0');
  });

  it('ticks: scaleLinear().ticks() value for value on the generated table', () => {
    const table = domains();
    expect(table.length).toBeGreaterThan(5000);
    const bad: string[] = [];
    for (const [a, b] of table) {
      const want = d3.scaleLinear().domain([a, b]).ticks();
      const got = ticks(a, b, 10);
      if (!same(got, want)) bad.push(`[${a}, ${b}]: ${got.join()} vs ${want.join()}`);
      for (const count of [0, 0.5, 1, 3, 25]) {
        if (!same(ticks(a, b, count), d3.ticks(a, b, count)))
          bad.push(`[${a}, ${b}] count ${count}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('linearScale and bandScale: d3 scaleLinear and scaleBand on the same table', () => {
    const next = random(426);
    const bad: string[] = [];
    for (const [a, b] of domains().slice(0, 1500)) {
      const range: [number, number] = [next() * 500, next() * 900];
      const mine = linearScale([a, b], range);
      const theirs = d3.scaleLinear().domain([a, b]).range(range);
      for (const x of [a, b, (a + b) / 2, a - 1, b * 3, 0]) {
        if (!Object.is(mine(x), theirs(x)))
          bad.push(`linear [${a}, ${b}] → ${JSON.stringify(range)}: ${x}`);
      }
    }
    for (let n = 0; n < 40; n++) {
      const cats = Array.from({ length: n }, () => String(Math.floor(next() * n * 0.8)));
      const range: [number, number] =
        n % 3 === 0 ? [next() * 900, next() * 100] : [next() * 100, next() * 900];
      const mine = bandScale(cats, range);
      const theirs = d3
        .scaleBand()
        .domain(cats)
        .range(range)
        .paddingInner(1)
        .paddingOuter(0)
        .align(0.5);
      for (const c of [...cats, 'missing']) {
        if (!Object.is(mine(c), theirs(c))) bad.push(`band ${n} ${JSON.stringify(range)}: ${c}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('linePath: d3 line() with gaps where d3 `defined` is false', () => {
    const next = random(7);
    const bad: string[] = [];
    for (let n = 0; n < 60; n++) {
      const pts = Array.from({ length: n % 9 }, (): [number, number] | undefined =>
        next() < 0.25 ? undefined : [next() * 1000 - 100, next() * 700]
      );
      const want =
        d3.line().defined((d) => !Number.isNaN(d[0]))(
          pts.map((p) => p ?? [Number.NaN, Number.NaN])
        ) ?? '';
      const got = linePath(pts.map((p) => (p ? { x: p[0], y: p[1] } : undefined)));
      if (got !== want) bad.push(`${got} vs ${want}`);
    }
    expect(bad).toEqual([]);
  });
});
