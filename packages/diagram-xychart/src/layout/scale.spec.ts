import { describe, expect, it } from 'vitest';
import { bandScale, linePath, linearScale, ticks } from './scale.ts';

// Expected values are d3 7.9's (d3-array 3.2.4 `ticks`, d3-scale 4.0.2 `scaleLinear`/`scaleBand`,
// d3-shape 3.2.0 `line`) for the same calls; packages/conformance/src/xychart/ticks-parity.spec.ts
// checks `ticks` against d3 itself over a generated table.
describe('ticks (d3-array ticks, count 10)', () => {
  it('steps by 1, 2 or 5 times a power of ten', () => {
    expect(ticks(0, 10, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ticks(0, 198.2, 10)).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180]);
    expect(ticks(4000, 11000, 10)).toEqual([
      4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10000, 10500, 11000,
    ]);
  });

  it('divides by the inverse step below 1, so 0.3 is 0.3', () => {
    expect(ticks(0, 1, 10)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('runs downwards for a reversed domain', () => {
    expect(ticks(10, 0, 10)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('gives the one value of an empty range, and none for a count of 0', () => {
    expect(ticks(5, 5, 10)).toEqual([5]);
    expect(ticks(0, 1, 0)).toEqual([]);
  });

  it('covers negative ranges', () => {
    expect(ticks(-3, 2.5, 10)).toEqual([-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5]);
  });
});

describe('linearScale (d3 scaleLinear)', () => {
  it('maps the domain onto the range', () => {
    const s = linearScale([0, 100], [10, 210]);
    expect(s(0)).toBe(10);
    expect(s(50)).toBe(110);
    expect(s(150)).toBe(310);
  });

  it('maps a reversed domain as d3 does (swapped ends)', () => {
    const s = linearScale([100, 0], [10, 210]);
    expect(s(100)).toBe(10);
    expect(s(25)).toBe(160);
  });

  it('maps every value to the middle of the range for an empty domain', () => {
    const s = linearScale([3, 3], [0, 50]);
    expect(s(3)).toBe(25);
    expect(s(-7)).toBe(25);
  });
});

describe('bandScale (d3 scaleBand, paddingInner 1, paddingOuter 0, align 0.5)', () => {
  it('puts the first and last category on the range ends', () => {
    const s = bandScale(['a', 'b', 'c'], [0, 100]);
    expect(['a', 'b', 'c'].map((c) => s(c))).toEqual([0, 50, 100]);
  });

  it('centres one category', () => {
    expect(bandScale(['a'], [20, 60])('a')).toBe(40);
  });

  it('de-duplicates the domain, so a repeat shares its first position', () => {
    const s = bandScale(['a', 'b', 'a', 'c'], [0, 100]);
    expect(['a', 'b', 'c'].map((c) => s(c))).toEqual([0, 50, 100]);
  });

  it('gives undefined for a value not in the domain', () => {
    expect(bandScale(['a'], [0, 10])('z')).toBeUndefined();
  });
});

describe('linePath (d3 line, linear curve)', () => {
  it('writes M then L, rounded to 3 decimals', () => {
    expect(
      linePath([
        { x: 0, y: 1 },
        { x: 10.12345, y: 20 },
        { x: 30, y: 0.0004 },
      ])
    ).toBe('M0,1L10.123,20L30,0');
  });

  it('closes a one-point run, as d3 does', () => {
    expect(linePath([{ x: 3, y: 4 }])).toBe('M3,4Z');
  });

  it('starts a new run after a gap, and is empty for no point', () => {
    expect(linePath([{ x: 0, y: 0 }, undefined, { x: 2, y: 2 }, { x: 3, y: 3 }])).toBe(
      'M0,0ZM2,2L3,3'
    );
    expect(linePath([])).toBe('');
  });
});
