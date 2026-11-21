// Ported from v12 `swimlanes/__tests__/direction.materializedGeometry.spec.ts` (c9b12739f), on the
// engine's `Edge`/`Node` (`internalData`'s `node`).
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '../layoutData.ts';
import { node } from './internalData.ts';
import {
  collapseRedundantRectangularDoglegs,
  liftObstacleHuggingSameSideRails,
  liftRailsOffForeignEdgeLabels,
  liftTopLaneTitleBandsAboveRails,
  reassignCrossingExternalRailChannels,
  separateSharedRenderedTerminalLanes,
  shiftLeftLaneTitleBandsLeftOfRails,
  shortcutRedundantOrthogonalJogs,
  swapDestinationTerminalTailsToReduceCrossings,
} from '../direction/materializedGeometry.ts';
import {
  orthogonalSegmentsForPoints,
  orthogonalSegmentsStrictlyCross,
} from '../direction/geometry.ts';
import type { Point } from '../../types.ts';
import { EDGE_ROUTING } from '../config.ts';

function strictCrossingCount(edges: Edge[]): number {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    const firstSegments = orthogonalSegmentsForPoints(edges[i]!.points!);
    for (let j = i + 1; j < edges.length; j++) {
      const secondSegments = orthogonalSegmentsForPoints(edges[j]!.points!);
      for (const firstSegment of firstSegments) {
        for (const secondSegment of secondSegments) {
          if (
            orthogonalSegmentsStrictlyCross(
              firstSegment.a,
              firstSegment.b,
              secondSegment.a,
              secondSegment.b
            )
          ) {
            count++;
          }
        }
      }
    }
  }
  return count;
}

