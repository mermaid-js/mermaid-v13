// `sides` hints (D503) after layout: an edge that names a side is routed again round every node
// and the routes drawn before it (D718), and the nodes are made into obstacles only when such an
// edge comes. Pinned: one reroute, several in one graph, hints that name the sides layered took
// (drawn again, square), and a graph with no hints.
import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutGraph, LayoutModel, Point, Side } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

const r = (x: number): number => Math.round(x * 100) / 100;

function routes(m: LayoutModel): unknown {
  return {
    size: [r(m.width), r(m.height)],
    edges: Object.fromEntries(
      [...m.edges].map(([id, e]) => [
        id,
        `${e.points.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')} | ${e.ports.source}/${e.ports.target}`,
      ])
    ),
  };
}

function graph(edges: LayoutEdge[]): LayoutGraph {
  return {
    direction: 'TB',
    nodes: [
      { id: 'a', width: 80, height: 40 },
      { id: 'b', width: 60, height: 30 },
      { id: 'c', width: 70, height: 36 },
      { id: 'd', width: 50, height: 30 },
    ],
    edges,
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
  };
}

const CHAIN: LayoutEdge[] = [
  { id: 'ab', source: 'a', target: 'b', minLen: 1 },
  { id: 'bc', source: 'b', target: 'c', minLen: 1 },
  { id: 'ad', source: 'a', target: 'd', minLen: 1 },
];

describe('layered: side hints routed again round the nodes', () => {
  it('reroutes an edge whose hint moves its ends', () => {
    const g = graph([
      ...CHAIN,
      {
        id: 'ac',
        source: 'a',
        target: 'c',
        minLen: 1,
        sides: { source: 'right', target: 'right' },
      },
    ]);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.edges.get('ac')!.ports).toEqual({ source: 'right', target: 'right' });
    expect(routes(m)).toMatchSnapshot();
  });

  it('reroutes several edges in one graph, each round every node', () => {
    const g = graph([
      ...CHAIN,
      { id: 'ac', source: 'a', target: 'c', minLen: 1, sides: { source: 'left', target: 'left' } },
      { id: 'db', source: 'd', target: 'b', minLen: 1, sides: { source: 'top', target: 'right' } },
      {
        id: 'cd',
        source: 'c',
        target: 'd',
        minLen: 1,
        sides: { source: 'right', target: 'bottom' },
      },
    ]);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.edges.get('ac')!.ports).toEqual({ source: 'left', target: 'left' });
    expect(m.edges.get('db')!.ports).toEqual({ source: 'top', target: 'right' });
    expect(m.edges.get('cd')!.ports).toEqual({ source: 'right', target: 'bottom' });
    expect(routes(m)).toMatchSnapshot();
  });

  it('draws again, square, the edges whose hints name the sides layered took (D718)', () => {
    const g = graph(CHAIN.map((e) => ({ ...e, sides: { source: 'bottom', target: 'top' } })));
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    for (const e of m.edges.values()) {
      expect(e.ports).toEqual({ source: 'bottom', target: 'top' });
      const square = e.points.every((q, i) => {
        const p = e.points[i - 1];
        return !p || p.x === q.x || p.y === q.y;
      });
      expect(square).toBe(true);
    }
    expect(routes(m)).toMatchSnapshot();
  });

  it("leaves layered's model as it is with no hints", () => {
    expect(routes(layered(graph(CHAIN)))).toMatchSnapshot();
  });
});

