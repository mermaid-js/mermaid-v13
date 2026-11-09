import { describe, expect, it } from 'vitest';
import type {
  Dir,
  EdgeRouting,
  LayoutEdge,
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelNode,
  Point,
  Side,
} from '../types.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';
import { handBuiltFixtures } from './layered.fixtures.ts';

// `LayoutEdge.sides` as hints (D327, D503): `layered` keeps its ranks and node order and uses a
// named side only to choose where the route leaves and enters the node, and the `ports` it reports.

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
const DIRS: readonly Dir[] = ['TB', 'BT', 'LR', 'RL'];
const ROUTINGS: readonly EdgeRouting[] = ['curved', 'stepped', 'straight'];
const EPS = 1e-6;
// Matrix routes that still cross an end box (the lane goes round one box, not both).
const CROSSED = 4;

function graph(
  edges: LayoutEdge[],
  direction: Dir = 'TB',
  routing: EdgeRouting = 'curved',
  extra: Partial<LayoutGraph> = {}
): LayoutGraph {
  return {
    direction,
    routing,
    nodes: [
      { id: 'a', width: 80, height: 40 },
      { id: 'b', width: 60, height: 30 },
      { id: 'c', width: 70, height: 36 },
    ],
    edges,
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
    ...extra,
  };
}

// The edges of the base graph: a chain a → b → c, plus a → c spanning two ranks.
function chain(sides?: LayoutEdge['sides'], at = 'ab', label = false): LayoutEdge[] {
  const edge = (id: string, source: string, target: string): LayoutEdge => ({
    id,
    source,
    target,
    minLen: 1,
    ...(id === at && sides ? { sides } : {}),
    ...(id === at && label ? { label: { width: 40, height: 16 } } : {}),
  });
  return [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('ac', 'a', 'c')];
}

// Whether `p` lies on `side` of the box and the route runs on from it out of that side: straight
// out where `layered` moved the end (`square`), and at least not back into the box for an end it
// placed there itself (a curved route leaves along an S).
function leaves(box: LayoutModelNode, side: Side, p: Point, q: Point, square: boolean): boolean {
  const l = box.x - box.width / 2;
  const r = box.x + box.width / 2;
  const t = box.y - box.height / 2;
  const b = box.y + box.height / 2;
  const onX = (y: number) => p.x >= l - EPS && p.x <= r + EPS && Math.abs(p.y - y) < EPS;
  const onY = (x: number) => p.y >= t - EPS && p.y <= b + EPS && Math.abs(p.x - x) < EPS;
  const level = (u: number, v: number) => !square || Math.abs(u - v) < EPS;
  switch (side) {
    case 'top':
      return onX(t) && level(q.x, p.x) && q.y < p.y;
    case 'bottom':
      return onX(b) && level(q.x, p.x) && q.y > p.y;
    case 'left':
      return onY(l) && level(q.y, p.y) && q.x < p.x;
    case 'right':
      return onY(r) && level(q.y, p.y) && q.x > p.x;
  }
}

function expectSides(g: LayoutGraph, m: LayoutModel, id: string, s: Side, t: Side): void {
  const e = g.edges.find((x) => x.id === id)!;
  const placed: LayoutModelEdge = m.edges.get(id)!;
  const pts = placed.points;
  expect(placed.ports).toEqual({ source: s, target: t });
  const n = pts.length;
  // Where `layered` already took the side, the end is its own; else it was moved.
  const free = layered({ ...g, edges: g.edges.map(({ sides: _, ...x }) => x) }).edges.get(id)!;
  const square = g.routing === 'stepped';
  const out = leaves(
    m.nodes.get(e.source)!,
    s,
    pts[0]!,
    pts[1]!,
    square || free.ports.source !== s
  );
  expect(out, `${id} leaves ${s}`).toBe(true);
  const back = pts[n - 2]!;
  const into = leaves(
    m.nodes.get(e.target)!,
    t,
    pts[n - 1]!,
    back,
    square || free.ports.target !== t
  );
  expect(into, `${id} enters ${t}`).toBe(true);
}

// Whether a straight leg of edge `id` runs through either end's box (the two-bend join cannot
// always go round: a known limit, GAPS T0b).
function crossesEnd(g: LayoutGraph, m: LayoutModel, id: string): boolean {
  const e = g.edges.find((x) => x.id === id)!;
  const pts = m.edges.get(id)!.points;
  return [m.nodes.get(e.source)!, m.nodes.get(e.target)!].some((box) =>
    pts.some((q, i) => {
      const p = pts[i - 1];
      if (!p || (Math.abs(p.x - q.x) > EPS && Math.abs(p.y - q.y) > EPS)) return false;
      return (
        Math.max(p.x, q.x) > box.x - box.width / 2 + 0.5 &&
        Math.min(p.x, q.x) < box.x + box.width / 2 - 0.5 &&
        Math.max(p.y, q.y) > box.y - box.height / 2 + 0.5 &&
        Math.min(p.y, q.y) < box.y + box.height / 2 - 0.5
      );
    })
  );
}

