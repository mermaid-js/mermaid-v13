// Ported from v12 `swimlanes/__tests__/phase2.layering.spec.ts` (c9b12739f), on graphs built from
// a `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { makeProperLayering } from '../phase2.dummies.ts';
import { assignLayers_LongestPath } from '../phase2.longestPath.ts';
import { type GraphSpec, viewOf } from './graphs.ts';

const mkGraph = (nodes: string[], edges: [string, string][]) =>
  viewOf({ nodes, edges }, { groups: false });

const CROSS_LANE: GraphSpec = {
  lanes: {
    Car: ['A'],
    Sales: ['B', 'M'],
    Constr: ['C', 'D', 'E', 'H', 'L', 'N'],
    Legal: ['I', 'J', 'K'],
    Fun: ['F', 'G'],
  },
  edges: [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'E'],
    ['E', 'F'],
    ['F', 'G'],
    ['D', 'H'],
    ['H', 'I'],
    ['I', 'J'],
    ['J', 'E'],
    ['I', 'K'],
    ['K', 'L'],
    ['L', 'M'],
    ['L', 'N'],
  ],
};

describe('Phase 2 — Layer Assignment', () => {
  it('Chain A->B->C->D: consecutive layers; no dummies', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ]
    );
    const layering = assignLayers_LongestPath(g, { compactSingleInput: false });
    expect(layering.layers).toEqual([['A'], ['B'], ['C'], ['D']]);
    expect(layering.dummy?.size ?? 0).toBe(0);
  });

  it('Long edge A->D with chain A->B->C->D introduces two dummies on A->D', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['A', 'D'],
      ]
    );
    const layering = assignLayers_LongestPath(g, { compactSingleInput: false });
    const { layering: proper, graphWithDummies } = makeProperLayering(layering, g);
    const dummies = [...(proper.dummy ?? [])];
    expect(dummies.length).toBe(2);
    expect(proper.layers[1]!.filter((id) => dummies.includes(id)).length).toBe(1);
    expect(proper.layers[2]!.filter((id) => dummies.includes(id)).length).toBe(1);
    // The long edge e3 should be split into a chain of 3 edges
    expect(graphWithDummies.edges.filter((e) => e.id.startsWith('e3#')).length).toBe(3);
  });

  it('Diamond: ranks consistent; minimal height', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'D'],
        ['C', 'D'],
      ]
    );
    const layering = assignLayers_LongestPath(g, { compactSingleInput: false });
    expect(layering.layers.length).toBe(3);
    expect(layering.layers[0]).toEqual(['A']);
    expect(new Set(layering.layers[1])).toEqual(new Set(['B', 'C']));
    expect(layering.layers[2]).toEqual(['D']);
  });

  it('Disconnected graphs: components layered independently', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['C', 'D'],
      ]
    );
    const r = assignLayers_LongestPath(g, { compactSingleInput: false }).rankOf;
    expect(r.A).toBe(0);
    expect(r.C).toBe(0);
    expect(r.B).toBe(1);
    expect(r.D).toBe(1);
  });

  it('Orders child subtrees by crossing counts', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'X'],
      [
        ['A', 'B'],
        ['A', 'C'],
        ['X', 'B'],
      ]
    );
    const layering = assignLayers_LongestPath(g, { compactSingleInput: false });
    expect(layering.layers[0]).toEqual(['A', 'X']);
    // Both B and C have the same crossing count (1), so they are ordered alphabetically
    expect(layering.layers[1]).toEqual(['B', 'C']);
  });

  it('Counts long edges when ordering same-layer children', () => {
    const g = viewOf(
      {
        lanes: { laneA: ['A'], laneB: ['B', 'X', 'Y'], laneC: ['C', 'Z'] },
        edges: [
          ['A', 'B'],
          ['A', 'C'],
          ['B', 'X'],
          ['B', 'Y'], // long edge spanning multiple layers (via X)
          ['X', 'Y'],
          ['C', 'Z'],
        ],
      },
      { groups: false }
    );
    const layering = assignLayers_LongestPath(g, { compactSingleInput: true });
    expect(layering.rankOf.A).toBe(0);
    expect(layering.rankOf.B).toBe(0);
    expect(layering.rankOf.C).toBe(0);
    const orderedNonGroups = layering.layers[0]!.filter((id) => !g.nodeById.get(id)?.isGroup);
    expect(orderedNonGroups[0]).toBe('A');
    expect(orderedNonGroups.slice(1)).toEqual(['C', 'B']);
  });

  it('Respects ignoreCrossLaneEdges when layering', () => {
    const baseline = assignLayers_LongestPath(viewOf(CROSS_LANE, { groups: false }), {
      compactSingleInput: false,
    });
    const ignore = assignLayers_LongestPath(viewOf(CROSS_LANE, { groups: false }), {
      compactSingleInput: false,
      ignoreCrossLaneEdges: true,
    });
    expect(baseline.rankOf.E).toBeGreaterThan(ignore.rankOf.E!);
    expect(ignore.rankOf.H).toBeGreaterThan(ignore.rankOf.E!);
  });
});
