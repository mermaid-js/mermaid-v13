import { describe, expect, it } from 'vitest';
import type { Dir, EdgeRouting, LayoutGraph } from '../types.ts';
import { cellProfile } from '../units.ts';
import { layered } from './index.ts';

function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  const children: unknown[] = Object.values(value);
  for (const child of children) freeze(child);
  Object.freeze(value);
}

const directions: Dir[] = ['TB', 'BT', 'LR', 'RL'];
const routings: EdgeRouting[] = ['curved', 'stepped', 'straight'];

// Interleaved loops must not shift the non-loop edge indices. The return edge makes a cycle;
// the parallel and long edges exercise track assignment and intermediate ranks.
function graph(direction: Dir, routing: EdgeRouting, grid: boolean): LayoutGraph {
  return {
    direction,
    routing,
    nodes: [
      { id: 'z', width: 31, height: 9, parent: 'missing' },
      { id: 'a', width: 21, height: 7, span: 0 },
      { id: 'm', width: 25, height: 11, parent: 'z' },
    ],
    edges: [
      { id: 'loop-1', source: 'z', target: 'z', minLen: 1, label: { width: 5, height: 3 } },
      { id: 'long', source: 'z', target: 'a', minLen: 4, label: { width: 7, height: 3 } },
      { id: 'loop-2', source: 'z', target: 'z', minLen: 1 },
      { id: 'parallel', source: 'z', target: 'a', minLen: 1, label: { width: 0, height: 3 } },
      {
        id: 'ends',
        source: 'a',
        target: 'm',
        minLen: 1,
        startLabel: { width: 3, height: 1 },
        endLabel: { width: 5, height: 1 },
      },
      { id: 'return', source: 'm', target: 'z', minLen: 1 },
    ],
    groups: [],
    spacing: { node: 5, rank: 8, edge: 2 },
    diagramPadding: 3,
    availableWidth: grid ? 70 : 250,
    ...(grid ? { grid: 1, metrics: cellProfile().engine } : {}),
  };
}

describe('layered: flat graph ownership and order', () => {
  for (const direction of directions)
    for (const routing of routings)
      it.each([false, true])(`${direction} ${routing}, grid=%s`, (grid) => {
        const input = graph(direction, routing, grid);
        const original = graph(direction, routing, grid);
        freeze(input);
        const model = layered(input);
        expect(input).toEqual(original);
        expect([...model.nodes.keys()]).toEqual(input.nodes.map((n) => n.id));
        expect([...model.edges.keys()]).toEqual(input.edges.map((e) => e.id));
        expect(model.groups.size).toBe(0);
        const expected = layered(input);
        model.nodes.get('z')!.x = -1000;
        model.edges.get('long')!.points[0]!.y = -1000;
        model.edges.clear();
        expect(layered(input)).toEqual(expected);
        expect(input).toEqual(original);
      });

  it.each(directions)('keeps empty graphs empty in %s', (direction) => {
    const input: LayoutGraph = {
      direction,
      nodes: [],
      edges: [],
      groups: [],
      spacing: { node: 5, rank: 8, edge: 2 },
      diagramPadding: 3,
    };
    freeze(input);
    expect(layered(input)).toEqual({
      direction,
      width: 6,
      height: 6,
      nodes: new Map(),
      edges: new Map(),
      groups: new Map(),
    });
  });
});