// Node centres relative to node `a`: the same whatever the sides, since ranks and order stay.
function placement(m: LayoutModel): Record<string, Point> {
  const a = m.nodes.get('a')!;
  return Object.fromEntries(
    [...m.nodes].map(([id, n]) => [id, { x: n.x - a.x, y: n.y - a.y }] as const)
  );
}

const plain = (m: LayoutModel): unknown => ({
  ...m,
  nodes: [...m.nodes],
  edges: [...m.edges],
  groups: [...m.groups],
});

describe('layered reads LayoutEdge.sides as hints (D503)', () => {
  // Every side at each end, on an edge in rank order (a → b) and against it (b → a).
  const cases = DIRS.flatMap((dir) =>
    ROUTINGS.flatMap((routing) =>
      SIDES.flatMap((s) =>
        SIDES.flatMap((t) => [
          [dir, routing, s, t, false] as const,
          [dir, routing, s, t, true] as const,
        ])
      )
    )
  );

  it.each(cases)('%s %s: %s → %s (against rank order: %s)', (dir, routing, s, t, against) => {
    const base = chain();
    const sided = chain({ source: s, target: t });
    if (against) {
      for (const list of [base, sided]) {
        list[0] = { ...list[0]!, source: 'b', target: 'a' };
      }
    }
    const g = graph(sided, dir, routing);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expectSides(g, m, 'ab', s, t);
    expect(placement(m)).toEqual(placement(layered(graph(base, dir, routing))));
  });

  it('records how many matrix routes still cross an end box (GAPS T0b)', () => {
    const crossed = cases.filter(([dir, routing, s, t, against]) => {
      const sided = chain({ source: s, target: t });
      if (against) sided[0] = { ...sided[0]!, source: 'b', target: 'a' };
      const g = graph(sided, dir, routing);
      return crossesEnd(g, layered(g), 'ab');
    });
    expect(crossed.length).toBe(CROSSED);
  });

  it.each(SIDES)('honours a side named at one end only (%s), keeping the other', (side) => {
    for (const which of ['source', 'target'] as const) {
      const g = graph(chain({ [which]: side }));
      const m = layered(g);
      const free = layered(graph(chain())).edges.get('ab')!.ports;
      expect(validateLayout(g, m)).toEqual([]);
      expect(m.edges.get('ab')!.ports).toEqual({ ...free, [which]: side });
      const want = { ...free, [which]: side };
      expectSides(g, m, 'ab', want.source, want.target);
    }
  });

  it.each(ROUTINGS)('keeps the label where layered put it (%s)', (routing) => {
    for (const s of SIDES) {
      const g = graph(chain({ source: s, target: 'right' }, 'ab', true), 'TB', routing);
      const m = layered(g);
      const free = layered(graph(chain(undefined, 'ab', true), 'TB', routing));
      expect(validateLayout(g, m)).toEqual([]);
      expectSides(g, m, 'ab', s, 'right');
      const rel = (x: LayoutModel): Point => {
        const a = x.nodes.get('a')!;
        const l = x.edges.get('ab')!.label!;
        return { x: l.x - a.x, y: l.y - a.y };
      };
      expect(rel(m), s).toEqual(rel(free));
    }
  });

  it('leaves room for markers and the arrowhead before the first bend, labels clear', () => {
    const marker = { length: 30, width: 12 };
    // Ends `layered` would not put on these sides in TB, so both move.
    for (const [s, t] of [
      ['top', 'bottom'],
      ['left', 'left'],
      ['right', 'right'],
      ['left', 'bottom'],
    ] as const) {
      const edges = chain({ source: s, target: t }).map((e) =>
        e.id === 'ab'
          ? {
              ...e,
              startMarker: marker,
              endMarker: marker,
              label: { width: 30, height: 14 },
              startLabel: { width: 10, height: 14 },
              endLabel: { width: 14, height: 14 },
            }
          : e
      );
      // Padding wide enough that no stub is cut short at the drawing's edge (GAPS T0b).
      const g = graph(edges, 'TB', 'stepped', { headRoom: 10, diagramPadding: 120 });
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      expectSides(g, m, 'ab', s, t);
      const pts = m.edges.get('ab')!.points;
      const n = pts.length;
      const len = (p: Point, q: Point) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
      expect(len(pts[0]!, pts[1]!)).toBeGreaterThanOrEqual(marker.length);
      expect(len(pts[n - 1]!, pts[n - 2]!)).toBeGreaterThanOrEqual(marker.length);
    }
  });

  it.todo(
    'spreads every end on a side apart: dropped for size (T0b rework); a moved end goes to the ' +
      "side's middle and may meet another end there (GAPS T0b)"
  );

  it('meets left and right sides at anchorY when the node sets one (D501)', () => {
    const g = graph(chain({ source: 'right', target: 'left' }));
    g.nodes[0] = { ...g.nodes[0]!, anchorY: 10 };
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    const a = m.nodes.get('a')!;
    expect(m.edges.get('ab')!.points[0]!.y).toBeCloseTo(a.y - a.height / 2 + 10);
  });

  it.each(SIDES.flatMap((s) => SIDES.map((t) => [s, t] as const)))(
    'draws a self-loop from %s to %s, its label where layered put it',
    (s, t) => {
      const g = graph([
        ...chain(),
        { id: 'aa', source: 'a', target: 'a', minLen: 1, sides: { source: s, target: t } },
        {
          id: 'bb',
          source: 'b',
          target: 'b',
          minLen: 1,
          sides: { source: s, target: t },
          label: { width: 20, height: 12 },
        },
      ]);
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      expectSides(g, m, 'aa', s, t);
      expectSides(g, m, 'bb', s, t);
    }
  );

  it('moves an end on a group to the side named', () => {
    const g: LayoutGraph = {
      ...graph([
        {
          id: 'xg',
          source: 'x',
          target: 'g',
          minLen: 1,
          sides: { source: 'right', target: 'left' },
        },
      ]),
      nodes: [
        { id: 'x', width: 60, height: 30 },
        { id: 'y', width: 60, height: 30, parent: 'g' },
      ],
      groups: [{ id: 'g', padding: { top: 10, right: 10, bottom: 10, left: 10 } }],
    };
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    const placed = m.edges.get('xg')!;
    expect(placed.ports).toEqual({ source: 'right', target: 'left' });
    const box = m.groups.get('g')!;
    const end = placed.points.at(-1)!;
    expect(end.x).toBeCloseTo(box.x - box.width / 2);
  });

  it('changes nothing where the sides named are the ones layered took', () => {
    for (const dir of DIRS) {
      const free = layered(graph(chain(), dir));
      const ports = free.edges.get('ab')!.ports;
      expect(plain(layered(graph(chain({ ...ports }), dir)))).toEqual(plain(free));
    }
  });

  it.todo(
    'refuses an unknown side with a RangeError: dropped for size (T0b rework); `Side` is typed ' +
      'and only compass checks it (GAPS T0b)'
  );

  it('ignores sides on the grid (D140)', () => {
    const cells = { grid: 1, spacing: { node: 4, rank: 4, edge: 2 }, diagramPadding: 1 };
    const sized = (edges: LayoutEdge[]): LayoutGraph => ({
      ...graph(edges, 'TB', 'stepped', cells),
      nodes: [
        { id: 'a', width: 7, height: 3 },
        { id: 'b', width: 7, height: 3 },
        { id: 'c', width: 7, height: 3 },
      ],
    });
    expect(plain(layered(sized(chain({ source: 'left', target: 'right' }))))).toEqual(
      plain(layered(sized(chain())))
    );
  });

  it('keeps every hand-built fixture valid with sides opposite to the flow', () => {
    const away: Record<Dir, [Side, Side]> = {
      TB: ['top', 'bottom'],
      BT: ['bottom', 'top'],
      LR: ['left', 'right'],
      RL: ['right', 'left'],
    };
    for (const f of handBuiltFixtures()) {
      if (f.graph.grid) continue;
      const [source, target] = away[f.graph.direction];
      const g: LayoutGraph = {
        ...f.graph,
        edges: f.graph.edges.map((e) => ({ ...e, sides: { source, target } })),
      };
      const m = layered(g);
      expect(validateLayout(g, m), f.name).toEqual([]);
      for (const e of g.edges) {
        if (e.source === e.target) continue;
        const ports = m.edges.get(e.id)!.ports;
        // Ends between a group and its own member keep layered's route.
        const nested = (inner: string, outer: string): boolean => {
          let p = g.nodes.find((n) => n.id === inner)?.parent;
          p ??= g.groups.find((x) => x.id === inner)?.parent;
          while (p !== undefined) {
            if (p === outer) return true;
            p = g.groups.find((x) => x.id === p)?.parent;
          }
          return false;
        };
        if (nested(e.source, e.target) || nested(e.target, e.source)) continue;
        expect(ports, `${f.name} ${e.id}`).toEqual({ source, target });
      }
    }
  });
});
