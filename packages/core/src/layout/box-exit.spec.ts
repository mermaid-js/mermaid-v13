import { describe, expect, it } from 'vitest';
import { boxExit } from './index.ts';

describe('boxExit', () => {
  it('leaves through the side the ray reaches first', () => {
    // A 20 × 10 box: half sizes 10 and 5.
    expect(boxExit(10, 5, 1, 0)).toBe(10);
    expect(boxExit(10, 5, 0, -2)).toBe(2.5);
    expect(boxExit(10, 5, 4, 1)).toBe(2.5);
    expect(boxExit(10, 5, 1, 1)).toBe(5);
  });

  it('is infinite for a ray of no direction', () => {
    expect(boxExit(10, 5, 0, 0)).toBe(Infinity);
  });
});
