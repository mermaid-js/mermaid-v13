import { describe, expect, it } from 'vitest';
import {
  layered,
  validateLayout,
  type Dir,
  type LayoutContext,
  type LayoutGraph,
  type LayoutModel,
  type Point,
  type Side,
} from '@mermaid-js/core/layout';
import type { DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { createMermaid } from 'mermaid';
import { elkEngine, toElkGraph } from './adapter.ts';
import elkLayouts from './index.ts';

// T0c #592 (D503): ELK layered gives each edge end that names a side a port on that side.

const spacing = { node: 50, rank: 50, edge: 20 };
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];
const DIRS: Dir[] = ['TB', 'BT', 'LR', 'RL'];
const OUTWARD: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** A → B (labelled, with end labels) and B → C, in `direction`. */
const graph = (direction: Dir, sides?: LayoutGraph['edges'][number]['sides']): LayoutGraph => ({
  direction,
  spacing,
  diagramPadding: 8,
  nodes: [
    { id: 'A', width: 80, height: 40 },
    { id: 'B', width: 60, height: 50 },
    { id: 'C', width: 40, height: 40 },
  ],
  edges: [
    {
      id: 'e',
      source: 'A',
      target: 'B',
      minLen: 1,
      label: { width: 30, height: 14 },
      startLabel: { width: 8, height: 10 },
      endLabel: { width: 8, height: 10 },
      ...(sides ? { sides } : {}),
    },
    { id: 'f', source: 'B', target: 'C', minLen: 1 },
  ],
  groups: [],
});

/** Whether `p` lies on `side` of node `id`'s box, away from its corners. */
function onSide(model: LayoutModel, id: string, side: Side, p: Point): boolean {
  const n = model.nodes.get(id)!;
  const [x0, x1, y0, y1] = [
    n.x - n.width / 2,
    n.x + n.width / 2,
    n.y - n.height / 2,
    n.y + n.height / 2,
  ];
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;
  const within = (v: number, lo: number, hi: number): boolean => v > lo && v < hi;
  if (side === 'top' || side === 'bottom')
    return near(p.y, side === 'top' ? y0 : y1) && within(p.x, x0, x1);
  return near(p.x, side === 'left' ? x0 : x1) && within(p.y, y0, y1);
}

/** Whether `p` lies on the border of node `id`'s box at least 6 from each corner. */
function clearOfCorners(model: LayoutModel, id: string, p: Point): boolean {
  const n = model.nodes.get(id)!;
  const xs = [n.x - n.width / 2, n.x + n.width / 2];
  const ys = [n.y - n.height / 2, n.y + n.height / 2];
  const far = xs.every((x) => ys.every((y) => Math.hypot(p.x - x, p.y - y) >= 6));
  const side = (['top', 'bottom', 'left', 'right'] as const).some((s) => onSide(model, id, s, p));
  return far && side;
}

/** The route leaves (or enters) square to `side`, outward. */
function leaves(from: Point, next: Point, side: Side): boolean {
  const o = OUTWARD[side];
  const dx = next.x - from.x;
  const dy = next.y - from.y;
  return o.x === 0 ? Math.abs(dx) < 0.5 && dy * o.y > 0 : Math.abs(dy) < 0.5 && dx * o.x > 0;
}

const cases = DIRS.flatMap((d) => SIDES.flatMap((s) => SIDES.map((t) => [d, s, t] as const)));

