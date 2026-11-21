import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutGraph, LayoutNode } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

const box = (id: string, parent?: string): LayoutNode => ({
  id,
  width: 60,
  height: 40,
  ...(parent ? { parent } : {}),
});
const link = (source: string, target: string): LayoutEdge => ({
  id: `${source}-${target}`,
  source,
  target,
  minLen: 1,
});
const pad = { top: 8, right: 8, bottom: 8, left: 8 };

// A TB group b → c inside an LR drawing; `crossed` adds an edge from outside into the group.
function graph(crossed: boolean): LayoutGraph {
  return {
    direction: 'LR',
    nodes: [box('a'), box('b', 'g'), box('c', 'g')],
    edges: [link('b', 'c'), ...(crossed ? [link('a', 'b')] : [link('a', 'g')])],
    groups: [{ id: 'g', direction: 'TB', padding: pad }],
    spacing: { node: 50, rank: 50, edge: 20 },
  };
}

describe('layered: groups', () => {
  it('lays out a group in its own direction', () => {
    const g = graph(false);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.nodes.get('b')!.x).toBeCloseTo(m.nodes.get('c')!.x);
    expect(m.nodes.get('c')!.y).toBeGreaterThan(m.nodes.get('b')!.y);
  });

  it("gives a group that an edge crosses its parent's direction, as v12 does", () => {
    const g = graph(true);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.nodes.get('b')!.y).toBeCloseTo(m.nodes.get('c')!.y);
    expect(m.nodes.get('c')!.x).toBeGreaterThan(m.nodes.get('b')!.x);
  });

  it('routes an edge into a nested group through the borders it crosses', () => {
    const g: LayoutGraph = {
      direction: 'TB',
      nodes: [box('a'), box('b', 'inner')],
      edges: [link('a', 'b')],
      groups: [
        { id: 'outer', padding: pad },
        { id: 'inner', parent: 'outer', padding: pad },
      ],
      spacing: { node: 50, rank: 50, edge: 20 },
    };
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    const outer = m.groups.get('outer')!;
    const points = m.edges.get('a-b')!.points;
    // Starts above the outer group and ends inside the inner one.
    expect(points[0]!.y).toBeLessThan(outer.y - outer.height / 2);
    expect(m.edges.get('a-b')!.ports).toEqual({ source: 'bottom', target: 'top' });
  });

  // #650: Brandes-Köpf lines up one bend with the group, so the nodes outside used to stack in
  // the middle of its side. `pullToHeld` moves each one across from the members it links to.
  it('puts nodes outside a group across from the members they link to', () => {
    const members = Array.from({ length: 12 }, (_, i) => box(`u${i}`, 'g'));
    const outside = ['a0', 'a1', 'a2', 'a3'];
    const g: LayoutGraph = {
      direction: 'LR',
      nodes: [...outside.map((id) => box(id)), ...members],
      edges: members.map((u, i) => link(outside[i % 4]!, u.id)),
      groups: [{ id: 'g', padding: pad }],
      spacing: { node: 50, rank: 50, edge: 20 },
    };
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    for (const id of outside) {
      const ys = g.edges.filter((e) => e.source === id).map((e) => m.nodes.get(e.target)!.y);
      expect(m.nodes.get(id)!.y, id).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(m.nodes.get(id)!.y, id).toBeLessThanOrEqual(Math.max(...ys));
    }
  });

  // #405, #415: an unlabelled edge between a group and its own member is laid out inside the
  // group, from its border (on top, below its title), not drawn between the two middles.
  it.each([
    ['into the member, from the top', 'g', 'b'],
    ['out of the member, to the bottom border', 'b', 'g'],
  ])('routes an edge %s', (_, source, target) => {
    const g: LayoutGraph = {
      direction: 'TB',
      nodes: [box('b', 'g'), box('c', 'g')],
      edges: [link('b', 'c'), link(source, target)],
      groups: [{ id: 'g', padding: pad, title: { width: 20, height: 16 } }],
      spacing: { node: 50, rank: 50, edge: 20 },
    };
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    const group = m.groups.get('g')!;
    const b = m.nodes.get('b')!;
    const points = m.edges.get(`${source}-${target}`)!.points;
    const [border, member] =
      source === 'g' ? [points[0]!, points.at(-1)!] : [points.at(-1)!, points[0]!];
    expect(member.y).toBeCloseTo(source === 'g' ? b.y - b.height / 2 : b.y + b.height / 2);
    // From below the title band (top padding and title), or to the bottom border round c,
    // which b → c puts below b.
    const top = group.y - group.height / 2;
    expect(border.y).toBeCloseTo(source === 'g' ? top + pad.top + 16 : group.y + group.height / 2);
    expect(Math.abs(border.y - member.y)).toBeGreaterThanOrEqual(20);
  });
});
