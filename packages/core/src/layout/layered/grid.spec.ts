import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel, RoutePoint, Side } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { cellFixtures, randomCellFixtures } from './grid.fixtures.ts';
import { layered } from './index.ts';

// DDLT-style checks on cell graphs with `grid: 1` (D78, D140). In grid mode a coordinate is a
// cell index: route point (c, r) is cell (c, r), and a box of width w centred at x covers the
// cells from x − w/2 + ½ to x + w/2 − ½. Edge ends are the cells just outside their side.
const FIXTURES = [...cellFixtures(), ...randomCellFixtures(60)];

interface Cells {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const cells = (b: { x: number; y: number; width: number; height: number }): Cells => ({
  left: b.x - b.width / 2 + 0.5,
  top: b.y - b.height / 2 + 0.5,
  right: b.x + b.width / 2 - 0.5,
  bottom: b.y + b.height / 2 - 0.5,
});

const inside = (c: Cells, p: { x: number; y: number }): boolean =>
  p.x >= c.left && p.x <= c.right && p.y >= c.top && p.y <= c.bottom;

// Whether `p` is the cell just outside `side` of `c`, next to one of the side's non-corner cells.
function offSide(c: Cells, side: Side, p: RoutePoint): boolean {
  switch (side) {
    case 'top':
      return p.y === c.top - 1 && p.x > c.left && p.x < c.right;
    case 'bottom':
      return p.y === c.bottom + 1 && p.x > c.left && p.x < c.right;
    case 'left':
      return p.x === c.left - 1 && p.y > c.top && p.y < c.bottom;
    case 'right':
      return p.x === c.right + 1 && p.y > c.top && p.y < c.bottom;
  }
}

function problems(graph: LayoutGraph, model: LayoutModel): string[] {
  const out = validateLayout(graph, model);
  const whole = (v: number): boolean => Number.isInteger(v);
  const page: Cells = { left: 0, top: 0, right: model.width - 1, bottom: model.height - 1 };
  for (const [id, b] of [...model.nodes, ...model.groups]) {
    const c = cells(b);
    if (!inside(page, { x: c.left, y: c.top }) || !inside(page, { x: c.right, y: c.bottom }))
      out.push(`box '${id}' lies outside the drawing's cells`);
  }
  for (const [id, e] of model.edges)
    if (e.points.some((p) => !inside(page, p))) out.push(`edge '${id}' leaves the drawing's cells`);
  const boxes = new Map<string, Cells>();
  for (const [id, b] of [...model.nodes, ...model.groups]) {
    const c = cells(b);
    if (![c.left, c.top, c.right, c.bottom].every(whole)) out.push(`box '${id}' is off the grid`);
    boxes.set(id, c);
  }
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const ends = new Map<string, string>();
  for (const e of graph.edges) {
    const m = model.edges.get(e.id)!;
    const pts = m.points;
    if (pts.some((p) => !whole(p.x) || !whole(p.y))) out.push(`edge '${e.id}' is off the grid`);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (a.x !== b.x && a.y !== b.y) out.push(`edge '${e.id}' has a diagonal segment`);
    }
    if (e.label && m.label) {
      const c = cells({ ...m.label, ...e.label });
      if (![c.left, c.top].every(whole)) out.push(`label of '${e.id}' is off the grid`);
    }
    const check = (id: string, side: Side, p: RoutePoint | undefined): void => {
      if (!p) return;
      const key = `${p.x},${p.y}`;
      const other = ends.get(key);
      if (other !== undefined) out.push(`edges '${other}' and '${e.id}' end in one cell ${key}`);
      ends.set(key, e.id);
      if (nodeIds.has(id) && !offSide(boxes.get(id)!, side, p))
        out.push(`edge '${e.id}' does not end off a ${side} side of '${id}' (${key})`);
    };
    check(e.source, m.ports.source, pts[0]);
    check(e.target, m.ports.target, pts[pts.length - 1]);
    // No route point other than the ends sits in a node box.
    for (const p of pts) {
      for (const n of graph.nodes) {
        if (inside(boxes.get(n.id)!, p)) out.push(`edge '${e.id}' has a point in '${n.id}'`);
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
