// v13-only: the two DDLT fixtures that failed D538's gates with v13's sizes (#595), each reduced
// to the edge that failed, so a fix in the engine shows here before `ddlt.spec.ts` gates the lot.
import { describe, expect, it } from 'vitest';
import type { Point } from '../../types.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { DDLT_FIXTURES, fixtureGraph } from './ddlt.fixtures.ts';
import { swimlaneGateIssues } from './ddltGates.ts';

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const box = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  left: b.x - b.width / 2,
  right: b.x + b.width / 2,
  top: b.y - b.height / 2,
  bottom: b.y + b.height / 2,
});

/** The gap between an axis-aligned segment and a box (0 when it touches or enters it). */
function gap(a: Point, b: Point, r: Rect): number {
  const dx = Math.max(r.left - Math.max(a.x, b.x), Math.min(a.x, b.x) - r.right, 0);
  const dy = Math.max(r.top - Math.max(a.y, b.y), Math.min(a.y, b.y) - r.bottom, 0);
  return Math.hypot(dx, dy);
}

function layOut(id: string) {
  const graph = fixtureGraph(id);
  const model = swimlaneLayout(graph, DDLT_FIXTURES[id]!.tuning);
  return { graph, model, issues: swimlaneGateIssues(graph, model) };
}

describe('swimlane DDLT regressions', () => {
  it('#634: an unlabelled edge leaving beside a labelled one keeps clear of its label', () => {
    const { graph, model, issues } = layOut('5-car-fun-sales-wide-tb');
    expect(issues.filter((i) => i.edgeId === 'L_I_K_0').map((i) => i.message)).toEqual([]);
    const ij = graph.edges.find((e) => e.id === 'L_I_J_0')!;
    const label = box({ ...model.edges.get('L_I_J_0')!.label!, ...ij.label! });
    const points = model.edges.get('L_I_K_0')!.points;
    // Every leg stays more than the gate's 2px off the label.
    for (let i = 0; i < points.length - 1; i++)
      expect(gap(points[i]!, points[i + 1]!, label)).toBeGreaterThan(2);
  });
});
