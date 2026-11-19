import { describe, expect, it } from 'vitest';
import { balance, median } from './shard.ts';

const items = (...ms: number[]) =>
  ms.map((t, i) => ({ key: `f${String(i).padStart(2, '0')}`, ms: t }));
const total = (bin: readonly { ms: number }[]) => bin.reduce((sum, { ms }) => sum + ms, 0);

describe('balance', () => {
  it('places every item in exactly one bin', () => {
    const all = items(9, 1, 7, 3, 3, 8, 2, 5, 5, 4, 6, 1);
    const keys = balance(all, 5)
      .flat()
      .map(({ key }) => key);
    expect([...keys].sort()).toEqual(all.map(({ key }) => key));
  });

  it('gives the same split whatever order the items come in', () => {
    const all = items(9, 1, 7, 3, 3, 8, 2, 5, 5, 4, 6, 1);
    const keysOf = (bins: { key: string }[][]) => bins.map((bin) => bin.map(({ key }) => key));
    expect(keysOf(balance([...all].reverse(), 4))).toEqual(keysOf(balance(all, 4)));
  });

  it('evens the time where an equal number of files would not', () => {
    // One long file and many short ones: equal counts put the long one beside half the rest.
    const all = items(100, ...Array.from({ length: 10 }, () => 10));
    const totals = balance(all, 2).map(total);
    expect([...totals].sort((a, b) => a - b)).toEqual([100, 100]);
  });

  it('keeps every item in one bin for one shard, and leaves bins empty when there are more shards than items', () => {
    expect(balance(items(3, 2, 1), 1)).toEqual([items(3, 2, 1)]);
    expect(balance(items(5, 4), 3).map((bin) => bin.length)).toEqual([1, 1, 0]);
  });

  it('refuses a count that is not a positive integer', () => {
    expect(() => balance(items(1), 0)).toThrow(/positive integer/);
    expect(() => balance(items(1), 1.5)).toThrow(/positive integer/);
  });
});

describe('median', () => {
  it('is the middle value, the mean of the two middle values, or 1 for none', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(1);
  });
});
