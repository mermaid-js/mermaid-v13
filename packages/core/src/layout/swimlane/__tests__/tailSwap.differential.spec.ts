import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '../layoutData.ts';
import { swapDestinationTerminalTailsToReduceCrossings } from '../direction/materializedGeometry.ts';
import { node } from './internalData.ts';
import { swapDestinationTerminalTailsReference } from './tailSwapReference.ts';

/**
 * The terminal tail swap reads the round's routes from indexes (#843). It must choose what the
 * plain version chose, which recounts every pair of routes for each swap it tries
 * (`tailSwapReference.ts`). Each case is a set of routes into a few hubs, drawn from a small grid
 * so that routes share tracks, cross, and lie within the tolerances of each other.
 */

/**
 * Cases per run. 3,000 is what it takes for the bends tie-break to decide a case: with 600 a
 * pass that counts the wrong bends still agrees with the plain version. The swap changes routes
 * in about 145 of them.
 */
const CASES = 3000;
/** Cases in which the swap must change routes, so agreement is not only on "no change". */
const MIN_CASES_WITH_A_SWAP = 70;
/** The longest a run of every case may take: two seconds alone, and CI is about 7x slower. */
const RUN_TIMEOUT_MS = 60_000;

const HUB_SIZE = { width: 60, height: 40 };
const SOURCE_SIZE = { width: 60, height: 40 };
const HUB_GAP = 400;
const HUB_Y = 600;
const TAIL_OFFSETS = [-20, 0, 20];
const TAIL_GAPS = [20, 40, 60, 80, 80.0004];
const SOURCE_COLUMNS = 5;
const SOURCE_ROWS = 4;
const COLUMN_GAP = 140;
const ROW_GAP = 120;
const RAIL_OFFSETS = [30, 50, 70, 90];

/** Integers below a bound from a 32-bit linear congruential generator, the same for the same seed. */
function seededRandom(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

interface Scene {
  nodes: Map<string, Node>;
  edges: Edge[];
}

/** Sources on a grid above hubs, and routes that turn twice and end in a straight tail. */
function scene(seed: number): Scene {
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]): T => items[random(items.length)]!;
  const hubCount = 1 + random(3);
  const nodes = new Map<string, Node>();
  const hubs = Array.from({ length: hubCount }, (_, i) => {
    const hub = node({ id: `h${i}`, x: i * HUB_GAP, y: HUB_Y, ...HUB_SIZE });
    nodes.set(hub.id, hub);
    return hub;
  });
  const edges: Edge[] = [];
  const edgeCount = 3 + random(8);
  for (let index = 0; index < edgeCount; index++) {
    const source = node({
      id: `s${index}`,
      x: random(SOURCE_COLUMNS) * COLUMN_GAP - COLUMN_GAP,
      y: random(SOURCE_ROWS) * ROW_GAP,
      ...SOURCE_SIZE,
    });
    nodes.set(source.id, source);
    const hub = pick(hubs);
    const rail = source.x! + pick(RAIL_OFFSETS);
    const start = { x: source.x! + SOURCE_SIZE.width / 2, y: source.y! };
    const tailOffset = pick(TAIL_OFFSETS);
    const tailGap = pick(TAIL_GAPS);
    const vertical = random(2) === 0;
    const tailStart = vertical
      ? { x: hub.x! + tailOffset, y: hub.y! - HUB_SIZE.height / 2 - tailGap }
      : { x: hub.x! - HUB_SIZE.width / 2 - tailGap, y: hub.y! + tailOffset };
    const terminal = vertical
      ? { x: tailStart.x, y: hub.y! - HUB_SIZE.height / 2 }
      : { x: hub.x! - HUB_SIZE.width / 2, y: tailStart.y };
    edges.push({
      id: `e${index}`,
      start: source.id,
      end: hub.id,
      points: [start, { x: rail, y: start.y }, { x: rail, y: tailStart.y }, tailStart, terminal],
    });
  }
  return { nodes, edges };
}

const routesOf = (edges: Edge[]): string => JSON.stringify(edges.map((edge) => edge.points));

describe('terminal tail swap: the same choices as its plain version', () => {
  it(
    `agrees on ${CASES} seeded cases, and swaps in at least ${MIN_CASES_WITH_A_SWAP} of them`,
    () => {
      let swapped = 0;
      const disagreements: number[] = [];
      for (let seed = 1; seed <= CASES; seed++) {
        const indexed = scene(seed);
        const plain = scene(seed);
        const before = routesOf(indexed.edges);
        swapDestinationTerminalTailsToReduceCrossings(indexed.edges, indexed.nodes);
        swapDestinationTerminalTailsReference(plain.edges, plain.nodes);
        if (routesOf(indexed.edges) !== routesOf(plain.edges)) disagreements.push(seed);
        if (routesOf(plain.edges) !== before) swapped++;
      }
      expect(disagreements).toEqual([]);
      expect(swapped).toBeGreaterThanOrEqual(MIN_CASES_WITH_A_SWAP);
    },
    RUN_TIMEOUT_MS
  );
});
