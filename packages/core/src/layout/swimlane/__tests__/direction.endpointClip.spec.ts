// Ported from v12 `swimlanes/__tests__/direction.endpointClip.spec.ts` (c9b12739f), on the
// engine's `Edge`/`Node` (`internalData`'s `node`). The cases from "where a route meets its nodes"
// on are v13's (#709): each builds a source and a destination box by hand and asserts the
// route's points, so the file can be split without a layout snapshot standing in for them.
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '../layoutData.ts';
import { node } from './internalData.ts';
import {
  CORNER_CLEARANCE,
  clipEdgeEndpointsToNodeBoundaries,
  prepareEdgeEndpointsForRenderer,
} from '../direction/endpointClip.ts';
import type { Point } from '../../types.ts';

describe('direction endpoint clipping', () => {
  it('clips buried endpoints to source and destination node boundaries', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: 0, y: 0, width: 10, height: 10 })],
      ['B', node({ id: 'B', x: 20, y: 0, width: 10, height: 10 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
      },
    ];

    clipEdgeEndpointsToNodeBoundaries(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: 5, y: 0 },
      { x: 15, y: 0 },
    ]);
  });

  it('moves straight side-to-side endpoints away from node corners', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: 0, y: 0, width: 20, height: 20 })],
      ['B', node({ id: 'B', x: 40, y: 0, width: 20, height: 40 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 10, y: 8 },
          { x: 30, y: 8 },
        ],
      },
    ];

    clipEdgeEndpointsToNodeBoundaries(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: 10, y: 6 },
      { x: 30, y: 6 },
    ]);
  });

  it('duplicates snapped endpoints so renderer clipping becomes a no-op', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: 0, y: 0, width: 10, height: 10 })],
      ['B', node({ id: 'B', x: 20, y: 0, width: 10, height: 10 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: -5, y: 0 },
          { x: 10, y: 0 },
          { x: 15, y: 0 },
        ],
      },
    ];

    prepareEdgeEndpointsForRenderer(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: -5, y: 0 },
      { x: -5, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 0 },
    ]);
  });

  it('is idempotent when renderer endpoints are already duplicated', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: 0, y: 0, width: 10, height: 10 })],
      ['B', node({ id: 'B', x: 20, y: 0, width: 10, height: 10 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: -5, y: 0 },
          { x: 10, y: 0 },
          { x: 15, y: 0 },
        ],
      },
    ];

    prepareEdgeEndpointsForRenderer(edges, nodeById);
    const once = edges[0]!.points!.map((point) => ({ ...point }));
    prepareEdgeEndpointsForRenderer(edges, nodeById);

    expect(edges[0]!.points).toEqual(once);
  });

  it('keeps straight renderer edges two-point while clearing corner ports', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: 0, y: 0, width: 20, height: 20 })],
      ['B', node({ id: 'B', x: 40, y: 0, width: 20, height: 40 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 10, y: 8 },
          { x: 30, y: 8 },
        ],
      },
    ];

    prepareEdgeEndpointsForRenderer(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: 10, y: 6 },
      { x: 30, y: 6 },
    ]);
  });

  it('snaps renderer endpoints to the boundary entered by the approach segment', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: 0, y: 0, width: 10, height: 10 })],
      ['B', node({ id: 'B', x: 40, y: 40, width: 20, height: 20 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 5, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 50 },
        ],
      },
    ];

    prepareEdgeEndpointsForRenderer(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: 5, y: 0 },
      { x: 5, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 40, y: 30 },
    ]);
  });
});

/** `INSIDE_EPS` in endpointClip.ts: a point counts as inside a node only deeper than this. */
const INSIDE_MARGIN = 0.5;

/** A node given by its four sides. */
const box = (id: string, left: number, top: number, right: number, bottom: number): Node =>
  node({
    id,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  });