// Named-side routes get lanes (D718, #1212): a route drawn again is a wall for the ones drawn
// after it, and the ends moved onto one side of a node are spread along it.
describe('layered: lanes for routes drawn again (D718)', () => {
  const CORNER = 12;
  interface Leg {
    at: number;
    from: number;
    to: number;
    h: boolean;
  }
  // The legs of a route, each as the line it runs on and the stretch it covers.
  const legs = (pts: readonly Point[]): Leg[] =>
    pts.slice(1).map((q, i) => {
      const p = pts[i]!;
      const h = Math.abs(p.y - q.y) < 1e-6;
      const [a, b] = h ? [p.x, q.x] : [p.y, q.y];
      return { at: h ? p.y : p.x, from: Math.min(a, b), to: Math.max(a, b), h };
    });
  // The longest stretch two routes run together, on one line or less than 8 px apart.
  const shared = (a: readonly Point[], b: readonly Point[]): number => {
    let most = 0;
    for (const u of legs(a))
      for (const v of legs(b))
        if (u.h === v.h && Math.abs(u.at - v.at) < 8)
          most = Math.max(most, Math.min(u.to, v.to) - Math.max(u.from, v.from));
    return most;
  };
  // The nodes other than its ends that a route runs through.
  const through = (m: LayoutModel, e: LayoutEdge): string[] => {
    const pts = m.edges.get(e.id)!.points;
    return [...m.nodes]
      .filter(([id]) => id !== e.source && id !== e.target)
      .filter(([, n]) =>
        pts.slice(1).some((q, i) => {
          const p = pts[i]!;
          return (
            Math.max(p.x, q.x) > n.x - n.width / 2 + 0.5 &&
            Math.min(p.x, q.x) < n.x + n.width / 2 - 0.5 &&
            Math.max(p.y, q.y) > n.y - n.height / 2 + 0.5 &&
            Math.min(p.y, q.y) < n.y + n.height / 2 - 0.5
          );
        })
      )
      .map(([id]) => id);
  };
  // `p` moved `d` towards `q`.
  const toward = (p: Point, q: Point, d: number): Point => {
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + ((q.x - p.x) * d) / len, y: p.y + ((q.y - p.y) * d) / len };
  };
  // Whether a route goes back the way it came in x or in y, leaving out its first and last
  // `CORNER`: the stubs straight out of the sides, which the sides choose.
  const doublesBack = (route: readonly Point[]): boolean => {
    const pts = [...route];
    const n = pts.length;
    pts[0] = toward(pts[0]!, pts[1]!, CORNER);
    pts[n - 1] = toward(pts[n - 1]!, pts[n - 2]!, CORNER);
    const signs = { x: new Set<number>(), y: new Set<number>() };
    for (let i = 1; i < n; i++)
      for (const k of ['x', 'y'] as const) {
        const d = pts[i]![k] - pts[i - 1]![k];
        if (Math.abs(d) > 1e-6) signs[k].add(Math.sign(d));
      }
    return signs.x.size > 1 || signs.y.size > 1;
  };
  // Architecture's shapes (#1212): a service is its 80 px icon over a label, a junction a bare
  // 80 px square, and every left or right end meets the icon's middle line.
  const service = (id: string) => ({ id, width: 80, height: 102, anchorY: 40 });
  const junction = (id: string) => ({ id, width: 80, height: 80, anchorY: 40 });
  const sided = (
    id: string,
    source: string,
    target: string,
    s: Side,
    t: Side,
    label = false
  ): LayoutEdge => ({
    id,
    source,
    target,
    minLen: 1,
    sides: { source: s, target: t },
    ...(label ? { label: { width: 44, height: 18 } } : {}),
  });
  const arch = (nodes: LayoutGraph['nodes'], edges: LayoutEdge[]): LayoutGraph => ({
    direction: 'TB',
    nodes,
    edges,
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 40,
  });
  // #1212's repro: a junction with a line on each side, the one below to a second junction.
  const junctionCross = (label = false): LayoutGraph =>
    arch(
      [service('top'), junction('j1'), junction('j2'), service('l'), service('r'), service('bot')],
      [
        sided('top-j1', 'top', 'j1', 'bottom', 'top', label),
        sided('j1-l', 'j1', 'l', 'left', 'right', label),
        sided('j1-r', 'j1', 'r', 'right', 'left', label),
        sided('j1-j2', 'j1', 'j2', 'bottom', 'top', label),
        sided('j2-bot', 'j2', 'bot', 'bottom', 'top', label),
      ]
    );
  // Two lines out of each side of a hub, to services in the rank below.
  const fan = (): LayoutGraph =>
    arch(['hub', 'a', 'b', 'c', 'd'].map(service), [
      sided('ha', 'hub', 'a', 'left', 'right'),
      sided('hb', 'hub', 'b', 'left', 'right'),
      sided('hc', 'hub', 'c', 'right', 'left'),
      sided('hd', 'hub', 'd', 'right', 'left'),
      sided('ad', 'a', 'd', 'bottom', 'top'),
    ]);
  // The edges drawn again: those whose route is not the one layered gives with no sides.
  const redrawn = (g: LayoutGraph, m: LayoutModel): LayoutEdge[] => {
    const free = layered({ ...g, edges: g.edges.map(({ sides: _, ...e }) => e) });
    const key = (x: LayoutModel, id: string) => JSON.stringify(x.edges.get(id)!.points);
    return g.edges.filter((e) => key(m, e.id) !== key(free, e.id));
  };

  // The fan's line to `d` still runs through `c`: a route has two corners from stub to stub,
  // which cannot go round `c` and reach `d` below it (GAPS T0b).
  it.each([
    ['the junction cross (#1212)', junctionCross(), true],
    ['the junction cross, labelled', junctionCross(true), true],
    ['a fan out of both sides of a hub', fan(), false],
  ])('keeps the routes drawn again apart: %s', (_, g, clear) => {
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    const again = redrawn(g, m);
    expect(again.length).toBeGreaterThan(1);
    for (const [i, e] of again.entries()) {
      if (clear) expect(through(m, e), `${e.id} runs through`).toEqual([]);
      for (const f of again.slice(0, i)) {
        const run = shared(m.edges.get(e.id)!.points, m.edges.get(f.id)!.points);
        expect(run, `${e.id} along ${f.id}`).toBeLessThanOrEqual(CORNER);
      }
    }
  });

  it.each([
    ['plain', false],
    ['labelled', true],
  ])('never doubles back in the junction cross (#1212, %s)', (_, label) => {
    const g = junctionCross(label);
    const m = layered(g);
    for (const e of g.edges) expect(doublesBack(m.edges.get(e.id)!.points), e.id).toBe(false);
  });

  it('spreads the ends on one side of a node along it, round the anchor line', () => {
    const m = layered(fan());
    const hub = m.nodes.get('hub')!;
    for (const [side, ids] of [
      ['left', ['ha', 'hb']],
      ['right', ['hc', 'hd']],
    ] as const) {
      const ys = ids.map((id) => m.edges.get(id)!.points[0]!.y);
      expect(Math.abs(ys[0]! - ys[1]!), side).toBeGreaterThanOrEqual(8);
      for (const y of ys) {
        expect(y, side).toBeGreaterThanOrEqual(hub.y - hub.height / 2 + CORNER);
        expect(y, side).toBeLessThanOrEqual(hub.y + hub.height / 2 - CORNER);
      }
      expect((ys[0]! + ys[1]!) / 2, side).toBeCloseTo(hub.y - hub.height / 2 + 40);
    }
  });

  it('puts the label of a route drawn again beside it, clear of every line and node', () => {
    const g = junctionCross(true);
    const m = layered(g);
    // How far a leg stays from a label's box: negative where it runs through it.
    const gap = (l: Leg, at: Point): number => {
      const [along, across] = l.h ? [at.x, at.y] : [at.y, at.x];
      const [half, depth] = l.h ? [22, 9] : [9, 22];
      const off = Math.max(l.from - along, along - l.to, 0);
      return Math.max(off - half, Math.abs(across - l.at) - depth);
    };
    for (const e of redrawn(g, m)) {
      const at = m.edges.get(e.id)!.label!;
      const own = Math.min(...legs(m.edges.get(e.id)!.points).map((l) => gap(l, at)));
      // Half a port pitch (8 px) off its own line.
      expect(own, e.id).toBeCloseTo(8);
      for (const f of m.edges.values())
        for (const l of legs(f.points)) expect(gap(l, at), e.id).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});
