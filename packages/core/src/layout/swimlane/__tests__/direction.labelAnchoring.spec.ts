// `anchorLabelsToPolyline` (`direction/labelAnchoring.ts`): where an edge's label box sits on its
// route. Each case builds a small layout by hand and asserts the label's centre and lane, so the
// file can be split (#709) without a layout snapshot standing in for these rules.
import { describe, expect, it } from 'vitest';
import type { Point } from '../../types.ts';
import type { Edge, Node } from '../layoutData.ts';
import { anchorLabelsToPolyline } from '../direction/labelAnchoring.ts';
import { node } from './internalData.ts';

/** `LABEL_ENDPOINT_CLEARANCE` in labelAnchoring.ts: free run kept between a label and a route end. */
const END_GAP = 12;
/** `LABEL_PLACEMENT_BUFFER`: margin around a label inside which a foreign node or edge blocks it. */
const BUFFER = 3;
/** The label sizes the cases use: wide (long axis horizontal), tall, and square. */
const WIDE = { width: 40, height: 16 };
const TALL = { width: 16, height: 40 };
const SQUARE = { width: 30, height: 30 };
/** Where a label starts: far outside every lane, so a label that is still here was not anchored. */
const UNPLACED = { x: -500, y: -500, parentId: 'unplaced' };

/** A lane: a group with no parent, as the lane model reads it, given by its four sides. */
const lane = (id: string, left: number, top: number, right: number, bottom: number): Node =>
  node({
    id,
    isGroup: true,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  });
/** One lane that holds every route below: 400 across, 200 down. */
const lane0 = () => lane('lane', 0, 0, 400, 200);
/** A placed obstacle node, given by its four sides. */
const block = (id: string, left: number, top: number, right: number, bottom: number): Node =>
  node({
    id,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  });
const labelBox = (size: { width: number; height: number }, id = 'L'): Node =>
  node({ id, isEdgeLabel: true, ...size, ...UNPLACED });
const route = (...xy: [number, number][]): Point[] => xy.map(([x, y]) => ({ x, y }));
const labelled = (points: Point[] | undefined, id = 'e', labelNodeId = 'L'): Edge => ({
  id,
  start: `${id}-from`,
  end: `${id}-to`,
  points,
  labelNodeId,
});
/** An edge with no label: only an obstacle for the others. */
const bare = (points: Point[], id = 'F'): Edge => ({ id, start: 'X', end: 'Y', points });

function anchor(nodes: Node[], edges: Edge[]): Map<string, Node> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  anchorLabelsToPolyline(edges, byId);
  return byId;
}
const where = (byId: Map<string, Node>, id = 'L') => {
  const n = byId.get(id)!;
  return { x: n.x, y: n.y, parentId: n.parentId };
};
const stays = { x: UNPLACED.x, y: UNPLACED.y, parentId: UNPLACED.parentId };
/** Anchor one labelled edge on `route` in the default lane, with `extra` nodes and edges. */
const anchoredOn = (points: Point[], size = WIDE, extra: { nodes?: Node[]; edges?: Edge[] } = {}) =>
  where(
    anchor(
      [lane0(), labelBox(size), ...(extra.nodes ?? [])],
      [labelled(points), ...(extra.edges ?? [])]
    )
  );
const inLane = (x: number, y: number) => ({ x, y, parentId: 'lane' });

