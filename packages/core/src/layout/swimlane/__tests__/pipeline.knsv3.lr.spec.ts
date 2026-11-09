// Ported from v12 `swimlanes/__tests__/pipeline.knsv3.lr.spec.ts` (c9b12739f). v12 built the
// knsv3 `LayoutData` by hand, sized its label nodes and ran sugiyamaLayout, the router and
// post-processing; here it is a `LayoutGraph` (label sizes on the edges, v12's spacing) through the
// whole engine. v12's `validateLayout` is core's `validateLayout` plus D538's gates
// (`ddltGates.ts`); its crossing count is the same strict count of crossing segment pairs. No debug
// logging.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel, Size } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { toLayoutModel } from '../adapter.ts';
import type { LayoutData } from '../layoutData.ts';
import { runSwimlane } from '../swimlane.ts';
import { swimlaneGateIssues } from './ddltGates.ts';
import { layoutGraph } from './graphs.ts';

// Approximation of the knsv3.html scenario: the Legal lane (I, J, K) plus a minimal Constr lane.
const SIZES: Record<string, Size> = {
  C: { width: 80, height: 50 },
  D: { width: 80, height: 50 },
  E: { width: 80, height: 50 },
  H: { width: 80, height: 50 },
  L: { width: 80, height: 50 },
  N: { width: 80, height: 50 },
  I: { width: 60, height: 50 },
  // Tall node approximating the multi-line label block
  J: { width: 232, height: 150 },
  K: { width: 60, height: 40 },
};

const EDGES: [id: string, start: string, end: string, label?: Size][] = [
  ['eC-D', 'C', 'D'],
  ['eD-E', 'D', 'E'],
  ['eD-H', 'D', 'H'],
  ['eK-L', 'K', 'L'],
  ['eL-N', 'L', 'N'],
  ['eJ-E', 'J', 'E'],
  ['eH-I', 'H', 'I'],
  // Yes branch with a long label: wide, two lines (as v12 sized its label node)
  ['eI-J', 'I', 'J', { width: 200, height: 42 }],
  ['eI-K', 'I', 'K', { width: 80, height: 40 }],
];

function makeKnsv3Graph(): LayoutGraph {
  const graph = layoutGraph({
    direction: 'LR',
    lanes: { Constr: ['C', 'D', 'E', 'H', 'L', 'N'], Legal: ['I', 'J', 'K'] },
    edges: EDGES.map(([, s, t, label]) => (label ? [s, t, label] : [s, t])),
    size: (id) => SIZES[id]!,
    spacing: { node: 40, rank: 100 },
  });
  graph.edges.forEach((e, i) => (e.id = EDGES[i]![0]));
  return graph;
}

function runKnsv3SwimlanesLR(): { graph: LayoutGraph; layout: LayoutData; model: LayoutModel } {
  const graph = makeKnsv3Graph();
  const layout = runSwimlane(graph, { ignoreCrossLaneEdges: true, optimizeRanksByCrossings: true });
  const model = toLayoutModel(graph, JSON.parse(JSON.stringify(layout)) as LayoutData);
  return { graph, layout, model };
}

/** v12's crossing count: segment pairs of different edges that cross strictly. */
function crossings(model: LayoutModel): number {
  const segs = [...model.edges].flatMap(([id, e]) =>
    e.points.slice(1).map((b, i) => ({ id, a: e.points[i]!, b }))
  );
  let count = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [s, t] = [segs[i]!, segs[j]!];
      if (s.id === t.id) continue;
      const sH = Math.abs(s.a.y - s.b.y) < 1;
      const tH = Math.abs(t.a.y - t.b.y) < 1;
      if (sH === tH) continue;
      const [h, v] = sH ? [s, t] : [t, s];
      const inH = v.a.x > Math.min(h.a.x, h.b.x) + 1 && v.a.x < Math.max(h.a.x, h.b.x) - 1;
      const inV = h.a.y > Math.min(v.a.y, v.b.y) + 1 && h.a.y < Math.max(v.a.y, v.b.y) - 1;
      if (inH && inV) count++;
    }
  }
  return count;
}

describe('Swimlanes LR knsv3 integration', () => {
  it('Level 1: validateLayout — knsv3 fixture produces a valid orthogonal layout', () => {
    const { graph, model } = runKnsv3SwimlanesLR();
    expect(validateLayout(graph, model)).toEqual([]);
    expect(swimlaneGateIssues(graph, model)).toEqual([]);
  });

  it('Level 1: I->K polyline does not intersect the I->J label rectangle', () => {
    const { layout } = runKnsv3SwimlanesLR();
    const ijLabelId = layout.edges.find((e) => e.id === 'eI-J')?.labelNodeId;
    expect(ijLabelId, 'Expected a label node for edge I->J').toBeDefined();
    const ijLabelNode = layout.nodes.find((n) => n.id === ijLabelId)!;
    expect(ijLabelNode).toBeDefined();

    const ikEdge = layout.edges.find((e) => e.id === 'eI-K');
    expect(ikEdge, 'Expected edge eI-K in the layout').toBeDefined();
    const pts = ikEdge?.points ?? [];
    expect(pts.length).toBeGreaterThanOrEqual(2);

    const labelLeft = (ijLabelNode.x ?? 0) - (ijLabelNode.width ?? 0) / 2;
    const labelRight = (ijLabelNode.x ?? 0) + (ijLabelNode.width ?? 0) / 2;
    const labelTop = (ijLabelNode.y ?? 0) - (ijLabelNode.height ?? 0) / 2;
    const labelBottom = (ijLabelNode.y ?? 0) + (ijLabelNode.height ?? 0) / 2;

    const epsilon = 2;
    const through = pts.slice(1).filter((p2, i) => {
      const p1 = pts[i]!;
      const intersectX =
        Math.max(p1.x, p2.x) > labelLeft + epsilon && Math.min(p1.x, p2.x) < labelRight - epsilon;
      const intersectY =
        Math.max(p1.y, p2.y) > labelTop + epsilon && Math.min(p1.y, p2.y) < labelBottom - epsilon;
      return intersectX && intersectY;
    });
    expect(through).toEqual([]);
  });

  it('Level 2: validateLayout breakdown on the knsv3 fixture', () => {
    // v12 pinned the crossings it achieved (3) so a regression above it is caught; 0 is the aim.
    const { model } = runKnsv3SwimlanesLR();
    expect(crossings(model)).toBeLessThanOrEqual(3);
  });
});
