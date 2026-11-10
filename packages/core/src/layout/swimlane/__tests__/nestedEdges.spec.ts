// Edges between a node and a group around it (#595 review): v12's router doubles back through
// the node, or post-processing collapses the route to a point, so the adapter gives them T0a's
// right-angled placeholder from the inner box to the outer box. One edge never fails a render.
import { describe, expect, it } from 'vitest';
import { validateLayout } from '../../validate.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

const cases: [string, string][] = [
  ['A', 's1'],
  ['s1', 'A'],
  ['B', 'n1'],
  ['n1', 'B'],
  ['B', 's1'],
];

describe.each(['TB', 'BT', 'LR', 'RL'] as const)('%s', (direction) => {
  it.each(cases)('routes %s -> %s, a node and a group around it, validly', (source, target) => {
    const graph = layoutGraph({
      direction,
      lanes: { s1: ['A'], s2: ['C'] },
      nested: { n1: ['s1', ['B']] },
      size: { width: 60, height: 40 },
      edges: [
        [source, target],
        ['A', 'C'],
      ],
    });
    const model = swimlaneLayout(graph);
    const route = model.edges.get('e0')!;
    expect(route.points).toHaveLength(2);
    expect(validateLayout(graph, model)).toEqual([]);
  });
});
