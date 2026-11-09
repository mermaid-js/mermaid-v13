// Ported from v12 `swimlanes/__tests__/sameRankDetour.spec.ts` (c9b12739f), through the engine on
// a `LayoutGraph`. Changed: v12 checked every issue of its `validateLayout`; here the checks are
// D538's (core's `validateLayout` and the swimlane gates of `ddltGates.ts`). The lanes are
// given in source order (v12's parser listed them last-declared first).
import { describe, expect, it } from 'vitest';
import type { LayoutGraph } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { swimlaneGateIssues } from './ddltGates.ts';
import { layoutGraph } from './graphs.ts';

interface NodeSpec {
  id: string;
  lane: string;
  width: number;
  height: number;
  shape?: string;
}

/** An LR graph as a parsed flowchart-style swimlane diagram carries it: 50/50 spacing, 8 padding. */
function graphLR(nodeSpecs: NodeSpec[], edges: [string, string][], lanes: string[]): LayoutGraph {
  const byId = new Map(nodeSpecs.map((n) => [n.id, n]));
  const graph = layoutGraph({
    direction: 'LR',
    lanes: Object.fromEntries(
      lanes.map((lane) => [lane, nodeSpecs.filter((n) => n.lane === lane).map((n) => n.id)])
    ),
    edges,
    size: (id) => ({ width: byId.get(id)!.width, height: byId.get(id)!.height }),
    spacing: { node: 50, rank: 50 },
    padding: 8,
  });
  for (const n of graph.nodes) n.shape = byId.get(n.id)!.shape ?? 'rounded';
  graph.edges.forEach((e) => (e.id = `L_${e.source}_${e.target}_0`));
  return graph;
}

function issueTypes(graph: LayoutGraph): string[] {
  const model = swimlaneLayout(graph);
  return [
    ...validateLayout(graph, model),
    ...swimlaneGateIssues(graph, model).map((i) => `${i.type}: ${i.message}`),
  ];
}

// Two decisions sit on the same rank with a third lane between them, so the edge
// joining them has to detour around the middle lane's node.
describe('swimlane router: an edge within one rank that detours around another lane', () => {
  it('leaves the detour on a face point no other edge uses', () => {
    const diamond = { width: 142, height: 142, shape: 'diamond' };
    const graph = graphLR(
      [
        { id: 'A', lane: 'Seeker', width: 128, height: 45 },
        { id: 'A2', lane: 'Seeker', ...diamond },
        { id: 'E', lane: 'Head', ...diamond },
        { id: 'F', lane: 'Head', width: 79, height: 45 },
        { id: 'G', lane: 'Head', width: 100, height: 45 },
        { id: 'F2', lane: 'Head', width: 79, height: 45 },
        { id: 'B', lane: 'Lead', ...diamond },
        { id: 'C', lane: 'Lead', width: 79, height: 45 },
      ],
      [
        ['E', 'F'],
        ['E', 'G'],
        ['G', 'F2'],
        ['B', 'C'],
        ['A', 'A2'],
        ['A2', 'B'],
        ['A2', 'E'],
        ['B', 'E'],
      ],
      ['Seeker', 'Head', 'Lead']
    );

    expect(issueTypes(graph)).toEqual([]);
  });
});