describe('anchorLabelsToPolyline: which leg hosts the label', () => {
  it('uses the middle leg of a three-leg route, not a longer end leg', () => {
    expect(anchoredOn(route([20, 50], [150, 50], [150, 150], [380, 150]))).toEqual(
      inLane(150, 100)
    );
  });

  it('may use any leg of a route with fewer than three, preferring the label long axis', () => {
    const lShape = route([20, 50], [300, 50], [300, 150]);
    expect(anchoredOn(lShape, WIDE)).toEqual(inLane(160, 50));
    expect(anchoredOn(lShape, TALL)).toEqual(inLane(300, 100));
  });

  describe('among the middle legs of a staircase', () => {
    const staircase = route([20, 20], [60, 20], [60, 60], [200, 60], [200, 160], [380, 160]);
    it('a wide label takes the horizontal leg although a vertical one is longer', () => {
      expect(anchoredOn(staircase, WIDE)).toEqual(inLane(130, 60));
    });
    it('a tall label takes the longest vertical leg', () => {
      expect(anchoredOn(staircase, TALL)).toEqual(inLane(200, 110));
    });
    it('a square label counts as wide', () => {
      expect(anchoredOn(staircase, SQUARE)).toEqual(inLane(130, 60));
    });
  });

  it.each([
    {
      name: 'the shorter leg first',
      steps: route(
        [20, 20],
        [60, 20],
        [60, 40],
        [120, 40],
        [120, 80],
        [300, 80],
        [300, 120],
        [380, 120]
      ),
      expected: inLane(210, 80),
    },
    {
      name: 'the longer leg first',
      steps: route(
        [20, 20],
        [60, 20],
        [60, 40],
        [240, 40],
        [240, 80],
        [300, 80],
        [300, 120],
        [380, 120]
      ),
      expected: inLane(150, 40),
    },
  ])('takes the longest of the horizontal middle legs: $name', (c) => {
    expect(anchoredOn(c.steps)).toEqual(c.expected);
  });

  // Neither horizontal leg is as long as the 40-wide label: both are 39 and 41, within the 2
  // units of slack the label is allowed, and the longer one still wins.
  it.each([
    {
      name: 'the shorter leg first',
      steps: route(
        [20, 20],
        [60, 20],
        [60, 40],
        [99, 40],
        [99, 60],
        [140, 60],
        [140, 80],
        [300, 80]
      ),
      expected: inLane(119.5, 60),
    },
    {
      name: 'the longer leg first',
      steps: route(
        [20, 20],
        [60, 20],
        [60, 40],
        [101, 40],
        [101, 60],
        [140, 60],
        [140, 80],
        [300, 80]
      ),
      expected: inLane(80.5, 40),
    },
  ])('takes the longer of two horizontal legs that are both shorter than the label: $name', (c) => {
    expect(anchoredOn(c.steps)).toEqual(c.expected);
  });

  it('takes the first of two horizontal legs that are equally long, each just long enough', () => {
    // 42 is the label's 40 plus the 2 units of slack it needs to count as fitting.
    const steps = route(
      [20, 20],
      [60, 20],
      [60, 40],
      [102, 40],
      [102, 60],
      [144, 60],
      [144, 80],
      [300, 80]
    );
    expect(anchoredOn(steps)).toEqual(inLane(81, 40));
  });

  it.each([
    {
      name: 'the shorter leg first',
      steps: route([20, 20], [60, 20], [60, 40], [100, 40], [100, 70], [300, 70]),
      expected: inLane(100, 55),
    },
    {
      name: 'the longer leg first',
      steps: route([20, 20], [60, 20], [60, 50], [100, 50], [100, 70], [300, 70]),
      expected: inLane(60, 35),
    },
  ])(
    'takes the longer of two vertical legs that are both shorter than a tall label: $name',
    (c) => {
      expect(anchoredOn(c.steps, TALL)).toEqual(c.expected);
    }
  );

  it('ignores a repeated last point when counting legs', () => {
    expect(anchoredOn(route([20, 50], [150, 50], [150, 150], [380, 150], [380, 150]))).toEqual(
      inLane(150, 100)
    );
  });

  it('ignores a slanted leg and anchors on the straight ones', () => {
    expect(anchoredOn(route([20, 50], [150, 50], [290, 150], [290, 190]))).toEqual(inLane(85, 50));
  });

  it('anchors a route of two points', () => {
    expect(anchoredOn(route([50, 100], [350, 100]))).toEqual(inLane(200, 100));
  });

  it.each([
    { name: 'only a slanted leg', points: route([20, 20], [120, 120]) },
    { name: 'a single point', points: route([20, 20]) },
    { name: 'no points', points: [] },
    { name: 'no route yet', points: undefined },
    { name: 'a repeated point only', points: route([60, 60], [60, 60]) },
  ])('leaves the label where it was for an edge with $name', (c) => {
    const byId = anchor([lane0(), labelBox(WIDE)], [labelled(c.points)]);
    expect(where(byId)).toEqual(stays);
  });
});

