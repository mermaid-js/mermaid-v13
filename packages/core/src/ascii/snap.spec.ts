import { describe, expect, it } from 'vitest';
import { cellFixtures, randomCellFixtures } from '../layout/layered/grid.fixtures.ts';
import { layered } from '../layout/layered/index.ts';
import type { Point, RoutePoint } from '../layout/types.ts';
import { snapRoute } from './snap.ts';

const v = (x: number, y: number): RoutePoint => ({ x, y, axis: 'v' });
const h = (x: number, y: number): RoutePoint => ({ x, y, axis: 'h' });

// Orthogonal and connected: every step changes x or y, never both, and never neither.
function square(route: readonly Point[]): boolean {
  return route.every((p, i) => {
    const q = route[i - 1];
    return !q || (p.x === q.x) !== (p.y === q.y);
  });
}

describe('snapRoute (D78, R-ASCII-1)', () => {
  it.each<[string, RoutePoint[], number, Point[]]>([
    [
      'a straight drop stays as it is',
      [v(2, 3), v(2, 6)],
      1,
      [
        { x: 2, y: 3 },
        { x: 2, y: 6 },
      ],
    ],
    [
      'float noise at a tie keeps a run straight (research example 2)',
      [v(50.99999, 4), v(51, 9), h(60, 9)],
      1,
      [
        { x: 51, y: 4 },
        { x: 51, y: 9 },
        { x: 60, y: 9 },
      ],
    ],
    [
      'a diagonal gets a knee: the axis says how the route reaches the point',
      [h(5, 1), v(9, 4)],
      1,
      [
        { x: 5, y: 1 },
        { x: 9, y: 1 },
        { x: 9, y: 4 },
      ],
    ],
    [
      'a diagonal reached horizontally bends first',
      [v(5, 1), h(9, 4)],
      1,
      [
        { x: 5, y: 1 },
        { x: 5, y: 4 },
        { x: 9, y: 4 },
      ],
    ],
    [
      'duplicate and collinear points go',
      [v(2, 3), v(2, 3), v(2, 5), v(2, 8), h(6, 8)],
      1,
      [
        { x: 2, y: 3 },
        { x: 2, y: 8 },
        { x: 6, y: 8 },
      ],
    ],
    [
      'a grid quantum other than 1 gives cell indices',
      [v(4, 6), v(4, 12)],
      2,
      [
        { x: 2, y: 3 },
        { x: 2, y: 6 },
      ],
    ],
  ])('%s', (_, points, grid, expected) => {
    expect(snapRoute(points, grid)).toEqual(expected);
  });

  it('keeps every engine route on the cell fixtures orthogonal and connected, ends in place', () => {
    for (const { name, graph } of [...cellFixtures(), ...randomCellFixtures(60)]) {
      for (const [id, e] of layered(graph).edges) {
        const route = snapRoute(e.points);
        expect(square(route), `${name} ${id}`).toBe(true);
        expect(route[0], `${name} ${id}`).toEqual({ x: e.points[0]!.x, y: e.points[0]!.y });
        const last = e.points[e.points.length - 1]!;
        expect(route[route.length - 1], `${name} ${id}`).toEqual({ x: last.x, y: last.y });
      }
    }
  });
});
