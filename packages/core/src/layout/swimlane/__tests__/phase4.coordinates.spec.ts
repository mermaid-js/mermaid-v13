// Ported from v12 `swimlanes/__tests__/phase4.coordinates.spec.ts` (c9b12739f), on a graph built
// from a `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { assignCoordinates } from '../phase4.coordinates.ts';
import { viewOf } from './graphs.ts';

describe('Phase 4 — Coordinate Assignment', () => {
  it('Single layer: monotone increasing x with nodeGap; y constant', () => {
    const g = viewOf({ nodes: ['A', 'B', 'C'] }, { groups: false });
    const coords = assignCoordinates({ layers: [['A', 'B', 'C']] }, g, {
      nodeGap: 50,
      layerGap: 80,
    });
    expect(coords.y.A).toBe(0);
    expect(coords.y.B).toBe(0);
    expect(coords.y.C).toBe(0);
    // Centered placement within single lane: [-50, 0, 50]
    expect(coords.x.A).toBe(-50);
    expect(coords.x.B).toBe(0);
    expect(coords.x.C).toBe(50);
  });
});
