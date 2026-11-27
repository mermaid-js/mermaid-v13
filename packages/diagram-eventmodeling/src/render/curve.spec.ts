import { describe, expect, it } from 'vitest';
import { createSourceHarness } from '@mermaid-js/shared/testing/render-harness';
import { eventmodelingConfigDefaults } from '../generated/config-defaults.ts';
import { eventmodeling } from '../plugin.ts';
import { relationCurve } from './curve.ts';

// `eventmodeling.curve` > `curve` > today's look (D733, D748, #1380). Today's look is not a
// `CurveKind`: with neither key set the layout's own points are drawn as before.
const render = createSourceHarness(eventmodeling);

// Down, up, along, under and a self relation: every route the layout builds.
const SOURCE = [
  'eventmodeling',
  'tf 01 cmd Start',
  'tf 02 evt Started ->> 01',
  'tf 03 evt Continued ->> 02',
  'tf 04 evt Finished ->> 03 ->> 02',
  'tf 05 rmo Status ->> 04 ->> 02',
  'tf 06 ui Screen ->> 05 ->> 06',
  'tf 07 cmd Retry ->> 06',
  'rf 08 evt Retried ->> 07',
  'tf 09 rmo Again',
].join('\n');

interface Drawn {
  id: string;
  d: string;
  head: number[];
}

/** Each relation's path `d` and its head's points, from the SVG text. */
function drawn(svg: string): Drawn[] {
  const out: Drawn[] = [];
  const re =
    /<path class="em-relation" data-id="([^"]*)"[^>]*? d="([^"]*)"[^>]*\/>\s*<polygon [^>]*points="([^"]*)"/g;
  for (const m of svg.matchAll(re))
    out.push({ id: m[1]!, d: m[2]!, head: m[3]!.split(/[\s,]+/).map(Number) });
  return out;
}

/** The writer rounds coordinates to two decimals. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** The self relation's index: the layout's route says which it is. */
const selfOf = (layout: { relations: readonly { route: string }[] }): number =>
  layout.relations.findIndex((r) => r.route === 'self');

async function draw(config?: Record<string, unknown>) {
  const r = await render(SOURCE, config ? { config } : {});
  return { relations: drawn(r.svg), warnings: r.warnings, layout: r.layout, svg: r.svg };
}

/** The points of a path of `M` and `L` only. */
function polyline(d: string): [number, number][] {
  expect(d).not.toMatch(/[^ML\d.,\s-]/);
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

describe('eventmodeling relation curve (D733, D748, #1380)', () => {
  it('has no default curve kind: the schema gives eventmodeling.curve none', () => {
    expect(eventmodelingConfigDefaults).not.toHaveProperty('curve');
    expect(relationCurve({}, () => undefined)).toBeUndefined();
    expect(relationCurve({ eventmodeling: {} }, () => undefined)).toBeUndefined();
  });

  it("draws today's look when neither key is set: the layout's points, its head", async () => {
    const { relations, layout, warnings } = await draw();
    expect(warnings).toEqual([]);
    expect(relations).toHaveLength(layout.relations.length);
    for (const [i, r] of relations.entries()) {
      const laid = layout.relations[i]!;
      expect(polyline(r.d)).toEqual(laid.points.map((p) => [r2(p.x), r2(p.y)]));
      expect(r.head).toEqual(laid.head.flatMap((p) => [r2(p.x), r2(p.y)]));
    }
    const routes = new Set(layout.relations.map((r) => r.route));
    expect([...routes].sort()).toEqual(['along', 'down', 'self', 'under', 'up']);
  });

  it('draws eventmodeling.curve over the top-level curve', async () => {
    const both = await draw({ curve: 'linear', eventmodeling: { curve: 'step' } });
    const own = await draw({ eventmodeling: { curve: 'step' } });
    const global = await draw({ curve: 'linear' });
    expect(both.warnings).toEqual([]);
    expect(both.relations).toEqual(own.relations);
    expect(both.relations).not.toEqual(global.relations);
  });

  it('draws the top-level curve when eventmodeling.curve is unset, over the unset look', async () => {
    const global = await draw({ curve: 'linear' });
    const own = await draw({ eventmodeling: { curve: 'linear' } });
    const unset = await draw();
    expect(global.warnings).toEqual([]);
    expect(global.relations).toEqual(own.relations);
    expect(global.relations).not.toEqual(unset.relations);
  });

  for (const curve of ['linear', 'step'] as const) {
    it(`points the head along the end of a ${curve} path, which stops at the head's base`, async () => {
      const { relations, layout } = await draw({ eventmodeling: { curve } });
      let turned = 0;
      for (const [i, r] of relations.entries()) {
        const laid = layout.relations[i]!;
        const tip = laid.points[laid.points.length - 1]!;
        // The head's tip stays on the target's edge.
        expect([r.head[2], r.head[3]]).toEqual([r2(tip.x), r2(tip.y)]);
        if (i === selfOf(layout)) continue;
        const line = polyline(r.d);
        const end = line[line.length - 1]!;
        // The line ends at the middle of the head's base (to the writer's two decimals).
        const mid = [(r.head[0]! + r.head[4]!) / 2, (r.head[1]! + r.head[5]!) / 2];
        expect(end[0]).toBeCloseTo(mid[0]!, 1);
        expect(end[1]).toBeCloseTo(mid[1]!, 1);
        const head = [r.head[2]! - end[0], r.head[3]! - end[1]];
        // A relation along a lane to the next box is as long as its head: no line is left.
        const before = line[line.length - 2];
        if (before) {
          const along = [end[0] - before[0], end[1] - before[1]];
          const scale = Math.hypot(along[0]!, along[1]!) * Math.hypot(head[0]!, head[1]!);
          // Parallel and the same way: the sine of the angle between them is 0, the cosine 1.
          expect((along[0]! * head[1]! - along[1]! * head[0]!) / scale).toBeCloseTo(0, 1);
          expect((along[0]! * head[0]! + along[1]! * head[1]!) / scale).toBeCloseTo(1, 1);
        }
        if (curve === 'step') expect(Math.min(Math.abs(head[0]!), Math.abs(head[1]!))).toBe(0);
        if (r.head.join() !== laid.head.flatMap((p) => [r2(p.x), r2(p.y)]).join()) turned++;
      }
      // A relation between lanes ends square to its box under `step`, not along the diagonal.
      if (curve === 'step') expect(turned).toBeGreaterThan(0);
    });
  }

  it('keeps a self relation as it is, whatever the curve', async () => {
    const base = await draw();
    const at = selfOf(base.layout);
    expect(at).toBeGreaterThanOrEqual(0);
    const unset = base.relations[at]!;
    expect(polyline(unset.d)).toHaveLength(4);
    for (const curve of ['linear', 'step', 'rounded', 'basis'])
      for (const config of [{ curve }, { eventmodeling: { curve } }]) {
        const set = (await draw(config)).relations[at]!;
        expect(set).toEqual(unset);
      }
  });

  it('draws an unknown name with rounded and warns CURVE_UNKNOWN once', async () => {
    const { relations, warnings } = await draw({ eventmodeling: { curve: 'bogus' } });
    const rounded = await draw({ eventmodeling: { curve: 'rounded' } });
    expect(relations).toEqual(rounded.relations);
    const unknown = warnings.filter((w) => w.code === 'CURVE_UNKNOWN');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.message).toContain('bogus');
  });
});