describe('anchorLabelsToPolyline: where along the leg', () => {
  const vertical = route([20, 50], [150, 50], [150, 150], [380, 150]);
  const across = (y: number) => bare(route([100, y], [200, y]), `F${y}`);

  it.each([
    { blockedAt: [], expectedY: 100 },
    { blockedAt: [100], expectedY: 75 },
    { blockedAt: [100, 75], expectedY: 125 },
    { blockedAt: [100, 75, 125], expectedY: 55 },
    { blockedAt: [100, 75, 125, 55], expectedY: 145 },
  ])('walks the leg in a fixed order of positions: blocked at $blockedAt', (c) => {
    expect(anchoredOn(vertical, WIDE, { edges: c.blockedAt.map(across) })).toEqual(
      inLane(150, c.expectedY)
    );
  });

  it('ignores a foreign edge that has no usable route', () => {
    const noRoute: Edge = { id: 'G', start: 'X', end: 'Y' };
    const stub = bare(route([150, 100]), 'H');
    expect(anchoredOn(vertical, WIDE, { edges: [noRoute, stub] })).toEqual(inLane(150, 100));
  });

  it('is not blocked by a layout-only edge or by its own route', () => {
    const steering = { ...across(100), isLayoutOnly: true };
    expect(anchoredOn(vertical, WIDE, { edges: [steering] })).toEqual(inLane(150, 100));
  });

  describe('keeping clear of the route ends', () => {
    const exact = WIDE.width + 2 * END_GAP;
    it('puts a label on the first leg no closer to the start than half its length plus the gap', () => {
      const firstLeg = (length: number) => route([20, 100], [20 + length, 100], [20 + length, 180]);
      // The midpoint of a leg of exactly `exact` is just far enough; one unit shorter is not.
      expect(anchoredOn(firstLeg(exact))).toEqual(inLane(20 + exact / 2, 100));
      expect(anchoredOn(firstLeg(exact - 2))).toEqual(inLane(20 + (exact - 2) * 0.75, 100));
    });

    it('measures the last leg the same way: a leg of exactly that length is just enough', () => {
      expect(anchoredOn(route([20, 20], [20, 100], [20 + exact, 100]))).toEqual(
        inLane(20 + exact / 2, 100)
      );
    });

    it('does the same at the end of a horizontal last leg', () => {
      expect(anchoredOn(route([20, 20], [20, 100], [80, 100]))).toEqual(inLane(35, 100));
    });

    it('measures a vertical first leg by the label height', () => {
      expect(anchoredOn(route([100, 20], [100, 80], [300, 80]), TALL)).toEqual(inLane(100, 65));
    });

    it('measures a vertical last leg by the label height', () => {
      expect(anchoredOn(route([20, 100], [150, 100], [150, 160]), TALL)).toEqual(inLane(150, 115));
    });

    it('counts the first leg that is drawn when the route starts with a repeated point', () => {
      expect(anchoredOn(route([20, 100], [20, 100], [80, 100], [80, 180]))).toEqual(
        inLane(65, 100)
      );
    });

    it('takes the midpoint of a lone leg that cannot clear both ends', () => {
      expect(anchoredOn(route([100, 100], [160, 100]))).toEqual(inLane(130, 100));
    });
  });
});

