// Ported from v12 `swimlanes/__tests__/pipeline.hoe.lr.spec.ts` (c9b12739f). v12 built the HoE
// `LayoutData` by hand, sized its label nodes and ran sugiyamaLayout, the router and
// post-processing; here it is a `LayoutGraph` (label sizes on the edges, v12's spacing) through the
// whole engine. v12's `validateLayout` is core's `validateLayout` plus D538's gates
// (`ddltGates.ts`); its crossing count is the same strict count of crossing segment pairs. No debug
// logging; v12's unused `hasEarlyReturnToStartRow` is dropped.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel, Point, Size } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import type { LayoutData } from '../layoutData.ts';
import { runSwimlane } from '../swimlane.ts';
import { toLayoutModel } from '../adapter.ts';
import { swimlaneGateIssues } from './ddltGates.ts';
import { layoutGraph } from './graphs.ts';

const SIZES: Record<string, Size> = {
  HE_CA: { width: 110, height: 70 },
  HE_Ans: { width: 90, height: 45 },
  HE_Inv: { width: 110, height: 45 },
  HE_Ans2: { width: 90, height: 45 },
  A: { width: 110, height: 45 },
  B: { width: 120, height: 70 },
  TL_CA: { width: 110, height: 70 },
  TL_Ans: { width: 90, height: 45 },
};

const EDGES: [id: string, start: string, end: string, label?: Size][] = [
  ['eHE_CA-HE_Ans', 'HE_CA', 'HE_Ans', { width: 42, height: 22 }],
  ['eHE_CA-HE_Inv', 'HE_CA', 'HE_Inv', { width: 38, height: 22 }],
  ['eHE_Inv-HE_Ans2', 'HE_Inv', 'HE_Ans2'],
  ['eA-B', 'A', 'B'],
  ['eTL_CA-TL_Ans', 'TL_CA', 'TL_Ans', { width: 42, height: 22 }],
  ['eB-TL_CA', 'B', 'TL_CA', { width: 42, height: 22 }],
  ['eB-HE_CA', 'B', 'HE_CA', { width: 38, height: 22 }],
  ['eTL_CA-HE_CA', 'TL_CA', 'HE_CA', { width: 38, height: 22 }],
];

function makeHoEGraph(): LayoutGraph {
  const graph = layoutGraph({
    direction: 'LR',
    lanes: {
      HoE: ['HE_CA', 'HE_Ans', 'HE_Inv', 'HE_Ans2'],
      StatusSeeker: ['A', 'B'],
      TechLead: ['TL_CA', 'TL_Ans'],
    },
    edges: EDGES.map(([, s, t, label]) => (label ? [s, t, label] : [s, t])),
    size: (id) => SIZES[id]!,
    spacing: { node: 40, rank: 90 },
  });
  graph.edges.forEach((e, i) => (e.id = EDGES[i]![0]));
  return graph;
}

function runHoESwimlanesLR(): { graph: LayoutGraph; layout: LayoutData; model: LayoutModel } {
  const graph = makeHoEGraph();
  const layout = runSwimlane(graph, { ignoreCrossLaneEdges: true, optimizeRanksByCrossings: true });
  const model = toLayoutModel(graph, copyOf(layout));
  return { graph, layout, model };
}

/** A copy of the internal data, so writing the model does not move what the specs read. */
function copyOf(data: LayoutData): LayoutData {
  return JSON.parse(JSON.stringify(data)) as LayoutData;
}

function hasZeroProgressOutAndBack(points: Point[]): boolean {
  if (points.length < 3) return false;
  const first = points[0]!;
  const last = points.at(-1)!;
  return Math.abs(first.x - last.x) < 1 && Math.abs(first.y - last.y) < 1;
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
      const y = h.a.y;
      const x = v.a.x;
      const inH = x > Math.min(h.a.x, h.b.x) + 1 && x < Math.max(h.a.x, h.b.x) - 1;
      const inV = y > Math.min(v.a.y, v.b.y) + 1 && y < Math.max(v.a.y, v.b.y) - 1;
      if (inH && inV) count++;
    }
  }
  return count;
}

