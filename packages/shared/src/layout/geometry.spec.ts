import { describe, expect, it } from 'vitest';
import { growRect } from './geometry.ts';

describe('growRect', () => {
  it('grows the rectangle by the same amount on every side', () => {
    expect(growRect({ x: 10, y: 20, width: 30, height: 40 }, 2)).toEqual({
      x: 8,
      y: 18,
      width: 34,
      height: 44,
    });
  });

  it('shrinks it for a negative amount', () => {
    expect(growRect({ x: 0, y: 0, width: 10, height: 6 }, -1)).toEqual({
      x: 1,
      y: 1,
      width: 8,
      height: 4,
    });
  });
});
