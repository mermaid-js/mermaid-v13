// Ported from v12 `swimlanes/__tests__/phase0.helpers.spec.ts` (c9b12739f), on graphs built from a
// `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import {
  incoming,
  isAcyclic,
  normalizeGraph,
  outgoing,
  topoSortIfAcyclic,
} from '../phase0.helpers.ts';
import { viewOf } from './graphs.ts';

const mkGraph = (nodes: string[], edges: [string, string][]) =>
  viewOf({ nodes, edges }, { groups: false });

describe('Phase 0 helpers', () => {
  it('handles empty graph', () => {
    const gn = normalizeGraph(mkGraph([], []));
    expect(isAcyclic(gn)).toBe(true);
    expect(topoSortIfAcyclic(gn)).toEqual([]);
  });

  it('handles single node', () => {
    const gn = normalizeGraph(mkGraph(['A'], []));
    expect(isAcyclic(gn)).toBe(true);
    expect(topoSortIfAcyclic(gn)).toEqual(['A']);
  });

  it('parallel edges remain acyclic', () => {
    const gn = normalizeGraph(
      mkGraph(
        ['A', 'B'],
        [
          ['A', 'B'],
          ['A', 'B'],
        ]
      )
    );
    expect(isAcyclic(gn)).toBe(true);
    expect(topoSortIfAcyclic(gn)).toEqual(['A', 'B']);
    expect(incoming(gn, 'B').length).toBe(2);
    expect(outgoing(gn, 'A').length).toBe(2);
  });

  it('detects self-loop as cyclic', () => {
    // The graph view leaves self-loops out, so this one is added to it by hand.
    const g = mkGraph(['A'], [['A', 'A']]);
    g.edges.push({ id: 'loop', src: 'A', dst: 'A', ref: { id: 'loop', start: 'A', end: 'A' } });
    const gn = normalizeGraph(g);
    expect(isAcyclic(gn)).toBe(false);
    expect(topoSortIfAcyclic(gn)).toBeNull();
  });

  it('two-node cycle A<->B is cyclic', () => {
    const gn = normalizeGraph(
      mkGraph(
        ['A', 'B'],
        [
          ['A', 'B'],
          ['B', 'A'],
        ]
      )
    );
    expect(isAcyclic(gn)).toBe(false);
    expect(topoSortIfAcyclic(gn)).toBeNull();
  });

  it('disconnected DAG topological order includes all nodes', () => {
    const gn = normalizeGraph(
      mkGraph(
        ['A', 'B', 'C', 'D'],
        [
          ['A', 'B'],
          ['C', 'D'],
        ]
      )
    );
    const order = topoSortIfAcyclic(gn);
    expect(order).not.toBeNull();
    expect(order!.length).toBe(4);
    // Ensure A before B and C before D
    const pos = Object.fromEntries(order!.map((id, i) => [id, i]));
    expect(pos.A).toBeLessThan(pos.B!);
    expect(pos.C).toBeLessThan(pos.D!);
  });
});