describe('materialized render geometry cleanup', () => {
  it('separates shared visible terminal rails on the same node face', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: -40, y: -30, width: 10, height: 10 })],
      ['B', node({ id: 'B', x: 0, y: 0, width: 10, height: 80 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B_1',
        start: 'A',
        end: 'B',
        points: [
          { x: -30, y: 0 },
          { x: -5, y: 0 },
        ],
      },
      {
        id: 'A_B_2',
        start: 'A',
        end: 'B',
        points: [
          { x: -30, y: 0 },
          { x: -5, y: 0 },
        ],
      },
    ];

    separateSharedRenderedTerminalLanes(edges, nodeById);

    const terminalYs = edges.map((edge) => edge.points!.at(-1)!.y).sort((a, b) => a - b);
    expect(terminalYs[0]).not.toBe(terminalYs[1]);
    expect(terminalYs).toContain(0);
  });

  it('separates near-parallel terminal rails on the same node face', () => {
    const nodeById = new Map<string, Node>([
      ['A', node({ id: 'A', x: -40, y: -30, width: 10, height: 10 })],
      ['B', node({ id: 'B', x: 0, y: 0, width: 10, height: 60 })],
      ['C', node({ id: 'C', x: -40, y: 30, width: 10, height: 10 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: -90, y: -4 },
          { x: -5, y: -4 },
        ],
      },
      {
        id: 'B_C',
        start: 'B',
        end: 'C',
        points: [
          { x: -5, y: 4 },
          { x: -90, y: 4 },
        ],
      },
    ];

    separateSharedRenderedTerminalLanes(edges, nodeById);

    const terminalYs = [edges[0]!.points!.at(-1)!.y, edges[1]!.points![0]!.y].sort((a, b) => a - b);
    expect(terminalYs[1]! - terminalYs[0]!).toBeGreaterThanOrEqual(16);
  });

  it('collapses a provably redundant rectangular dogleg', () => {
    const edges: Edge[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
          { x: 0, y: 20 },
        ],
      },
    ];

    collapseRedundantRectangularDoglegs(edges, new Map());

    expect(edges[0]!.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 20 },
    ]);
  });

  it('lifts a same-side rail away from an intervening node border', () => {
    const nodeById = new Map<string, Node>([
      ['26', node({ id: '26', x: -166, y: 54, width: 232, height: 66 })],
      ['27', node({ id: '27', x: 830, y: 54, width: 232, height: 66 })],
      ['28', node({ id: '28', x: 166, y: 54, width: 232, height: 108 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'L_26_27_0',
        start: '26',
        end: '27',
        points: [
          { x: -166, y: 21 },
          { x: -166, y: 1 },
          { x: 830, y: 1 },
          { x: 830, y: 21 },
        ],
      },
    ];

    liftObstacleHuggingSameSideRails(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: -166, y: 21 },
      { x: -166, y: -20 },
      { x: 830, y: -20 },
      { x: 830, y: 21 },
    ]);
  });

  it('raises top lane title bands above a clear same-side rail', () => {
    const nodeById = new Map<string, Node>([
      ['26', node({ id: '26', x: -166, y: 54, width: 232, height: 66 })],
      ['27', node({ id: '27', x: 830, y: 54, width: 232, height: 66 })],
      ['28', node({ id: '28', x: 166, y: 54, width: 232, height: 108 })],
      [
        'General_Manager',
        node({
          id: 'General_Manager',
          isGroup: true,
          direction: 'TB', // v12 wrote TD; v13's Dir names it TB
          x: 166,
          y: 54,
          width: 996,
          height: 180,
          groupTitleRect: { left: -332, right: 664, top: -36, bottom: -15 },
        }),
      ],
    ]);
    const edges: Edge[] = [
      {
        id: 'L_26_27_0',
        start: '26',
        end: '27',
        points: [
          { x: -166, y: 21 },
          { x: -166, y: 1 },
          { x: 830, y: 1 },
          { x: 830, y: 21 },
        ],
      },
    ];

    liftObstacleHuggingSameSideRails(edges, nodeById);
    liftTopLaneTitleBandsAboveRails(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: -166, y: 21 },
      { x: -166, y: -20 },
      { x: 830, y: -20 },
      { x: 830, y: 21 },
    ]);
    expect(nodeById.get('General_Manager')).toMatchObject({
      y: 49.5,
      height: 189,
      groupTitleRect: { left: -332, right: 664, top: -45, bottom: -24 },
    });
  });

  it('shifts LR lane title bands left of a clear left-side rail', () => {
    const nodeById = new Map<string, Node>([
      [
        'BOD',
        {
          id: 'BOD',
          isGroup: true,
          direction: 'LR',
          x: 0,
          y: 100,
          width: 200,
          height: 200,
          groupTitleRect: { left: -100, right: -64, top: 0, bottom: 200 },
        },
      ],
      [
        'Finance_Head',
        {
          id: 'Finance_Head',
          isGroup: true,
          direction: 'LR',
          x: 0,
          y: 300,
          width: 200,
          height: 200,
          groupTitleRect: { left: -100, right: -64, top: 200, bottom: 400 },
        },
      ],
    ]);
    const edges: Edge[] = [
      {
        id: 'L_27_28_0',
        start: '27',
        end: '28',
        points: [
          { x: -80, y: 350 },
          { x: -80, y: 300 },
          { x: -90, y: 300 },
          { x: -90, y: 50 },
          { x: -80, y: 50 },
        ],
      },
    ];

    shiftLeftLaneTitleBandsLeftOfRails(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: -80, y: 350 },
      { x: -80, y: 300 },
      { x: -90, y: 300 },
      { x: -90, y: 50 },
      { x: -80, y: 50 },
    ]);
    expect(nodeById.get('BOD')).toMatchObject({
      x: -15,
      width: 230,
      groupTitleRect: { left: -130, right: -94, top: 0, bottom: 200 },
    });
    expect(nodeById.get('Finance_Head')).toMatchObject({
      x: -15,
      width: 230,
      groupTitleRect: { left: -130, right: -94, top: 200, bottom: 400 },
    });
  });

  it('swaps shared destination terminal tails when both swaps remove a crossing', () => {
    const cExitTopPort = { x: 297.553125, y: 1171.1287841796875 };
    const dExitRightPort = { x: 318.890625, y: 1196.6287841796875 };
    const nodeById = new Map<string, Node>([
      ['C', node({ id: 'C', x: 292.21875, y: 287.5, width: 150.05624389648438, height: 91 })],
      ['D', node({ id: 'D', x: 292.21875, y: 570.5, width: 94.11250305175781, height: 91 })],
      [
        'exit',
        node({ id: 'exit', x: 292.21875, y: 1196.6287841796875, width: 53.34375, height: 51 }),
      ],
    ]);
    const edges: Edge[] = [
      {
        id: 'L_C_exit_0',
        start: 'C',
        end: 'exit',
        points: [
          { x: 367.2468719482422, y: 287.5 },
          { x: 387.2468719482422, y: 287.5 },
          { x: 387.2468719482422, y: 1151.1287841796875 },
          { x: 297.553125, y: 1151.1287841796875 },
          cExitTopPort,
        ],
      },
      {
        id: 'L_D_exit_0',
        start: 'D',
        end: 'exit',
        points: [
          { x: 339.2750015258789, y: 570.5 },
          { x: 359.2750015258789, y: 570.5 },
          { x: 359.2750015258789, y: 1196.6287841796875 },
          dExitRightPort,
        ],
      },
    ];

    expect(strictCrossingCount(edges)).toBe(1);

    swapDestinationTerminalTailsToReduceCrossings(edges, nodeById);

    expect(strictCrossingCount(edges)).toBe(0);
    expect(edges[0]!.points!.at(-1)).toEqual(dExitRightPort);
    expect(edges[1]!.points!.at(-1)).toEqual(cExitTopPort);
  });

  // v13 (#634): 5-car-fun-sales-wide-tb's I→K ran along I→J's label, wider than I.
  it("moves a rail off the side of another edge's label, and leaves its own label alone", () => {
    const nodeById = new Map<string, Node>([
      ['N1', node({ id: 'N1', x: 30, y: -60, width: 60, height: 20 })],
      ['N2', node({ id: 'N2', x: 30, y: 100, width: 60, height: 20 })],
      ['label', node({ id: 'label', x: 50, y: 20, width: 100, height: 40, isEdgeLabel: true })],
    ]);
    const rail = (x: number) => [
      { x: 60, y: -60 },
      { x, y: -60 },
      { x, y: 100 },
      { x: 60, y: 100 },
    ];
    const foreign: Edge = { id: 'foreign', start: 'N1', end: 'N2', points: rail(101) };
    liftRailsOffForeignEdgeLabels([foreign], nodeById);
    expect(foreign.points).toEqual(rail(106));

    const own: Edge = {
      id: 'own',
      start: 'N1',
      end: 'N2',
      labelNodeId: 'label',
      points: rail(101),
    };
    liftRailsOffForeignEdgeLabels([own], nodeById);
    expect(own.points).toEqual(rail(101));
  });

  // v13 (#634): beside a short stub, the label's nearer side is behind the stub's start, which
  // would turn the stub back into its own source box (and the rail through both end boxes).
  it('never moves a rail so a terminal leg turns back into its own box', () => {
    const nodeById = new Map<string, Node>([
      ['N1', node({ id: 'N1', x: 30, y: -60, width: 60, height: 20 })],
      ['N2', node({ id: 'N2', x: 30, y: 100, width: 60, height: 20 })],
      ['label', node({ id: 'label', x: 113, y: 20, width: 100, height: 40, isEdgeLabel: true })],
    ]);
    const stub = (x: number, face = 60) => [
      { x: face, y: -60 },
      { x, y: -60 },
      { x, y: 100 },
      { x: face, y: 100 },
    ];
    const edge: Edge = { id: 'stub', start: 'N1', end: 'N2', points: stub(64) };
    liftRailsOffForeignEdgeLabels([edge], nodeById);
    expect(edge.points).toEqual(stub(169));
  });

  // v13 (#634): every rail along a foreign label moves, however many there are (it stopped at 8).
  it('moves every rail off a foreign label, not only the first few', () => {
    const count = 12;
    const nodeById = new Map<string, Node>();
    const edges: Edge[] = [];
    for (let k = 0; k < count; k++) {
      const dy = 1000 * k;
      nodeById.set(`A${k}`, node({ id: `A${k}`, x: 30, y: dy - 60, width: 60, height: 20 }));
      nodeById.set(`B${k}`, node({ id: `B${k}`, x: 30, y: dy + 100, width: 60, height: 20 }));
      nodeById.set(
        `L${k}`,
        node({ id: `L${k}`, x: 50, y: dy + 20, width: 100, height: 40, isEdgeLabel: true })
      );
      edges.push({
        id: `e${k}`,
        start: `A${k}`,
        end: `B${k}`,
        points: [
          { x: 60, y: dy - 60 },
          { x: 101, y: dy - 60 },
          { x: 101, y: dy + 100 },
          { x: 60, y: dy + 100 },
        ],
      });
    }
    liftRailsOffForeignEdgeLabels(edges, nodeById);
    expect(edges.map((e) => e.points![1]!.x)).toEqual(Array.from({ length: count }, () => 106));
  });

  it('reassigns overlapping external rail channels as a crossing-minimizing bundle', () => {
    const nodeById = new Map<string, Node>([
      ['26', node({ id: '26', x: -22, y: 664, width: 116, height: 64 })],
      ['27', node({ id: '27', x: -22, y: 1602, width: 116, height: 116 })],
      ['28', node({ id: '28', x: -22, y: 1050, width: 116, height: 80 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'L_26_27_0',
        start: '26',
        end: '27',
        points: [
          { x: -80, y: 664 },
          { x: -100, y: 664 },
          { x: -100, y: 1660 },
          { x: -80, y: 1660 },
        ],
      },
      {
        id: 'L_27_28_0',
        start: '27',
        end: '28',
        points: [
          { x: 36, y: 1544 },
          { x: 65, y: 1544 },
          { x: 65, y: 1467 },
          { x: -126.4, y: 1467 },
          { x: -126.4, y: 1132 },
          { x: 36, y: 1132 },
          { x: 36, y: 1050 },
        ],
      },
    ];

    expect(strictCrossingCount(edges)).toBe(2);

    reassignCrossingExternalRailChannels(edges, nodeById);

    expect(strictCrossingCount(edges)).toBe(0);
    expect(edges[0]!.points![1]!.x).toBe(-126.4);
    expect(edges[1]!.points![3]!.x).toBe(-100);
  });

  it('shortcuts a dominated orthogonal jog when clearance is preserved', () => {
    const nodeById = new Map<string, Node>([
      ['23', node({ id: '23', x: 36, y: 1328, width: 232, height: 108 })],
      ['27', node({ id: '27', x: 36, y: 1660, width: 232, height: 66 })],
      ['28', node({ id: '28', x: 36, y: 996, width: 232, height: 108 })],
    ]);
    const edges: Edge[] = [
      {
        id: 'L_27_28_0',
        start: '27',
        end: '28',
        points: [
          { x: 36, y: 1544 },
          { x: 65, y: 1544 },
          { x: 65, y: 1467 },
          { x: -100, y: 1467 },
          { x: -100, y: 1132 },
          { x: 36, y: 1132 },
          { x: 36, y: 1050 },
        ],
      },
    ];

    shortcutRedundantOrthogonalJogs(edges, nodeById);

    expect(edges[0]!.points).toEqual([
      { x: 36, y: 1544 },
      { x: 36, y: 1467 },
      { x: -100, y: 1467 },
      { x: -100, y: 1132 },
      { x: 36, y: 1132 },
      { x: 36, y: 1050 },
    ]);
  });

  it('shortcuts a redundant jog even when endpoint nodes are unavailable', () => {
    const edges: Edge[] = [
      {
        id: 'missing_endpoint_edge',
        start: 'missing-start',
        end: 'missing-end',
        points: [
          { x: 36, y: 1544 },
          { x: 65, y: 1544 },
          { x: 65, y: 1467 },
          { x: -100, y: 1467 },
          { x: -100, y: 1132 },
          { x: 36, y: 1132 },
          { x: 36, y: 1050 },
        ],
      },
    ];

    shortcutRedundantOrthogonalJogs(edges, new Map());

    expect(edges[0]!.points).toEqual([
      { x: 36, y: 1544 },
      { x: 65, y: 1544 },
      { x: 65, y: 1132 },
      { x: 36, y: 1132 },
      { x: 36, y: 1050 },
    ]);
  });
});

// The cases below are v13's (#709): each pass gets a few small hand-built inputs, one per rule it
// applies, so the file can be split without a layout snapshot standing in for them.

const path = (...xy: [number, number][]): Point[] => xy.map(([x, y]) => ({ x, y }));
/** A node given by its four sides. */
const box = (
  id: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
  more = {}
): Node =>
  node({
    id,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
    ...more,
  });
/** Run one pass on edge `e` (from `S` to `T`) among `others`, and return the first edge's points. */
function pass(
  fn: (edges: Edge[], nodes: Map<string, Node>) => void,
  points: Point[],
  extra: {
    nodes?: Node[];
    others?: Edge[];
    start?: string;
    end?: string;
    layoutOnly?: boolean;
  } = {}
): Point[] | undefined {
  const edge: Edge = {
    id: 'e',
    start: extra.start ?? 'S',
    end: extra.end ?? 'T',
    points,
    ...(extra.layoutOnly ? { isLayoutOnly: true } : {}),
  };
  fn([edge, ...(extra.others ?? [])], new Map((extra.nodes ?? []).map((n) => [n.id, n])));
  return edge.points;
}
const bare = (points: Point[], id = 'other', more: Partial<Edge> = {}): Edge => ({
  id,
  start: 'X',
  end: 'Y',
  points,
  ...more,
});

describe('collapseRedundantRectangularDoglegs', () => {
  const collapse = (points: Point[], extra?: Parameters<typeof pass>[2]) =>
    pass(collapseRedundantRectangularDoglegs, points, extra);

  it.each([
    {
      name: 'out and back sideways at the end of a vertical run',
      from: path([0, 0], [10, 0], [10, 10], [0, 10], [0, 20]),
      to: path([0, 0], [0, 20]),
    },
    {
      name: 'the same, going left',
      from: path([0, 0], [-10, 0], [-10, 10], [0, 10], [0, 20]),
      to: path([0, 0], [0, 20]),
    },
    {
      name: 'out and back up or down at the end of a horizontal run',
      from: path([0, 0], [0, 10], [10, 10], [10, 0], [20, 0]),
      to: path([0, 0], [20, 0]),
    },
    {
      name: 'the same, going up',
      from: path([0, 0], [0, -10], [10, -10], [10, 0], [20, 0]),
      to: path([0, 0], [20, 0]),
    },
    {
      name: 'a sideways step in the middle of a vertical run',
      from: path([0, 0], [0, 10], [10, 10], [10, 20], [0, 20], [0, 30]),
      to: path([0, 0], [0, 30]),
    },
    {
      name: 'a step up or down in the middle of a horizontal run',
      from: path([0, 0], [10, 0], [10, 10], [20, 10], [20, 0], [30, 0]),
      to: path([0, 0], [30, 0]),
    },
  ])('removes $name', (c) => {
    expect(collapse(c.from)).toEqual(c.to);
  });

  it.each([
    {
      name: 'out and back to the left, away from the origin',
      from: path([100, 100], [90, 100], [90, 110], [100, 110], [100, 120]),
      to: path([100, 100], [100, 120]),
    },
    {
      name: 'out and back up, away from the origin',
      from: path([100, 100], [100, 90], [110, 90], [110, 100], [120, 100]),
      to: path([100, 100], [120, 100]),
    },
    {
      name: 'a step to the left in a vertical run, away from the origin',
      from: path([100, 100], [100, 110], [90, 110], [90, 120], [100, 120], [100, 130]),
      to: path([100, 100], [100, 130]),
    },
    {
      name: 'a step up in a horizontal run, away from the origin',
      from: path([100, 100], [110, 100], [110, 90], [120, 90], [120, 100], [130, 100]),
      to: path([100, 100], [130, 100]),
    },
  ])('removes $name', (c) => {
    expect(collapse(c.from)).toEqual(c.to);
  });

  it('keeps the points before and after the dogleg', () => {
    const from = path([-30, 0], [0, 0], [10, 0], [10, 10], [0, 10], [0, 20], [30, 20]);
    expect(collapse(from)).toEqual(path([-30, 0], [0, 0], [0, 20], [30, 20]));
  });

  it('removes every dogleg of a route', () => {
    const from = path(
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 20],
      [10, 20],
      [10, 30],
      [0, 30],
      [0, 40]
    );
    expect(collapse(from)).toEqual(path([0, 0], [0, 40]));
  });

  it.each([
    {
      name: 'a staircase that keeps going',
      from: path([0, 0], [10, 0], [10, 10], [20, 10], [20, 20]),
    },
    {
      name: 'a step that does not return to its line',
      from: path([0, 0], [10, 0], [10, 10], [-5, 10], [-5, 20]),
    },
    { name: 'fewer than five points', from: path([0, 0], [10, 0], [10, 10], [0, 10]) },
  ])('leaves $name', (c) => {
    expect(collapse(c.from)).toEqual(c.from);
  });

  it.each([
    {
      name: 'a first leg that is slanted',
      from: path([0, 0], [10, 5], [10, 10], [0, 10], [0, 20]),
    },
    { name: 'a third leg that is slanted', from: path([0, 0], [10, 0], [10, 8], [0, 10], [0, 20]) },
    {
      name: 'a first leg that is slanted, in a horizontal run',
      from: path([0, 0], [5, 10], [10, 10], [10, 0], [20, 0]),
    },
    {
      name: 'a third leg that is slanted, in a horizontal run',
      from: path([0, 0], [0, 10], [8, 10], [10, 0], [20, 0]),
    },
    {
      name: 'a step in the middle of a vertical run whose first leg is slanted',
      from: path([0, 0], [5, 10], [10, 10], [10, 20], [0, 20], [0, 30]),
    },
    {
      name: 'a step in the middle of a vertical run whose second leg is slanted',
      from: path([0, 0], [0, 10], [10, 12], [10, 20], [0, 20], [0, 30]),
    },
    {
      name: 'a step in the middle of a vertical run whose fourth leg is slanted',
      from: path([0, 0], [0, 10], [10, 10], [10, 20], [0, 22], [0, 30]),
    },
    {
      name: 'a step in the middle of a horizontal run whose first leg is slanted',
      from: path([0, 0], [10, 5], [10, 10], [20, 10], [20, 0], [30, 0]),
    },
    {
      name: 'a step in the middle of a horizontal run whose third leg is slanted',
      from: path([0, 0], [10, 0], [10, 10], [20, 12], [20, 0], [30, 0]),
    },
    {
      name: 'a step in the middle of a horizontal run whose fifth leg is slanted',
      from: path([0, 0], [10, 0], [10, 10], [20, 10], [22, 0], [30, 0]),
    },
    {
      name: 'six points that climb like a staircase',
      from: path([0, 0], [10, 0], [10, 10], [20, 10], [20, 20], [30, 20]),
    },
    {
      name: 'six points that climb, vertical first',
      from: path([0, 0], [0, 10], [10, 10], [10, 20], [20, 20], [20, 30]),
    },
  ])('leaves a route with $name', (c) => {
    expect(collapse(c.from)).toEqual(c.from);
  });

  it('refuses a collapse that would leave a slanted leg', () => {
    const from = path([0, 0], [10, 0], [10, 10], [0, 10], [0, 20], [30, 35]);
    expect(collapse(from)).toEqual(from);
  });

  it('collapses a dogleg of a later edge, not only of the first', () => {
    const later = bare(path([0, 0], [10, 0], [10, 10], [0, 10], [0, 20]), 'later');
    const first = pass(collapseRedundantRectangularDoglegs, path([0, 0], [30, 0]), {
      others: [later],
    });
    expect(first).toEqual(path([0, 0], [30, 0]));
    expect(later.points).toEqual(path([0, 0], [0, 20]));
  });

  describe('only where the straight line is clear', () => {
    const dogleg = () => path([0, 0], [10, 0], [10, 10], [0, 10], [0, 20]);
    const straight = path([0, 0], [0, 20]);

    it('refuses a line through a node that is not an end of the edge', () => {
      expect(collapse(dogleg(), { nodes: [box('N', -10, 7, 10, 13)] })).toEqual(dogleg());
    });

    it('allows a line through a node that is an end of the edge', () => {
      expect(collapse(dogleg(), { nodes: [box('N', -10, 7, 10, 13)], end: 'N' })).toEqual(straight);
      expect(collapse(dogleg(), { nodes: [box('N', -10, 7, 10, 13)], start: 'N' })).toEqual(
        straight
      );
    });

    it('refuses a line through a label, even one that belongs to an end', () => {
      const label = box('N', -10, 7, 10, 13, { isEdgeLabel: true });
      expect(collapse(dogleg(), { nodes: [label], end: 'N' })).toEqual(dogleg());
    });

    it('keeps 2 units clear of a node: exactly 2 is enough, less is not', () => {
      expect(collapse(dogleg(), { nodes: [box('N', -10, 8, -2, 12)] })).toEqual(straight);
      expect(collapse(dogleg(), { nodes: [box('N', -10, 8, -1, 12)] })).toEqual(dogleg());
    });

    it('refuses a line that another edge crosses', () => {
      expect(collapse(dogleg(), { others: [bare(path([-5, 10], [5, 10]))] })).toEqual(dogleg());
    });

    it('allows a line another edge only ends on', () => {
      expect(collapse(dogleg(), { others: [bare(path([0, 10], [5, 10]))] })).toEqual(straight);
    });

    it('refuses a line that shares a stretch of track with another edge, however short a bend', () => {
      expect(collapse(dogleg(), { others: [bare(path([0, 5], [0, 15]))] })).toEqual(dogleg());
      expect(collapse(dogleg(), { others: [bare(path([0, 13], [0, 30]))] })).toEqual(straight);
    });

    it('keeps 2 units clear of a label too: exactly 2 is enough, less is not', () => {
      const label = (right: number) => box('L', -10, 8, right, 12, { isEdgeLabel: true });
      expect(collapse(dogleg(), { nodes: [label(-2)] })).toEqual(straight);
      expect(collapse(dogleg(), { nodes: [label(-1)] })).toEqual(dogleg());
    });

    it('refuses a line that shares exactly 8 units of track with another edge', () => {
      expect(collapse(dogleg(), { others: [bare(path([0, 12], [0, 30]))] })).toEqual(dogleg());
    });

    it('ignores an edge that has no points at all', () => {
      const noPoints: Edge = { id: 'none', start: 'X', end: 'Y' };
      expect(collapse(dogleg(), { others: [noPoints] })).toEqual(straight);
    });

    it('ignores an edge that only steers the layout, or has under two points', () => {
      const steer = bare(path([-5, 10], [5, 10]), 'steer', { isLayoutOnly: true });
      const dot = bare(path([0, 10]), 'dot');
      expect(collapse(dogleg(), { others: [steer, dot] })).toEqual(straight);
    });

    it('does not touch an edge that only steers the layout', () => {
      expect(collapse(dogleg(), { layoutOnly: true })).toEqual(dogleg());
    });
  });
});

