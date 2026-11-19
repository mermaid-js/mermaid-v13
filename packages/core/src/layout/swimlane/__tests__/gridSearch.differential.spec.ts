import { describe, expect, it } from 'vitest';
import { type PipeLine, firstPipeNear } from '../orthogonalRouter/gridSearch.ts';

/**
 * The router's A* search reads the pipe grid through `gridSearch.ts` (#843). Each lookup must
 * answer what the scan it replaces answered; the scan is kept here as the router had it inline.
 * Coordinates come from a coarse grid with small offsets, so that pipes lie exactly 1 apart and
 * within 1 of each other.
 */

const CASES = 20_000;
/**
 * Lookups that find a pipe, so agreement is not only on "none": a run finds about 7,500 in
 * 20,000.
 */
const MIN_FOUND = 5_000;

/** Offsets from a grid line: exact, a hair either side, and either side of the 1 boundary. */
const OFFSETS = [0, 0.05, -0.05, 0.5, 0.999_999, -0.999_999, 1, -1, 1.000_001, 0.1 + 0.2];

function seededRandom(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

const coordFrom = (random: (below: number) => number): number =>
  random(12) * 7.5 + OFFSETS[random(OFFSETS.length)]!;

/** The router's lookup: the list sorted in place, then the first pipe within 1. */
function findIndexReference(pipes: PipeLine[], at: number): number {
  const sorted = pipes.sort((a, b) => a.coord - b.coord);
  return sorted.findIndex((p) => Math.abs(p.coord - at) < 1);
}

describe('the A* grid lookups answer as the scans they replace (#843)', () => {
  it('finds the first pipe within 1 of a point as findIndex does', () => {
    const random = seededRandom(7);
    let found = 0;
    for (let c = 0; c < CASES; c++) {
      const pipes = Array.from({ length: random(14) }, () => ({ coord: coordFrom(random) }));
      const at = coordFrom(random);
      const expected = findIndexReference(pipes, at);
      expect(firstPipeNear(pipes, at), `case ${c}`).toBe(expected);
      if (expected >= 0) found++;
    }
    expect(found).toBeGreaterThanOrEqual(MIN_FOUND);
  });
});
