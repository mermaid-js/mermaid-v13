import { describe, expect, it } from 'vitest';
import { byCodeUnit } from '../compare.ts';

describe('byCodeUnit (#676)', () => {
  it('orders by UTF-16 code unit, not by any locale', () => {
    // Each pair collates the other way round in some locale (et, cs, da, sv) or in `en`.
    expect(['z', 't', 'd', 'ch', 'b', 'B', 'z2', 'ä', 'a10', 'a2'].sort(byCodeUnit)).toEqual([
      'B',
      'a10',
      'a2',
      'b',
      'ch',
      'd',
      't',
      'z',
      'z2',
      'ä',
    ]);
  });

  it('is a consistent comparator', () => {
    expect(byCodeUnit('a', 'a')).toBe(0);
    expect(byCodeUnit('a', 'b')).toBe(-1);
    expect(byCodeUnit('b', 'a')).toBe(1);
    expect(byCodeUnit('', 'a')).toBe(-1);
  });
});
