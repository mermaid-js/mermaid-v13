import { describe, expect, it } from 'vitest';
import type { RoutePoint } from '@mermaid-js/core/layout';
import { streamWriter } from '@mermaid-js/core/svg';
import { curveKind, curveReporter, routePath, type CurveKind } from './route.ts';

const down = (x: number, y: number): RoutePoint => ({ x, y, axis: 'v' });
const side = (x: number, y: number): RoutePoint => ({ x, y, axis: 'h' });

// The route the layered engine gives an edge between two ranks: down, across, down.
const Z: RoutePoint[] = [down(0, 0), down(0, 50), side(100, 50), down(100, 100)];

const path = (kind: CurveKind, route: readonly RoutePoint[] = Z, trim = 0): string =>
  routePath(streamWriter(), route, kind, trim, trim).d;

describe('routePath step curves (#356, D602)', () => {
  it.each(['step', 'stepBefore', 'stepAfter'] as const)('%s has right angles only', (kind) => {
    expect(path(kind)).not.toMatch(/[QAC]/);
    expect(path(kind, Z, 6)).not.toMatch(/[QAC]/);
  });

  it('draws the three step variants differently for one route', () => {
    const [step, before, after] = (['step', 'stepBefore', 'stepAfter'] as const).map((k) =>
      path(k)
    );
    expect(new Set([step, before, after]).size).toBe(3);
  });

  it('puts the step in the middle, near the start or near the end of the leg', () => {
    expect(path('step')).toBe('M0,0L0,50L100,50L100,100');
    const before = path('stepBefore');
    const after = path('stepAfter');
    expect(before).toMatch(/^M0,0L0,(\d+(\.\d+)?)L100,\1L100,100$/);
    expect(after).toMatch(/^M0,0L0,(\d+(\.\d+)?)L100,\1L100,100$/);
    const y = (d: string): number => Number(/^M0,0L0,([\d.]+)/.exec(d)![1]);
    expect(y(before)).toBeLessThan(50);
    expect(y(after)).toBeGreaterThan(50);
  });

  it('leaves a route with more than one bend as the engine routed it', () => {
    const detour = [
      down(0, 0),
      down(0, 20),
      side(60, 20),
      down(60, 80),
      side(100, 80),
      down(100, 100),
    ];
    expect(path('stepBefore', detour)).toBe(path('step', detour));
  });

  it.each(['stepBefore', 'stepAfter'] as const)(
    '%s leaves a U-shaped route as the engine routed it',
    (kind) => {
      // The across leg (y 120) lies beyond both ends (y 0 and 100): moving it between them would
      // make the last leg enter the node from the wrong side.
      const u = [down(0, 0), down(0, 120), side(100, 120), down(100, 100)];
      expect(path(kind, u)).toBe(path('step', u));
      expect(path(kind, u)).toBe('M0,0L0,120L100,120L100,100');
      expect(path(kind, u, 6)).toBe(path('step', u, 6));
      // And the same with the legs running across.
      const across = [side(0, 0), side(120, 0), down(120, 100), side(100, 100)];
      expect(path(kind, across)).toBe(path('step', across));
    }
  );

  it('moves the across leg only where it lies clear of the marker room at both ends', () => {
    const tight = [down(0, 0), down(0, 10), side(100, 10), down(100, 20)];
    for (const kind of ['stepBefore', 'stepAfter'] as const) {
      expect(path(kind, tight, 12)).toBe(path('step', tight, 12));
    }
  });

  it('turns an interior offset leg by the plain inset, without marker room', () => {
    // Not from the layered engine: a diagonal leg between two bends. The marker room (6) belongs to
    // the first and last legs only, so this leg turns a quarter of its 40 away from each end.
    const bent = [down(0, 0), down(0, 20), down(60, 60), down(60, 100)];
    expect(path('stepBefore', bent, 6)).toContain('L60,30');
    expect(path('stepAfter', bent, 6)).toContain('L0,50');
    expect(path('step', bent, 6)).toContain('L60,40');
    for (const k of ['step', 'stepBefore', 'stepAfter'] as const) {
      expect(path(k, bent, 6)).not.toMatch(/[QAC]/);
    }
  });

  it('keeps the marker room at the ends of a two-point offset route', () => {
    const diagonal = [down(0, 0), down(100, 100)];
    const [step, before, after] = (['step', 'stepBefore', 'stepAfter'] as const).map((k) =>
      path(k, diagonal, 6)
    );
    expect(step).toContain('L0,50');
    expect(before).toContain('L0,');
    expect(new Set([step, before, after]).size).toBe(3);
    const ys = (d: string): number[] => [...d.matchAll(/L0,([\d.]+)/g)].map((m) => Number(m[1]!));
    expect(Math.min(...ys(before!))).toBeGreaterThanOrEqual(6);
    expect(Math.max(...ys(after!))).toBeLessThanOrEqual(94);
  });

  it('leaves rounded corners as arcs and curved legs as S-curves', () => {
    expect(path('rounded')).toMatch(/A5,5/);
    expect(path('curved')).toMatch(/C/);
  });
});

describe('curveKind (#356, D602)', () => {
  it('returns each known name unchanged and warns for none', () => {
    const seen: unknown[] = [];
    for (const k of ['linear', 'step', 'stepBefore', 'stepAfter', 'rounded']) {
      expect(curveKind(k, (w) => seen.push(w))).toBe(k);
    }
    expect(curveKind('basis', (w) => seen.push(w))).toBe('curved');
    expect(curveKind(undefined, (w) => seen.push(w))).toBe('curved');
    expect(seen).toEqual([]);
  });

  it('draws an unknown name curved and reports it as CURVE_UNKNOWN', () => {
    const seen: { code: string; message: string }[] = [];
    expect(curveKind('bogus', (w) => seen.push(w))).toBe('curved');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('CURVE_UNKNOWN');
    expect(seen[0]!.message).toContain('bogus');
    expect(seen[0]).not.toHaveProperty('path');
  });

  it('stays silent without a sink', () => {
    expect(curveKind('bogus')).toBe('curved');
  });
});

describe('curveReporter', () => {
  it('warns once per unknown name, however many edges use it', () => {
    const seen: string[] = [];
    const kind = curveReporter((w) => seen.push(w.message));
    for (const c of ['bogus', 'bogus', 'oops', 'bogus', 'step', undefined]) kind(c);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('bogus');
    expect(seen[1]).toContain('oops');
  });

  it('starts afresh for every render', () => {
    const seen: string[] = [];
    curveReporter((w) => seen.push(w.message))('bogus');
    curveReporter((w) => seen.push(w.message))('bogus');
    expect(seen).toHaveLength(2);
  });
});
