// v13-only: the two DDLT fixtures that failed D538's gates with v13's sizes (#595), and the v12
// fixes that come over as fixtures (#683), each reduced to the edge that failed, so a fix in the
// engine shows here before `ddlt.spec.ts` gates the lot.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Point } from '../../types.ts';
import { EDGE_ROUTING } from '../config.ts';
import { crossingPointsBetween } from '../direction/laneContainment.ts';
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

/** A segment that runs less than this far inside a box only touches it (v12's `TOUCH_LENGTH`). */
const TOUCH_LENGTH = 1;

/** How far the square segment from `a` to `b` runs strictly inside `r`; 0 for a slanted one. */
function lengthInside(a: Point, b: Point, r: Rect): number {
  const overlap = (from: number, to: number, low: number, high: number) =>
    Math.max(0, Math.min(Math.max(from, to), high) - Math.max(Math.min(from, to), low));
  if (a.x === b.x) return a.x > r.left && a.x < r.right ? overlap(a.y, b.y, r.top, r.bottom) : 0;
  if (a.y === b.y) return a.y > r.top && a.y < r.bottom ? overlap(a.x, b.x, r.left, r.right) : 0;
  return 0;
}

/**
 * The locales whose collation orders the ids of `regressions/locale-independent-order` other than
 * by code unit: Estonian puts z before t, Czech ch after h, Danish b after B, Swedish a-umlaut
 * after z.
 */
const OTHER_LOCALES = ['et-EE', 'cs-CZ', 'da-DK', 'sv-SE'] as const;

/** Makes a `localeCompare` call without a locale argument sort as it does for a reader of `locale`. */
function readAs(locale: string): void {
  vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
    this: string,
    that: string,
    locales?: Intl.LocalesArgument,
    options?: Intl.CollatorOptions
  ) {
    return new Intl.Collator(locales ?? locale, options).compare(this, that);
  });
}

function layOut(id: string) {
  const graph = fixtureGraph(id);
  const model = swimlaneLayout(graph, DDLT_FIXTURES[id]!.tuning);
  return { graph, model, issues: swimlaneGateIssues(graph, model) };
}

/** Edges with both ends in one lane, each once routed round a rail outside it: fixture, edge, lane. */
const SAME_LANE_EDGES: readonly (readonly [fixture: string, edge: string, lane: string])[] = [
  ['regressions/same-lane-detour-tb', 'L_d_e_0', 'Qa'],
  ['regressions/same-lane-back-edge-lr', 'L_c_a_0', 'Ops'],
  ['regressions/terminal-lane-detour', 'L_E_G_0', 'subGraph1'],
  ['8-query-process-2', 'L_E_G_0', 'subGraph1'],
  ['4-car-fun-sales-tb', 'L_I_K_0', 'Legal'],
  ['7-car-sales-constr', 'L_I_K_0', 'Legal'],
];

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
  it.each(SAME_LANE_EDGES)('#683: %s keeps %s inside lane %s', (id, edge, lane) => {
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

  // mermaid-js/mermaid#8698: the route that stays in the lane may cost a crossing, and the hop
  // drawn over it must not run into an arrowhead of either edge.
  it.each(SAME_LANE_EDGES)('#683: %s draws no hop of %s near an arrowhead', (id, edge) => {
    const { graph, model } = layOut(id);
    const route = model.edges.get(edge)!.points;
    const tooClose = graph.edges
      .filter((other) => other.id !== edge)
      .flatMap((other) => {
        const otherRoute = model.edges.get(other.id)?.points ?? [];
        const tips = [route[0], route.at(-1), otherRoute[0], otherRoute.at(-1)];
        return crossingPointsBetween(route, otherRoute)
          .filter((hop) =>
            tips.some(
              (tip) =>
                tip !== undefined &&
                Math.hypot(tip.x - hop.x, tip.y - hop.y) < EDGE_ROUTING.TERMINAL_HOP_CLEARANCE
            )
          )
          .map((hop) => `${other.id} at (${hop.x.toFixed(1)}, ${hop.y.toFixed(1)})`);
      });
    expect(tooClose).toEqual([]);
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

  // mermaid-js/mermaid#8695: the router ran "B2 -> A2" on through A2 and started "B3 -> A1" inside
  // B3. Each edge is cut where it meets its box, so no route runs on inside a box at either end.
  it('#684: no route of edge-end-on-box runs inside the box at either of its ends', () => {
    const { graph, model, issues } = layOut('regressions/edge-end-on-box');
    expect(issues.map((i) => i.message)).toEqual([]);
    const runsInside: string[] = [];
    for (const e of graph.edges) {
      const points = model.edges.get(e.id)!.points;
      for (const end of [e.source, e.target]) {
        const r = box(model.nodes.get(end)!);
        const deepest = Math.max(
          0,
          ...points.slice(1).map((p, i) => lengthInside(points[i]!, p, r))
        );
        if (deepest >= TOUCH_LENGTH)
          runsInside.push(`${e.id} runs ${deepest.toFixed(1)} px inside ${end}`);
      }
    }
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(runsInside).toEqual([]);
  });

  // mermaid-js/mermaid#8770: ids are ordered by code unit, so the layout is the same for a reader
  // of any language. A stand-in for each locale's `localeCompare` lays the fixture out as that
  // reader would have seen it, were the engine to ask the host.
  describe('#684: the layout of locale-independent-order does not depend on the reader locale', () => {
    const id = 'regressions/locale-independent-order';
    const layOutAs = (locale: string) => {
      readAs(locale);
      try {
        return layOut(id).model;
      } finally {
        vi.restoreAllMocks();
      }
    };

    afterEach(() => vi.restoreAllMocks());

    it('has a stand-in that sorts like an Estonian reader', () => {
      readAs('et-EE');
      expect('z'.localeCompare('t')).toBe(-1);
      expect('z'.localeCompare('t', 'en')).toBe(1);
    });

    it.each(OTHER_LOCALES)('lays out the same for a reader in %s as in en-US', (locale) => {
      expect(layOutAs(locale)).toEqual(layOutAs('en-US'));
    });

    it('stacks the two chains of each lane in code unit order', () => {
      const { model } = layOut(id);
      const y = (node: string) => model.nodes.get(node)!.y;
      // Each pair collates the other way round in the locale named in OTHER_LOCALES.
      for (const [first, second] of [
        ['t', 'z'],
        ['ch', 'h'],
        ['B', 'b'],
        ['y', 'ä'],
      ] as const)
        expect(y(first), `${first} above ${second}`).toBeLessThan(y(second));
    });
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
