// A group's self-loop (#187, D102): its route and its label count in the drawing's size and in
// the size of the group it sits in, as a node's self-loop does.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

const pad = { top: 8, right: 8, bottom: 8, left: 8 };
const LABEL = { width: 40, height: 20 };

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
const inside = (outer: Rect, inner: Rect): boolean =>
  inner.x0 >= outer.x0 - 1e-6 &&
  inner.y0 >= outer.y0 - 1e-6 &&
  inner.x1 <= outer.x1 + 1e-6 &&
  inner.y1 <= outer.y1 + 1e-6;
const clear = (a: Rect, b: Rect): boolean =>
  a.x1 <= b.x0 + 1e-6 || b.x1 <= a.x0 + 1e-6 || a.y1 <= b.y0 + 1e-6 || b.y1 <= a.y0 + 1e-6;

// The state fixture's shape: `Inactive --> Idle` into the composite `Active`, and
// `Active --> Active`, with `Active` in a parent group beside a sibling node.
function graph(dir: Dir, labelled: boolean, nested: boolean): LayoutGraph {
  const within = nested ? { parent: 'outer' } : {};
  return {
    direction: dir,
    nodes: [
      { id: 'Inactive', width: 80, height: 40, ...within },
      { id: 'Idle', width: 60, height: 40, parent: 'Active' },
    ],
    edges: [
      { id: 'e0', source: 'Inactive', target: 'Idle', minLen: 1 },
      {
        id: 'loop',
        source: 'Active',
        target: 'Active',
        minLen: 1,
        ...(labelled ? { label: LABEL } : {}),
      },
    ],
    groups: [
      { id: 'Active', padding: pad, title: { width: 50, height: 20 }, ...within },
      ...(nested ? [{ id: 'outer', padding: pad }] : []),
    ],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
  };
}

function check(g: LayoutGraph, m: LayoutModel): void {
  expect(validateLayout(g, m)).toEqual([]);
  const page: Rect = { x0: 0, y0: 0, x1: m.width, y1: m.height };
  const loop = m.edges.get('loop')!;
  const label = g.edges[1]!.label;
  const parts = loop.points.map((p) => rectOf(p, { width: 0, height: 0 }));
  if (label) parts.push(rectOf(loop.label!, label));
  const outer = m.groups.get('outer');
  for (const r of parts) {
    expect(inside(page, r)).toBe(true);
    if (outer) expect(inside(rectOf(outer, outer), r)).toBe(true);
    // Clear of every other box in the drawing.
    const other = m.nodes.get('Inactive')!;
    expect(clear(rectOf(other, other), r)).toBe(true);
  }
}

describe("layered: a group's self-loop", () => {
  for (const dir of ['TB', 'LR'] as const) {
    for (const labelled of [false, true]) {
      for (const nested of [false, true]) {
        const name = `${dir}, ${labelled ? 'with' : 'without'} a label${nested ? ', in a group' : ''}`;
        it(`stays inside the drawing${nested ? ' and its parent group' : ''}: ${name}`, () => {
          const g = graph(dir, labelled, nested);
          check(g, layered(g));
        });
      }
    }
  }

  it('leaves the room laid out for a node self-loop as it was', () => {
    const g: LayoutGraph = {
      direction: 'TB',
      nodes: [{ id: 'a', width: 60, height: 40 }],
      edges: [{ id: 'l', source: 'a', target: 'a', minLen: 1, label: LABEL }],
      groups: [],
      spacing: { node: 50, rank: 50, edge: 20 },
    };
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(
      inside({ x0: 0, y0: 0, x1: m.width, y1: m.height }, rectOf(m.edges.get('l')!.label!, LABEL))
    ).toBe(true);
  });
});
