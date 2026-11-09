// Ported from v12 `swimlanes/__tests__/phase2.compact.lanes.spec.ts` (c9b12739f), on a graph built
// from a `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { assignLayers_LongestPath } from '../phase2.longestPath.ts';
import { viewOf } from './graphs.ts';

describe('Compact single-input across lanes', () => {
  it('Only compacts for C (different lane), not for B (same lane)', () => {
    const g = viewOf(
      {
        lanes: { lane1: ['A', 'B'], lane2: ['C'] },
        edges: [
          ['A', 'B'],
          ['A', 'C'],
        ],
      },
      { groups: false }
    );
    const r = assignLayers_LongestPath(g, { compactSingleInput: true }).rankOf;
    expect(r.A).toBe(0);
    expect(r.B).toBe(1); // same lane as A -> next layer
    expect(r.C).toBe(0); // different lane -> inherit layer
  });
});
