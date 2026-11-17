import { describe, expect, it } from 'vitest';
import { RoutedSegmentIndex } from '../routedSegmentIndex.ts';
import type { IndexedSegment, RoutedOrientation } from '../routedSegmentIndex.ts';

/**
 * The router's crossing penalty counts the routed segments a step crosses. The index must give
 * the count of the scan of every segment it replaces (#843), on segments and steps drawn from a
 * small grid so that coordinates, spans and tolerances meet often.
 */

const EPS = 0.001;
const CASES = 200;
const SEGMENTS_PER_CASE = 40;
const EDGES = 6;
const GRID = 8;
const STEP = 10;
/** Offsets from a grid value: on it, within the tolerance, and outside it. */
const OFFSETS = [0, 0, 0, 0.0004, 0.002, 3];
/** The longest a run may take: well under a second alone, and CI is about 7x slower. */
const RUN_TIMEOUT_MS = 20_000;

function sequence(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

/** The scan the index replaces, as the router wrote it. */
function scan(
  all: readonly IndexedSegment[],
  orientation: RoutedOrientation,
  except: number,
  [low, high]: readonly [number, number],
  through: number
): number {
  let count = 0;
  for (const seg of all) {
    if (seg.edgeIndex === except || seg.orientation !== orientation) continue;
    if (seg.coord < low || seg.coord > high) continue;
    if (seg.from - EPS <= through && seg.to + EPS >= through) count++;
  }
  return count;
}

describe('RoutedSegmentIndex', () => {
  it(
    `counts as the scan of every segment does, over ${CASES} seeded cases`,
    () => {
      const mismatches: number[] = [];
      let nonZero = 0;
      for (let seed = 1; seed <= CASES; seed++) {
        const random = sequence(seed);
        const value = () => random(GRID) * STEP + OFFSETS[random(OFFSETS.length)]!;
        const index = new RoutedSegmentIndex();
        const all: IndexedSegment[] = [];
        for (let i = 0; i < SEGMENTS_PER_CASE; i++) {
          const a = value();
          const segment: IndexedSegment = {
            edgeIndex: random(EDGES),
            orientation: random(2) === 0 ? 'horizontal' : 'vertical',
            coord: value(),
            from: a,
            to: a + random(GRID) * STEP,
          };
          index.add(segment);
          all.push(segment);
          // Queries between additions: the router asks while it adds.
          const low = value();
          const range = [low, low + random(3) * STEP] as const;
          const orientation = random(2) === 0 ? 'horizontal' : 'vertical';
          const except = random(EDGES);
          const through = value();
          const expected = scan(all, orientation, except, range, through);
          if (index.countAcross(orientation, except, range, through, EPS) !== expected) {
            mismatches.push(seed);
          }
          if (expected > 0) nonZero++;
        }
      }
      expect(mismatches).toEqual([]);
      // Most queries find something, so agreement is not only on zero.
      expect(nonZero).toBeGreaterThan((CASES * SEGMENTS_PER_CASE) / 4);
    },
    RUN_TIMEOUT_MS
  );
});
