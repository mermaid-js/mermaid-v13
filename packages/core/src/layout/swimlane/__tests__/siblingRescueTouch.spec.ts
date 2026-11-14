// A U-detour rescued into a straight line is shifted off the face centre. When the shifted line
// would pass a corner of another route closer than the visible route gap, it takes the next
// shift out (#678).
import { describe, expect, it } from 'vitest';
import { straightenCollinearSiblingDetours } from '../direction/siblingSharedFaceRouting.ts';
import type { Edge, Node } from '../layoutData.ts';
import { VISIBLE_ROUTE_GAP, bends, distanceToSegment, distinct } from './routeTouches.ts';

const node = (id: string, x: number, y: number): Node => ({
  id,
  x,
  y,
  width: 152,
  height: 40,
  isGroup: false,
});

const edge = (id: string, start: string, end: string, xy: [number, number][]): Edge => ({
  id,
  start,
  end,
  points: xy.map(([x, y]) => ({ x, y })),
});

/** The least distance from a corner of `other` to the straight line `rescued`. */
function nearestCorner(rescued: Edge, other: Edge): number {
  const [a, b] = rescued.points!;
  return Math.min(...bends(distinct(other.points!)).map((p) => distanceToSegment(p, a!, b!)));
}

describe('a rescued detour beside another route', () => {
  // `D -> H` is a U-detour over the top; `D -> E` leaves D's face centre and turns 20 px on.
  const layout = () => {
    const nodes = [node('D', 474, 756), node('H', 912, 756), node('E', 1650, 756)];
    const toH = edge('D_H', 'D', 'H', [
      [474, 736],
      [474, 716],
      [912, 716],
      [912, 736],
    ]);
    const toE = edge('D_E', 'D', 'E', [
      [550, 756],
      [570, 756],
      [570, 713],
      [1011, 713],
      [1011, 756],
      [1573.8, 756],
    ]);
    return { nodes, toH, toE };
  };

  it('keeps the visible route gap from the corner of the route beside it', () => {
    const { nodes, toH, toE } = layout();
    straightenCollinearSiblingDetours([toH, toE], nodes);
    expect(toH.points).toHaveLength(2);
    expect(nearestCorner(toH, toE)).toBeGreaterThanOrEqual(VISIBLE_ROUTE_GAP);
  });
});
