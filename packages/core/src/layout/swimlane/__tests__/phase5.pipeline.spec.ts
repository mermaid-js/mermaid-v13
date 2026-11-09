// Ported from v12 `swimlanes/__tests__/phase5.pipeline.spec.ts` (c9b12739f), on graphs built from
// a `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { sugiyamaLayout } from '../pipeline.ts';
import { totalCrossings } from '../phase3.ordering.ts';
import { viewOf } from './graphs.ts';

const mkGraph = (nodes: string[], edges: [string, string][]) =>
  viewOf({ nodes, edges }, { groups: false });

describe('Phase 5 — Pipeline (sugiyamaLayout)', () => {
  it('Chain A->B->C->D yields layered y and no reversed', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ]
    );
    const res = sugiyamaLayout(g, { nodeGap: 40, layerGap: 80, ignoreCrossLaneEdges: false });
    expect(res.reversed.length).toBe(0);
    expect(res.coordinates.y).toMatchObject({ A: 0, B: 80, C: 160, D: 240 });
  });

  it('Two-node cycle A<->B gets one reversed edge', () => {
    const res = sugiyamaLayout(
      mkGraph(
        ['A', 'B'],
        [
          ['A', 'B'],
          ['B', 'A'],
        ]
      )
    );
    expect(res.reversed.length).toBe(1);
  });

  it('Two-layer bipartite ordering reaches zero crossings', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'X', 'Y', 'Z'],
      [
        ['A', 'X'],
        ['B', 'Y'],
        ['C', 'Z'],
      ]
    );
    expect(totalCrossings(sugiyamaLayout(g).ordered.layers, g.edges)).toBe(0);
  });
});
