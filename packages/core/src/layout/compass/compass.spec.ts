// `compass` (D326, D327, D501) at its own seam, `compass(graph)`: sides as named or derived from
// `direction`, `align`, `{group}` border ends, ends on groups, and the input checks.
import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutGraph, LayoutNode, Side } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { compass } from './index.ts';
import { METRICS } from './compass.ts';

const node = (id: string, extra: Partial<LayoutNode> = {}): LayoutNode => ({
  id,
  width: 80,
  height: 100,
  anchorY: 40,
  ...extra,
});

function edge(source: string, target: string, s?: Side, t?: Side): LayoutEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    minLen: 1,
    ...(s || t ? { sides: { ...(s ? { source: s } : {}), ...(t ? { target: t } : {}) } } : {}),
  };
}

function graph(partial: Partial<LayoutGraph>): LayoutGraph {
  return {
    direction: 'TB',
    nodes: [],
    edges: [],
    groups: [],
    spacing: { node: 10, rank: 10, edge: 10 },
    ...partial,
  };
}

const pad = { top: 40, right: 40, bottom: 40, left: 40 };

describe('compass', () => {
  it('puts each node on the side its edge names, in line', () => {
    const g = graph({
      nodes: [node('a'), node('b'), node('c'), node('d')],
      edges: [
        edge('a', 'b', 'right', 'left'),
        edge('a', 'c', 'bottom', 'top'),
        edge('a', 'd', 'left', 'right'),
      ],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    const at = (id: string) => m.nodes.get(id)!;
    expect(at('b').x).toBeGreaterThan(at('a').x);
    expect(at('b').y).toBe(at('a').y);
    expect(at('c').y).toBeGreaterThan(at('a').y);
    expect(at('c').x).toBe(at('a').x);
    expect(at('d').x).toBeLessThan(at('a').x);
    const ab = m.edges.get('a-b')!;
    expect(ab.ports).toEqual({ source: 'right', target: 'left' });
    expect(ab.points).toHaveLength(2);
    // `left`/`right` ends meet the anchor line, `top`/`bottom` ends the middle of the side.
    expect(ab.points[0]).toEqual({ x: at('a').x + 40, y: at('a').y - 50 + 40, axis: 'h' });
    expect(m.edges.get('a-c')!.points[0]).toEqual({ x: at('a').x, y: at('a').y + 50, axis: 'v' });
    // One cell gap between neighbours.
    expect(at('b').x - at('a').x).toBe(80 + METRICS.gap);
  });

  it.each([
    ['LR', 'right', 'left'],
    ['RL', 'left', 'right'],
    ['TB', 'bottom', 'top'],
    ['BT', 'top', 'bottom'],
  ] as const)('derives sides from direction %s where an edge names none (D327)', (dir, s, t) => {
    const g = graph({
      direction: dir,
      nodes: [node('a'), node('b')],
      edges: [edge('a', 'b'), edge('b', 'a', undefined, 'left')],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.edges.get('a-b')!.ports).toEqual({ source: s, target: t });
    expect(m.edges.get('b-a')!.ports).toEqual({ source: s, target: 'left' });
    expect(m.direction).toBe(dir);
  });

  it('places `align` members in a row or a column before edges', () => {
    const g = graph({
      nodes: [node('a'), node('b'), node('c')],
      edges: [edge('a', 'b', 'bottom', 'top')],
      align: [
        { axis: 'row', members: ['a', 'b'] },
        { axis: 'column', members: ['a', 'c'] },
      ],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    const at = (id: string) => m.nodes.get(id)!;
    expect(at('b').y).toBe(at('a').y);
    expect(at('b').x).toBeGreaterThan(at('a').x);
    expect(at('c').x).toBe(at('a').x);
    expect(at('c').y).toBeGreaterThan(at('a').y);
  });

  it('lines a row up on anchorY, and on the middle without it', () => {
    const g = graph({
      nodes: [node('a', { height: 140 }), node('b'), node('c', { anchorY: undefined, height: 30 })],
      edges: [edge('a', 'b', 'right', 'left'), edge('b', 'c', 'right', 'left')],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    for (const id of ['a-b', 'b-c']) {
      const p = m.edges.get(id)!.points;
      expect(p).toHaveLength(2);
      expect(p[0]!.y).toBe(p[1]!.y);
    }
  });

  it('keeps groups rigid and around their members, with the title in the top band', () => {
    const g = graph({
      nodes: [node('a', { parent: 'g' }), node('b', { parent: 'g' }), node('c')],
      groups: [{ id: 'g', padding: pad, title: { width: 300, height: 20 } }],
      edges: [edge('a', 'b', 'right', 'left'), edge('b', 'c', 'right', 'left')],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    const grp = m.groups.get('g')!;
    // Widened for its title.
    expect(grp.width).toBeGreaterThanOrEqual(300 + METRICS.titleRoom);
    expect(grp.title.y).toBe(grp.y - grp.height / 2 + METRICS.titleTop + 10);
  });

  it('meets the group border for a `border` end, and a group for an end on one', () => {
    const g = graph({
      nodes: [node('a', { parent: 'g' }), node('b', { parent: 'h' }), node('c')],
      groups: [
        { id: 'g', padding: pad },
        { id: 'h', padding: pad },
      ],
      edges: [
        { ...edge('a', 'b', 'right', 'left'), border: { source: true, target: true } },
        edge('c', 'g', 'top', 'bottom'),
      ],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    const gg = m.groups.get('g')!;
    const hh = m.groups.get('h')!;
    const ab = m.edges.get('a-b')!.points;
    expect(ab[0]!.x).toBe(gg.x + gg.width / 2);
    expect(ab.at(-1)!.x).toBe(hh.x - hh.width / 2);
    const cg = m.edges.get('c-g')!.points;
    expect(cg.at(-1)!.y).toBe(gg.y + gg.height / 2);
    expect(m.nodes.get('c')!.y).toBeGreaterThan(gg.y);
  });

  it('draws self, like-side and repeated edges, and groups listed after their children', () => {
    const g = graph({
      nodes: [node('a', { parent: 'inner' }), node('b'), node('c', { parent: 'outer' })],
      groups: [
        { id: 'inner', parent: 'outer', padding: pad },
        { id: 'outer', padding: pad },
        { id: 'empty', parent: 'outer', padding: pad },
      ],
      edges: [
        edge('a', 'a', 'top', 'top'),
        edge('a', 'b', 'left', 'left'),
        { ...edge('a', 'b', 'right', 'left'), id: 'again' },
        { ...edge('a', 'b', 'right', 'left'), id: 'again2', label: { width: 50, height: 16 } },
        edge('c', 'a', 'right', 'left'),
      ],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    const self = m.edges.get('a-a')!.points;
    expect(self[0]).not.toEqual(self.at(-1));
  });

  it('lays out an empty graph and a lone empty group', () => {
    expect(validateLayout(graph({}), compass(graph({})))).toEqual([]);
    const g = graph({ groups: [{ id: 'g', padding: pad }], diagramPadding: 8 });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.groups.get('g')!.width).toBe(METRICS.iconSize + 80);
  });

  it('refuses bad input as the other engines do', () => {
    expect(() => compass(graph({ nodes: [node('a'), node('a')] }))).toThrow(/duplicate/);
    expect(() => compass(graph({ nodes: [node('a')], edges: [edge('a', 'x')] }))).toThrow(
      /unknown target/
    );
    expect(() => compass(graph({ nodes: [node('a', { width: NaN })] }))).toThrow(RangeError);
  });
});

/** Whether an axis-aligned segment runs through a rect's interior. */
function crosses(p: { x: number; y: number }, q: { x: number; y: number }, r: Rect): boolean {
  const x0 = Math.min(p.x, q.x);
  const x1 = Math.max(p.x, q.x);
  const y0 = Math.min(p.y, q.y);
  const y1 = Math.max(p.y, q.y);
  return x0 < r.x1 && x1 > r.x0 && y0 < r.y1 && y1 > r.y0;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const around = (c: { x: number; y: number }, w: number, h: number): Rect => ({
  x0: c.x - w / 2,
  y0: c.y - h / 2,
  x1: c.x + w / 2,
  y1: c.y + h / 2,
});

describe('compass: review fixes', () => {
  it('keeps end labels clear of other edges’ lines and markers (finding 1)', () => {
    const marked = (s: string): LayoutEdge => ({
      ...edge(s, 'd'),
      endLabel: { width: 20, height: 14 },
      endMarker: { length: 10, width: 10 },
    });
    const g = graph({
      direction: 'LR',
      nodes: ['a', 'b', 'c', 'd'].map((id) => node(id, { anchorY: undefined, height: 30 })),
      edges: [marked('a'), marked('b'), marked('c')],
    });
    const m = compass(g);
    expect(validateLayout(g, m)).toEqual([]);
    const problems: string[] = [];
    for (const e of g.edges) {
      const label = around(m.edges.get(e.id)!.endLabel!, 20, 14);
      for (const o of g.edges) {
        if (o.id === e.id) continue;
        const pts = m.edges.get(o.id)!.points;
        for (let i = 1; i < pts.length; i++)
          if (crosses(pts[i - 1]!, pts[i]!, label)) problems.push(`${e.id} on ${o.id}'s line`);
        // The marker: its length back along the last run, its width across.
        const end = pts.at(-1)!;
        const prev = pts.at(-2)!;
        const len = Math.hypot(prev.x - end.x, prev.y - end.y);
        const tip = {
          x: end.x + ((prev.x - end.x) / len) * 5,
          y: end.y + ((prev.y - end.y) / len) * 5,
        };
        if (crosses(tip, tip, label) || overlapsRect(label, around(tip, 10, 10)))
          problems.push(`${e.id} on ${o.id}'s marker`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('places a 0×0 edge label (finding 2)', () => {
    const g = graph({
      nodes: [node('a'), node('b')],
      edges: [{ ...edge('a', 'b'), label: { width: 0, height: 0 } }],
    });
    const m = compass(g);
    expect(m.edges.get('a-b')!.label).toBeDefined();
    expect(validateLayout(g, m)).toEqual([]);
  });

  it('refuses non-finite sizes and spacings the way `layered` does (findings 3, 4)', () => {
    const base = { nodes: [node('a'), node('b')], edges: [edge('a', 'b')] };
    const bad: Partial<LayoutGraph>[] = [
      { groups: [{ id: 'g', padding: pad, title: { width: NaN, height: 10 } }] },
      { groups: [{ id: 'g', padding: pad, title: { width: 10, height: Infinity } }] },
      { ...base, edges: [{ ...edge('a', 'b'), minLen: NaN }] },
      { ...base, edges: [{ ...edge('a', 'b'), startMarker: { length: NaN, width: 1 } }] },
      { ...base, edges: [{ ...edge('a', 'b'), endMarker: { length: 1, width: -1 } }] },
      { spacing: { node: NaN, rank: 1, edge: 1 } },
      { spacing: { node: 1, rank: -1, edge: 1 } },
      { spacing: { node: 1, rank: 1, edge: Infinity } },
      { headRoom: NaN },
    ];
    for (const b of bad) expect(() => compass(graph(b)), JSON.stringify(b)).toThrow(RangeError);
  });

  it('drops the parent of every group on a parent cycle (finding 6)', () => {
    const g = graph({
      nodes: [node('a', { parent: 'A' }), node('b', { parent: 'B' })],
      groups: [
        { id: 'A', parent: 'B', padding: pad },
        { id: 'B', parent: 'A', padding: pad },
      ],
    });
    const m = compass(g);
    const A = m.groups.get('A')!;
    const B = m.groups.get('B')!;
    expect(overlapsRect(around(A, A.width, A.height), around(B, B.width, B.height))).toBe(false);
  });

  it('refuses a side it does not know (finding 7)', () => {
    const g = graph({
      nodes: [node('a'), node('b')],
      edges: [{ ...edge('a', 'b'), sides: { source: 'up' as Side } }],
    });
    expect(() => compass(g)).toThrow(RangeError);
  });
});

function overlapsRect(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}
