// Ported from v12 `swimlanes/__tests__/laneOrdering.spec.ts` (c9b12739f), on graphs built from a
// `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import {
  buildWeightedLaneEdges,
  laneArrangementCost,
  optimizeTopLaneOrder,
} from '../laneOrdering.ts';
import { buildTopLaneOrder } from '../phase2.options.ts';
import { viewOf } from './graphs.ts';

/** One node per lane, `<lane>-node`, and an edge per pair of lanes. */
function mkGraph(lanes: string[], edgePairs: [string, string][]) {
  return viewOf({
    lanes: Object.fromEntries(lanes.map((lane) => [lane, [`${lane}-node`]])),
    edges: edgePairs.map(([a, b]) => [`${a}-node`, `${b}-node`] as const),
  });
}

describe('automatic swimlane ordering', () => {
  it('counts visible inter-lane edges as undirected weights', () => {
    const g = mkGraph(
      ['lane1', 'lane2', 'lane3'],
      [
        ['lane1', 'lane2'],
        ['lane2', 'lane1'],
        ['lane1', 'lane3'],
        ['lane1', 'lane1'],
      ]
    );
    g.layout.edges.push({
      id: 'layout-only-label',
      start: 'lane1-node',
      end: 'lane2-node',
      isLayoutOnly: true,
    });

    expect(buildWeightedLaneEdges(g)).toEqual([
      { a: 'lane1', b: 'lane2', weight: 2 },
      { a: 'lane1', b: 'lane3', weight: 1 },
    ]);
  });

  it('reduces weighted linear arrangement cost when automatic ordering is enabled', () => {
    const g = mkGraph(
      ['laneA', 'laneB', 'laneC', 'laneD'],
      [
        ['laneA', 'laneD'],
        ['laneA', 'laneD'],
        ['laneA', 'laneD'],
        ['laneA', 'laneD'],
      ]
    );
    const weights = buildWeightedLaneEdges(g);
    const optimized = optimizeTopLaneOrder(g, { restarts: 8 });

    expect(laneArrangementCost(optimized, weights)).toBeLessThan(
      laneArrangementCost(buildTopLaneOrder(g), weights)
    );
    expect(optimizeTopLaneOrder(g, { restarts: 8 })).toEqual(optimized);
  });

  it('preserves source order when every lane order has the same cost', () => {
    const g = mkGraph(
      ['laneA', 'laneB', 'laneC'],
      [
        ['laneA', 'laneB'],
        ['laneA', 'laneC'],
        ['laneB', 'laneC'],
      ]
    );
    expect(optimizeTopLaneOrder(g, { restarts: 8 })).toEqual(['laneA', 'laneB', 'laneC']);
  });
});
