// `sides` hints (D503) after layout: an edge whose named side moves an end is routed again
// round every node, and the nodes are made into obstacles only when such an edge comes. Pinned:
// one reroute, several in one graph, a hint that moves nothing (the model is layered's own), and
// a graph with no hints.
import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

const r = (x: number): number => Math.round(x * 100) / 100;

function routes(m: LayoutModel): unknown {
  return {
    size: [r(m.width), r(m.height)],
    edges: Object.fromEntries(
      [...m.edges].map(([id, e]) => [
        id,
        `${e.points.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')} | ${e.ports.source}/${e.ports.target}`,
      ])
    ),
  };
}

function graph(edges: LayoutEdge[]): LayoutGraph {
  return {
    direction: 'TB',
    nodes: [
      { id: 'a', width: 80, height: 40 },
      { id: 'b', width: 60, height: 30 },
      { id: 'c', width: 70, height: 36 },
      { id: 'd', width: 50, height: 30 },
    ],
    edges,
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
  };
}

const CHAIN: LayoutEdge[] = [
  { id: 'ab', source: 'a', target: 'b', minLen: 1 },
  { id: 'bc', source: 'b', target: 'c', minLen: 1 },
  { id: 'ad', source: 'a', target: 'd', minLen: 1 },
];

describe('layered: side hints routed again round the nodes', () => {
  it('reroutes an edge whose hint moves its ends', () => {
    const g = graph([
      ...CHAIN,
      {
        id: 'ac',
        source: 'a',
        target: 'c',
        minLen: 1,
        sides: { source: 'right', target: 'right' },
      },
    ]);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.edges.get('ac')!.ports).toEqual({ source: 'right', target: 'right' });
    expect(routes(m)).toMatchSnapshot();
  });

  it('reroutes several edges in one graph, each round every node', () => {
    const g = graph([
      ...CHAIN,
      { id: 'ac', source: 'a', target: 'c', minLen: 1, sides: { source: 'left', target: 'left' } },
      { id: 'db', source: 'd', target: 'b', minLen: 1, sides: { source: 'top', target: 'right' } },
      {
        id: 'cd',
        source: 'c',
        target: 'd',
        minLen: 1,
        sides: { source: 'right', target: 'bottom' },
      },
    ]);
    const m = layered(g);
    expect(validateLayout(g, m)).toEqual([]);
    expect(m.edges.get('ac')!.ports).toEqual({ source: 'left', target: 'left' });
    expect(m.edges.get('db')!.ports).toEqual({ source: 'top', target: 'right' });
    expect(m.edges.get('cd')!.ports).toEqual({ source: 'right', target: 'bottom' });
    expect(routes(m)).toMatchSnapshot();
  });

  it("leaves layered's model as it is when no hint moves an end", () => {
    const plain = layered(graph(CHAIN));
    const hinted = layered(
      graph(CHAIN.map((e) => ({ ...e, sides: { source: 'bottom', target: 'top' } })))
    );
    expect(routes(hinted)).toEqual(routes(plain));
    expect(routes(plain)).toMatchSnapshot();
  });
});
