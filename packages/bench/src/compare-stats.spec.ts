import { describe, expect, it } from 'vitest';
import { medianOf, medianSpeedup, pairedChange } from './compare-stats.ts';

describe('pairedChange', () => {
  it('calls identical timings no change, with a zero-width interval', () => {
    const t = Array<number>(20).fill(2);
    expect(pairedChange(t, t)).toEqual({ median: 0, low: 0, high: 0, rounds: 20 });
  });

  it('finds a consistent 10% slowdown, with an interval that excludes no change', () => {
    const base = Array.from({ length: 20 }, (_, i) => 2 + (i % 3) * 0.1);
    const slower = base.map((x, i) => x * 1.1 * (i % 2 ? 1.01 : 0.99));
    const c = pairedChange(slower, base)!;
    expect(c.median).toBeCloseTo(0.1, 1);
    expect(c.low).toBeGreaterThan(0);
    expect(c.high).toBeLessThan(0.15);
  });

  it('pairs by round, so a slow round shared by both cancels out', () => {
    const base = [1, 1, 5, 1, 1, 5, 1, 1, 5, 1];
    expect(pairedChange(base, base)!.median).toBe(0);
  });

  it('skips rounds either side missed, and gives up under 5 paired rounds', () => {
    const a = [1, null, 1, 1, null, 1, 1];
    const b = [1, 1, null, 1, 1, 1, 1];
    expect(pairedChange(a, b)).toBeNull();
    expect(pairedChange([...a, 1, 1], [...b, 1, 1])!.rounds).toBe(6);
  });

  it('is deterministic: the same rounds give the same interval', () => {
    const a = Array.from({ length: 20 }, (_, i) => 1 + ((i * 7) % 5) / 20);
    const b = Array.from({ length: 20 }, (_, i) => 1 + ((i * 3) % 5) / 20);
    expect(pairedChange(a, b)).toEqual(pairedChange(a, b));
  });
});

describe('medianSpeedup and medianOf', () => {
  it('is the median of the other renderer over v13 in the rounds both ran', () => {
    expect(medianSpeedup([1, 1, null], [20, 30, 40])).toBeCloseTo(Math.sqrt(600), 6);
    expect(medianSpeedup([1, null], [null, 3])).toBeNull();
    expect(medianOf([3, null, 1, 2])).toBe(2);
    expect(medianOf([null])).toBeNull();
  });
});
