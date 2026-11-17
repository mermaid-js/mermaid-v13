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
