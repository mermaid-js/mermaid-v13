// The label of an edge between a group and one of its own members (#198): it sits inside the
// group, clear of the member, the group's title and the other labels, in px and in cells. The
// graphs have the shapes the flowchart (subgraph → member) and ER (group → member, square routes,
// a head room for the cardinality mark) builders give.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutGraph, LayoutModel } from '../types.ts';
import { cellProfile, pxProfile } from '../units.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const rectOf = (c: { x: number; y: number }, s: { width: number; height: number }): Rect => ({
  x0: c.x - s.width / 2,
  y0: c.y - s.height / 2,
  x1: c.x + s.width / 2,
  y1: c.y + s.height / 2,
});
const clear = (a: Rect, b: Rect): boolean =>
  a.x1 <= b.x0 + 1e-6 || b.x1 <= a.x0 + 1e-6 || a.y1 <= b.y0 + 1e-6 || b.y1 <= a.y0 + 1e-6;
const within = (outer: Rect, inner: Rect): boolean =>
  inner.x0 >= outer.x0 - 1e-6 &&
  inner.y0 >= outer.y0 - 1e-6 &&
  inner.x1 <= outer.x1 + 1e-6 &&
  inner.y1 <= outer.y1 + 1e-6;

type Units = 'px' | 'cells';
type Form = 'flowchart' | 'er';

// `G` holds `A` (and `B` below it); `edges` names the group ↔ member edges, each labelled.
function graph(
  units: Units,
  form: Form,
  dir: Dir,
  own: [string, string][],
  opts: { nested?: boolean; wide?: boolean } = {}
): LayoutGraph {
  const cells = units === 'cells';
  const p = cells ? cellProfile() : pxProfile;
  const b = p.builder;
  const node = (id: string, parent?: string) => ({
    id,
    ...(cells ? { width: 5, height: 3 } : { width: opts.wide ? 152 : 60, height: 40 }),
    ...(parent ? { parent } : {}),
  });
  const label = (text: string) =>
    cells ? { width: text.length + 2, height: 1 } : { width: text.length * 8 + 12, height: 20 };
  const pad = b.groupPad;
  const groups: LayoutGraph['groups'] = [
    {
      id: 'G',
      padding: { top: b.titlePad, right: pad, bottom: pad, left: pad },
      title: cells ? { width: 3, height: 0 } : { width: 24, height: 16 },
      ...(opts.nested ? { parent: 'outer' } : {}),
    },
  ];
  if (opts.nested)
    groups.push({ id: 'outer', padding: { top: b.titlePad, right: pad, bottom: pad, left: pad } });
  const g: LayoutGraph = {
    direction: dir,
    nodes: [node('A', 'G'), node('B', 'G'), node('X', opts.nested ? 'outer' : undefined)],
    edges: [
      { id: 'a-b', source: 'A', target: 'B', minLen: 1 },
      { id: 'x-a', source: 'X', target: 'A', minLen: 1 },
      ...own.map(([s, t], i) => ({
        id: `own${i}`,
        source: s,
        target: t,
        minLen: 1,
        label: label(i === 0 ? 'lbl' : `label ${i}`),
      })),
    ],
    groups,
    spacing: b.spacing,
    diagramPadding: b.diagramPadding,
    headRoom: b.headRoom,
    metrics: p.engine,
    ...(form === 'er' ? { routing: 'stepped' as const } : {}),
    ...(cells ? { grid: 1 } : {}),
  };
  return g;
}

function check(g: LayoutGraph, m: LayoutModel, cells: boolean): void {
  expect(validateLayout(g, m)).toEqual([]);
  const group = m.groups.get('G')!;
  const box = rectOf(group, group);
  // Inside the frame: on the grid, off its border cells and below the title's border row.
  const inner: Rect = cells
    ? { x0: box.x0 + 1, y0: box.y0 + 1, x1: box.x1 - 1, y1: box.y1 - 1 }
    : box;
  const spec = g.groups.find((x) => x.id === 'G')!;
  const title = cells
    ? { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0 + 1 }
    : rectOf(group.title, spec.title!);
  const labels: Rect[] = [];
  for (const e of g.edges) {
    if (!e.label) continue;
    const at = m.edges.get(e.id)!.label!;
    const r = rectOf(at, e.label);
    expect(within(inner, r), `${e.id} inside G`).toBe(true);
    expect(clear(r, title), `${e.id} clear of the title`).toBe(true);
    for (const [id, n] of m.nodes)
      expect(clear(r, rectOf(n, n)), `${e.id} clear of ${id}`).toBe(true);
    for (const o of labels) expect(clear(r, o), `${e.id} clear of another label`).toBe(true);
    labels.push(r);
  }
  // No route runs through a label.
  for (const [id, e] of m.edges) {
    const p = e.points;
    for (let i = 1; i < p.length; i++) {
      const seg = {
        x0: Math.min(p[i - 1]!.x, p[i]!.x),
        y0: Math.min(p[i - 1]!.y, p[i]!.y),
        x1: Math.max(p[i - 1]!.x, p[i]!.x),
        y1: Math.max(p[i - 1]!.y, p[i]!.y),
      };
      const thick = cells
        ? { x0: seg.x0 - 0.5, y0: seg.y0 - 0.5, x1: seg.x1 + 0.5, y1: seg.y1 + 0.5 }
        : seg;
      for (const r of labels) {
        const touches =
          thick.x0 < r.x1 - 1e-6 &&
          r.x0 < thick.x1 - 1e-6 &&
          thick.y0 < r.y1 - 1e-6 &&
          r.y0 < thick.y1 - 1e-6;
        expect(touches, `${id} runs through a label`).toBe(false);
      }
    }
  }
  // The end on the member is apart from every other edge end, so the line is not drawn on top of
  // another edge into the same side of the member (mermaid-js/mermaid#8824).
  const apart = cells ? 1 : pxProfile.engine.portPitch;
  for (const own of g.edges) {
    if (!own.id.startsWith('own')) continue;
    const p = m.edges.get(own.id)!.points;
    const end = own.source === 'G' ? p[p.length - 1]! : p[0]!;
    for (const [id, o] of m.edges) {
      if (id === own.id) continue;
      for (const q of [o.points[0]!, o.points[o.points.length - 1]!]) {
        const d = Math.hypot(q.x - end.x, q.y - end.y);
        expect(d, `${own.id} ends ${d} from an end of ${id}`).toBeGreaterThanOrEqual(apart - 1e-6);
      }
    }
  }
}

describe('layered: the label of an edge between a group and its own member', () => {
  for (const units of ['px', 'cells'] as const) {
    for (const form of ['flowchart', 'er'] as const) {
      for (const dir of ['TB', 'LR'] as const) {
        const cells = units === 'cells';
        it(`${form}, ${units}, ${dir}: group → member`, () => {
          const g = graph(units, form, dir, [['G', 'A']]);
          check(g, layered(g), cells);
        });
        it(`${form}, ${units}, ${dir}: member → group, with a wide member`, () => {
          const g = graph(units, form, dir, [['B', 'G']], { wide: true });
          check(g, layered(g), cells);
        });
        it(`${form}, ${units}, ${dir}: two such edges, in a parent group`, () => {
          const g = graph(
            units,
            form,
            dir,
            [
              ['G', 'A'],
              ['B', 'G'],
            ],
            { nested: true }
          );
          check(g, layered(g), cells);
        });
      }
    }
  }
});
