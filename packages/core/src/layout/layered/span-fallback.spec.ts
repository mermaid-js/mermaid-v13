// A node's span (the length of its side that edge ends may use) is the one the graph gives; only
// a node without one gets the engine's, from its width or, where its group's flow runs sideways,
// its height, less a corner at each end. Pinned: an explicit zero span, spans left to the engine
// in a group whose direction turns the flow, and given spans beside them.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

const r = (x: number): number => Math.round(x * 100) / 100;

function ends(m: LayoutModel): unknown {
  return Object.fromEntries(
    [...m.edges].map(([id, e]) => {
      const a = e.points[0]!;
      const b = e.points[e.points.length - 1]!;
      return [id, `${r(a.x)},${r(a.y)} -> ${r(b.x)},${r(b.y)}`];
    })
  );
}

function fan(span: number | undefined, nested: boolean): LayoutGraph {
  const within = nested ? { parent: 'G' } : {};
  const hub = { id: 'hub', width: 120, height: 40, ...within };
  return {
    direction: 'TB',
    nodes: [
      span === undefined ? hub : { ...hub, span },
      ...['p', 'q', 'r'].map((id) => ({ id, width: 40, height: 20, ...within })),
    ],
    edges: ['p', 'q', 'r'].map((t) => ({ id: `hub-${t}`, source: 'hub', target: t, minLen: 1 })),
    groups: nested
      ? [{ id: 'G', direction: 'LR', padding: { top: 8, right: 8, bottom: 8, left: 8 } }]
      : [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
  };
}

describe('layered: node spans', () => {
  it('an explicit zero span puts every end in the middle of its side', () => {
    const g = fan(0, false);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    const hub = m.nodes.get('hub')!;
    for (const e of g.edges) expect(m.edges.get(e.id)!.points[0]!.x).toBeCloseTo(hub.x);
    expect(ends(m)).toMatchSnapshot();
  });

  it.each([
    ['left to the engine', undefined],
    ['given', 30],
    ['zero', 0],
  ] as const)('a span %s, in a group that turns the flow sideways', (_, span) => {
    const g = fan(span, true);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(ends(m)).toMatchSnapshot();
  });

  it('a span left to the engine at the top level spreads the ends', () => {
    const g = fan(undefined, false);
    const m = layered(g);
    expect(new Set(g.edges.map((e) => r(m.edges.get(e.id)!.points[0]!.x))).size).toBe(3);
    expect(ends(m)).toMatchSnapshot();
  });
});