describe('anchorLabelsToPolyline: arrowhead room at the route ends', () => {
  /** Tall enough to reach into the arrowhead room beside a short leg, without being a tall label. */
  const BOX = { width: 40, height: 24 };
  const BOX_TALL = { width: 24, height: 40 };

  it.each([
    {
      name: 'start, pointing right',
      steps: route([20, 100], [45, 100], [45, 130], [150, 130]),
      expected: inLane(45, 122.5),
    },
    {
      name: 'start, pointing left',
      steps: route([200, 100], [175, 100], [175, 130], [70, 130]),
      expected: inLane(175, 122.5),
    },
    {
      name: 'end, reached going left',
      steps: route([150, 130], [45, 130], [45, 100], [20, 100]),
      expected: inLane(45, 122.5),
    },
  ])('moves a label off the horizontal arrowhead room at the $name', (c) => {
    // The middle leg is short: the midpoint and the quarter point both touch the arrowhead box.
    expect(anchoredOn(c.steps, BOX)).toEqual(c.expected);
  });

  it.each([
    {
      name: 'start, pointing down',
      steps: route([100, 20], [100, 45], [130, 45], [130, 150]),
      expected: inLane(122.5, 45),
    },
    {
      name: 'start, pointing up',
      steps: route([100, 180], [100, 155], [130, 155], [130, 50]),
      expected: inLane(122.5, 155),
    },
    {
      name: 'end, reached going up',
      steps: route([130, 150], [130, 45], [100, 45], [100, 20]),
      expected: inLane(122.5, 45),
    },
  ])('moves a label off the vertical arrowhead room at the $name', (c) => {
    expect(anchoredOn(c.steps, BOX_TALL)).toEqual(c.expected);
  });

  it.each([
    {
      name: 'start, pointing right, leg turning up',
      steps: route([20, 100], [45, 100], [45, 70], [150, 70]),
      size: BOX,
      expected: inLane(45, 77.5),
    },
    {
      name: 'start, pointing down, leg turning left',
      steps: route([150, 20], [150, 45], [120, 45], [120, 150]),
      size: BOX_TALL,
      expected: inLane(127.5, 45),
    },
  ])('keeps clear of the whole arrowhead box, not a line through it: $name', (c) => {
    expect(anchoredOn(c.steps, c.size)).toEqual(c.expected);
  });

  describe('a slanted end leg: the box around its tip and inner point is arrowhead room', () => {
    // The only straight leg starts where the slanted one ends and doubles back along it, so
    // the one spot that clears both ends sits over the slant's bounding box.
    it('beside the leg, where the slant tip is wider than the label', () => {
      const spike = route([80, 130], [50, 100], [50, 190]);
      expect(where(anchor([lane0(), labelBox(TALL)], [labelled(spike)]))).toEqual(stays);
    });

    it('below the leg, where the slant tip is taller than the label', () => {
      const spike = route([20, 160], [50, 100], [50, 190]);
      expect(where(anchor([lane0(), labelBox(WIDE)], [labelled(spike)]))).toEqual(stays);
    });
  });
});