/** The source and destination used unless a case says otherwise: 40 square, 60 apart. */
const SRC = () => box('A', 0, 0, 40, 40);
const DST = () => box('B', 100, 0, 140, 40);
const path = (...xy: [number, number][]): Point[] => xy.map(([x, y]) => ({ x, y }));

/** Run `fn` on one edge from `A` to `B` over the given nodes and return its points. */
function through(
  fn: typeof clipEdgeEndpointsToNodeBoundaries,
  points: Point[],
  nodes: Node[] = [SRC(), DST()]
): Point[] | undefined {
  const edges: Edge[] = [{ id: 'A_B', start: 'A', end: 'B', points }];
  fn(edges, new Map(nodes.map((n) => [n.id, n])));
  return edges[0]!.points;
}
const clip = (points: Point[], nodes?: Node[]) =>
  through(clipEdgeEndpointsToNodeBoundaries, points, nodes);
const prepare = (points: Point[], nodes?: Node[]) =>
  through(prepareEdgeEndpointsForRenderer, points, nodes);

describe('clipEdgeEndpointsToNodeBoundaries: where a route meets its nodes', () => {
  it.each([
    { side: 'right', from: path([20, 20], [70, 20]), to: path([40, 20], [70, 20]) },
    { side: 'left', from: path([20, 20], [-30, 20]), to: path([0, 20], [-30, 20]) },
    { side: 'top', from: path([20, 20], [20, -30]), to: path([20, 0], [20, -30]) },
    { side: 'bottom', from: path([20, 20], [20, 70]), to: path([20, 40], [20, 70]) },
  ])('cuts a route that starts inside the source where it leaves through the $side', (c) => {
    expect(clip(c.from)).toEqual(c.to);
  });

  it.each([
    { side: 'left', from: path([70, 20], [120, 20]), to: path([70, 20], [100, 20]) },
    { side: 'right', from: path([170, 20], [120, 20]), to: path([170, 20], [140, 20]) },
    { side: 'top', from: path([120, -30], [120, 20]), to: path([120, -30], [120, 0]) },
    { side: 'bottom', from: path([120, 70], [120, 20]), to: path([120, 70], [120, 40]) },
  ])('cuts a route that ends inside the destination where it enters through the $side', (c) => {
    expect(clip(c.from)).toEqual(c.to);
  });

  it('drops every point the node swallows before the route comes out', () => {
    expect(clip(path([10, 20], [20, 20], [30, 20], [70, 20]))).toEqual(path([40, 20], [70, 20]));
  });

  it('does not count a point as inside until it is deeper than the margin', () => {
    expect(clip(path([40 - INSIDE_MARGIN, 20], [70, 20]))).toEqual(
      path([40 - INSIDE_MARGIN, 20], [70, 20])
    );
    expect(clip(path([40 - INSIDE_MARGIN - 0.1, 20], [70, 20]))).toEqual(path([40, 20], [70, 20]));
  });

  it('leaves a route that lies wholly inside a node as it is', () => {
    expect(clip(path([10, 10], [10, 30]))).toEqual(path([10, 10], [10, 30]));
  });

  it('turns a slanted leg out of the node into a right angle at the border', () => {
    expect(clip(path([20, 20], [60, -20]))).toEqual(path([40, 0], [60, 0], [60, -20]));
  });

  it('keeps every point before the one that touches the destination', () => {
    expect(clip(path([70, 60], [70, 20], [120, 20]))).toEqual(path([70, 60], [70, 20], [100, 20]));
  });

  it('leaves a route that lies wholly inside the destination as it is', () => {
    expect(clip(path([110, 10], [110, 30]))).toEqual(path([110, 10], [110, 30]));
  });

  it('clips one end when the node at the other is not in the layout', () => {
    const lost = (id: 'start' | 'end') => {
      const edge: Edge = { id: 'A_B', start: 'A', end: 'B', points: path([20, 20], [120, 20]) };
      edge[id] = 'gone';
      clipEdgeEndpointsToNodeBoundaries(
        [edge],
        new Map([
          ['A', SRC()],
          ['B', DST()],
        ])
      );
      return edge.points;
    };
    expect(lost('start')).toEqual(path([20, 20], [100, 20]));
    expect(lost('end')).toEqual(path([40, 20], [120, 20]));
  });

  it('skips an edge that only steers the layout, has under two points, or names no node', () => {
    const inside = () => path([20, 20], [70, 20]);
    const edges: Edge[] = [
      { id: 'steer', start: 'A', end: 'B', points: inside(), isLayoutOnly: true },
      { id: 'one', start: 'A', end: 'B', points: path([20, 20]) },
      { id: 'none', start: 'A', end: 'B' },
      { id: 'anon', start: '', end: '', points: inside() },
    ];
    clipEdgeEndpointsToNodeBoundaries(
      edges,
      new Map([
        ['A', SRC()],
        ['B', DST()],
      ])
    );
    expect(edges.map((e) => e.points)).toEqual([inside(), path([20, 20]), undefined, inside()]);
  });
});