describe('liftObstacleHuggingSameSideRails', () => {
  const lift = (points: Point[], extra?: Parameters<typeof pass>[2]) =>
    pass(liftObstacleHuggingSameSideRails, points, extra);
  /** A horizontal rail at `y` between two vertical legs, over a node 40 wide. */
  const underRail = (y: number) => path([0, 50], [0, y], [100, y], [100, 50]);
  const sideRail = (x: number) => path([50, 0], [x, 0], [x, 100], [50, 100]);

  it('lifts a horizontal rail above the node it runs through, to 20 units clear of it', () => {
    expect(lift(underRail(45), { nodes: [box('N', 30, 40, 70, 60)] })).toEqual(underRail(20));
  });

  it('lifts a vertical rail to the left of the node it runs through', () => {
    expect(lift(sideRail(45), { nodes: [box('N', 40, 30, 60, 70)] })).toEqual(sideRail(20));
  });

  it('clears the nearest edge of several nodes it runs along', () => {
    const nodes = [box('N1', 30, 40, 50, 60), box('N2', 60, 30, 80, 70)];
    expect(lift(underRail(45), { nodes })).toEqual(underRail(10));
  });

  it('goes below the node when the way above is not clear', () => {
    const above = bare(path([10, 20], [90, 20]));
    expect(lift(underRail(45), { nodes: [box('N', 30, 40, 70, 60)], others: [above] })).toEqual(
      underRail(80)
    );
  });

  it('goes below the node when the way above would add a crossing', () => {
    const across = bare(path([50, 10], [50, 30]));
    expect(lift(underRail(45), { nodes: [box('N', 30, 40, 70, 60)], others: [across] })).toEqual(
      underRail(80)
    );
  });

  it('goes below the node when the way above runs through a label', () => {
    const label = box('L', 40, 10, 60, 30, { isEdgeLabel: true });
    expect(lift(underRail(45), { nodes: [box('N', 30, 40, 70, 60), label] })).toEqual(
      underRail(80)
    );
  });

  it('goes right of the widest blocker when the way left is not clear', () => {
    const nodes = [box('N1', 40, 30, 60, 50), box('N2', 30, 60, 80, 80)];
    const left = bare(path([10, 10], [10, 90]));
    expect(lift(sideRail(55), { nodes, others: [left] })).toEqual(sideRail(100));
  });

  it('goes below the lowest blocker when the way above is not clear', () => {
    const nodes = [box('N1', 30, 40, 50, 60), box('N2', 60, 30, 80, 70)];
    const above = bare(path([10, 10], [90, 10]));
    expect(lift(underRail(45), { nodes, others: [above] })).toEqual(underRail(90));
  });

  it('goes below the node when the way above runs into another node', () => {
    const nodes = [box('N', 30, 40, 70, 60), box('M', 40, 10, 60, 30)];
    expect(lift(underRail(45), { nodes })).toEqual(underRail(80));
  });

  it('lifts a rail again when its new place runs along another node', () => {
    // The node above ends exactly 2 units over the new rail: that is close enough to count, so the
    // rail goes on up past it.
    const nodes = [box('N', 30, 40, 70, 60), box('M', 40, 0, 60, 18)];
    expect(lift(underRail(45), { nodes })).toEqual(underRail(-20));
  });

  it.each([
    { name: 'a node 1 unit from the way above', top: 19, expected: 80 },
    { name: 'a node 3 units from the way above', top: 17, expected: 20 },
  ])('keeps the way clear of $name', (c) => {
    const nodes = [box('N', 30, 40, 70, 60), box('M', 40, 0, 60, c.top)];
    expect(lift(underRail(45), { nodes })).toEqual(underRail(c.expected));
  });

  it('keeps 2 units clear of a label on the way above', () => {
    const label = (bottom: number) => box('L', 40, 0, 60, bottom, { isEdgeLabel: true });
    expect(lift(underRail(45), { nodes: [box('N', 30, 40, 70, 60), label(18)] })).toEqual(
      underRail(20)
    );
    expect(lift(underRail(45), { nodes: [box('N', 30, 40, 70, 60), label(19)] })).toEqual(
      underRail(80)
    );
  });

  it('refuses the way above when another edge shares exactly 8 units of its track', () => {
    const nodes = [box('N', 30, 40, 70, 60)];
    expect(lift(underRail(45), { nodes, others: [bare(path([92, 20], [140, 20]))] })).toEqual(
      underRail(80)
    );
    expect(lift(underRail(45), { nodes, others: [bare(path([93, 20], [140, 20]))] })).toEqual(
      underRail(20)
    );
  });

  it('lifts a later edge although an earlier one cannot be lifted', () => {
    // The first rail runs through a node, but both ways round it are blocked by other edges.
    const stuck = path([0, 50], [0, 45], [100, 45], [100, 50]);
    const walls = [
      bare(path([10, 20], [90, 20]), 'above'),
      bare(path([10, 80], [90, 80]), 'below'),
    ];
    const second = bare(path([300, 50], [300, 45], [400, 45], [400, 50]), 'second', {
      start: 'S2',
      end: 'T2',
    });
    const nodes = [box('N', 30, 40, 70, 60), box('M', 330, 40, 370, 60)];
    expect(lift(stuck, { nodes, others: [...walls, second] })).toEqual(stuck);
    expect(second.points).toEqual(path([300, 50], [300, 20], [400, 20], [400, 50]));
  });

  it('lifts every edge that needs it, not only the first', () => {
    const second = bare(path([200, 50], [200, 45], [300, 45], [300, 50]), 'second', {
      start: 'S2',
      end: 'T2',
    });
    const nodes = [box('N', 30, 40, 70, 60), box('M', 230, 40, 270, 60)];
    expect(lift(underRail(45), { nodes, others: [second] })).toEqual(underRail(20));
    expect(second.points).toEqual(path([200, 50], [200, 20], [300, 20], [300, 50]));
  });

  describe('how close a rail must be to count as beside a node', () => {
    const blocker = () => [box('N', 30, 40, 70, 60)];
    it.each([
      { y: 38, lifted: true },
      { y: 37, lifted: false },
      { y: 62, lifted: true },
      { y: 63, lifted: false },
    ])('a horizontal rail at $y is lifted: $lifted', (c) => {
      const rail = underRail(c.y);
      expect(lift(rail, { nodes: blocker() })).toEqual(c.lifted ? underRail(20) : rail);
    });

    it.each([
      { x: 38, lifted: true },
      { x: 37, lifted: false },
      { x: 62, lifted: true },
      { x: 63, lifted: false },
    ])('a vertical rail at $x is lifted: $lifted', (c) => {
      const rail = sideRail(c.x);
      expect(lift(rail, { nodes: [box('N', 40, 30, 60, 70)] })).toEqual(
        c.lifted ? sideRail(20) : rail
      );
    });

    it.each([
      { width: 8, lifted: true },
      { width: 7, lifted: false },
    ])('a node $width units wide along a horizontal rail: lifted $lifted', (c) => {
      const rail = underRail(45);
      const narrow = [box('N', 46, 40, 46 + c.width, 60)];
      expect(lift(rail, { nodes: narrow })).toEqual(c.lifted ? underRail(20) : rail);
    });

    it.each([
      { height: 8, lifted: true },
      { height: 7, lifted: false },
    ])('a node $height units tall along a vertical rail: lifted $lifted', (c) => {
      const rail = sideRail(45);
      const short = [box('N', 40, 46, 60, 46 + c.height)];
      expect(lift(rail, { nodes: short })).toEqual(c.lifted ? sideRail(20) : rail);
    });
  });

  it.each([
    {
      name: 'the first leg is parallel to the rail',
      from: path([0, 45], [50, 45], [100, 45], [100, 50]),
    },
    {
      name: 'the last leg is parallel to the rail',
      from: path([0, 50], [0, 45], [50, 45], [100, 45]),
    },
  ])('leaves a route where $name', (c) => {
    expect(lift(c.from, { nodes: [box('N', 30, 40, 70, 60)] })).toEqual(c.from);
  });

  it('leaves a rail that cannot move without leaving a slanted leg', () => {
    const slanted = path([0, 50], [0, 45], [100, 45], [100, 50], [110, 60]);
    expect(lift(slanted, { nodes: [box('N', 30, 40, 70, 60)] })).toEqual(slanted);
  });

  it.each([
    { name: 'a node that is an end of the edge', nodes: [box('S', 30, 40, 70, 60)] },
    { name: 'a node it overlaps by less than 8 units', nodes: [box('N', 95, 40, 105, 60)] },
    { name: 'a node more than 2 units off the rail', nodes: [box('N', 30, 60, 70, 80)] },
  ])('leaves a rail beside $name', (c) => {
    expect(lift(underRail(45), { nodes: c.nodes })).toEqual(underRail(45));
  });

  it.each([
    {
      name: 'a route of more than three legs',
      from: path([0, 50], [0, 45], [100, 45], [100, 50], [120, 50]),
    },
    { name: 'a route of two legs', from: path([0, 45], [100, 45], [100, 50]) },
  ])('leaves $name', (c) => {
    expect(lift(c.from, { nodes: [box('N', 30, 40, 70, 60)] })).toEqual(c.from);
  });

  it('leaves an edge that only steers the layout', () => {
    expect(lift(underRail(45), { nodes: [box('N', 30, 40, 70, 60)], layoutOnly: true })).toEqual(
      underRail(45)
    );
  });
});