describe('anchorLabelsToPolyline: other nodes and edges', () => {
  const vertical = route([20, 50], [150, 50], [150, 150], [380, 150]);
  const labelLeft = 150 + WIDE.width / 2;

  it('keeps off a node that covers the midpoint and its neighbours on the leg', () => {
    expect(anchoredOn(vertical, WIDE, { nodes: [block('N', 135, 85, 165, 115)] })).toEqual(
      inLane(150, 55)
    );
  });

  it.each([
    { gap: BUFFER, expected: inLane(150, 100) },
    { gap: BUFFER - 1, expected: inLane(150, 75) },
  ])('keeps $gap units clear of a node beside the label, no more and no less', (c) => {
    const beside = block('N', labelLeft + c.gap, 90, labelLeft + c.gap + 20, 110);
    expect(anchoredOn(vertical, WIDE, { nodes: [beside] })).toEqual(c.expected);
  });

  it('is not blocked by a nested group, another label, or a node with no size', () => {
    const nested = node({
      id: 'G',
      isGroup: true,
      parentId: 'lane',
      x: 150,
      y: 100,
      width: 60,
      height: 60,
    });
    const otherLabel = node({ id: 'M', isEdgeLabel: true, x: 150, y: 100, width: 60, height: 60 });
    const unsized = node({ id: 'Z', x: 150, y: 100 });
    expect(anchoredOn(vertical, WIDE, { nodes: [nested, otherLabel, unsized] })).toEqual(
      inLane(150, 100)
    );
  });

  it('is not blocked by its own box, even where the node is not flagged as a label', () => {
    const unflagged = node({ id: 'L', ...WIDE, x: 160, y: 104, parentId: UNPLACED.parentId });
    const byId = anchor([lane0(), unflagged], [labelled(vertical)]);
    expect(where(byId)).toEqual(inLane(150, 100));
  });

  it('skips a lane that has no size', () => {
    const ghost = node({ id: 'ghost', isGroup: true });
    const byId = anchor([ghost, lane0(), labelBox(WIDE)], [labelled(vertical)]);
    expect(where(byId)).toEqual(inLane(150, 100));
  });

  it('keeps one label off the box of a label placed before it', () => {
    const first = route([50, 100], [350, 100]);
    const second = route([50, 114], [350, 114]);
    const byId = anchor(
      [lane0(), labelBox(WIDE, 'L1'), labelBox(WIDE, 'L2')],
      [labelled(first, 'e1', 'L1'), labelled(second, 'e2', 'L2')]
    );
    // Neither route is within reach of the other's label, but the two midpoints would overlap.
    expect([where(byId, 'L1'), where(byId, 'L2')]).toEqual([inLane(200, 100), inLane(125, 114)]);
  });

  it('places every label again from the routes alone when it runs a second time', () => {
    const nodes = [lane0(), labelBox(WIDE, 'L1'), labelBox(WIDE, 'L2')];
    const edges = [
      labelled(route([50, 100], [350, 100]), 'e1', 'L1'),
      labelled(route([50, 114], [350, 114]), 'e2', 'L2'),
    ];
    const byId = anchor(nodes, edges);
    const once = [where(byId, 'L1'), where(byId, 'L2')];
    anchorLabelsToPolyline(edges, byId);
    expect([where(byId, 'L1'), where(byId, 'L2')]).toEqual(once);
  });

  it('is not blocked by an edge that only steers the layout, and does not anchor its label', () => {
    const steering = { ...labelled(route([50, 100], [350, 100]), 'v', 'V'), isLayoutOnly: true };
    const byId = anchor(
      [lane0(), labelBox(WIDE), labelBox(WIDE, 'V')],
      [steering, labelled(route([50, 106], [350, 106]))]
    );
    expect(where(byId, 'V')).toEqual(stays);
    expect(where(byId)).toEqual(inLane(200, 106));
  });

  it.each([
    { name: 'a label node that is not in the layout', labelNodeId: 'ghost' },
    { name: 'no label node id', labelNodeId: undefined },
  ])('skips an edge with $name and still anchors the others', (c) => {
    // Its route runs well clear of the labelled one, so only the skip is under test.
    const lost = { ...labelled(route([20, 190], [380, 190]), 'lost'), labelNodeId: c.labelNodeId };
    const byId = anchor([lane0(), labelBox(WIDE)], [lost, labelled(vertical)]);
    expect(where(byId)).toEqual(inLane(150, 100));
  });

  it.each([
    { name: 'no width', size: { height: 16 } },
    { name: 'no height', size: { width: 40 } },
    { name: 'zero width', size: { width: 0, height: 16 } },
    { name: 'zero height', size: { width: 40, height: 0 } },
  ])('leaves a label with $name where it was', (c) => {
    const byId = anchor(
      [lane0(), node({ id: 'L', isEdgeLabel: true, ...c.size, ...UNPLACED })],
      [labelled(vertical)]
    );
    expect(where(byId)).toEqual(stays);
  });
});