describe('clipEdgeEndpointsToNodeBoundaries: a straight route clear of the corners', () => {
  const [near, far] = [CORNER_CLEARANCE, 40 - CORNER_CLEARANCE];

  it.each([
    { y: 2, expected: near },
    { y: near, expected: near },
    { y: 20, expected: 20 },
    { y: far, expected: far },
    { y: 38, expected: far },
  ])('moves a horizontal route at $y to $expected', (c) => {
    expect(clip(path([40, c.y], [100, c.y]))).toEqual(path([40, c.expected], [100, c.expected]));
  });

  it.each([
    { x: 2, expected: near },
    { x: 20, expected: 20 },
    { x: 38, expected: far },
  ])('moves a vertical route at $x to $expected', (c) => {
    const below = box('B', 0, 100, 40, 140);
    expect(clip(path([c.x, 40], [c.x, 100]), [SRC(), below])).toEqual(
      path([c.expected, 40], [c.expected, 100])
    );
  });

  it.each([
    { name: 'left of the source', from: path([0, 2], [-30, 2]), to: path([0, near], [-30, near]) },
    { name: 'top of the source', from: path([2, 0], [2, -30]), to: path([near, 0], [near, -30]) },
    {
      name: 'bottom of the source',
      from: path([2, 40], [2, 70]),
      to: path([near, 40], [near, 70]),
    },
  ])('moves a route that leaves the $name off the corner', (c) => {
    expect(clip(c.from, [SRC()])).toEqual(c.to);
  });

  it.each([
    {
      name: 'right of the destination',
      from: path([170, 2], [140, 2]),
      to: path([170, near], [140, near]),
    },
    {
      name: 'top of the destination',
      from: path([102, -30], [102, 0]),
      to: path([100 + near, -30], [100 + near, 0]),
    },
    {
      name: 'bottom of the destination',
      from: path([102, 70], [102, 40]),
      to: path([100 + near, 70], [100 + near, 40]),
    },
  ])('moves a route that enters the $name off the corner', (c) => {
    expect(clip(c.from, [DST()])).toEqual(c.to);
  });

  it('moves a route that leaves the top of a node that does not start at the origin', () => {
    const low = box('A', 0, 100, 40, 140);
    expect(clip(path([2, 100], [2, 60]), [low])).toEqual(path([near, 100], [near, 60]));
  });

  it.each([
    { name: 'a horizontal route between the nodes', from: path([60, 2], [90, 2]) },
    { name: 'a vertical route above the source', from: path([2, -60], [2, -30]) },
    { name: 'a vertical route below the source', from: path([2, 70], [2, 100]) },
  ])('leaves $name alone when neither end is on a border', (c) => {
    expect(clip(c.from)).toEqual(c.from);
  });

  it.each([
    { name: 'left border, above the node', from: path([0, -10], [-30, -10]) },
    { name: 'left border, below the node', from: path([0, 50], [-30, 50]) },
    { name: 'right border, above the node', from: path([40, -10], [70, -10]) },
    { name: 'right border, below the node', from: path([40, 50], [70, 50]) },
    { name: 'top border, left of the node', from: path([-10, 0], [-10, -30]) },
    { name: 'top border, right of the node', from: path([50, 0], [50, -30]) },
    { name: 'bottom border, left of the node', from: path([-10, 40], [-10, 70]) },
    { name: 'bottom border, right of the node', from: path([50, 40], [50, 70]) },
  ])('leaves a route that runs along the line of the $name alone', (c) => {
    expect(clip(c.from, [SRC()])).toEqual(c.from);
  });

  it.each([
    { y: 18, expected: 20 },
    { y: 22, expected: 20 },
  ])('centres a route at $y on a node too short to clear both corners', (c) => {
    const short = box('A', 0, 20 - (CORNER_CLEARANCE - 1), 40, 20 + (CORNER_CLEARANCE - 1));
    expect(clip(path([40, c.y], [70, c.y]), [short])).toEqual(
      path([40, c.expected], [70, c.expected])
    );
  });

  it('keeps a route that no position clears at both ends', () => {
    const lower = box('B', 100, 40, 140, 80);
    expect(clip(path([40, 40], [100, 40]), [SRC(), lower])).toEqual(path([40, 40], [100, 40]));
  });

  it('clears the corner of whichever node is in the layout', () => {
    expect(clip(path([40, 2], [70, 2]), [SRC()])).toEqual(path([40, near], [70, near]));
    expect(clip(path([70, 2], [100, 2]), [DST()])).toEqual(path([70, near], [100, near]));
  });

  it('leaves a bent route alone', () => {
    expect(clip(path([40, 2], [70, 2], [70, 50]))).toEqual(path([40, 2], [70, 2], [70, 50]));
  });
});

