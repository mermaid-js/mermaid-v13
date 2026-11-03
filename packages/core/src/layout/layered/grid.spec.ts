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

describe('layered: grid (cells)', () => {
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