describe('anchorLabelsToPolyline: when the usual spots are all taken', () => {
  const straight = route([50, 100], [350, 100]);
  /** A foreign edge close enough beside the route to block every position along it. */
  const hugging = bare(route([30, 105], [370, 105]));

  it('gives up the clearance from foreign edges rather than leave the label unplaced', () => {
    expect(anchoredOn(straight, WIDE, { edges: [hugging] })).toEqual(inLane(200, 100));
  });

  it('does not give up the clearance from nodes', () => {
    const wall = block('N', 40, 90, 360, 110);
    expect(anchoredOn(straight, WIDE, { edges: [hugging], nodes: [wall] })).toEqual(stays);
  });

  it('gives up the clearance from the route ends together with that from foreign edges', () => {
    const lone = route([100, 100], [160, 100]);
    expect(anchoredOn(lone, WIDE, { edges: [bare(route([80, 105], [180, 105]))] })).toEqual(
      inLane(130, 100)
    );
  });

  it('takes a spot clear of foreign edges, even close to a route end, before one that is not', () => {
    // The long first leg is blocked along its whole length. The short last leg has no position
    // far enough from the end, except by giving that up; its midpoint is free of the edge.
    const withTail = route([50, 100], [350, 100], [350, 138]);
    expect(anchoredOn(withTail, WIDE, { edges: [hugging] })).toEqual(inLane(350, 119));
  });

  it('walks every leg when the middle legs are blocked, not only the midpoints', () => {
    const steps = route([20, 50], [150, 50], [150, 150], [380, 150]);
    const wall = block('N', 135, 40, 165, 160);
    const crossing = bare(route([265, 120], [265, 180]));
    // The longest end leg is blocked at its midpoint: its quarter point is free.
    expect(anchoredOn(steps, WIDE, { nodes: [wall], edges: [crossing] })).toEqual(
      inLane(207.5, 150)
    );
  });

  it('expands to the end legs when no middle leg can host the label', () => {
    const steps = route([30, 50], [30, 100], [250, 100], [250, 150]);
    const cover = block('N', 20, 90, 260, 110);
    expect(anchoredOn(steps, WIDE, { nodes: [cover] })).toEqual(inLane(30, 75));
  });
});

