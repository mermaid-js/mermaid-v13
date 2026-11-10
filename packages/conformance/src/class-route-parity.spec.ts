import { describe, expect, it } from 'vitest';
import type { RoutePoint } from '@mermaid-js/core/layout';
import { streamWriter } from '@mermaid-js/core/svg';
import { routePath as classRoute } from '@mermaid-js/diagram-class/testing';
import { routePath as flowRoute, type CurveKind } from '@mermaid-js/diagram-flowchart/testing';
import { routePath as requirementRoute } from '@mermaid-js/diagram-requirement/testing';

// The class and requirement renderers draw edges with a copy of the flowchart's `routePath`
// (packages never import each other, spec #126 T4, spec #520 T4). This keeps the copies equal: a
// fix in one fails here until it is made in the others.

const KINDS: readonly CurveKind[] = [
  'curved',
  'linear',
  'step',
  'stepBefore',
  'stepAfter',
  'rounded',
];

/** A small deterministic generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function route(r: () => number): RoutePoint[] {
  const n = 2 + Math.floor(r() * 5);
  const pts: RoutePoint[] = [];
  let x = Math.round(r() * 200);
  let y = Math.round(r() * 200);
  for (let i = 0; i < n; i++) {
    const axis = r() < 0.5 ? 'h' : 'v';
    // Mostly right-angle legs, as the engine routes, with some free ones and repeated points.
    const k = r();
    if (k < 0.4) x += Math.round((r() - 0.5) * 160);
    else if (k < 0.8) y += Math.round((r() - 0.5) * 160);
    else if (k < 0.95) {
      x += Math.round((r() - 0.5) * 80);
      y += Math.round((r() - 0.5) * 80);
    }
    pts.push({ x, y, axis });
  }
  return pts;
}

const draw = (f: typeof flowRoute, pts: RoutePoint[], kind: CurveKind, s: number, e: number) => {
  const w = streamWriter();
  const p = f(w, pts, kind, s, e);
  return { ...p, d: String(p.d) };
};

describe('class, requirement and flowchart routePath stay the same', () => {
  it('draws identical paths and ends on generated routes', () => {
    const r = rng(156);
    let n = 0;
    for (let i = 0; i < 600; i++) {
      const pts = route(r);
      const kind = KINDS[i % KINDS.length]!;
      const s = [0, 4, 13.5, 17.25][Math.floor(r() * 4)]!;
      const e = [0, 4, 13.5, 17.25][Math.floor(r() * 4)]!;
      const flow = draw(flowRoute, pts, kind, s, e);
      expect(draw(classRoute, pts, kind, s, e), JSON.stringify({ pts, kind, s, e })).toEqual(flow);
      expect(draw(requirementRoute, pts, kind, s, e), JSON.stringify({ pts, kind, s, e })).toEqual(
        flow
      );
      n++;
    }
    expect(n).toBe(600);
  });
});
