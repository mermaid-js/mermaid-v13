// v13-only: the two DDLT fixtures that failed D538's gates with v13's sizes (#595), and the v12
// fixes that come over as fixtures (#683), each reduced to the edge that failed, so a fix in the
// engine shows here before `ddlt.spec.ts` gates the lot.
import { describe, expect, it } from 'vitest';
import type { Point } from '../../types.ts';
import { EDGE_ROUTING } from '../config.ts';
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

  it("#636: a same-rank back edge (LR) never takes a terminal tail through its target's box", () => {
    const { model, issues } = layOut('pebr-2-edge-intrudes-lane-label');
    const edge = 'L_Dep2.Proc2_Dep1.Proc2_0';
    expect(issues.filter((i) => i.edgeId === edge).map((i) => i.message)).toEqual([]);
    const target = box(model.nodes.get('Dep1.Proc2')!);
    const points = model.edges.get(edge)!.points;
    // Only the last leg reaches the target; every other leg stays more than 2px off it.
    for (let i = 0; i < points.length - 2; i++)
      expect(gap(points[i]!, points[i + 1]!, target)).toBeGreaterThan(2);
    // With the swap refused, the edge and its forward twin run straight, side by side.
    expect(points).toHaveLength(2);
    expect(model.edges.get('L_Dep1.Proc2_Dep2.Proc2_0')!.points).toHaveLength(2);
  });

  // mermaid-js/mermaid#8698: each edge has both ends in one lane, and was routed round a rail
  // outside it. The LR one stays in its lane in v13 already (LR is routed on drawn sizes).
  it.each([
    ['regressions/same-lane-detour-tb', 'L_d_e_0', 'Qa'],
    ['regressions/same-lane-back-edge-lr', 'L_c_a_0', 'Ops'],
    ['4-car-fun-sales-tb', 'L_I_K_0', 'Legal'],
    ['7-car-sales-constr', 'L_I_K_0', 'Legal'],
  ])('#683: %s keeps %s inside lane %s', (id, edge, lane) => {
    const { model, issues } = layOut(id);
    expect(issues.filter((i) => i.edgeId === edge).map((i) => i.message)).toEqual([]);
    const band = box(model.groups.get(lane)!);
    for (const p of model.edges.get(edge)!.points) {
      expect(p.x).toBeGreaterThanOrEqual(band.left);
      expect(p.x).toBeLessThanOrEqual(band.right);
      expect(p.y).toBeGreaterThanOrEqual(band.top);
      expect(p.y).toBeLessThanOrEqual(band.bottom);
    }
  });

  it('#683: two opposite edges between stacked nodes run an arrowhead spacing apart', () => {
    // mermaid-js/mermaid#8407: the back edge, straightened beside its opposite, ran 4px from it.
    const { model, issues } = layOut('regressions/opposite-edges-gap');
    expect(issues.map((i) => i.message)).toEqual([]);
    const down = model.edges.get('L_assess_reply_0')!.points;
    const back = model.edges.get('L_reply_assess_0')!.points;
    expect(down).toHaveLength(2);
    expect(back).toHaveLength(2);
    expect(Math.abs(back[0]!.x - down[0]!.x)).toBeCloseTo(EDGE_ROUTING.MIN_ARROWHEAD_SPACING, 6);
    expect(back[0]!.x).toBeCloseTo(back[1]!.x, 6);
    expect(down[0]!.x).toBeCloseTo(down[1]!.x, 6);
  });

  // mermaid-js/mermaid#8693: three tracks meet on the right face of Triage: its straight
  // connector to Resolve and two arrivals. The connector stays one straight line through both
  // centres, and the arrivals are moved off it.
  it('#678: a straight connector between aligned lanes stays straight when the face is shared', () => {
    const { model, issues } = layOut('regressions/terminal-lanes-keep-straight-connector');
    expect(issues.map((i) => i.message)).toEqual([]);
    const triage = model.nodes.get('b')!;
    const straight = model.edges.get('L_b_c_0')!.points;
    expect(straight).toHaveLength(2);
    expect(straight[0]!.y).toBeCloseTo(triage.y, 6);
    expect(straight[1]!.y).toBeCloseTo(model.nodes.get('c')!.y, 6);
    const arrivals = ['L_d_b_0', 'L_c_b_0'].map((id) => model.edges.get(id)!.points.at(-1)!.y);
    for (const y of arrivals)
      expect(Math.abs(y - straight[0]!.y)).toBeGreaterThanOrEqual(
        EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE
      );
    expect(Math.abs(arrivals[0]! - arrivals[1]!)).toBeGreaterThanOrEqual(
      EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE
    );
  });
});