describe('anchorLabelsToPolyline: lanes', () => {
  const side = (parentId: string) => ({ parentId });
  const twoColumns = () => [lane('A', 0, 0, 200, 200), lane('B', 200, 0, 400, 200)];
  const placedIn = (nodes: Node[], steps: Point[], size = WIDE, from = 'unplaced') => {
    const label = node({
      id: 'L',
      isEdgeLabel: true,
      ...size,
      x: UNPLACED.x,
      y: UNPLACED.y,
      parentId: from,
    });
    return where(anchor([...nodes, label], [labelled(steps)]));
  };

  it('moves the label into the lane that holds it', () => {
    const inB = route([230, 50], [300, 50], [300, 150], [380, 150]);
    expect(placedIn(twoColumns(), inB, WIDE, 'A')).toEqual({ x: 300, y: 100, ...side('B') });
    const inA = route([20, 50], [100, 50], [100, 150], [180, 150]);
    expect(placedIn(twoColumns(), inA, WIDE, 'B')).toEqual({ x: 100, y: 100, ...side('A') });
  });

  it('does not straddle a lane border: it moves along the leg until it fits in one lane', () => {
    const crossing = route([50, 50], [50, 100], [350, 100], [350, 150]);
    expect(placedIn(twoColumns(), crossing)).toEqual({ x: 125, y: 100, ...side('A') });
  });

  describe('a label whose box would cross a border but whose anchor is inside the lane', () => {
    const rows = () => [lane('P', 0, 0, 400, 100), lane('Q', 0, 100, 400, 200)];

    it.each([
      {
        name: 'right border',
        steps: route([30, 50], [30, 100], [350, 100], [350, 150]),
        expected: { x: 179, y: 100, ...side('A') },
        lanes: twoColumns,
      },
      {
        name: 'left border',
        steps: route([370, 50], [370, 100], [50, 100], [50, 150]),
        expected: { x: 221, y: 100, ...side('B') },
        lanes: twoColumns,
      },
      {
        name: 'bottom border',
        steps: route([50, 20], [150, 20], [150, 170], [300, 170]),
        expected: { x: 150, y: 79, ...side('P') },
        lanes: rows,
      },
      {
        name: 'top border',
        steps: route([300, 190], [150, 190], [150, 20], [50, 20]),
        expected: { x: 150, y: 121, ...side('Q') },
        lanes: rows,
      },
    ])('is shifted inside the lane, keeping the anchor under it: $name', (c) => {
      const size = c.steps[1]!.x === c.steps[2]!.x ? TALL : WIDE;
      expect(placedIn(c.lanes(), c.steps, size)).toEqual(c.expected);
    });
  });

  it.each([
    {
      name: 'right',
      lanes: [lane('W', 0, 0, 200, 200), lane('R', 200, 0, 600, 200)],
      steps: route([400, 50], [400, 100], [780, 100], [780, 150]),
      size: WIDE,
      expected: { x: 579, y: 100, ...side('R') },
    },
    {
      name: 'left',
      lanes: [lane('W', 400, 0, 600, 200), lane('R', 0, 0, 400, 200)],
      steps: route([120, 50], [120, 100], [-100, 100], [-100, 150]),
      size: WIDE,
      expected: { x: 21, y: 100, ...side('R') },
    },
    {
      name: 'below',
      lanes: [lane('W', 0, 0, 400, 100), lane('R', 0, 100, 400, 400)],
      steps: route([50, 360], [150, 360], [150, 420], [300, 420]),
      size: TALL,
      expected: { x: 150, y: 379, ...side('R') },
    },
    {
      name: 'above',
      lanes: [lane('W', 0, 300, 400, 400), lane('R', 0, 0, 400, 300)],
      steps: route([300, 50], [150, 50], [150, -30], [50, -30]),
      size: TALL,
      expected: { x: 150, y: 21, ...side('R') },
    },
  ])('finds the lane that holds the anchor when an earlier lane lies $name of it', (c) => {
    expect(placedIn(c.lanes, c.steps, c.size)).toEqual(c.expected);
  });

  it('keeps a label whose box exactly touches a lane border where the route puts it', () => {
    const atBorder = route([100, 50], [20, 50], [20, 150], [100, 150]);
    expect(placedIn([lane('lane', 0, 0, 400, 200)], atBorder)).toEqual({
      x: 20,
      y: 100,
      ...side('lane'),
    });
  });

  it.each([
    {
      name: 'as wide as the label plus its margin on both sides',
      lanes: [lane('tight', 100, 0, 142, 200)],
      steps: route([125, 30], [125, 170]),
      expected: { x: 121, y: 100, ...side('tight') },
    },
    {
      name: 'as tall as the label plus its margin on both sides',
      lanes: [lane('tight', 0, 92, 400, 110)],
      steps: route([50, 105], [350, 105]),
      expected: { x: 200, y: 101, ...side('tight') },
    },
  ])('centres a label in a lane $name', (c) => {
    expect(placedIn(c.lanes, c.steps)).toEqual(c.expected);
  });

  it('leaves a label whose route lies outside every lane', () => {
    expect(placedIn(twoColumns(), route([50, 300], [350, 300]))).toEqual(stays);
  });

  it.each([
    {
      name: 'narrower than the label',
      lanes: [lane('thin', 100, 0, 130, 200)],
      steps: route([115, 30], [115, 170]),
    },
    {
      name: 'shorter than the label',
      lanes: [lane('flat', 0, 93, 400, 107)],
      steps: route([50, 100], [350, 100]),
    },
  ])('leaves a label that cannot fit in a lane $name', (c) => {
    expect(placedIn(c.lanes, c.steps)).toEqual(stays);
  });
});