describe('separateSharedRenderedTerminalLanes', () => {
  /** Three nodes: a wide, flat `B` that the lanes meet, and `A` and `C` that the edges come from. */
  const WIDE = box('B', -40, -5, 40, 5);
  const TALL = box('B', -5, -40, 5, 40);
  const edgeTo = (id: string, from: string, points: Point[], to = 'B'): Edge => ({
    id,
    start: from,
    end: to,
    points,
  });
  const separate = (edges: Edge[], nodes: Node[]) => {
    separateSharedRenderedTerminalLanes(edges, new Map(nodes.map((n) => [n.id, n])));
    return edges.map((e) => e.points);
  };
  const above = (x: number) => path([x, -60], [x, -5]);
  const left = (y: number, from = -35) => path([from, y], [-5, y]);

  it('moves one of two end rails that share a top face and a coordinate, by 7', () => {
    const edges = [edgeTo('e1', 'A', above(0)), edgeTo('e2', 'C', above(0))];
    expect(separate(edges, [WIDE])).toEqual([path([-7, -60], [-7, -5]), above(0)]);
  });

  it('does the same on a face down the side of a node', () => {
    const edges = [edgeTo('e1', 'A', left(0)), edgeTo('e2', 'C', left(0))];
    expect(separate(edges, [TALL])).toEqual([path([-35, -7], [-5, -7]), left(0)]);
  });

  it('moves the other way when 7 one way would leave the face', () => {
    const edges = [edgeTo('e1', 'A', above(-36)), edgeTo('e2', 'C', above(-36))];
    expect(separate(edges, [WIDE])).toEqual([path([-29, -60], [-29, -5]), above(-36)]);
  });

  it('goes to 14 when both places at 7 are taken', () => {
    const edges = [
      edgeTo('e1', 'A', above(0)),
      edgeTo('e2', 'C', above(0)),
      edgeTo('e3', 'D', above(-7)),
      edgeTo('e4', 'E', above(7)),
    ];
    expect(separate(edges, [WIDE])[0]).toEqual(path([-14, -60], [-14, -5]));
  });

  it('goes on separating until no two rails share a coordinate', () => {
    const edges = [
      edgeTo('e1', 'A', above(0)),
      edgeTo('e2', 'C', above(0)),
      edgeTo('e3', 'D', above(0)),
    ];
    expect(separate(edges, [WIDE])).toEqual([
      path([-7, -60], [-7, -5]),
      path([7, -60], [7, -5]),
      above(0),
    ]);
  });

  it.each([
    { name: 'overlap by less than 8', second: path([0, -12], [0, -5]) },
    { name: 'sit 0.5 apart or more', second: path([0.5, -60], [0.5, -5]) },
  ])('leaves two rails that $name', (c) => {
    const edges = [edgeTo('e1', 'A', above(0)), edgeTo('e2', 'C', c.second)];
    expect(separate(edges, [WIDE])).toEqual([above(0), c.second]);
  });

  it('leaves two rails on different nodes', () => {
    const edges = [edgeTo('e1', 'A', above(0)), edgeTo('e2', 'C', above(0), 'D')];
    expect(separate(edges, [WIDE, box('D', -40, -5, 40, 5)])).toEqual([above(0), above(0)]);
  });

  describe('rails whose ends are inside the node', () => {
    it.each([
      {
        name: 'left half',
        node: TALL,
        from: path([-60, 0], [-3, 0]),
        to: path([-60, -7], [-5, -7]),
      },
      { name: 'right half', node: TALL, from: path([60, 0], [3, 0]), to: path([60, -7], [5, -7]) },
      {
        name: 'upper half',
        node: WIDE,
        from: path([0, -60], [0, -3]),
        to: path([-7, -60], [-7, -5]),
      },
      { name: 'lower half', node: WIDE, from: path([0, 60], [0, 3]), to: path([-7, 60], [-7, 5]) },
    ])('moves a rail that ends in the $name onto the face it runs to', (c) => {
      const edges = [edgeTo('e1', 'A', c.from), edgeTo('e2', 'C', c.from)];
      expect(separate(edges, [c.node])[0]).toEqual(c.to);
    });
  });

  it('moves a rail that overlaps another by exactly 8 units, but not by 7', () => {
    const long = path([-90, 0], [-5, 0]);
    const eight = path([-13, 0], [-5, 0]);
    const seven = path([-12, 0], [-5, 0]);
    expect(separate([edgeTo('e1', 'A', long), edgeTo('e2', 'C', eight)], [TALL])[0]).toEqual(
      path([-90, -7], [-5, -7])
    );
    expect(separate([edgeTo('e1', 'A', long), edgeTo('e2', 'C', seven)], [TALL])).toEqual([
      long,
      seven,
    ]);
  });

  describe('rails of opposite ends that run side by side on one face', () => {
    /** `B` is 10 wide and 60 tall: a face span of 60. */
    const nodes = () => [
      box('B', -5, -30, 5, 30),
      box('A', -45, -35, -35, -25),
      box('C', -45, 25, -35, 35),
    ];
    const meet = (length: number, gap = 8) => [
      edgeTo('in', 'A', path([-5 - length, -gap / 2], [-5, -gap / 2])),
      edgeTo('out', 'B', path([-5, gap / 2], [-5 - length, gap / 2]), 'C'),
    ];
    const unchanged = (edges: Edge[]) => edges.map((e) => e.points!.map((p) => ({ ...p })));

    it('moves the end rail clear of the start rail by 16', () => {
      const edges = meet(85);
      const before = unchanged(edges);
      expect(separate(edges, nodes())).toEqual([path([-90, -18], [-5, -18]), before[1]]);
    });

    it.each([
      { name: 'shorter than the face', length: 55, moved: false },
      { name: 'as long as the face', length: 60, moved: true },
      { name: 'twice as long as the face', length: 120, moved: true },
      { name: 'longer than twice the face', length: 125, moved: false },
    ])('with the shared run $name: moved $moved', (c) => {
      const edges = meet(c.length);
      const before = unchanged(edges);
      const after = separate(edges, nodes());
      expect(after[0]).toEqual(c.moved ? path([-5 - c.length, -18], [-5, -18]) : before[0]);
    });

    it.each([
      { name: '15 apart', gap: 15, moved: true },
      { name: '16 apart', gap: 16, moved: false },
    ])('with the rails $name: moved $moved', (c) => {
      const edges = meet(85, c.gap);
      const before = unchanged(edges);
      expect(separate(edges, nodes())[0]).not.toEqual(c.moved ? before[0] : []);
      if (!c.moved) {
        expect(separate(edges, nodes())[0]).toEqual(before[0]);
      }
    });

    it('does the same down the right face', () => {
      const edges = [
        edgeTo('in', 'A', path([90, -4], [5, -4])),
        edgeTo('out', 'B', path([5, 4], [90, 4]), 'C'),
      ];
      expect(separate(edges, nodes())).toEqual([path([90, -18], [5, -18]), path([5, 4], [90, 4])]);
    });

    it.each([
      { name: 'two end rails', second: edgeTo('b', 'C', path([-90, 4], [-5, 4])) },
      { name: 'two start rails', second: edgeTo('b', 'B', path([-5, 4], [-90, 4]), 'C') },
    ])('leaves $name 8 apart', (c) => {
      const first =
        c.second.id === 'b' && c.name === 'two start rails'
          ? edgeTo('a', 'B', path([-5, -4], [-90, -4]), 'A')
          : edgeTo('a', 'A', path([-90, -4], [-5, -4]));
      const before = unchanged([first, c.second]);
      expect(separate([first, c.second], nodes())).toEqual(before);
    });

    it('leaves rails on different faces', () => {
      const edges = [
        edgeTo('in', 'A', path([-90, -4], [-5, -4])),
        edgeTo('out', 'B', path([5, 4], [90, 4]), 'C'),
      ];
      const before = unchanged(edges);
      expect(separate(edges, nodes())).toEqual(before);
    });
  });

  it('ignores an edge that only steers the layout', () => {
    const steer = { ...edgeTo('e2', 'C', above(0)), isLayoutOnly: true };
    expect(separate([edgeTo('e1', 'A', above(0)), steer], [WIDE])).toEqual([above(0), above(0)]);
  });

  it('leaves a straight connector in place and moves the other edge', () => {
    const nodes = [
      box('B', -5, -40, 5, 40),
      box('A', -45, -5, -35, 5),
      box('C', -45, -35, -35, -25),
    ];
    const straight = edgeTo('straight', 'A', left(0));
    const bent = edgeTo('bent', 'C', left(0));
    expect(separate([straight, bent], nodes)).toEqual([left(0), path([-35, -7], [-5, -7])]);
    const [bent2, straight2] = [edgeTo('bent', 'C', left(0)), edgeTo('straight', 'A', left(0))];
    expect(separate([bent2, straight2], nodes)).toEqual([path([-35, -7], [-5, -7]), left(0)]);
  });

  it('moves the end rail rather than the start rail of a pair', () => {
    const startRail = edgeTo('out', 'B', path([-5, 0], [-35, 0]), 'A');
    const endRail = edgeTo('in', 'C', left(0));
    expect(separate([startRail, endRail], [TALL])).toEqual([
      path([-5, 0], [-35, 0]),
      path([-35, -7], [-5, -7]),
    ]);
  });

  it('moves a start rail when the end rail is a straight connector', () => {
    const nodes = [
      box('B', -5, -40, 5, 40),
      box('A', -45, -35, -35, -25),
      box('C', -45, -5, -35, 5),
    ];
    const startRail = edgeTo('out', 'B', path([-5, 0], [-35, 0]), 'A');
    const connector = edgeTo('in', 'C', left(0));
    expect(separate([startRail, connector], nodes)).toEqual([path([-5, -7], [-35, -7]), left(0)]);
  });
});

