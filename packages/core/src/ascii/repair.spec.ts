import { describe, expect, it } from 'vitest';
import type {
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  LayoutModelEdge,
  Point,
  RoutePoint,
  Side,
} from '../layout/types.ts';
import { cellFixtures, randomCellFixtures } from '../layout/layered/grid.fixtures.ts';
import { layered } from '../layout/layered/index.ts';
import { repairRoutes, routeCollisions, type CollisionKind } from './repair.ts';

// Hand-built cell models (grid: 1): coordinates are cell indices. A node is given by its top-left
// cell and size, a route by its corner cells.
interface Spec {
  width: number;
  height: number;
  nodes: Record<string, [x: number, y: number, w: number, h: number, parent?: string]>;
  groups?: Record<string, [x: number, y: number, w: number, h: number, parent?: string]>;
  edges: [
    id: string,
    source: string,
    target: string,
    ports: [Side, Side],
    route: [number, number][],
    label?: [x: number, y: number, w: number],
  ][];
}

function build(spec: Spec): { graph: LayoutGraph; model: LayoutModel } {
  const box = ([x, y, w, h]: [number, number, number, number, string?]) => ({
    x: x + w / 2 - 0.5,
    y: y + h / 2 - 0.5,
    width: w,
    height: h,
  });
  const groups: LayoutGroup[] = Object.entries(spec.groups ?? {}).map(([id, g]) => ({
    id,
    padding: { top: 1, right: 1, bottom: 1, left: 1 },
    ...(g[4] ? { parent: g[4] } : {}),
  }));
  const graph: LayoutGraph = {
    direction: 'TB',
    nodes: Object.entries(spec.nodes).map(([id, n]) => ({
      id,
      width: n[2],
      height: n[3],
      ...(n[4] ? { parent: n[4] } : {}),
    })),
    edges: spec.edges.map(([id, source, target, , , label]) => ({
      id,
      source,
      target,
      minLen: 1,
      ...(label ? { label: { width: label[2], height: 1 } } : {}),
    })),
    groups,
    spacing: { node: 2, rank: 4, edge: 1 },
    routing: 'stepped',
    grid: 1,
  };
  const model: LayoutModel = {
    width: spec.width,
    height: spec.height,
    direction: 'TB',
    nodes: new Map(Object.entries(spec.nodes).map(([id, n]) => [id, box(n)])),
    groups: new Map(
      Object.entries(spec.groups ?? {}).map(([id, g]) => {
        const b = box(g);
        return [id, { ...b, title: { x: b.x, y: g[1] } }];
      })
    ),
    edges: new Map(
      spec.edges.map(([id, , , [source, target], route, label]): [string, LayoutModelEdge] => [
        id,
        {
          ports: { source, target },
          points: route.map(([x, y], i): RoutePoint => {
            const prev = route[i - 1];
            return { x, y, axis: prev && prev[1] === y ? 'h' : 'v' };
          }),
          ...(label ? { label: { x: label[0] + label[2] / 2 - 0.5, y: label[1] } } : {}),
        },
      ])
    ),
  };
  return { graph, model };
}

const pts = (route: [number, number][]): Point[] => route.map(([x, y]) => ({ x, y }));

