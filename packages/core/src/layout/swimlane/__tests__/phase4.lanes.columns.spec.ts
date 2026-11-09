// Ported from v12 `swimlanes/__tests__/phase4.lanes.columns.spec.ts` (c9b12739f), on a graph built
// from a `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { assignCoordinates } from '../phase4.coordinates.ts';
import { viewOf } from './graphs.ts';

const WIDTHS: Record<string, number> = { A: 120, B: 160, C: 200, D: 100 };

describe('Lane columns', () => {
  it('keeps same x for nodes in the same lane across layers', () => {
    const g = viewOf(
      {
        lanes: { lane1: ['A', 'B', 'D'], lane2: ['C'] },
        size: (id) => ({ width: WIDTHS[id]!, height: 50 }),
      },
      { groups: false }
    );
    // layers: A on 0, B and C on 1, D on 2
    const coords = assignCoordinates({ layers: [['A'], ['B', 'C'], ['D']] }, g, {
      nodeGap: 40,
      laneGap: 120,
      layerGap: 100,
    });
    expect(coords.x.A).toBe(coords.x.B);
    expect(coords.x.A).toBe(coords.x.D);
    expect(coords.x.C).toBeGreaterThan(coords.x.B!);
  });
});