describe('ELK layered: named sides become FIXED_SIDE ports (D503)', () => {
  it.each(cases)('%s, A:%s → B:%s', (direction, source, target) => {
    const g = graph(direction, { source, target });
    const model = elkEngine('layered')(g);
    const e = model.edges.get('e')!;
    const pts = e.points;
    expect(e.ports).toEqual({ source, target });
    expect(onSide(model, 'A', source, pts[0]!)).toBe(true);
    expect(onSide(model, 'B', target, pts[pts.length - 1]!)).toBe(true);
    expect(leaves(pts[0]!, pts[1]!, source)).toBe(true);
    expect(leaves(pts[pts.length - 1]!, pts[pts.length - 2]!, target)).toBe(true);
    expect(e.label && e.startLabel && e.endLabel).toBeTruthy();
    expect(validateLayout(g, model)).toEqual([]);
  });

  it.each(DIRS.flatMap((d) => SIDES.map((s) => [d, s] as const)))(
    '%s, one end named (%s): it is kept, the other is ELK’s',
    (direction, side) => {
      for (const sides of [{ source: side }, { target: side }]) {
        const g = graph(direction, sides);
        const model = elkEngine('layered')(g);
        const e = model.edges.get('e')!;
        const pts = e.points;
        if (sides.source) expect(onSide(model, 'A', side, pts[0]!)).toBe(true);
        else expect(onSide(model, 'B', side, pts[pts.length - 1]!)).toBe(true);
        expect(e.ports[sides.source ? 'source' : 'target']).toBe(side);
        const built = toElkGraph(g, 'layered');
        const free = sides.source ? 'B' : 'A';
        expect(built.nodes.get(free)!.ports).toBeUndefined();
        expect(validateLayout(g, model)).toEqual([]);
      }
    }
  );

  it('meets left and right ports at anchorY, top and bottom at the middle (D501)', () => {
    const g = graph('TB');
    g.nodes[0] = { ...g.nodes[0]!, anchorY: 10 };
    g.edges.push(
      { id: 'l', source: 'A', target: 'C', minLen: 1, sides: { source: 'left' } },
      { id: 'r', source: 'C', target: 'A', minLen: 1, sides: { target: 'right' } },
      { id: 'b', source: 'A', target: 'B', minLen: 1, sides: { source: 'bottom' } }
    );
    const model = elkEngine('layered')(g);
    const a = model.nodes.get('A')!;
    const top = a.y - a.height / 2;
    const l = model.edges.get('l')!.points;
    const r = model.edges.get('r')!.points;
    const b = model.edges.get('b')!.points;
    expect(l[0]).toMatchObject({ x: a.x - a.width / 2, y: top + 10 });
    expect(r[r.length - 1]).toMatchObject({ x: a.x + a.width / 2, y: top + 10 });
    expect(onSide(model, 'A', 'bottom', b[0]!)).toBe(true);
    expect(toElkGraph(g, 'layered').nodes.get('A')!.layoutOptions).toMatchObject({
      'elk.portConstraints': 'FIXED_POS',
    });
    expect(validateLayout(g, model)).toEqual([]);
  });

  // Review 1 and 5: on a FIXED_POS node, ends that name no side used to sit at a corner.
  it('keeps unsided ends of an anchorY node on a side, clear of the corners (review 1)', () => {
    const g = graph('TB');
    g.nodes[0] = { ...g.nodes[0]!, anchorY: 10 };
    g.edges.push(
      { id: 'l', source: 'A', target: 'C', minLen: 1, sides: { source: 'left' } },
      { id: 'in', source: 'C', target: 'A', minLen: 1 }
    );
    const model = elkEngine('layered')(g);
    const e = model.edges.get('e')!;
    const into = model.edges.get('in')!.points;
    expect(clearOfCorners(model, 'A', e.points[0]!)).toBe(true);
    expect(clearOfCorners(model, 'A', into.at(-1)!)).toBe(true);
    expect(onSide(model, 'A', e.ports.source, e.points[0]!)).toBe(true);
    expect(validateLayout(g, model)).toEqual([]);
  });

  it('spreads ends that share a side of an anchorY node (review 4)', () => {
    const g = graph('LR');
    g.nodes[0] = { ...g.nodes[0]!, anchorY: 15 };
    g.edges.push(
      { id: 'l1', source: 'A', target: 'B', minLen: 1, sides: { source: 'left' } },
      { id: 'l2', source: 'A', target: 'C', minLen: 1, sides: { source: 'left' } },
      { id: 't1', source: 'A', target: 'B', minLen: 1, sides: { source: 'top' } },
      { id: 't2', source: 'A', target: 'C', minLen: 1, sides: { source: 'top' } }
    );
    const model = elkEngine('layered')(g);
    const start = (id: string): Point => model.edges.get(id)!.points[0]!;
    const a = model.nodes.get('A')!;
    expect(start('l1')).not.toEqual(start('l2'));
    expect(start('t1')).not.toEqual(start('t2'));
    for (const id of ['l1', 'l2']) {
      expect(onSide(model, 'A', 'left', start(id))).toBe(true);
      // Around the icon line, not across the whole side.
      expect(Math.abs(start(id).y - (a.y - a.height / 2 + 15))).toBeLessThanOrEqual(spacing.edge);
    }
    for (const id of ['t1', 't2']) expect(onSide(model, 'A', 'top', start(id))).toBe(true);
    expect(validateLayout(g, model)).toEqual([]);
  });

  it('routes a named side of a group that grows for its title from outside it (review 2)', () => {
    const g: LayoutGraph = {
      direction: 'TB',
      spacing,
      diagramPadding: 8,
      nodes: [
        { id: 'A', width: 60, height: 40 },
        { id: 'X', width: 20, height: 20, parent: 'G' },
      ],
      edges: [{ id: 'in', source: 'A', target: 'G', minLen: 1, sides: { target: 'left' } }],
      groups: [
        {
          id: 'G',
          padding: { top: 8, right: 8, bottom: 8, left: 8 },
          title: { width: 300, height: 20 },
        },
      ],
    };
    const model = elkEngine('layered')(g);
    const pts = model.edges.get('in')!.points;
    const box = model.groups.get('G')!;
    const left = box.x - box.width / 2;
    expect(pts.at(-1)!.x).toBeCloseTo(left);
    // Every point before the end lies outside the group, so the route never crosses it.
    for (const p of pts.slice(0, -1)) {
      const inside =
        p.x > left + 0.5 &&
        p.x < box.x + box.width / 2 - 0.5 &&
        p.y > box.y - box.height / 2 + 0.5 &&
        p.y < box.y + box.height / 2 - 0.5;
      expect(inside, JSON.stringify(pts)).toBe(false);
    }
    expect(pts.at(-2)!.x).toBeLessThan(left);
  });

  it('gives no port to an edge between a group and its own member, as layered (review 6)', () => {
    const g: LayoutGraph = {
      direction: 'TB',
      spacing,
      diagramPadding: 8,
      nodes: [
        { id: 'X', width: 40, height: 40, parent: 'G' },
        { id: 'Y', width: 40, height: 40, parent: 'H' },
      ],
      edges: [
        {
          id: 'own',
          source: 'G',
          target: 'X',
          minLen: 1,
          sides: { source: 'left', target: 'left' },
        },
        {
          id: 'deep',
          source: 'Y',
          target: 'G',
          minLen: 1,
          sides: { source: 'right', target: 'top' },
        },
      ],
      groups: [
        { id: 'G', padding: { top: 8, right: 8, bottom: 8, left: 8 } },
        { id: 'H', parent: 'G', padding: { top: 8, right: 8, bottom: 8, left: 8 } },
      ],
    };
    const built = toElkGraph(g, 'layered');
    for (const n of built.nodes.values()) expect(n.ports, n.id).toBeUndefined();
    expect(built.edges.get('own')).toMatchObject({ sources: ['G'], targets: ['X'] });
    expect(built.edges.get('deep')).toMatchObject({ sources: ['Y'], targets: ['G'] });
  });

  it('keeps FIXED_SIDE on a node with anchorY that names only top or bottom', () => {
    const g = graph('LR', { source: 'top' });
    g.nodes[0] = { ...g.nodes[0]!, anchorY: 10 };
    expect(toElkGraph(g, 'layered').nodes.get('A')!.layoutOptions).toMatchObject({
      'elk.portConstraints': 'FIXED_SIDE',
    });
  });

  // Review 3: refused as `layered`'s check() refuses it, on every node, sides or not.
  it.each([
    [Number.NaN, { source: 'left' }],
    [-1, { source: 'right' }],
    [41, { source: 'left' }],
    [Infinity, { source: 'left' }],
    [Number.NaN, { source: 'top' }],
    [41, undefined],
  ] as const)('refuses anchorY %s (sides %o) as layered does', (anchorY, sides) => {
    const g = graph('TB', sides);
    g.nodes[0] = { ...g.nodes[0]!, anchorY };
    let want: unknown;
    try {
      layered(g);
    } catch (e) {
      want = e;
    }
    expect(want).toBeInstanceOf(RangeError);
    expect(() => elkEngine('layered')(g)).toThrow((want as Error).message);
  });

  it.each([0, 40])('accepts anchorY %s, on the box edge', (anchorY) => {
    const g = graph('TB', { source: 'left' });
    g.nodes[0] = { ...g.nodes[0]!, anchorY };
    expect(() => elkEngine('layered')(g)).not.toThrow();
  });

  it('puts ports on a group and on a node inside one', () => {
    const g: LayoutGraph = {
      direction: 'TB',
      spacing,
      diagramPadding: 8,
      nodes: [
        { id: 'A', width: 60, height: 40 },
        { id: 'X', width: 40, height: 40, parent: 'G' },
        { id: 'B', width: 60, height: 40 },
      ],
      edges: [
        { id: 'in', source: 'A', target: 'G', minLen: 1, sides: { target: 'left' } },
        { id: 'out', source: 'X', target: 'B', minLen: 1, sides: { source: 'right' } },
      ],
      groups: [{ id: 'G', padding: { top: 8, right: 8, bottom: 8, left: 8 } }],
    };
    const model = elkEngine('layered')(g);
    const into = model.edges.get('in')!.points;
    const g0 = model.groups.get('G')!;
    expect(into[into.length - 1]!.x).toBeCloseTo(g0.x - g0.width / 2);
    expect(onSide(model, 'X', 'right', model.edges.get('out')!.points[0]!)).toBe(true);
    expect(model.edges.get('in')!.ports.target).toBe('left');
    expect(validateLayout(g, model)).toEqual([]);
  });

  it('gives a self loop two ports, one per end', () => {
    const g = graph('TB');
    g.edges.push({
      id: 's',
      source: 'A',
      target: 'A',
      minLen: 1,
      sides: { source: 'right', target: 'top' },
    });
    const model = elkEngine('layered')(g);
    const s = model.edges.get('s')!;
    expect(s.ports).toEqual({ source: 'right', target: 'top' });
    expect(onSide(model, 'A', 'right', s.points[0]!)).toBe(true);
    expect(onSide(model, 'A', 'top', s.points[s.points.length - 1]!)).toBe(true);
  });

  it('builds no port and no constraint for a graph without sides, or under another algorithm', () => {
    const plain = toElkGraph(graph('TB'), 'layered');
    const stress = toElkGraph(graph('TB', { source: 'left', target: 'right' }), 'stress');
    for (const built of [plain, stress])
      for (const n of built.nodes.values()) {
        expect(n.ports).toBeUndefined();
        expect(n.layoutOptions?.['elk.portConstraints']).toBeUndefined();
      }
    expect(stress.edges.get('e')).toMatchObject({ sources: ['A'], targets: ['B'] });
  });
});