describe('lane title bands', () => {
  /** A top-level lane. Its box is 200 across and 200 down from `top`; the band is 20 tall, 200 wide. */
  const lane = (more: Record<string, unknown> = {}): Node =>
    node({
      id: 'lane',
      isGroup: true,
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      groupTitleRect: { left: 0, right: 200, top: 0, bottom: 20 },
      ...more,
    });
  const rail = (...xy: [number, number][]): Edge => ({
    id: 'rail',
    start: 'A',
    end: 'B',
    points: path(...xy),
  });
  const run = (
    fn: typeof liftTopLaneTitleBandsAboveRails,
    nodes: Node[],
    edges: Edge[],
    direction?: string
  ) => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    fn(edges, byId, direction);
    return byId;
  };

  describe('liftTopLaneTitleBandsAboveRails', () => {
    const lift = (nodes: Node[], edges: Edge[], direction?: string) =>
      run(liftTopLaneTitleBandsAboveRails, nodes, edges, direction);
    const lifted = (delta: number) => ({
      y: 100 - delta / 2,
      height: 200 + delta,
      groupTitleRect: { left: 0, right: 200, top: 0 - delta, bottom: 20 - delta },
    });
    const unmoved = lifted(0);

    it('grows the lane upward by the distance from the rail to the band bottom, plus 4', () => {
      const result = lift([lane()], [rail([20, 10], [180, 10])]);
      expect(result.get('lane')).toMatchObject(lifted(14));
    });

    it('uses the rail furthest up the band, whichever edge it belongs to', () => {
      const edges = [rail([20, 15], [180, 15]), { ...rail([20, 5], [180, 5]), id: 'other' }];
      expect(lift([lane()], edges).get('lane')).toMatchObject(lifted(19));
    });

    it('moves every top lane by the same distance, also those no rail crosses', () => {
      const other = lane({
        id: 'other',
        x: 400,
        groupTitleRect: { left: 300, right: 500, top: 0, bottom: 20 },
      });
      const result = lift([lane(), other], [rail([20, 10], [180, 10])]);
      expect(result.get('other')).toMatchObject({
        y: 93,
        height: 214,
        groupTitleRect: { left: 300, right: 500, top: -14, bottom: 6 },
      });
    });

    it.each([
      { y: 0, delta: 24 },
      { y: 20, delta: 4 },
    ])('counts a rail along the band edge at y $y', (c) => {
      expect(lift([lane()], [rail([20, c.y], [180, c.y])]).get('lane')).toMatchObject(
        lifted(c.delta)
      );
    });

    it.each([
      { name: 'just below the band', from: rail([20, 21], [180, 21]) },
      { name: 'just above the band', from: rail([20, -1], [180, -1]) },
      { name: 'a vertical rail', from: rail([100, -50], [100, 50]) },
      { name: 'a rail overlapping the band by 7', from: rail([193, 10], [300, 10]) },
    ])('does not move for $name', (c) => {
      expect(lift([lane()], [c.from]).get('lane')).toMatchObject(unmoved);
    });

    it('moves for a rail overlapping the band by 8', () => {
      expect(lift([lane()], [rail([192, 10], [300, 10])]).get('lane')).toMatchObject(lifted(14));
    });

    it('ignores an edge that only steers the layout', () => {
      const steer = { ...rail([20, 10], [180, 10]), isLayoutOnly: true };
      expect(lift([lane()], [steer]).get('lane')).toMatchObject(unmoved);
    });

    it.each([
      { name: 'a TB layout', own: undefined, layout: 'TB', top: true },
      { name: 'a BT layout, whose band stays on top', own: undefined, layout: 'BT', top: true },
      { name: 'a lower-case layout direction', own: undefined, layout: 'tb', top: true },
      { name: 'no direction at all', own: undefined, layout: undefined, top: true },
      { name: 'an LR layout', own: undefined, layout: 'LR', top: false },
      { name: 'an RL layout', own: undefined, layout: 'RL', top: false },
      { name: 'an LR lane in a TB layout', own: 'LR', layout: 'TB', top: false },
      { name: 'a TB lane in an LR layout', own: 'TB', layout: 'LR', top: true },
    ])('treats the lane as a top band in $name: $top', (c) => {
      const result = lift(
        [lane(c.own ? { direction: c.own } : {})],
        [rail([20, 10], [180, 10])],
        c.layout
      );
      expect(result.get('lane')).toMatchObject(c.top ? lifted(14) : unmoved);
    });

    it.each([
      { name: 'a lane with no band', more: { groupTitleRect: undefined } },
      {
        name: 'a band of no width',
        more: { groupTitleRect: { left: 50, right: 50, top: 0, bottom: 20 } },
      },
      {
        name: 'a band of no height',
        more: { groupTitleRect: { left: 0, right: 200, top: 20, bottom: 20 } },
      },
      {
        name: 'a band that is taller than wide',
        more: { groupTitleRect: { left: 0, right: 20, top: 0, bottom: 200 } },
      },
      {
        name: 'a band with an infinite side',
        more: { groupTitleRect: { left: 0, right: Infinity, top: 0, bottom: 20 } },
      },
      {
        name: 'a band with a side that is not a number',
        more: { groupTitleRect: { left: 0, right: 200, top: '0', bottom: 20 } },
      },
      { name: 'a lane with no height', more: { height: 0 } },
      { name: 'a lane with no y', more: { y: undefined } },
      { name: 'a group inside another', more: { parentId: 'outer' } },
    ])('leaves $name alone', (c) => {
      const nodes = [lane(c.more), node({ id: 'outer', isGroup: true })];
      const before = JSON.stringify(nodes[0]);
      lift(nodes, [rail([20, 10], [180, 10])]);
      expect(JSON.stringify(nodes[0])).toBe(before);
    });

    it('stays put without any lane', () => {
      expect(() => lift([], [rail([20, 10], [180, 10])])).not.toThrow();
    });
  });

  describe('shiftLeftLaneTitleBandsLeftOfRails', () => {
    /** A lane in an LR layout: 200 across, 200 down, with a 36 wide band at its left edge. */
    const side = (more: Record<string, unknown> = {}): Node =>
      lane({
        direction: 'LR',
        groupTitleRect: { left: -100, right: -64, top: 0, bottom: 200 },
        x: 0,
        ...more,
      });
    const shift = (nodes: Node[], edges: Edge[], direction?: string) =>
      run(shiftLeftLaneTitleBandsLeftOfRails, nodes, edges, direction);
    const shifted = (delta: number) => ({
      x: 0 - delta / 2,
      width: 200 + delta,
      groupTitleRect: { left: -100 - delta, right: -64 - delta, top: 0, bottom: 200 },
    });
    const unmoved = shifted(0);

    it('widens the lane leftward by the distance from the rail to the band right side, plus 4', () => {
      expect(shift([side()], [rail([-80, 20], [-80, 180])]).get('lane')).toMatchObject(shifted(20));
    });

    it('goes left of a horizontal rail that runs across the band, to its leftmost point', () => {
      expect(shift([side()], [rail([-120, 100], [-20, 100])]).get('lane')).toMatchObject(
        shifted(60)
      );
    });

    it('uses the leftmost rail, whichever edge it belongs to', () => {
      const edges = [rail([-80, 20], [-80, 180]), { ...rail([-90, 20], [-90, 180]), id: 'other' }];
      expect(shift([side()], edges).get('lane')).toMatchObject(shifted(30));
    });

    it('moves every left lane by the same distance', () => {
      const other = side({
        id: 'other',
        y: 300,
        groupTitleRect: { left: -100, right: -64, top: 200, bottom: 400 },
      });
      const result = shift([side(), other], [rail([-80, 20], [-80, 180])]);
      expect(result.get('other')).toMatchObject({
        ...shifted(20),
        groupTitleRect: { left: -120, right: -84, top: 200, bottom: 400 },
      });
    });

    it.each([
      { x: -64, delta: 4 },
      { x: -100, delta: 40 },
    ])('counts a rail along the band edge at x $x', (c) => {
      expect(shift([side()], [rail([c.x, 20], [c.x, 180])]).get('lane')).toMatchObject(
        shifted(c.delta)
      );
    });

    it.each([
      { name: 'just right of the band', from: rail([-63, 20], [-63, 180]) },
      { name: 'just left of the band', from: rail([-101, 20], [-101, 180]) },
      { name: 'a rail overlapping the band by 7', from: rail([-80, 193], [-80, 300]) },
      { name: 'a horizontal rail below the band', from: rail([-120, 201], [-20, 201]) },
      { name: 'a horizontal rail overlapping the band by 7', from: rail([-71, 100], [20, 100]) },
    ])('does not move for $name', (c) => {
      expect(shift([side()], [c.from]).get('lane')).toMatchObject(unmoved);
    });

    it('moves for a rail overlapping the band by 8', () => {
      expect(shift([side()], [rail([-80, 192], [-80, 300])]).get('lane')).toMatchObject(
        shifted(20)
      );
      expect(shift([side()], [rail([-72, 100], [20, 100])]).get('lane')).toMatchObject(shifted(12));
    });

    it('ignores an edge that only steers the layout', () => {
      const steer = { ...rail([-80, 20], [-80, 180]), isLayoutOnly: true };
      expect(shift([side()], [steer]).get('lane')).toMatchObject(unmoved);
    });

    it.each([
      { name: 'an LR lane', own: 'LR', layout: undefined, left: true },
      {
        name: 'an RL lane, whose band stays on the left',
        own: 'RL',
        layout: undefined,
        left: true,
      },
      { name: 'a lower-case direction', own: 'lr', layout: undefined, left: true },
      {
        name: 'an LR layout, with no direction on the lane',
        own: undefined,
        layout: 'LR',
        left: true,
      },
      {
        name: 'an RL layout, with no direction on the lane',
        own: undefined,
        layout: 'RL',
        left: true,
      },
      { name: 'a TB lane', own: 'TB', layout: 'LR', left: false },
      { name: 'a TB layout', own: undefined, layout: 'TB', left: false },
      { name: 'no direction at all', own: undefined, layout: undefined, left: false },
    ])('treats $name as a left band: $left', (c) => {
      const band = side({ direction: c.own });
      const result = shift([band], [rail([-80, 20], [-80, 180])], c.layout);
      expect(result.get('lane')).toMatchObject(c.left ? shifted(20) : unmoved);
    });

    it.each([
      { name: 'a lane with no band', more: { groupTitleRect: undefined } },
      {
        name: 'a band that is wider than tall',
        more: { groupTitleRect: { left: -100, right: 100, top: 0, bottom: 20 } },
      },
      {
        name: 'a band of no width',
        more: { groupTitleRect: { left: -64, right: -64, top: 0, bottom: 200 } },
      },
      { name: 'a lane with no width', more: { width: 0 } },
      { name: 'a lane with no x', more: { x: undefined } },
      { name: 'a group inside another', more: { parentId: 'outer' } },
    ])('leaves $name alone', (c) => {
      const nodes = [side(c.more), node({ id: 'outer', isGroup: true })];
      const before = JSON.stringify(nodes[0]);
      shift(nodes, [rail([-80, 20], [-80, 180])]);
      expect(JSON.stringify(nodes[0])).toBe(before);
    });
  });
});

