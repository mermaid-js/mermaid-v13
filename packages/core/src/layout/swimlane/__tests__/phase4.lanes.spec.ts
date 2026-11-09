// Ported from v12 `swimlanes/__tests__/phase4.lanes.spec.ts` (c9b12739f), on a graph built from a
// `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { assignCoordinates } from '../phase4.coordinates.ts';
import { viewOf } from './graphs.ts';

const WIDTHS: Record<string, number> = { A: 100, B: 120, C: 180, D: 80 };

describe('Lane-aware placement', () => {
  it('separates nodes of different lanes with laneGap', () => {
    const g = viewOf(
      {
        lanes: { lane1: ['B'], lane2: ['C'] },
        nodes: ['A', 'D'],
        size: (id) => ({ width: WIDTHS[id]!, height: 50 }),
      },
      { groups: false }
    );
    const laneGap = 100;
    const coords = assignCoordinates({ layers: [['B', 'C']] }, g, {
      nodeGap: 40,
      laneGap,
      layerGap: 80,
    });
    // Expected gap between centers >= laneGap + (B.width + C.width)/2
    expect(coords.x.C! - coords.x.B!).toBeGreaterThanOrEqual(laneGap + (120 + 180) / 2);
  });
});
