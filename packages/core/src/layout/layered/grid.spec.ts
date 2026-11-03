import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { validateGrid } from '../validate-grid.ts';
import { cellFixtures, randomCellFixtures, randomGroupFixtures } from './grid.fixtures.ts';
import { layered } from './index.ts';

// DDLT-style checks on cell graphs with `grid: 1` (D78, D140), through `validateGrid`: whole
// cells, square segments, each edge end in a cell of its own off a box corner.
const FIXTURES = [...cellFixtures(), ...randomCellFixtures(60), ...randomGroupFixtures(120)];

// Besides `validateGrid`: no route point other than its ends sits in a node box.
function problems(graph: LayoutGraph, model: LayoutModel): string[] {
  const out = validateGrid(graph, model);
  for (const [id, e] of model.edges) {
    for (const p of e.points) {
      for (const [nid, b] of model.nodes) {
        if (Math.abs(p.x - b.x) < b.width / 2 && Math.abs(p.y - b.y) < b.height / 2)
          out.push(`edge '${id}' has a point in '${nid}'`);
      }
    }
  }
  return out;
}

// Route cells on a group's top border row under its title (cells round(x − w/2 + ½) on, `width`
// of them): the title is text, so no edge may end or cross there. An edge of the group's own
// that leaves or enters its top side ends on the cell above the border: the border cell under that
// end is where the drawing puts its tee, so it must not be under the title either.
function underTitles(graph: LayoutGraph, model: LayoutModel): string[] {
  const out: string[] = [];
  for (const g of graph.groups) {
    const placed = model.groups.get(g.id)!;
    if (!g.title || g.title.width <= 0) continue;
    const row = placed.y - placed.height / 2 + 0.5;
    const lo = Math.round(placed.title.x - g.title.width / 2 + 0.5);
    const hi = lo + g.title.width - 1;
    for (const e of graph.edges) {
      const placedEdge = model.edges.get(e.id)!;
      const ends = [
        [e.source, placedEdge.ports.source, placedEdge.points[0]!],
        [e.target, placedEdge.ports.target, placedEdge.points.at(-1)!],
      ] as const;
      for (const [end, side, p] of ends)
        if (end === g.id && side === 'top' && lo <= p.x && p.x <= hi)
          out.push(`edge '${e.id}' ends on the title of '${g.id}'`);
    }
    for (const [id, e] of model.edges) {
      const p = e.points;
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)]!;
        const b = p[i]!;
        const xs = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        const ys = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        if (ys[0]! <= row && row <= ys[1]! && xs[0]! <= hi && lo <= xs[1]!)
          out.push(`edge '${id}' meets the title of '${g.id}'`);
      }
    }
  }
  return [...new Set(out)];
}

// Blank cells between each group's frame (its outermost cells) and each direct member, short of
// the group's `padding` on any side.
function tightFrames(graph: LayoutGraph, model: LayoutModel): string[] {
  const out: string[] = [];
  const cells = (b: { x: number; y: number; width: number; height: number }) => ({
    left: b.x - b.width / 2 + 0.5,
    top: b.y - b.height / 2 + 0.5,
    right: b.x + b.width / 2 - 0.5,
    bottom: b.y + b.height / 2 - 0.5,
  });
  const members = [
    ...graph.nodes.map((n) => [n.id, n.parent, model.nodes.get(n.id)!] as const),
    ...graph.groups.map((g) => [g.id, g.parent, model.groups.get(g.id)!] as const),
  ];
  for (const g of graph.groups) {
    const f = cells(model.groups.get(g.id)!);
    for (const [id, parent, box] of members) {
      if (parent !== g.id) continue;
      const m = cells(box);
      const blank = {
        left: m.left - f.left - 1,
        right: f.right - m.right - 1,
        top: m.top - f.top - 1,
        bottom: f.bottom - m.bottom - 1,
      };
      for (const side of ['left', 'right', 'top', 'bottom'] as const)
        if (blank[side] < g.padding[side])
          out.push(`'${id}' is ${blank[side]} cells from the ${side} of '${g.id}'`);
    }
  }
  return out;
}