describe('liftRailsOffForeignEdgeLabels', () => {
  /** The label's own box: 100 wide and 40 tall, with its corner at the origin. */
  const label = () => box('label', 0, 0, 100, 40, { isEdgeLabel: true });
  const ends = () => [box('N1', 0, -70, 60, -50), box('N2', 0, 90, 60, 110)];
  /** A U-shaped edge from `N1` to `N2` whose rail runs down at `x`, beside the label. */
  const rail = (x: number) => path([60, -60], [x, -60], [x, 100], [60, 100]);
  /** The same from two boxes far left, so a rail can go either side of the label and keep its legs. */
  const farEnds = () => [box('N1', -160, -70, -100, -50), box('N2', -160, 90, -100, 110)];
  const wide = (x: number) => path([-100, -60], [x, -60], [x, 100], [-100, 100]);
  const lift = (points: Point[], nodes: Node[], others: Edge[] = [], more: Partial<Edge> = {}) => {
    const edge: Edge = { id: 'e', start: 'N1', end: 'N2', points, ...more };
    liftRailsOffForeignEdgeLabels([edge, ...others], new Map(nodes.map((n) => [n.id, n])));
    return edge.points;
  };
  const gap = EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE;

  it('moves a rail to the nearer side of the label, the touch tolerance out', () => {
    expect(lift(rail(101), [...ends(), label()])).toEqual(rail(100 + gap));
    expect(lift(rail(1), [...ends(), label()])).toEqual(rail(0 - gap));
  });

  it('does the same for a rail that runs across', () => {
    const tall = box('label', 0, 0, 40, 100, { isEdgeLabel: true });
    const nodes = [box('N1', -70, 0, -50, 60), box('N2', 90, 0, 110, 60), tall];
    const sideways = (y: number) => path([-60, 60], [-60, y], [100, y], [100, 60]);
    expect(lift(sideways(101), nodes)).toEqual(sideways(100 + gap));
    expect(lift(sideways(1), nodes)).toEqual(sideways(0 - gap));
  });

  it.each([
    { x: 102, moved: true },
    { x: 103, moved: false },
    { x: -2, moved: true },
    { x: -3, moved: false },
  ])('moves a rail at x $x only if within 2 units of the label: $moved', (c) => {
    const result = lift(rail(c.x), [...ends(), label()]);
    expect(result![1]!.x === c.x).toBe(!c.moved);
  });

  it.each([
    { name: 'a label that the rail overlaps by 8', top: 92, moved: true },
    { name: 'a label that the rail overlaps by 7', top: 93, moved: false },
  ])('only moves a rail along $name: $moved', (c) => {
    // The label is right of the rail, so the rail's legs, which run left, stay clear of it.
    const beside = box('label', 102, c.top, 200, c.top + 40, { isEdgeLabel: true });
    expect(lift(rail(101), [...ends(), beside])).toEqual(c.moved ? rail(102 - gap) : rail(101));
  });

  it('leaves a rail that the label keeps clear of', () => {
    expect(lift(rail(130), [...ends(), label()])).toEqual(rail(130));
  });

  describe('a rail through the middle of the label, free to go either way', () => {
    const nodes = () => [...farEnds(), label()];
    it('takes the nearer side', () => {
      expect(lift(wide(60), nodes())).toEqual(wide(100 + gap));
    });

    it('takes the other side when the nearer one runs into a node', () => {
      const wall = box('wall', 100 + gap - 4, 20, 100 + gap + 4, 30);
      expect(lift(wide(60), [...nodes(), wall])).toEqual(wide(0 - gap));
    });

    it('takes the other side when the nearer one shares track with another edge', () => {
      const other: Edge = {
        id: 'other',
        start: 'X',
        end: 'Y',
        points: path([100 + gap, 0], [100 + gap, 30]),
      };
      expect(lift(wide(60), nodes(), [other])).toEqual(wide(0 - gap));
    });

    it('takes the other side when the nearer one would add a crossing', () => {
      const across: Edge = {
        id: 'across',
        start: 'X',
        end: 'Y',
        points: path([80, 20], [120, 20]),
      };
      expect(lift(wide(60), nodes(), [across])).toEqual(wide(0 - gap));
    });

    it('stays when neither side is free', () => {
      const walls = [
        box('w1', 100 + gap - 4, 20, 100 + gap + 4, 30),
        box('w2', -gap - 4, 20, -gap + 4, 30),
      ];
      expect(lift(wide(60), [...nodes(), ...walls])).toEqual(wide(60));
    });
  });

  it('does not touch an edge with fewer than three legs', () => {
    const l = path([60, -60], [101, -60], [101, 100]);
    expect(lift(l, [...ends(), label()])).toEqual(l);
  });

  it('ignores an edge that only steers the layout, and a layout without labels', () => {
    expect(lift(rail(101), [...ends(), label()], [], { isLayoutOnly: true })).toEqual(rail(101));
    expect(lift(rail(101), ends())).toEqual(rail(101));
  });
});

