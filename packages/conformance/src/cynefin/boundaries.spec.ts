import { describe, expect, it } from 'vitest';
import { num } from '@mermaid-js/core/svg';
import {
  cliffCurve,
  confusionEllipse,
  curveData,
  ellipseData,
  foldCurve,
  hashString,
  horizonCurve,
  resolveSeed,
  seededRandom,
} from '@mermaid-js/diagram-cynefin/testing';
import { loadV12Boundaries } from './v12-boundaries.ts';

/**
 * The boundaries against v12's own generator (spec #423 T3): the fold, the horizon, the cliff
 * and the ellipse equal `mermaid@12.2.0`'s paths after `num()` rounding, the two decimals
 * every v13 path is written with (`core/src/svg/escape.ts`).
 */
const v12 = loadV12Boundaries();

/** A path's commands and numbers, each number as `num()` writes it. */
function rounded(d: string): string[] {
  return (d.match(/[A-Za-z]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map((t) =>
    /[A-Za-z]/.test(t) ? t : num(Number(t))
  );
}

const SEEDS = [1, 42, -3, 2 ** 31 - 1];
const AMPLITUDES = [0, 8, 15, 50];
const CANVASES = [
  [800, 600],
  [1000, 700],
  [333, 517],
] as const;

const cases = CANVASES.flatMap(([w, h]) =>
  SEEDS.flatMap((seed) => AMPLITUDES.map((a) => [w, h, seed, a] as const))
);

describe('cynefin boundaries equal v12 after num() rounding', () => {
  it('reads the generator from the v12 chunk', () => {
    expect(v12.generateFoldPath(800, 600, 42, 8)).toMatch(
      /^M401\.6176600307226,0 C406\.1051963418722,42\.857142857142854 /
    );
  });

  it.each(cases)('fold %d × %d, seed %d, amplitude %d', (w, h, seed, a) => {
    expect(rounded(curveData(foldCurve(w, h, seed, a)))).toEqual(
      rounded(v12.generateFoldPath(w, h, seed, a))
    );
  });

  // The renderer seeds the horizon with `seed + 100` (cynefinRenderer.ts :146).
  it.each(cases)('horizon %d × %d, seed %d, amplitude %d', (w, h, seed, a) => {
    expect(rounded(curveData(horizonCurve(w, h, seed, a)))).toEqual(
      rounded(v12.generateHorizontalBoundary(w, h, seed + 100, a))
    );
  });

  it.each(CANVASES)('cliff and ellipse %d × %d', (w, h) => {
    expect(rounded(curveData(cliffCurve(w, h)))).toEqual(rounded(v12.generateCliffPath(w, h)));
    const e = confusionEllipse(w, h);
    expect(rounded(ellipseData(e))).toEqual(
      rounded(v12.generateConfusionPath(w / 2, h / 2, w * 0.15, h * 0.15))
    );
  });

  it('draws amplitude 0 as straight cubic segments, not lines', () => {
    const d = curveData(foldCurve(800, 600, 42, 0));
    expect(d).toBe(
      'M400,0' +
        [1, 2, 3, 4, 5, 6, 7]
          .map((i) => {
            const y0 = ((i - 1) * 600) / 7;
            const y1 = (i * 600) / 7;
            const mid = num((y0 + y1) / 2);
            return `C400,${mid} 400,${mid} 400,${num(y1)}`;
          })
          .join('')
    );
  });
});

describe('cynefin seed randomness equals v12', () => {
  const inputs = [0, 1, 42, -3, -50, 100, 999999, 1.5, 2 ** 31 - 1, 2 ** 31 + 99, -(2 ** 40)];
  it('seededRandom', () => {
    expect(inputs.map(seededRandom)).toEqual(inputs.map((s) => v12.seededRandom(s)));
  });

  it('hashString', () => {
    const ids = ['', 'a', 'mermaid-1', 'cynefin', 'é→', 'x'.repeat(500)];
    expect(ids.map(hashString)).toEqual(ids.map((s) => v12.hashString(s)));
  });

  it('resolveSeed hashes the id prefix where v12 hashed the element id (D362)', () => {
    for (const seed of [0, Number.NaN, Infinity, -Infinity, 7, -3, 0.5])
      expect(resolveSeed(seed, 'mermaid-9')).toBe(v12.resolveSeed(seed, 'mermaid-9'));
  });
});
