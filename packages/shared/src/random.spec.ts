import { describe, expect, it } from 'vitest';
import { seededRandom } from './random.ts';

const take = (next: () => number, n: number): number[] => Array.from({ length: n }, next);

describe('seededRandom', () => {
  it('gives the sequence venn has drawn its layouts from (D413)', () => {
    expect(take(seededRandom(0x2f6b_5a1d), 3)).toEqual([
      0.03671163250692189, 0.9502415654715151, 0.19595528836362064,
    ]);
    expect(take(seededRandom(7), 3)).toEqual([
      0.011704753153026104, 0.06195825757458806, 0.97690763277933,
    ]);
  });

  it('wraps the seed to 32 bits', () => {
    expect(take(seededRandom(-1), 3)).toEqual(take(seededRandom(2 ** 32 - 1), 3));
    expect(seededRandom(-1)()).toBe(0.8964226141106337);
  });
});