/**
 * A graph diagram `sided` whose lines read `a:R -- L:b` (architecture's form; no first-party
 * diagram on this base gives sides yet).
 */
const SIDE_OF: Record<string, Side> = { L: 'left', R: 'right', T: 'top', B: 'bottom' };
const sided: DiagramPlugin<string[], LayoutModel> = {
  id: 'sided',
  layoutKind: 'graph',
  detector: (text) => /^\s*sided/.test(text),
  parse: (text) => ({
    model: text.split('\n').filter((l) => l.includes(' -- ')),
    ast: { id: 'sided', type: 'Sided', range: { start: 0, end: text.length } },
    diagnostics: [],
    symbols: [],
    statements: [],
  }),
  layout: (lines, ctx) => {
    const edges = lines.map((l, i) => {
      const [, a, s, t, b] = /(\w+):(\w) -- (\w):(\w+)/.exec(l)!;
      const sides = { source: SIDE_OF[s!]!, target: SIDE_OF[t!]! };
      return { id: `e${i}`, source: a!, target: b!, minLen: 1, sides };
    });
    const ids = [...new Set(edges.flatMap((e) => [e.source, e.target]))];
    return ctx.layout({
      direction: 'TB',
      spacing,
      nodes: ids.map((id) => ({ id, width: 80, height: 100, anchorY: 40 })),
      edges,
      groups: [],
    });
  },
  render: (_model, _layout, _ctx, w: SvgWriter) => {
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 10] });
    w.close();
  },
};