describe('swapDestinationTerminalTailsToReduceCrossings', () => {
  /** `E` has a top port at x 105 and a right port at y 300. */
  const nodes = () => [
    box('E', 70, 275, 130, 325),
    box('C', -40, -15, 10, 35),
    box('D', -40, 75, 10, 125),
  ];
  const into = (id: string, from: string, points: Point[], more: Partial<Edge> = {}): Edge => ({
    id,
    start: from,
    end: 'E',
    points,
    ...more,
  });
  const cStart = () => path([10, 10], [150, 10], [150, 250], [105, 250], [105, 275]);
  const dStart = () => path([10, 100], [140, 100], [140, 300], [130, 300]);
  /** `C` goes round to the top port and `D` to the right port, which cross at (140, 250). */
  const crossed = () => [into('C-E', 'C', cStart()), into('D-E', 'D', dStart())];
  const cAfter = () => path([10, 10], [150, 10], [150, 300], [130, 300]);
  const dAfter = () => path([10, 100], [140, 100], [140, 250], [105, 250], [105, 275]);
  const swap = (edges: Edge[], more: Node[] = nodes()) => {
    swapDestinationTerminalTailsToReduceCrossings(edges, new Map(more.map((n) => [n.id, n])));
    return edges.map((e) => e.points);
  };
  const unchanged = (edges: Edge[]) => edges.map((e) => e.points!.map((p) => ({ ...p })));

  it('gives each edge the last leg of the other when that removes the crossing', () => {
    expect(swap(crossed())).toEqual([cAfter(), dAfter()]);
  });

  it('leaves edges that do not cross', () => {
    const edges = [into('C-E', 'C', cAfter()), into('D-E', 'D', dAfter())];
    const before = unchanged(edges);
    expect(swap(edges)).toEqual(before);
  });

  it('leaves edges that end on different nodes', () => {
    const edges = crossed();
    edges[1]!.end = 'E2';
    const before = unchanged(edges);
    expect(swap(edges, [...nodes(), box('E2', 300, 275, 360, 325)])).toEqual(before);
  });

  it('leaves an edge with fewer than four points', () => {
    const edges = [crossed()[0]!, into('D-E', 'D', path([10, 100], [140, 100], [140, 300]))];
    const before = unchanged(edges);
    expect(swap(edges)).toEqual(before);
  });

  it('leaves edges when a swapped-in route would run into another node', () => {
    const edges = crossed();
    const before = unchanged(edges);
    expect(swap(edges, [...nodes(), box('block', 145, 280, 155, 290)])).toEqual(before);
  });

  it('leaves edges when a swapped-in route would share track with a third edge', () => {
    const third: Edge = { id: 'third', start: 'X', end: 'Y', points: path([150, 260], [150, 320]) };
    const edges = [...crossed(), third];
    const before = unchanged(edges);
    expect(swap(edges)).toEqual(before);
  });

  it('ignores an edge that only steers the layout', () => {
    const edges = crossed();
    edges[1]!.isLayoutOnly = true;
    const before = unchanged(edges);
    expect(swap(edges)).toEqual(before);
  });
});

