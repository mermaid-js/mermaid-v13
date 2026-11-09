// Ported from v12 `swimlanes/phase2.layering.spec.ts` (c9b12739f), on graphs built from a
// `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { assignLayers_LaneAwareCompact } from './phase2.laneAwareCompact.ts';
import { viewOf } from './__tests__/graphs.ts';

describe('Lane-aware compact layering', () => {
  it('keeps sibling cross-lane branches before downstream branches in the same lane', () => {
    // Te2 -> D1, Te2 -> T4 and D4 -> T6 carry labels; they take part in layering as
    // themselves, so no label node or layout-only edge appears here.
    const label = { width: 20, height: 16 };
    const g = viewOf({
      lanes: { S: ['T5'], T: ['T4', 'T6'], Tester: ['Te2', 'D4'], D: ['D1', 'D2', 'D3'] },
      edges: [
        ['Te2', 'D1', label],
        ['D1', 'D2'],
        ['D2', 'D3'],
        ['D3', 'D4'],
        ['Te2', 'T4', label],
        ['D4', 'T6', label],
        ['T6', 'T5'],
      ],
    });
    expect(g.nodes.some((id) => id.startsWith('edge-label-'))).toBe(false);
    const layering = assignLayers_LaneAwareCompact(g, {
      ignoreCrossLaneEdges: true,
      direction: 'LR',
    });
    expect(layering.rankOf.T4).toBeLessThan(layering.rankOf.T6!);
  });

  it('assigns expected layers for the provided swimlanes diagram', () => {
    const g = viewOf({
      lanes: {
        Car: ['A'],
        Sales: ['B', 'M'],
        Legal: ['I', 'J', 'K'],
        Constr: ['C', 'D', 'E', 'H', 'L', 'N'],
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
    });
    const r = assignLayers_LaneAwareCompact(g, { ignoreCrossLaneEdges: true }).rankOf;
    const expected: Record<string, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 1,
      E: 3,
      F: 3,
      G: 4,
      H: 2,
      I: 2,
      J: 3,
      L: 4,
      M: 4,
      N: 5,
    };
    for (const [id, layer] of Object.entries(expected)) {
      expect(r[id], `node ${id}`).toBe(layer);
    }
  });
});
