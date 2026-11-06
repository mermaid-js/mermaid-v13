/**
 * R-LAYOUT-8, D280: the `tree` engine runs in linear time. A ratio test on CPU time (best of 5),
 * not an absolute time, so a busy machine slows both sizes alike: 8 times the nodes should cost
 * about 8 times as much; quadratic work would cost about 64 times.
 */
import type { LayoutGraph } from '@mermaid-js/core/layout';
import { tree } from '@mermaid-js/core/layout/tree';
import { describe, expect, it } from 'vitest';

/** A small deterministic generator (mulberry32). */
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

/** `n` nodes, node i's parent `parentOf(i)`, with sizes from `size`. */
function treeGraph(
  n: number,
  parentOf: (i: number) => number,
  size: () => [number, number] = () => [60, 24]
): LayoutGraph {
  return {
    direction: 'LR',
    nodes: Array.from({ length: n }, (_, i) => {
      const [width, height] = size();
      return { id: `n${i}`, width, height };
    }),
    edges: Array.from({ length: n - 1 }, (_, k) => ({
      id: `e${k}`,
      source: `n${parentOf(k + 1)}`,
      target: `n${k + 1}`,
      minLen: 1,
    })),
    groups: [],
    spacing: { node: 10, rank: 40, edge: 10 },
  };
}

function randomTree(n: number): LayoutGraph {
  const r = rng(3);
  const parents = Array.from({ length: n }, (_, i) => Math.floor(r() * i));
  return treeGraph(
    n,
    (i) => parents[i]!,
    () => [20 + r() * 180, 16 + r() * 50]
  );
}

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown): number => {
  const t0 = cpuMs();
  run();
  return cpuMs() - t0;
};

describe('tree: linear in the number of nodes', () => {
  it.each([
    ['random trees', randomTree],
    ['a deep chain', (n: number) => treeGraph(n, (i) => i - 1)],
    ['a wide fan', (n: number) => treeGraph(n, () => 0)],
    // Graphs that are not one tree (D285): a cycle through every node, and a second parent each.
    [
      'a cycle',
      (n: number) => {
        const g = treeGraph(n, (i) => i - 1);
        g.edges.push({ id: 'back', source: `n${n - 1}`, target: 'n0', minLen: 1 });
        return g;
      },
    ],
    [
      'two parents each',
      (n: number) => {
        const g = treeGraph(n, (i) => i - 1);
        for (let k = 0; k + 2 < n; k++)
          g.edges.push({ id: `x${k}`, source: `n${k}`, target: `n${k + 2}`, minLen: 1 });
        return g;
      },
    ],
    [
      'nested groups',
      (n: number) => {
        const g = treeGraph(n, (i) => i - 1);
        g.groups = Array.from({ length: n }, (_, k) => ({
          id: `g${k}`,
          ...(k > 0 ? { parent: `g${k - 1}` } : {}),
          padding: { top: 1, right: 1, bottom: 1, left: 1 },
        }));
        g.nodes[n - 1]!.parent = `g${n - 1}`;
        return g;
      },
    ],
  ] as const)(
    '%s',
    (_, build) => {
      const small = build(2_000);
      const large = build(16_000);
      tree(small); // warm up
      tree(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => tree(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => tree(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
