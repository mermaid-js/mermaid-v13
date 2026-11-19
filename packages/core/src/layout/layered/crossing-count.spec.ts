import { describe, expect, it } from 'vitest';
import { graphOf, type Segment } from './graph.fixtures.ts';
import { crossed, FEW_ENDS, reduceCrossings } from './layered.ts';

// `crossed` counts the crossings in a gap between two ranks pair by pair when the gap has at most
// `FEW_ENDS` ends, and with an accumulator tree when it has more. Both count the pairs of ends
// out of order in the same sequence, so they must agree on any input. These tests check it, and
// the count `reduceCrossings` makes of the order it is given (its second result), against both
// ways of counting, kept here as the reference, on generated inputs either side of the threshold.

// Small deterministic generator (mulberry32), as in sort-rows.spec.ts.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The ends' places in the lower rank, gap by gap: the upper rank left to right, each node's
// segments in order of where they lead, as `reduceCrossings` lists them.
function gaps(ranks: number[][], segments: Segment[]): { targets: number[]; places: number }[] {
  const firstOf: number[] = [];
  let v = 0;
  for (const rank of ranks) {
    firstOf.push(v);
    v += rank.length;
  }
  return ranks.slice(0, -1).map((rank, r) => {
    const targets: number[] = [];
    for (let i = 0; i < rank.length; i++) {
      const from = firstOf[r]! + i;
      const leads = segments.filter((s) => s.from === from).map((s) => s.to - firstOf[r + 1]!);
      targets.push(...leads.sort((a, b) => a - b));
    }
    return { targets, places: ranks[r + 1]!.length };
  });
}

// Reference: every pair, the way it is counted for few ends.
function byPairs(targets: number[]): number {
  let total = 0;
  for (let a = 1; a < targets.length; a++)
    for (let b = 0; b < a; b++) if (targets[b]! > targets[a]!) total++;
  return total;
}

// Reference: the accumulator tree, the way it is counted for more ends (and was for all).
function byTree(targets: number[], places: number): number {
  let leaves = 1;
  while (leaves < places) leaves <<= 1;
  const tree = new Int32Array(2 * leaves);
  let total = 0;
  for (const x of targets) {
    let i = x + leaves;
    tree[i]!++;
    while (i > 1) {
      if ((i & 1) === 0) total += tree[i + 1]!;
      i >>= 1;
      tree[i]!++;
    }
  }
  return total;
}

// A graph of `ranks.length` ranks of the given sizes, with `ends[r]` segments in gap r between
// random nodes of the two ranks. Two segments may join the same pair of nodes.
function generated(rand: () => number, sizes: number[], ends: number[]) {
  const ranks = sizes.map((k) => Array.from({ length: k }, () => 10));
  const segments: Segment[] = [];
  let first = 0;
  for (let r = 0; r + 1 < sizes.length; r++) {
    const next = first + sizes[r]!;
    for (let k = 0; k < ends[r]!; k++)
      segments.push({
        from: first + Math.floor(rand() * sizes[r]!),
        to: next + Math.floor(rand() * sizes[r + 1]!),
      });
    first = next;
  }
  return { ranks, segments };
}

function check(ranks: number[][], segments: Segment[]): void {
  const { g, nodes } = graphOf({ ranks, segments });
  const [, declared] = reduceCrossings(g, nodes);
  let pairs = 0;
  let tree = 0;
  for (const { targets, places } of gaps(ranks, segments)) {
    pairs += byPairs(targets);
    tree += byTree(targets, places);
  }
  expect(pairs).toBe(tree);
  expect(declared).toBe(pairs);
}

describe('crossing count', () => {
  it('counts pair by pair up to 16 ends in a gap', () => {
    // Measured (LD2, round 3); change it only with a paired timing of the layout.
    expect(FEW_ENDS).toBe(16);
  });

  it('gives what both ways of counting give, for any number of ends', () => {
    const tree = new Int32Array(2 * 64);
    for (let seed = 1; seed <= 2000; seed++) {
      const rand = rng(seed);
      const t = seed % (3 * FEW_ENDS);
      const places = 1 + Math.floor(rand() * 40);
      // Unsorted, with repeats: more than the layout gives it, which sorts each node's ends.
      const targets = Array.from({ length: t }, () => Math.floor(rand() * places));
      // Rubbish past `t` and in the tree must not count.
      const given = Int32Array.from([...targets, 0, places - 1, 0]);
      tree.fill(7);
      const want = byPairs(targets);
      expect(byTree(targets, places)).toBe(want);
      expect(crossed(given, t, places, tree)).toBe(want);
    }
  });

  it('agrees with both ways of counting in the layout, either side of the threshold', () => {
    const counts = [2, 3, FEW_ENDS - 1, FEW_ENDS, FEW_ENDS + 1, FEW_ENDS + 2, 2 * FEW_ENDS, 40];
    let withCrossings = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const rand = rng(seed);
      const ends = counts[seed % counts.length]!;
      const upper = 1 + Math.floor(rand() * 8);
      const lower = 2 + Math.floor(rand() * 9);
      const { ranks, segments } = generated(rand, [upper, lower], [ends]);
      check(ranks, segments);
      if (byPairs(gaps(ranks, segments)[0]!.targets) > 0) withCrossings++;
    }
    // Most inputs have crossings to count.
    expect(withCrossings).toBeGreaterThan(250);
  });

  it('adds up gaps with few ends and gaps with many in one graph', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(1000 + seed);
      const sizes = Array.from({ length: 4 }, () => 2 + Math.floor(rand() * 7));
      const ends = sizes.slice(1).map(() => Math.floor(rand() * 2 * (FEW_ENDS + 4)));
      const { ranks, segments } = generated(rand, sizes, ends);
      check(ranks, segments);
    }
  });

  it('counts ties as no crossing', () => {
    // Two segments from one node to one node, and two that share an end: only 0-3 and 1-2
    // cross.
    const ranks = [
      [10, 10],
      [10, 10],
    ];
    const segments = [
      { from: 0, to: 2 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 1, to: 2 },
    ];
    check(ranks, segments);
    const { g, nodes } = graphOf({ ranks, segments });
    expect(reduceCrossings(g, nodes)[1]).toBe(1);
  });
});
