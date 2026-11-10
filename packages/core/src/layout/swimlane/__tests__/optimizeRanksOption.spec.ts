// `swimlane.optimizeRanksByCrossings` (#601, D534) reaches the engine: v12's greedy pass runs only
// under `ignoreCrossLaneEdges: false` (gravity layering, through longest path), as in v12. On the
// corpus it changes no layout: longest path puts every node at its lowest feasible rank (or, with
// compaction, below it), so the pass, which only lifts a node down to that bound, finds nothing to
// move, upstream too. This spec checks the option is passed, not an effect.
import { describe, expect, it, vi } from 'vitest';
import type * as CrossOptimization from '../phase2.crossOptimization.ts';
import { layoutGraph } from './graphs.ts';
import { runSwimlane } from '../swimlane.ts';

const calls = vi.hoisted(() => ({ n: 0 }));

vi.mock('../phase2.crossOptimization.ts', async (load) => {
  const m = await load<typeof CrossOptimization>();
  return {
    ...m,
    optimizeRanksByCrossings: (...args: Parameters<typeof m.optimizeRanksByCrossings>) => {
      calls.n++;
      return m.optimizeRanksByCrossings(...args);
    },
  };
});

const graph = layoutGraph({
  lanes: { A: ['a1', 'a2'], B: ['b1', 'b2'] },
  edges: [
    ['a1', 'a2'],
    ['b1', 'b2'],
    ['a1', 'b2'],
    ['b1', 'a2'],
  ],
  size: { width: 40, height: 20 },
});

const runs = (tuning: Parameters<typeof runSwimlane>[1]): number => {
  calls.n = 0;
  runSwimlane(graph, tuning);
  return calls.n;
};

describe('optimizeRanksByCrossings reaches the engine', () => {
  it('runs the pass only with ignoreCrossLaneEdges: false and the option on', () => {
    expect(runs({ ignoreCrossLaneEdges: false, optimizeRanksByCrossings: true })).toBeGreaterThan(
      0
    );
    expect(runs({ ignoreCrossLaneEdges: false, optimizeRanksByCrossings: false })).toBe(0);
    expect(runs({ ignoreCrossLaneEdges: true, optimizeRanksByCrossings: true })).toBe(0);
  });
});