describe('through createMermaid().render() with the ELK package registered', () => {
  it('meets each node on the side its edge names, left and right at anchorY', async () => {
    const laid: { name: string; model: LayoutModel }[] = [];
    const m = createMermaid();
    m.initialize({ deterministic: true });
    m.registerLayoutLoaders(
      elkLayouts.map((l) => ({
        ...l,
        loader: async () => {
          const engine = await l.loader();
          return (g: LayoutGraph, ctx?: LayoutContext) => {
            const model = engine(g, ctx);
            laid.push({ name: l.name, model });
            return model;
          };
        },
      }))
    );
    await m.registerExternalDiagrams([sided]);
    const text = '---\nconfig:\n  layout: elk\n---\nsided\na:R -- L:b\nb:B -- T:c\nc:L -- R:a\n';
    const { svg } = await m.render('d', text);
    expect(svg).toContain('<svg');
    expect(laid.map((l) => l.name)).toEqual(['elk']);
    const { model } = laid[0]!;
    const want: [string, string, string, Side, Side][] = [
      ['e0', 'a', 'b', 'right', 'left'],
      ['e1', 'b', 'c', 'bottom', 'top'],
      ['e2', 'c', 'a', 'left', 'right'],
    ];
    for (const [id, a, b, source, target] of want) {
      const e = model.edges.get(id)!;
      expect(e.ports, id).toEqual({ source, target });
      expect(onSide(model, a, source, e.points[0]!), id).toBe(true);
      expect(onSide(model, b, target, e.points.at(-1)!), id).toBe(true);
    }
    // b's one left end sits on its icon line; a's two right ends spread about it.
    const line = (id: string): number => {
      const n = model.nodes.get(id)!;
      return n.y - n.height / 2 + 40;
    };
    expect(model.edges.get('e0')!.points.at(-1)!.y).toBeCloseTo(line('b'));
    const right = ['e0', 'e2'].map((id) => {
      const pts = model.edges.get(id)!.points;
      return (id === 'e0' ? pts[0]! : pts.at(-1)!).y - line('a');
    });
    expect(right.sort((x, y) => x - y)).toEqual([-spacing.edge / 2, spacing.edge / 2]);
  });
});