describe('repairRoutes (D78, R-ASCII-1)', () => {
  it('leaves a clean route as the engine drew it', () => {
    const { graph, model } = build({
      width: 5,
      height: 10,
      nodes: { A: [0, 0, 5, 3], B: [0, 7, 5, 3] },
      edges: [
        [
          'e',
          'A',
          'B',
          ['bottom', 'top'],
          [
            [2, 3],
            [2, 6],
          ],
        ],
      ],
    });
    const result = repairRoutes(graph, model);
    expect(result.routes.get('e')).toEqual(
      pts([
        [2, 3],
        [2, 6],
      ])
    );
    expect(result.repaired).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('routes a segment that runs through a box around it', () => {
    // A over C over B; the edge A→B drops straight through C.
    const { graph, model } = build({
      width: 9,
      height: 17,
      nodes: { A: [2, 0, 5, 3], C: [2, 7, 5, 3], B: [2, 14, 5, 3] },
      edges: [
        [
          'e',
          'A',
          'B',
          ['bottom', 'top'],
          [
            [4, 3],
            [4, 13],
          ],
        ],
      ],
    });
    expect(routeCollisions(graph, model).map((c) => c.kind)).toContain('box');
    const result = repairRoutes(graph, model);
    expect(result.repaired).toEqual(['e']);
    expect(result.unresolved).toEqual([]);
    expect(routeCollisions(graph, model, result.routes)).toEqual([]);
    const route = result.routes.get('e')!;
    expect(route[0]).toEqual({ x: 4, y: 3 });
    expect(route[route.length - 1]).toEqual({ x: 4, y: 13 });
  });

  // One case per collision kind (research/ascii-snapping.md, "What the repair router has to
  // cover"): the snapped routes collide, the repaired ones do not, and the ends stay put.
  it.each<[string, CollisionKind, Spec, string]>([
    [
      'another edge’s label',
      'label',
      {
        width: 22,
        height: 17,
        nodes: { A: [2, 0, 5, 3], B: [2, 14, 5, 3], X: [12, 0, 5, 3], Y: [12, 14, 5, 3] },
        edges: [
          [
            'f',
            'X',
            'Y',
            ['bottom', 'top'],
            [
              [14, 3],
              [14, 13],
            ],
            [2, 8, 5],
          ],
          [
            'e',
            'A',
            'B',
            ['bottom', 'top'],
            [
              [4, 3],
              [4, 13],
            ],
          ],
        ],
      },
      'e',
    ],
    [
      'a run along a group frame (padding 1 leaves no lane)',
      'frame',
      {
        width: 20,
        height: 17,
        groups: { g: [0, 0, 13, 9] },
        nodes: { A: [2, 2, 5, 3, 'g'], B: [12, 14, 5, 3] },
        edges: [
          [
            'e',
            'A',
            'B',
            ['bottom', 'top'],
            [
              [4, 5],
              [4, 8],
              [14, 8],
              [14, 13],
            ],
          ],
        ],
      },
      'e',
    ],
    [
      'a frame crossed with no reason',
      'frame',
      {
        width: 14,
        height: 17,
        groups: { g: [0, 5, 9, 7] },
        nodes: { A: [0, 0, 5, 3], B: [0, 14, 5, 3] },
        edges: [
          [
            'e',
            'A',
            'B',
            ['bottom', 'top'],
            [
              [2, 3],
              [2, 13],
            ],
          ],
        ],
      },
      'e',
    ],
    [
      'a group’s edge to its own member, through another member',
      'box',
      {
        width: 13,
        height: 15,
        groups: { g: [0, 4, 13, 11] },
        nodes: { X: [4, 6, 5, 3, 'g'], In: [4, 10, 5, 3, 'g'] },
        edges: [
          [
            'e',
            'g',
            'In',
            ['top', 'top'],
            [
              [6, 3],
              [6, 9],
            ],
          ],
        ],
      },
      'e',
    ],
    [
      'unrelated edges sharing a track',
      'shared',
      {
        width: 13,
        height: 13,
        nodes: { A: [0, 0, 5, 3], B: [8, 0, 5, 3], C: [0, 10, 5, 3], D: [8, 10, 5, 3] },
        edges: [
          [
            'e1',
            'A',
            'D',
            ['bottom', 'top'],
            [
              [2, 3],
              [2, 6],
              [10, 6],
              [10, 9],
            ],
          ],
          [
            'e2',
            'B',
            'C',
            ['bottom', 'top'],
            [
              [11, 3],
              [11, 6],
              [3, 6],
              [3, 9],
            ],
          ],
        ],
      },
      'e2',
    ],
    [
      'fan-out siblings sharing a track (D140: kept apart, not merged)',
      'shared',
      {
        width: 22,
        height: 13,
        nodes: { A: [0, 0, 9, 3], B: [10, 10, 5, 3], C: [16, 10, 5, 3] },
        edges: [
          [
            'e1',
            'A',
            'B',
            ['bottom', 'top'],
            [
              [3, 3],
              [3, 6],
              [12, 6],
              [12, 9],
            ],
          ],
          [
            'e2',
            'A',
            'C',
            ['bottom', 'top'],
            [
              [5, 3],
              [5, 6],
              [18, 6],
              [18, 9],
            ],
          ],
        ],
      },
      'e2',
    ],
    [
      'a corner touch, which reads as a connection',
      'corner',
      {
        width: 18,
        height: 13,
        nodes: { A: [6, 0, 5, 3], D: [12, 10, 5, 3], P: [0, 5, 5, 3], Q: [6, 10, 5, 3] },
        edges: [
          [
            'e1',
            'A',
            'D',
            ['bottom', 'top'],
            [
              [8, 3],
              [8, 6],
              [14, 6],
              [14, 9],
            ],
          ],
          [
            'e2',
            'P',
            'Q',
            ['right', 'top'],
            [
              [5, 6],
              [8, 6],
              [8, 9],
            ],
          ],
        ],
      },
      'e2',
    ],
  ])('repairs %s', (_, kind, spec, edge) => {
    const { graph, model } = build(spec);
    expect(routeCollisions(graph, model).map((c) => [c.edge, c.kind])).toContainEqual([edge, kind]);
    const result = repairRoutes(graph, model);
    expect(result.unresolved).toEqual([]);
    expect(result.repaired).toEqual([edge]);
    expect(routeCollisions(graph, model, result.routes)).toEqual([]);
    for (const [id, route] of result.routes) {
      const snapped = model.edges.get(id)!.points;
      expect(route[0]).toEqual({ x: snapped[0]!.x, y: snapped[0]!.y });
      const last = snapped[snapped.length - 1]!;
      expect(route[route.length - 1]).toEqual({ x: last.x, y: last.y });
    }
  });

  it('lets edges cross at right angles', () => {
    const { graph, model } = build({
      width: 17,
      height: 13,
      nodes: { A: [6, 0, 5, 3], B: [6, 10, 5, 3], P: [0, 5, 5, 3], Q: [12, 5, 5, 3] },
      edges: [
        [
          'e1',
          'A',
          'B',
          ['bottom', 'top'],
          [
            [8, 3],
            [8, 9],
          ],
        ],
        [
          'e2',
          'P',
          'Q',
          ['right', 'left'],
          [
            [5, 6],
            [11, 6],
          ],
        ],
      ],
    });
    expect(routeCollisions(graph, model)).toEqual([]);
    expect(repairRoutes(graph, model).repaired).toEqual([]);
  });

  it('keeps a self-loop’s layout shape and reports what it runs into', () => {
    const { graph, model } = build({
      width: 10,
      height: 5,
      nodes: { A: [0, 0, 5, 5], X: [7, 2, 3, 3] },
      edges: [
        [
          'loop',
          'A',
          'A',
          ['right', 'right'],
          [
            [5, 1],
            [7, 1],
            [7, 3],
            [5, 3],
          ],
        ],
      ],
    });
    const result = repairRoutes(graph, model);
    expect(result.routes.get('loop')).toEqual(
      pts([
        [5, 1],
        [7, 1],
        [7, 3],
        [5, 3],
      ])
    );
    expect(result.repaired).toEqual([]);
    expect(result.unresolved.map((c) => [c.kind, c.with])).toContainEqual(['box', 'X']);
  });

  it('keeps the snapped stretch and reports it when there is no lane', () => {
    const { graph, model } = build({
      width: 5,
      height: 17,
      nodes: { A: [0, 0, 5, 3], C: [0, 7, 5, 3], B: [0, 14, 5, 3] },
      edges: [
        [
          'e',
          'A',
          'B',
          ['bottom', 'top'],
          [
            [2, 3],
            [2, 13],
          ],
        ],
      ],
    });
    const result = repairRoutes(graph, model);
    expect(result.routes.get('e')).toEqual(
      pts([
        [2, 3],
        [2, 13],
      ])
    );
    expect(result.repaired).toEqual([]);
    expect(new Set(result.unresolved.map((c) => `${c.kind} ${c.with}`))).toEqual(
      new Set(['box C'])
    );
  });

  // The engine's own routes on the cell fixtures (#42): after repair, no edge passes through a box
  // or another edge's label, every route stays square with its ends in place, and whatever is
  // left is reported (R-ASCII-1; the corpus property is #48's).
  it('repairs the engine routes on the cell fixtures', () => {
    const fixtures = [...cellFixtures(), ...randomCellFixtures(200)];
    const edgeIds = new Set(fixtures.flatMap((f) => f.graph.edges.map((e) => e.id)));
    for (const { name, graph } of fixtures) {
      const model = layered(graph);
      const result = repairRoutes(graph, model);
      const left = routeCollisions(graph, model, result.routes);
      expect(
        left.filter((c) => c.kind === 'box' || (c.kind === 'label' && edgeIds.has(c.with))),
        name
      ).toEqual([]);
      expect(left.length, name).toBeLessThanOrEqual(result.unresolved.length);
      for (const [id, route] of result.routes) {
        const points = model.edges.get(id)!.points;
        expect(square(route), `${name} ${id}`).toBe(true);
        expect(route[0], `${name} ${id}`).toEqual({ x: points[0]!.x, y: points[0]!.y });
        const last = points[points.length - 1]!;
        expect(route[route.length - 1], `${name} ${id}`).toEqual({ x: last.x, y: last.y });
      }
    }
  });

  it('repairs every collision on the hand-built cell fixtures', () => {
    for (const { name, graph } of cellFixtures()) {
      const model = layered(graph);
      expect(routeCollisions(graph, model, repairRoutes(graph, model).routes), name).toEqual([]);
    }
  });
});

function square(route: readonly Point[]): boolean {
  return route.every((p, i) => {
    const q = route[i - 1];
    return !q || (p.x === q.x) !== (p.y === q.y);
  });
}
