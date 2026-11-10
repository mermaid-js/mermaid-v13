// Ported from v12 `swimlanes/__tests__/direction.portSwap.spec.ts` (c9b12739f), on the engine's
// `Edge`/`Node`.
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '../layoutData.ts';
import { portSwapToLShape } from '../direction/portSwap.ts';

describe('portSwapToLShape', () => {
  it('rewrites a non-collinear HVH detour to a 3-point L shape from the source face', () => {
    const nodes: Node[] = [
      { id: 'A', isGroup: false, x: 0, y: 0, width: 40, height: 40 },
      { id: 'B', isGroup: false, x: 100, y: 100, width: 40, height: 40 },
    ];
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 20, y: 0 },
          { x: 60, y: 0 },
          { x: 60, y: 80 },
          { x: 100, y: 80 },
        ],
      },
    ];

    portSwapToLShape(edges, nodes);

    expect(edges[0]!.points).toEqual([
      { x: 0, y: 20 },
      { x: 0, y: 80 },
      { x: 100, y: 80 },
    ]);
  });
});
