// An unlabelled edge between a group and one of its own members, in px (#416, #415, #405): it is
// a loop from the group's side border into the member, and never a line between the two middles,
// which lies under the member and cannot be seen.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutGraph, LayoutModel } from '../types.ts';
import { pxProfile } from '../units.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

// `G` holds `A` above `B`; with `nested`, `A` and `B` are in `inner`, a group of `G`.
function graph(dir: Dir, own: [string, string][], nested = false): LayoutGraph {
  const b = pxProfile.builder;
  const pad = b.groupPad;
  const padding = { top: b.titlePad, right: pad, bottom: pad, left: pad };
  const home = nested ? 'inner' : 'G';
  const node = (id: string, parent?: string) => ({
    id,
    width: 120,
    height: 40,
    ...(parent ? { parent } : {}),
  });
  return {
    direction: dir,
    nodes: [node('A', home), node('B', home), node('X')],
    edges: [
      { id: 'a-b', source: 'A', target: 'B', minLen: 1 },
      { id: 'x-a', source: 'X', target: 'A', minLen: 1 },
      ...own.map(([source, target], i) => ({ id: `own${i}`, source, target, minLen: 1 })),
    ],
    groups: [
      { id: 'G', padding, title: { width: 24, height: 16 } },
      ...(nested ? [{ id: 'inner', padding, title: { width: 24, height: 16 }, parent: 'G' }] : []),
    ],
    spacing: b.spacing,
    diagramPadding: b.diagramPadding,
    headRoom: b.headRoom,
    metrics: pxProfile.engine,
  };
}

const length = (points: readonly { x: number; y: number }[]): number =>
  points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);

// Whether (x, y) is strictly inside the box of centre `c` and size `s`.
const inside = (
  p: { x: number; y: number },
  c: { x: number; y: number; width: number; height: number }
): boolean => Math.abs(p.x - c.x) < c.width / 2 - 1e-6 && Math.abs(p.y - c.y) < c.height / 2 - 1e-6;

function check(g: LayoutGraph, m: LayoutModel, group: string, member: string, id: string): void {
  expect(validateLayout(g, m)).toEqual([]);
  const points = m.edges.get(id)!.points;
  const box = m.groups.get(group)!;
  const fromGroup = g.edges.find((e) => e.id === id)!.source === group;
  const [atGroup, atMember] = fromGroup
    ? [points[0]!, points.at(-1)!]
    : [points.at(-1)!, points[0]!];
  // It starts (or ends) on a side border of the group and ends (or starts) on the member's box.
  expect(Math.abs(Math.abs(atGroup.x - box.x) - box.width / 2)).toBeLessThan(1e-6);
  const node = m.nodes.get(member)!;
  expect(Math.abs(Math.abs(atMember.y - node.y) - node.height / 2)).toBeLessThan(1e-6);
  // Long enough to carry an arrowhead and still show a line.
  expect(length(points)).toBeGreaterThan(3 * g.headRoom!);
  // No point of it is under a node.
  for (const [name, n] of m.nodes)
    for (const p of points) expect(inside(p, n), `${id} under ${name}`).toBe(false);
}

describe('layered: an unlabelled edge between a group and its own member (#416)', () => {
  for (const dir of ['TB', 'LR'] as const) {
    it(`${dir}: group → member`, () => {
      const g = graph(dir, [['G', 'A']]);
      check(g, layered(g), 'G', 'A', 'own0');
    });

    it(`${dir}: member → group`, () => {
      const g = graph(dir, [['B', 'G']]);
      check(g, layered(g), 'G', 'B', 'own0');
    });

    it(`${dir}: both ways on one member do not share a line`, () => {
      const g = graph(dir, [
        ['G', 'A'],
        ['A', 'G'],
      ]);
      const m = layered(g);
      check(g, m, 'G', 'A', 'own0');
      check(g, m, 'G', 'A', 'own1');
      const ys = (id: string): number[] => m.edges.get(id)!.points.map((p) => p.y);
      expect(Math.max(...ys('own0'))).toBeLessThanOrEqual(Math.min(...ys('own1')));
    });

    it(`${dir}: group → a member two levels down`, () => {
      const g = graph(dir, [['G', 'B']], true);
      check(g, layered(g), 'G', 'B', 'own0');
    });
  }
});
