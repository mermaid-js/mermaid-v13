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
import {
  cellFixtures,
  randomCellFixtures,
  randomGroupFixtures,
} from '../layout/layered/grid.fixtures.ts';
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

  // #42: an edge between a group and its own member ends on the group's top border, where it
  // meets the frame; that one cell is the edge's end, not a frame collision.
  it.each<[string, Spec['edges'][number]]>([
    [
      'member to its group',
      [
        'e',
        'A',
        'g',
        ['top', 'top'],
        [
          [4, 1],
          [4, 0],
        ],
      ],
    ],
    [
      'group to its member',
      [
        'e',
        'g',
        'A',
        ['top', 'top'],
        [
          [4, 0],
          [4, 1],
        ],
      ],
    ],
  ])('lets a %s edge end on the group border', (_, edge) => {
    const { graph, model } = build({
      width: 19,
      height: 6,
      groups: { g: [0, 0, 19, 6] },
      nodes: { A: [1, 2, 7, 3, 'g'], B: [10, 2, 8, 3, 'g'] },
      edges: [edge],
    });
    expect(routeCollisions(graph, model)).toEqual([]);
    const result = repairRoutes(graph, model);
    expect(result.repaired).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('still counts a run along the border before a group end', () => {
    const { graph, model } = build({
      width: 19,
      height: 6,
      groups: { g: [0, 0, 19, 6] },
      nodes: { A: [1, 2, 7, 3, 'g'], B: [10, 2, 8, 3, 'g'] },
      edges: [
        [
          'e',
          'A',
          'g',
          ['top', 'top'],
          [
            [4, 1],
            [4, 0],
            [7, 0],
          ],
        ],
      ],
    });
    expect(routeCollisions(graph, model).map((c) => [c.kind, c.cell])).toEqual([
      ['frame', { x: 4, y: 0 }],
      ['frame', { x: 5, y: 0 }],
      ['frame', { x: 6, y: 0 }],
    ]);
  });

  // Review of #45, findings 1, 2, 3, 5, 6.
  it('never doubles back into a stretch goal (review 1)', () => {
    const { graph, model } = build({
      width: 7,
      height: 14,
      nodes: {
        A: [0, 0, 5, 3],
        B: [0, 11, 5, 3],
        N: [2, 5, 1, 1],
        C: [1, 6, 1, 1],
        D: [3, 6, 1, 1],
      },
      edges: [
        [
          'e',
          'A',
          'B',
          ['bottom', 'top'],
          [
            [2, 3],
            [2, 10],
          ],
        ],
      ],
    });
    const result = repairRoutes(graph, model);
    expect(simple(result.routes.get('e')!)).toBe(true);
    expect(routeCollisions(graph, model, result.routes)).toEqual([]);
  });

  it.each<[string, Spec]>([
    [
      'its own run',
      {
        width: 14,
        height: 16,
        nodes: {
          A: [0, 0, 5, 3],
          B: [7, 13, 5, 3],
          W0: [3, 4, 1, 1],
          W1: [9, 5, 3, 1],
          W2: [2, 11, 3, 1],
          W3: [11, 5, 3, 1],
          W4: [11, 7, 2, 1],
          W5: [4, 8, 2, 1],
          W6: [7, 6, 2, 1],
        },
        edges: [
          [
            'e',
            'A',
            'B',
            ['bottom', 'top'],
            [
              [2, 3],
              [2, 5],
              [9, 5],
              [9, 12],
            ],
          ],
        ],
      },
    ],
    [
      'its own run, without a U-turn',
      {
        width: 14,
        height: 16,
        nodes: {
          A: [0, 0, 5, 3],
          B: [6, 13, 5, 3],
          W0: [12, 10, 3, 1],
          W1: [7, 9, 2, 1],
          W2: [9, 10, 1, 1],
          W3: [0, 6, 3, 1],
          W4: [10, 7, 1, 1],
        },
        edges: [
          [
            'e',
            'A',
            'B',
            ['bottom', 'top'],
            [
              [2, 3],
              [2, 8],
              [8, 8],
              [8, 12],
            ],
          ],
        ],
      },
    ],
  ])('never crosses %s (review 2)', (_, spec) => {
    const { graph, model } = build(spec);
    const result = repairRoutes(graph, model);
    const route = result.routes.get('e')!;
    expect(simple(route), JSON.stringify(route)).toBe(true);
  });

  it('reports a route that crosses itself (review 2)', () => {
    const { graph, model } = build({
      width: 12,
      height: 14,
      nodes: { A: [0, 0, 5, 3], B: [7, 11, 5, 3] },
      edges: [
        [
          'e',
          'A',
          'B',
          ['bottom', 'top'],
          [
            [2, 3],
            [2, 8],
          ],
        ],
      ],
    });
    const loop = pts([
      [2, 3],
      [2, 6],
      [5, 6],
      [5, 4],
      [3, 4],
      [3, 8],
      [9, 8],
      [9, 10],
    ]);
    expect(routeCollisions(graph, model, new Map([['e', loop]])).map((c) => c.kind)).toContain(
      'shared'
    );
  });

  it('rejects a route that is not orthogonal instead of hanging (review 3)', () => {
    const { graph, model } = build({
      width: 5,
      height: 14,
      nodes: { A: [0, 0, 5, 3], B: [0, 11, 5, 3] },
      edges: [
        [
          'e',
          'A',
          'B',
          ['bottom', 'top'],
          [
            [2, 3],
            [2, 10],
          ],
        ],
      ],
    });
    expect(() =>
      routeCollisions(
        graph,
        model,
        new Map([
          [
            'e',
            pts([
              [2, 3],
              [5, 4],
            ]),
          ],
        ])
      )
    ).toThrow(/not orthogonal/);
  });

  it.each([
    ['e1', 'e2'],
    ['e2', 'e1'],
  ])('sees overlapping labels whatever the edge order (review 5: %s first)', (first, second) => {
    const edges: Spec['edges'] = [
      [
        'e1',
        'A',
        'B',
        ['bottom', 'top'],
        [
          [1, 3],
          [1, 10],
        ],
        [1, 6, 3],
      ],
      [
        'e2',
        'A',
        'B',
        ['bottom', 'top'],
        [
          [3, 3],
          [3, 10],
        ],
        [3, 6, 3],
      ],
    ];
    const byId = new Map(edges.map((e) => [e[0], e]));
    const { graph, model } = build({
      width: 12,
      height: 14,
      nodes: { A: [0, 0, 8, 3], B: [0, 11, 8, 3] },
      edges: [byId.get(first)!, byId.get(second)!],
    });
    expect(routeCollisions(graph, model).map((c) => [c.edge, c.kind])).toContainEqual([
      'e2',
      'label',
    ]);
  });

  it('gives up on walled-in ends quickly among many boxes (review 6)', () => {
    const nodes: Spec['nodes'] = {};
    const edges: Spec['edges'] = [];
    let k = 0;
    for (let y = 20; y < 180; y += 4)
      for (let x = 2; x < 258; x += 4) nodes[`w${k++}`] = [x, y, 1, 1];
    for (let i = 0; i < 10; i++) {
      const x = 11 + i * 24;
      nodes[`A${i}`] = [x - 2, 0, 5, 3];
      nodes[`B${i}`] = [x - 2, 195, 5, 3];
      nodes[`L${i}`] = [x - 1, 193, 1, 2];
      nodes[`R${i}`] = [x + 1, 193, 1, 2];
      nodes[`T${i}`] = [x, 192, 1, 1];
      edges.push([
        `e${i}`,
        `A${i}`,
        `B${i}`,
        ['bottom', 'top'],
        [
          [x, 3],
          [x, 194],
        ],
      ]);
    }
    const { graph, model } = build({ width: 260, height: 200, nodes, edges });
    const t0 = Date.now();
    const result = repairRoutes(graph, model);
    // About 0.2 s with a cell lookup, 1.6 s with a scan over every node per probe.
    expect(Date.now() - t0).toBeLessThan(800);
    expect(result.unresolved.map((c) => c.with)).toContain('T0');
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
    const fixtures = [...cellFixtures(), ...randomCellFixtures(200), ...randomGroupFixtures(200)];
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
        expect(simple(route), `${name} ${id} visits a cell twice`).toBe(true);
        expect(route[0], `${name} ${id}`).toEqual({ x: points[0]!.x, y: points[0]!.y });
        const last = points[points.length - 1]!;
        expect(route[route.length - 1], `${name} ${id}`).toEqual({ x: last.x, y: last.y });
      }
    }
  });

  it('repairs every collision on the hand-built cell fixtures', () => {
    for (const { name, graph } of cellFixtures()) {
      const model = layered(graph);
      const left = routeCollisions(graph, model, repairRoutes(graph, model).routes);
      expect(
        left.map((c) => `${c.edge} ${c.kind} ${c.cell.x},${c.cell.y} ${c.with}`),
        name
      ).toEqual([]);
    }
  });
});

// No cell twice: a route never doubles back over itself.
function simple(route: readonly Point[]): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < route.length; i++) {
    const p = route[i]!;
    const q = route[i - 1] ?? p;
    const dx = Math.sign(p.x - q.x);
    const dy = Math.sign(p.y - q.y);
    for (let x = q.x, y = q.y; ; x += dx, y += dy) {
      if (i === 0 || x !== q.x || y !== q.y) {
        if (seen.has(`${x},${y}`)) return false;
        seen.add(`${x},${y}`);
      }
      if (x === p.x && y === p.y) break;
    }
  }
  return true;
}

function square(route: readonly Point[]): boolean {
  return route.every((p, i) => {
    const q = route[i - 1];
    return !q || (p.x === q.x) !== (p.y === q.y);
  });
}
