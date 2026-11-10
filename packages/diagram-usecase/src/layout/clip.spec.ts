import { describe, expect, it } from 'vitest';
import type { LayoutModelEdge, RoutePoint } from '@mermaid-js/core/layout';
import { clipEdge, type Oval } from './clip.ts';

/** An oval at the origin, 100 × 40. */
const OVAL: Oval = { cx: 0, cy: 0, rx: 50, ry: 20 };

const p = (x: number, y: number, axis: 'h' | 'v'): RoutePoint => ({ x, y, axis });
const edge = (...points: RoutePoint[]): LayoutModelEdge => ({
  points,
  ports: { source: 'bottom', target: 'top' },
});
const round = (points: readonly RoutePoint[]) =>
  points.map((q) => [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100, q.axis]);

/** Where the vertical line x = 20 meets the oval: y = ±20·√(1 − 0.16). */
const AT_20 = Math.round(20 * Math.sqrt(1 - 0.16) * 100) / 100;

describe('clipEdge', () => {
  it('moves a target end along its last segment onto the oval', () => {
    const out = clipEdge(edge(p(20, -100, 'v'), p(20, -20, 'v')), undefined, OVAL);
    expect(round(out.points)).toEqual([
      [20, -100, 'v'],
      [20, -AT_20, 'v'],
    ]);
  });

  it('gives a source end the axis of the leg it now leaves by, when points inside are dropped', () => {
    // The route leaves across ('h') from a point inside the oval, then turns down ('v'): the
    // new first segment is the downward leg.
    const out = clipEdge(edge(p(0, 0, 'h'), p(20, 0, 'h'), p(20, 60, 'v'), p(100, 60, 'h')), OVAL);
    expect(round(out.points)).toEqual([
      [20, AT_20, 'v'],
      [20, 60, 'v'],
      [100, 60, 'h'],
    ]);
  });

  it('runs a source end that misses the oval to it toward the centre, with fresh axes', () => {
    // y = 30 never meets an oval 20 high: one step in, toward the centre, and the old first
    // point now runs in from that step.
    const out = clipEdge(edge(p(60, 30, 'v'), p(200, 30, 'h')), OVAL);
    expect(out.points.map((q) => q.axis)).toEqual(['h', 'h', 'h']);
    const [hit] = out.points;
    expect((hit!.x / 50) ** 2 + (hit!.y / 20) ** 2).toBeCloseTo(1, 9);
    expect(round(out.points.slice(1))).toEqual([
      [60, 30, 'h'],
      [200, 30, 'h'],
    ]);
  });

  it('steps back past a zero-length last segment to the previous distinct point', () => {
    const out = clipEdge(edge(p(20, -100, 'v'), p(20, -20, 'v'), p(20, -20, 'v')), undefined, OVAL);
    expect(round(out.points)).toEqual([
      [20, -100, 'v'],
      [20, -AT_20, 'v'],
    ]);
  });

  it('ends on a point already on the oval without a second copy of it', () => {
    const out = clipEdge(edge(p(0, -100, 'v'), p(0, -20, 'v'), p(0, 0, 'v')), undefined, OVAL);
    expect(round(out.points)).toEqual([
      [0, -100, 'v'],
      [0, -20, 'v'],
    ]);
  });

  it('leaves a route alone on a flat oval (no width or no height)', () => {
    const route = edge(p(20, -100, 'v'), p(20, -20, 'v'));
    for (const flat of [
      { ...OVAL, rx: 0 },
      { ...OVAL, ry: 0 },
    ]) {
      const out = clipEdge(route, flat, flat);
      expect(out.points).toEqual(route.points);
      expect(out.points.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
    }
  });

  it('leaves a route that lies wholly inside the oval as it is', () => {
    const route = edge(p(-10, 0, 'h'), p(10, 0, 'h'));
    expect(clipEdge(route, OVAL, OVAL).points).toEqual(route.points);
  });
});
