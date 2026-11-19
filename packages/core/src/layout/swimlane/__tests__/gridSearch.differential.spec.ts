import { describe, expect, it } from 'vitest';
import {
  type ObstacleBox,
  ObstacleLines,
  type PipeLine,
  firstPipeNear,
} from '../orthogonalRouter/gridSearch.ts';

/**
 * The router's A* search reads the pipe grid and the node boxes through `gridSearch.ts` (#843).
 * Each lookup must answer what the scan it replaces answered; the scans are kept here as the
 * router had them inline. Coordinates come from a coarse grid with small offsets, so that pipes
 * lie exactly 1 apart, within 1 of each other, and on the edges of boxes.
 */

const CASES = 20_000;
/**
 * Lookups that find a pipe, so agreement is not only on "none": a run finds about 7,500 in
 * 20,000.
 */
const MIN_FOUND = 5_000;
/** Steps a box blocks, likewise: a run blocks about 2,850 of 20,000. */
const MIN_BLOCKED = 2_000;

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

/** The router's step test, as it ran over every box for each neighbour. */
function blockedReference(
  obstacles: readonly ObstacleBox[],
  cx: number,
  cy: number,
  neighbor: { x: number; y: number },
  start: string | undefined,
  end: string | undefined
): boolean {
  const minX = Math.min(cx, neighbor.x);
  const maxX = Math.max(cx, neighbor.x);
  const minY = Math.min(cy, neighbor.y);
  const maxY = Math.max(cy, neighbor.y);
  return obstacles.some((obs) => {
    if (obs.nodeId === start || obs.nodeId === end) {
      return false;
    }
    if (minX !== maxX) {
      return obs.minY < cy && obs.maxY > cy && obs.maxX > minX && obs.minX < maxX;
    }
    return obs.minX < cx && obs.maxX > cx && obs.maxY > minY && obs.minY < maxY;
  });
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

  it('blocks a step as the scan over every box does', () => {
    const random = seededRandom(11);
    let blocked = 0;
    for (let c = 0; c < CASES / 20; c++) {
      const obstacles: ObstacleBox[] = Array.from({ length: random(9) }, (_, i) => {
        const [x, y] = [coordFrom(random), coordFrom(random)];
        return {
          nodeId: `n${i}`,
          minX: x,
          minY: y,
          maxX: x + random(4) * 7.5,
          maxY: y + random(4) * 7.5,
        };
      });
      const lines = new ObstacleLines(obstacles);
      for (let step = 0; step < 20; step++) {
        const [cx, cy] = [coordFrom(random), coordFrom(random)];
        const neighbor =
          random(2) === 0 ? { x: coordFrom(random), y: cy } : { x: cx, y: coordFrom(random) };
        const start = random(3) === 0 ? undefined : `n${random(10)}`;
        const end = random(3) === 0 ? undefined : `n${random(10)}`;
        const bounds = [
          Math.min(cx, neighbor.x),
          Math.max(cx, neighbor.x),
          Math.min(cy, neighbor.y),
          Math.max(cy, neighbor.y),
        ] as const;
        const expected = blockedReference(obstacles, cx, cy, neighbor, start, end);
        expect(lines.blocksStep(cx, cy, bounds, start, end), `case ${c}.${step}`).toBe(expected);
        if (expected) blocked++;
      }
    }
    expect(blocked).toBeGreaterThanOrEqual(MIN_BLOCKED);
  });
});
