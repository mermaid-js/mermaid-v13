import { describe, expect, it } from 'vitest';
import { PointKeys } from '../pointKeys.ts';

/**
 * `PointKeys` hands out each point's key once made (#843). A key must be the template's, the
 * first time and every time after: for halves of the last kept digit and either side of them,
 * for both zeros (which a `Map` takes as one key), for NaN and for numbers `toFixed` writes in
 * exponent form.
 */

const CASES = 20_000;
const VALUES = [
  0,
  -0,
  0.05,
  -0.05,
  0.15,
  0.25,
  1.45,
  2.55,
  0.0005,
  0.0015,
  0.1 + 0.2,
  1e21,
  -7.5,
  Number.NaN,
];

function seededRandom(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

describe('PointKeys (#843)', () => {
  it.each([1, 3])('keys a point as the template with %i digits does, each time', (digits) => {
    const random = seededRandom(17 + digits);
    const keys = new PointKeys(digits);
    const value = (): number =>
      random(2) === 0 ? VALUES[random(VALUES.length)]! : random(40) * 7.5 + random(1000) / 1000;
    for (let c = 0; c < CASES; c++) {
      const [x, y] = [value(), value()];
      expect(keys.key(x, y), `case ${c}`).toBe(`${x.toFixed(digits)},${y.toFixed(digits)}`);
    }
  });
});
