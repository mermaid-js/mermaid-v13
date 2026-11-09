// Lanes grown around the final routes (v13, `laneFit.ts`): with flowchart's 20px group padding a
// rail laid 20 outside the nodes sat on the lane border (`mermaid-work`, `15-border-hugging-lr`).
import { describe, expect, it } from 'vitest';
import { fitLanesToRoutes } from '../laneFit.ts';
import { internalData } from './internalData.ts';

/** Two TB lanes side by side, 0–100 and 100–200 across, 0–300 along, with a 21px title band. */
const lanes = () =>
  [
    { id: 'L1', isGroup: true, x: 50, y: 150, width: 100, height: 300 },
    { id: 'L2', isGroup: true, x: 150, y: 150, width: 100, height: 300 },
  ].map((l) => ({ ...l, groupTitleRect: { left: l.x - 50, right: l.x + 50, top: 0, bottom: 21 } }));

const nodes = [
  { id: 'A', parentId: 'L1', x: 50, y: 80, width: 40, height: 20 },
  { id: 'B', parentId: 'L2', x: 150, y: 80, width: 40, height: 20 },
];

describe('fitLanesToRoutes', () => {
  it('grows every lane along the flow, and the outer lanes across it, around a rail', () => {
    const data = internalData(
      [...lanes(), ...nodes],
      [
        {
          start: 'A',
          end: 'B',
          points: [
            { x: 50, y: 90 },
            { x: 50, y: 295 },
            { x: 205, y: 295 },
            { x: 205, y: 80 },
            { x: 170, y: 80 },
          ],
        },
      ]
    );
    fitLanesToRoutes(data);
    const [l1, l2] = data.nodes;
    expect([l1!.y! + l1!.height! / 2, l2!.y! + l2!.height! / 2]).toEqual([305, 305]);
    expect(l2!.x! + l2!.width! / 2).toBe(215);
    // The title band stays at the top and spans the grown lane.
    expect(l2!.groupTitleRect).toEqual({ left: 100, right: 215, top: 0, bottom: 21 });
    expect(l1!.x! - l1!.width! / 2).toBe(0);
  });

  it('leaves lanes that already hold every route with room to spare', () => {
    const data = internalData(
      [...lanes(), ...nodes],
      [
        {
          start: 'A',
          end: 'B',
          points: [
            { x: 70, y: 80 },
            { x: 130, y: 80 },
          ],
        },
      ]
    );
    const before = JSON.stringify(data.nodes);
    fitLanesToRoutes(data);
    expect(JSON.stringify(data.nodes)).toBe(before);
  });

  it('moves the end of an edge that meets a lane with the lane border', () => {
    const data = internalData(
      [...lanes(), ...nodes],
      [
        {
          id: 'r',
          start: 'A',
          end: 'B',
          points: [
            { x: 50, y: 90 },
            { x: 50, y: 295 },
            { x: 130, y: 295 },
            { x: 130, y: 80 },
          ],
        },
        // B down to the bottom of its own lane, which grows to 305 for r's rail.
        {
          id: 'g',
          start: 'B',
          end: 'L2',
          points: [
            { x: 160, y: 90 },
            { x: 160, y: 300 },
          ],
        },
      ]
    );
    fitLanesToRoutes(data);
    expect(data.nodes[1]!.y! + data.nodes[1]!.height! / 2).toBe(305);
    expect(data.edges[1]!.points).toEqual([
      { x: 160, y: 90 },
      { x: 160, y: 305 },
    ]);
  });
});