describe('prepareEdgeEndpointsForRenderer: snapping the ends onto the border', () => {
  const [near] = [CORNER_CLEARANCE];

  it.each([
    {
      name: 'right half of the source, going right',
      from: path([30, 20], [70, 20]),
      to: path([40, 20], [70, 20]),
    },
    {
      name: 'left half of the source, going left',
      from: path([10, 20], [-30, 20]),
      to: path([0, 20], [-30, 20]),
    },
    {
      name: 'lower half of the source, going down',
      from: path([20, 30], [20, 70]),
      to: path([20, 40], [20, 70]),
    },
    {
      name: 'upper half of the source, going up',
      from: path([20, 10], [20, -30]),
      to: path([20, 0], [20, -30]),
    },
  ])('moves a start from the $name onto the nearer border', (c) => {
    expect(prepare(c.from, [SRC()])).toEqual(c.to);
  });

  it.each([
    {
      name: 'from the left, in its right half',
      from: path([60, 20], [130, 20]),
      to: path([60, 20], [100, 20]),
    },
    {
      name: 'from the right, in its left half',
      from: path([180, 20], [110, 20]),
      to: path([180, 20], [140, 20]),
    },
    {
      name: 'from above, in its lower half',
      from: path([120, -30], [120, 30]),
      to: path([120, -30], [120, 0]),
    },
    {
      name: 'from below, in its upper half',
      from: path([120, 70], [120, 10]),
      to: path([120, 70], [120, 40]),
    },
  ])('moves an end into the destination $name onto the border it comes from', (c) => {
    expect(prepare(c.from, [DST()])).toEqual(c.to);
  });

  it.each([
    { name: 'top', from: path([30, 0], [70, 0]), to: path([40, near], [70, near]) },
    { name: 'bottom', from: path([30, 40], [70, 40]), to: path([40, 40 - near], [70, 40 - near]) },
    { name: 'left', from: path([0, 30], [0, 70]), to: path([near, 40], [near, 70]) },
    { name: 'right', from: path([40, 30], [40, 70]), to: path([40 - near, 40], [40 - near, 70]) },
  ])('snaps a start that sits exactly on the line of the $name border like any other', (c) => {
    expect(prepare(c.from, [SRC()])).toEqual(c.to);
  });

  it('picks the nearer border of a node that does not start at the origin', () => {
    const low = box('A', 0, 100, 40, 140);
    expect(prepare(path([20, 110], [20, 60]), [low])).toEqual(path([20, 100], [20, 60]));
  });

  it('leaves an end alone when it is level with the node on neither axis', () => {
    expect(prepare(path([30, -5], [70, -5]), [SRC()])).toEqual(path([30, -5], [70, -5]));
    expect(prepare(path([-5, 30], [-5, 70]), [SRC()])).toEqual(path([-5, 30], [-5, 70]));
    expect(prepare(path([60, -5], [130, -5]), [DST()])).toEqual(path([60, -5], [130, -5]));
    expect(prepare(path([145, 70], [145, 10]), [DST()])).toEqual(path([145, 70], [145, 10]));
  });

  it('leaves an end alone when the leg into it is slanted', () => {
    expect(prepare(path([30, 20], [60, 60]), [SRC()])).toEqual(path([30, 20], [60, 60]));
  });

  it('drops repeated points before it looks at the ends', () => {
    expect(prepare(path([40, 20], [40, 20], [70, 20]), [SRC()])).toEqual(path([40, 20], [70, 20]));
  });

  it('skips an edge that only steers the layout, or has fewer than two points', () => {
    const edges: Edge[] = [
      { id: 'steer', start: 'A', end: 'B', points: path([30, 20], [70, 20]), isLayoutOnly: true },
      { id: 'one', start: 'A', end: 'B', points: path([30, 20]) },
    ];
    prepareEdgeEndpointsForRenderer(
      edges,
      new Map([
        ['A', SRC()],
        ['B', DST()],
      ])
    );
    expect(edges.map((e) => e.points)).toEqual([path([30, 20], [70, 20]), path([30, 20])]);
  });

  describe('a stub that runs along the node border and then leaves outward is dropped', () => {
    it.each([
      {
        side: 'left',
        from: path([0, 30], [0, 10], [-50, 10], [-50, -60]),
        to: path([0, 10], [0, 10], [-50, 10], [-50, -60], [-50, -60]),
      },
      {
        side: 'right',
        from: path([40, 30], [40, 10], [90, 10], [90, -60]),
        to: path([40, 10], [40, 10], [90, 10], [90, -60], [90, -60]),
      },
      {
        side: 'top',
        from: path([30, 0], [10, 0], [10, -50], [60, -50]),
        to: path([10, 0], [10, 0], [10, -50], [60, -50], [60, -50]),
      },
      {
        side: 'bottom',
        from: path([30, 40], [10, 40], [10, 90], [60, 90]),
        to: path([10, 40], [10, 40], [10, 90], [60, 90], [60, 90]),
      },
    ])('at the start, along the $side border', (c) => {
      expect(prepare(c.from, [SRC()])).toEqual(c.to);
    });

    it.each([
      {
        side: 'left',
        from: path([0, 10], [0, 30], [-50, 30], [-50, -60]),
        to: path([0, 30], [0, 30], [-50, 30], [-50, -60], [-50, -60]),
      },
      {
        side: 'right',
        from: path([40, 10], [40, 30], [90, 30], [90, -60]),
        to: path([40, 30], [40, 30], [90, 30], [90, -60], [90, -60]),
      },
      {
        side: 'top',
        from: path([10, 0], [30, 0], [30, -50], [60, -50]),
        to: path([30, 0], [30, 0], [30, -50], [60, -50], [60, -50]),
      },
      {
        side: 'bottom',
        from: path([10, 40], [30, 40], [30, 90], [60, 90]),
        to: path([30, 40], [30, 40], [30, 90], [60, 90], [60, 90]),
      },
    ])('at the start, along the $side border up to the corner nearest the start', (c) => {
      expect(prepare(c.from, [SRC()])).toEqual(c.to);
    });

    it.each([
      {
        side: 'left',
        from: path([50, -60], [50, 10], [100, 10], [100, 30]),
        to: path([50, -60], [50, -60], [50, 10], [100, 10], [100, 10]),
      },
      {
        side: 'right',
        from: path([190, -60], [190, 10], [140, 10], [140, 30]),
        to: path([190, -60], [190, -60], [190, 10], [140, 10], [140, 10]),
      },
      {
        side: 'top',
        from: path([60, -50], [110, -50], [110, 0], [130, 0]),
        to: path([60, -50], [60, -50], [110, -50], [110, 0], [110, 0]),
      },
      {
        side: 'bottom',
        from: path([60, 90], [110, 90], [110, 40], [130, 40]),
        to: path([60, 90], [60, 90], [110, 90], [110, 40], [110, 40]),
      },
    ])('at the end, along the $side border', (c) => {
      expect(prepare(c.from, [DST()])).toEqual(c.to);
    });
  });

  it('does not drop a stub that runs along the line of a border beyond the node', () => {
    const points = prepare(path([50, 0], [60, 0], [60, -50]), [SRC()]);
    expect(points).toEqual(path([40, near], [40, near], [60, near], [60, -50], [60, -50]));
  });

  describe('keeping the ends of a bent route off the corners', () => {
    it.each([
      {
        name: 'a start on a vertical border',
        from: path([40, 2], [70, 2], [70, 60]),
        to: path([40, near], [40, near], [70, near], [70, 60], [70, 60]),
      },
      {
        name: 'an end on a vertical border',
        from: path([70, 60], [70, 2], [100, 2]),
        to: path([70, 60], [70, 60], [70, near], [100, near], [100, near]),
      },
      {
        name: 'a start on a horizontal border',
        from: path([2, 40], [2, 70], [60, 70]),
        to: path([near, 40], [near, 40], [near, 70], [60, 70], [60, 70]),
      },
      {
        name: 'an end on a horizontal border',
        from: path([60, 70], [102, 70], [102, 40]),
        to: path([60, 70], [60, 70], [100 + near, 70], [100 + near, 40], [100 + near, 40]),
      },
    ])('moves $name along the border, with the run of points level with it', (c) => {
      expect(prepare(c.from, [SRC(), DST()])).toEqual(c.to);
    });
  });

  it('moves every point of a route that runs straight into the destination', () => {
    expect(prepare(path([70, 2], [85, 2], [100, 2]), [DST()])).toEqual(
      path([70, near], [70, near], [85, near], [100, near], [100, near])
    );
  });

  it('keeps a straight route that no position clears at both ends', () => {
    const lower = box('B', 100, 40, 140, 80);
    expect(prepare(path([40, 40], [100, 40]), [SRC(), lower])).toEqual(path([40, 40], [100, 40]));
  });

  it('does not take a route of two points that lies along a border for a stub', () => {
    expect(prepare(path([0, 30], [0, 10]), [SRC()])).toEqual(path([near, 40], [near, 10]));
  });

  it('drops the stub of a route that has no other leg before the outward one', () => {
    expect(prepare(path([0, 30], [0, 10], [-50, 10]), [SRC()])).toEqual(path([0, 10], [-50, 10]));
  });

  describe('a run along the line of a border, beyond the node, is not a stub', () => {
    const [low, high] = [near, 40 - near];
    it.each([
      {
        name: 'top, beyond the right side',
        from: path([50, 0], [60, 0], [60, -50]),
        to: path([40, low], [40, low], [60, low], [60, -50], [60, -50]),
      },
      {
        name: 'top, beyond the left side',
        from: path([-10, 0], [-20, 0], [-20, -50]),
        to: path([0, low], [0, low], [-20, low], [-20, -50], [-20, -50]),
      },
      {
        name: 'bottom, beyond the right side',
        from: path([50, 40], [60, 40], [60, 90]),
        to: path([40, high], [40, high], [60, high], [60, 90], [60, 90]),
      },
      {
        name: 'bottom, beyond the left side',
        from: path([-10, 40], [-20, 40], [-20, 90]),
        to: path([0, high], [0, high], [-20, high], [-20, 90], [-20, 90]),
      },
      {
        name: 'left, beyond the bottom',
        from: path([0, 50], [0, 60], [-50, 60]),
        to: path([low, 40], [low, 40], [low, 60], [-50, 60], [-50, 60]),
      },
      {
        name: 'left, beyond the top',
        from: path([0, -10], [0, -20], [-50, -20]),
        to: path([low, 0], [low, 0], [low, -20], [-50, -20], [-50, -20]),
      },
      {
        name: 'right, beyond the bottom',
        from: path([40, 50], [40, 60], [90, 60]),
        to: path([high, 40], [high, 40], [high, 60], [90, 60], [90, 60]),
      },
      {
        name: 'right, beyond the top',
        from: path([40, -10], [40, -20], [90, -20]),
        to: path([high, 0], [high, 0], [high, -20], [90, -20], [90, -20]),
      },
    ])('$name', (c) => {
      expect(prepare(c.from, [SRC()])).toEqual(c.to);
    });
  });

  describe('a stub along the top border of a node that does not start at the origin', () => {
    it('is dropped at the start when it leaves outward', () => {
      const low = box('A', 0, 100, 40, 140);
      expect(prepare(path([30, 100], [10, 100], [10, 50], [60, 50]), [low])).toEqual(
        path([10, 100], [10, 100], [10, 50], [60, 50], [60, 50])
      );
    });

    it('is dropped at the end when it leaves outward', () => {
      const low = box('B', 100, 100, 140, 140);
      expect(prepare(path([60, 50], [110, 50], [110, 100], [130, 100]), [low])).toEqual(
        path([60, 50], [60, 50], [110, 50], [110, 100], [110, 100])
      );
    });
  });

  describe('a route that leaves the node straight keeps its first and last legs', () => {
    it.each([
      { side: 'top', from: path([20, 0], [20, -50], [20, -90], [60, -90]) },
      { side: 'bottom', from: path([20, 40], [20, 90], [20, 130], [60, 130]) },
      { side: 'left', from: path([0, 20], [-50, 20], [-90, 20], [-90, 60]) },
      { side: 'right', from: path([40, 20], [90, 20], [130, 20], [130, 60]) },
    ])('out of the $side of the source', (c) => {
      const [first, ...rest] = c.from;
      expect(prepare(c.from, [SRC()])).toEqual([first, first, ...rest, rest.at(-1)]);
    });

    it.each([
      { side: 'top', from: path([160, -90], [120, -90], [120, -50], [120, 0]) },
      { side: 'bottom', from: path([160, 130], [120, 130], [120, 90], [120, 40]) },
      { side: 'left', from: path([60, 60], [60, 20], [90, 20], [100, 20]) },
      { side: 'right', from: path([200, 60], [200, 20], [170, 20], [140, 20]) },
    ])('into the $side of the destination', (c) => {
      const [first, ...rest] = c.from;
      expect(prepare(c.from, [DST()])).toEqual([first, first, ...rest, rest.at(-1)]);
    });
  });

  it('moves a straight route off the corners without duplicating its two points', () => {
    expect(prepare(path([40, 2], [70, 2]), [SRC()])).toEqual(path([40, near], [70, near]));
  });

  it('gives the repeated end points of its own, so moving one does not move the other', () => {
    const points = prepare(path([-5, 0], [10, 0], [15, 0]))!;
    expect(points[0]).toEqual(points[1]);
    expect(points[0]).not.toBe(points[1]);
    expect(points.at(-1)).not.toBe(points.at(-2));
  });
});