describe('Swimlanes LR HoE integration', () => {
  // v12 left eHE_CA-HE_Inv starting at the router's anchor, 20 above HE_CA; v13's
  // `terminalReattach.ts` brings that end back onto the box.
  it('Level 1: validateLayout — HoE fixture produces a valid orthogonal layout', () => {
    const { graph, model } = runHoESwimlanesLR();
    expect(validateLayout(graph, model)).toEqual([]);
  });

  it('Level 1: D538 gates — HoE fixture has no obstacle, corner or hugging issue', () => {
    const { graph, model } = runHoESwimlanesLR();
    expect(swimlaneGateIssues(graph, model)).toEqual([]);
  });

  it('Level 2: every labelled edge has its label center on a polyline segment', () => {
    const { layout } = runHoESwimlanesLR();
    const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
    const EPS = 1;
    const offenders: string[] = [];
    for (const edge of layout.edges) {
      const labelNode = edge.labelNodeId ? nodeById.get(edge.labelNodeId) : undefined;
      const pts = edge.points;
      if (!labelNode || !pts || pts.length < 2) continue;
      const lcx = labelNode.x ?? 0;
      const lcy = labelNode.y ?? 0;
      const onSegment = pts.slice(1).some((b, i) => {
        const a = pts[i]!;
        if (Math.abs(a.y - b.y) < 1e-6) {
          return (
            Math.abs(lcy - a.y) < EPS &&
            lcx >= Math.min(a.x, b.x) - EPS &&
            lcx <= Math.max(a.x, b.x) + EPS
          );
        }
        if (Math.abs(a.x - b.x) < 1e-6) {
          return (
            Math.abs(lcx - a.x) < EPS &&
            lcy >= Math.min(a.y, b.y) - EPS &&
            lcy <= Math.max(a.y, b.y) + EPS
          );
        }
        return false;
      });
      if (!onSegment) offenders.push(`${edge.id} label at (${lcx}, ${lcy})`);
    }
    expect(offenders).toEqual([]);
  });

  it('Level 2: edge polylines have no spikes, collinear intermediates, or zero-progress out-and-back', () => {
    const { layout } = runHoESwimlanesLR();
    const EPS = 1e-6;
    const offenders: string[] = [];
    for (const edge of layout.edges) {
      const pts = edge.points ?? [];
      for (let i = 1; i < pts.length - 1; i++) {
        const [prev, cur, next] = [pts[i - 1]!, pts[i]!, pts[i + 1]!];
        if (Math.abs(prev.x - next.x) < EPS && Math.abs(prev.y - next.y) < EPS) {
          offenders.push(`${edge.id}: spike`);
          continue;
        }
        const sameX = Math.abs(prev.x - cur.x) < EPS && Math.abs(cur.x - next.x) < EPS;
        const sameY = Math.abs(prev.y - cur.y) < EPS && Math.abs(cur.y - next.y) < EPS;
        if (sameX) {
          const lo = Math.min(prev.y, next.y);
          const hi = Math.max(prev.y, next.y);
          if (cur.y > lo + EPS && cur.y < hi - EPS) offenders.push(`${edge.id}: collinear`);
        } else if (sameY) {
          const lo = Math.min(prev.x, next.x);
          const hi = Math.max(prev.x, next.x);
          if (cur.x > lo + EPS && cur.x < hi - EPS) offenders.push(`${edge.id}: collinear`);
        }
      }
      if (pts.length >= 3 && hasZeroProgressOutAndBack(pts)) {
        offenders.push(`${edge.id}: zeroProgress`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Level 2: validateLayout — no crossings on the HoE fixture', () => {
    const { model } = runHoESwimlanesLR();
    expect(crossings(model)).toBe(0);
  });
});