describe('reassignCrossingExternalRailChannels', () => {
  type Turn = (p: Point) => Point;
  /** The existing test's layout, turned so its two external rails run down each side of the nodes. */
  const scenario = (turn: Turn, swapSize: boolean) => {
    const place = (id: string, x: number, y: number, width: number, height: number): Node => {
      const c = turn({ x, y });
      return node({
        id,
        x: c.x,
        y: c.y,
        width: swapSize ? height : width,
        height: swapSize ? width : height,
      });
    };
    const nodes = [
      place('26', -22, 664, 116, 64),
      place('27', -22, 1602, 116, 116),
      place('28', -22, 1050, 116, 80),
    ];
    const edges: Edge[] = [
      {
        id: 'L_26_27_0',
        start: '26',
        end: '27',
        points: path([-80, 664], [-100, 664], [-100, 1660], [-80, 1660]).map(turn),
      },
      {
        id: 'L_27_28_0',
        start: '27',
        end: '28',
        points: path(
          [36, 1544],
          [65, 1544],
          [65, 1467],
          [-126.4, 1467],
          [-126.4, 1132],
          [36, 1132],
          [36, 1050]
        ).map(turn),
      },
    ];
    return { nodes, edges };
  };
  const reassign = (nodes: Node[], edges: Edge[]) =>
    reassignCrossingExternalRailChannels(edges, new Map(nodes.map((n) => [n.id, n])));
  const crossings = (edges: Edge[]) => strictCrossingCount(edges);

  it.each([
    { side: 'left', turn: (p: Point) => p, swap: false, axis: 'x', sign: 1 },
    { side: 'right', turn: (p: Point) => ({ x: -p.x, y: p.y }), swap: false, axis: 'x', sign: -1 },
    { side: 'top', turn: (p: Point) => ({ x: p.y, y: p.x }), swap: true, axis: 'y', sign: 1 },
    { side: 'bottom', turn: (p: Point) => ({ x: p.y, y: -p.x }), swap: true, axis: 'y', sign: -1 },
  ] as const)('puts the outer rail of two crossing bundles on the $side outermost', (c) => {
    const { nodes, edges } = scenario(c.turn, c.swap);
    expect(crossings(edges)).toBe(2);
    reassign(nodes, edges);
    expect(crossings(edges)).toBe(0);
    expect(edges[0]!.points![1]![c.axis]).toBe(c.sign * -126.4);
    expect(edges[1]!.points![3]![c.axis]).toBe(c.sign * -100);
  });

  it('leaves edges that do not cross', () => {
    const { nodes, edges } = scenario((p) => p, false);
    reassign(nodes, edges);
    const settled = edges.map((e) => e.points!.map((q) => ({ ...q })));
    reassign(nodes, edges);
    expect(edges.map((e) => e.points)).toEqual(settled);
  });

  it('ignores an edge that only steers the layout', () => {
    const { nodes, edges } = scenario((p) => p, false);
    edges[1]!.isLayoutOnly = true;
    const before = edges.map((e) => e.points!.map((q) => ({ ...q })));
    reassign(nodes, edges);
    expect(edges.map((e) => e.points)).toEqual(before);
  });

  it('leaves rails that run between the end boxes rather than outside them', () => {
    const { nodes, edges } = scenario((p) => p, false);
    // Bring both outer rails inside the span of the end boxes' sides: no longer external.
    edges[0]!.points = path([-80, 664], [-30, 664], [-30, 1660], [-80, 1660]);
    edges[1]!.points = path(
      [36, 1544],
      [65, 1544],
      [65, 1467],
      [-40, 1467],
      [-40, 1132],
      [36, 1132],
      [36, 1050]
    );
    const before = edges.map((e) => e.points!.map((q) => ({ ...q })));
    reassign(nodes, edges);
    expect(edges.map((e) => e.points)).toEqual(before);
  });

  it('leaves edges whose end nodes are not in the layout', () => {
    const { edges } = scenario((p) => p, false);
    const before = edges.map((e) => e.points!.map((q) => ({ ...q })));
    reassign([], edges);
    expect(edges.map((e) => e.points)).toEqual(before);
  });
});

describe('shortcutRedundantOrthogonalJogs', () => {
  const shortcut = (points: Point[], extra?: Parameters<typeof pass>[2]) =>
    pass(shortcutRedundantOrthogonalJogs, points, extra);
  /** Right, down, back left: the two corners below and left of the start both shorten it. */
  const jog = () => path([0, 0], [20, 0], [20, 10], [-10, 10]);
  const viaLeftCorner = () => path([0, 0], [0, 10], [-10, 10]);
  const viaUpperCorner = () => path([0, 0], [-10, 0], [-10, 10]);

  it('cuts a horizontal jog down to one corner, taking the first corner of equal length', () => {
    expect(shortcut(jog())).toEqual(viaLeftCorner());
  });

  it('does the same for a vertical jog', () => {
    expect(shortcut(path([0, 0], [0, 20], [10, 20], [10, -10]))).toEqual(
      path([0, 0], [0, -10], [10, -10])
    );
  });

  it.each([
    {
      name: 'a horizontal jog back to its own line',
      from: path([0, 0], [20, 0], [20, 10], [0, 10]),
      to: path([0, 0], [0, 10]),
    },
    {
      name: 'a vertical jog back to its own line',
      from: path([0, 0], [0, 20], [10, 20], [10, 0]),
      to: path([0, 0], [10, 0]),
    },
  ])('removes $name entirely', (c) => {
    expect(shortcut(c.from)).toEqual(c.to);
  });

  it('keeps the points before and after the jog', () => {
    const from = path([0, -30], [0, 0], [20, 0], [20, 10], [-10, 10], [-10, 40]);
    expect(shortcut(from)).toEqual(path([0, -30], [0, 10], [-10, 10], [-10, 40]));
  });

  it('takes the other corner when the first one would run through a node', () => {
    expect(shortcut(jog(), { nodes: [box('M', -3, 7, 3, 13)] })).toEqual(viaUpperCorner());
  });

  it('takes the other corner when the first one would share track with another edge', () => {
    const other = bare(path([0, -5], [0, 20]));
    expect(shortcut(jog(), { others: [other] })).toEqual(viaUpperCorner());
  });

  it('takes the other corner when the first one would add a crossing', () => {
    const across = bare(path([-5, 5], [5, 5]));
    expect(shortcut(jog(), { others: [across] })).toEqual(viaUpperCorner());
  });

  it('keeps the jog when both corners run through a label', () => {
    expect(
      shortcut(jog(), { nodes: [box('label', -12, -2, 2, 12, { isEdgeLabel: true })] })
    ).toEqual(jog());
  });

  it('keeps the jog when the other corner would turn back into the box the edge starts from', () => {
    const start = box('S', -40, -5, 0, 5);
    const inTheWay = box('M', -3, 7, 3, 13);
    // Without the start box the other corner is taken, as above; with it, that corner would run
    // into a box the edge does not run into now.
    expect(shortcut(jog(), { nodes: [inTheWay] })).toEqual(viaUpperCorner());
    expect(shortcut(jog(), { nodes: [inTheWay, start], start: 'S' })).toEqual(jog());
  });

  it.each([
    { name: 'a staircase', from: path([0, 0], [20, 0], [20, 10], [40, 10]) },
    { name: 'three legs', from: path([0, 0], [20, 0], [20, 10]) },
    { name: 'a vertical staircase', from: path([0, 0], [0, 20], [10, 20], [10, 40]) },
  ])('leaves $name', (c) => {
    expect(shortcut(c.from)).toEqual(c.from);
  });

  it('cuts the jog in every edge that has one', () => {
    const second = bare(path([100, 0], [120, 0], [120, 10], [90, 10]), 'second');
    expect(shortcut(jog(), { others: [second] })).toEqual(viaLeftCorner());
    expect(second.points).toEqual(path([100, 0], [100, 10], [90, 10]));
  });

  it('ignores an edge that only steers the layout', () => {
    expect(shortcut(jog(), { layoutOnly: true })).toEqual(jog());
    const steer = bare(path([0, -5], [0, 20]), 'steer', { isLayoutOnly: true });
    expect(shortcut(jog(), { others: [steer] })).toEqual(viaLeftCorner());
  });
});
