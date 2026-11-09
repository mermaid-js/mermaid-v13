// Ported from v12 `swimlanes/__tests__/phase3.ordering.spec.ts` (c9b12739f), on graphs built from
// a `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import type { Layering } from '../helpers.ts';
import { orderLayers, totalCrossings } from '../phase3.ordering.ts';
import { viewOf } from './graphs.ts';

const mkGraph = (nodes: string[], edges: [string, string][]) =>
  viewOf({ nodes, edges }, { groups: false });

const layeringOf = (layers: string[][]): Layering => ({
  layers,
  rankOf: Object.fromEntries(layers.flatMap((l, r) => l.map((id) => [id, r]))),
  dummy: new Set(),
});

describe('Phase 3 — Vertex Ordering', () => {
  it('Two-layer bipartite zero-crossing order is achieved', () => {
    const g = mkGraph(
      ['U1', 'U2', 'L1', 'L2'],
      [
        ['U1', 'L1'],
        ['U2', 'L2'],
      ]
    );
    // deliberately reversed lower layer
    const ordered = orderLayers(
      layeringOf([
        ['U1', 'U2'],
        ['L2', 'L1'],
      ]),
      g
    );
    expect(ordered.layers[0]).toEqual(['U1', 'U2']);
    expect(ordered.layers[1]).toEqual(['L1', 'L2']);
    expect(totalCrossings(ordered.layers, g.edges)).toBe(0);
  });

  it('Transpose reduces crossings on a crafted case', () => {
    const g = mkGraph(
      ['A', 'B', 'C', 'd', 'e', 'f'],
      [
        ['A', 'e'],
        ['B', 'd'],
        ['C', 'f'],
      ]
    );
    const layering = layeringOf([
      ['A', 'B', 'C'],
      ['d', 'e', 'f'],
    ]);
    const before = totalCrossings(layering.layers, g.edges);
    const ordered = orderLayers(layering, g);
    expect(totalCrossings(ordered.layers, g.edges)).toBeLessThanOrEqual(before);
  });

  it('Deterministic results on repeated runs', () => {
    const g = mkGraph(
      ['U1', 'U2', 'U3', 'L1', 'L2', 'L3'],
      [
        ['U1', 'L2'],
        ['U2', 'L1'],
        ['U3', 'L3'],
      ]
    );
    const layering = layeringOf([
      ['U1', 'U2', 'U3'],
      ['L3', 'L2', 'L1'],
    ]);
    expect(orderLayers(layering, g).layers).toEqual(orderLayers(layering, g).layers);
  });

  it('Transpose considers crossings against next layer', () => {
    const g = mkGraph(
      ['I', 'J', 'K', 'L', 'E'],
      [
        ['I', 'J'],
        ['I', 'K'],
        ['J', 'E'],
        ['K', 'L'],
      ]
    );
    // targets ordered to induce a crossing with the initial J,K order
    const layering = layeringOf([['I'], ['J', 'K'], ['L', 'E']]);
    const before = totalCrossings(layering.layers, g.edges);
    const ordered = orderLayers(layering, g);
    expect(ordered.layers[1]).toEqual(['K', 'J']);
    expect(totalCrossings(ordered.layers, g.edges)).toBeLessThan(before);
  });
});