describe('layered: grid (cells)', () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))(
    '%s keeps group padding in blank cells inside the frame',
    (_, fixture) => {
      expect(tightFrames(fixture.graph, layered(fixture.graph))).toEqual([]);
    }
  );

  it.each([...FIXTURES, ...randomGroupFixtures(200)].map((f) => [f.name, f] as const))(
    '%s keeps edges off group titles',
    (_, fixture) => {
      expect(underTitles(fixture.graph, layered(fixture.graph))).toEqual([]);
    }
  );

  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s lies on the grid', (_, fixture) => {
    expect(problems(fixture.graph, layered(fixture.graph))).toEqual([]);
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s never shrinks a box', (_, fixture) => {
    const model = layered(fixture.graph);
    for (const n of fixture.graph.nodes) {
      const b = model.nodes.get(n.id)!;
      expect(b.width).toBeGreaterThanOrEqual(n.width);
      expect(b.height).toBeGreaterThanOrEqual(n.height);
    }
  });

  // Final #37 review (golden `subgraph_three_levels_nested`): a frame its title makes wider than
  // its content keeps the content centred, the same blank cells left and right.
  it.each(['LR', 'TB'] as const)('centres a member in a frame widened by its title (%s)', (dir) => {
    const graph = FIXTURES.find((f) => f.name === 'title over a group edge end TB')!.graph;
    const g: LayoutGraph = {
      ...graph,
      direction: dir,
      nodes: [{ id: 'A', width: 5, height: 3, parent: 'level3' }],
      edges: [],
      groups: [
        {
          id: 'level3',
          padding: { top: 0, right: 1, bottom: 1, left: 1 },
          title: { width: 6, height: 1 },
        },
      ],
    };
    const model = layered(g);
    const frame = model.groups.get('level3')!;
    const a = model.nodes.get('A')!;
    const left = a.x - a.width / 2 - (frame.x - frame.width / 2);
    const right = frame.x + frame.width / 2 - (a.x + a.width / 2);
    expect(left).toBe(right);
  });

  it('keeps one-line boxes in a chain at their size', () => {
    const fixture = FIXTURES.find((f) => f.name === 'chain TB')!;
    const model = layered(fixture.graph);
    for (const n of fixture.graph.nodes)
      expect(model.nodes.get(n.id)).toMatchObject({ width: n.width, height: n.height });
  });

  it('draws a straight edge between odd and even boxes in one column', () => {
    const model = layered(FIXTURES.find((f) => f.name === 'odd and even widths in line')!.graph);
    for (const e of model.edges.values()) {
      expect(e.points.map((p) => p.x).every((x) => x === e.points[0]!.x)).toBe(true);
    }
  });

  it('grows a one-line LR box until four ends fit on its side (D140)', () => {
    const fixture = FIXTURES.find((f) => f.name === 'fan out LR four')!;
    const a = layered(fixture.graph).nodes.get('A')!;
    // Four ends at a pitch of 2, off both corners: 2·4 + 1 rows.
    expect(a.height).toBe(9);
    expect(a.width).toBe(5);
  });

  it('grows a TB box until five ends fit on its side (D140)', () => {
    const fixture = FIXTURES.find((f) => f.name === 'fan out TB five')!;
    const a = layered(fixture.graph).nodes.get('A')!;
    expect(a.width).toBe(11);
    expect(a.height).toBe(3);
  });

  it.each(['curved', 'straight'] as const)('routes square on the grid when %s is asked', (r) => {
    const bad = cellFixtures()
      .map((f) => ({ ...f.graph, routing: r }))
      .map((g) => problems(g, layered(g)))
      .filter((p) => p.length > 0);
    expect(bad).toEqual([]);
  });

  it.each([2, 0.5, 1.5])(
    'rejects a grid quantum of %f: only character cells are supported',
    (q) => {
      const g = FIXTURES.find((f) => f.name === 'chain TB')!.graph;
      expect(() => layered({ ...g, grid: q })).toThrow(RangeError);
    }
  );

  it('keeps a fractional drawing margin on the grid', () => {
    const g = {
      ...FIXTURES.find((f) => f.name === 'F7 drawing margin')!.graph,
      diagramPadding: 0.5,
    };
    expect(problems(g, layered(g))).toEqual([]);
  });

  it('lays out the same twice', () => {
    for (const f of FIXTURES) {
      const copy = JSON.parse(JSON.stringify(f.graph)) as LayoutGraph;
      const plain = (m: LayoutModel): unknown => ({
        ...m,
        nodes: [...m.nodes],
        edges: [...m.edges],
        groups: [...m.groups],
      });
      expect(plain(layered(f.graph))).toEqual(plain(layered(copy)));
    }
  });
});
