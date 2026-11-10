// Ported from v12 `swimlanes/__tests__/direction.terminalStub.spec.ts` (c9b12739f), on the
// engine's `Edge`/`Node` (`internalData`'s `node`).
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '../layoutData.ts';
import { node } from './internalData.ts';
import { collapseShortTerminalStub } from '../direction/terminalStub.ts';

describe('collapseShortTerminalStub', () => {
  it('retargets a short perpendicular destination stub to the destination face center', () => {
    const nodeById = new Map<string, Node>([
      ['B', node({ id: 'B', x: 100, y: 110, width: 40, height: 40 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 0, y: 120 },
          { x: 70, y: 120 },
          { x: 70, y: 100 },
          { x: 78, y: 100 },
        ],
      },
    ];

    collapseShortTerminalStub(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: 0, y: 120 },
      { x: 100, y: 120 },
      { x: 100, y: 130 },
    ]);
  });
});
