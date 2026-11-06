import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attrs, PathData, SafeColor, SafeValue } from '@mermaid-js/core/svg';
import { pathBuilder } from '@mermaid-js/core/svg';
import roughModule from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core.js';
import { sketch, strokeLineDash, type SketchOptions } from './sketch.ts';

// The default import is roughjs's object itself (see `sketch.ts`); its types put it under `.default`.
const rough = roughModule as unknown as typeof roughModule.default;

const FILL = '#ffeeaa' as SafeColor;
const STROKE = '#333' as SafeColor;

/** v12's node options (`userNodeOverrides`), without the paints and the seed. */
const NODE: SketchOptions = {
  roughness: 0.7,
  fillStyle: 'hachure',
  fillWeight: 1.5,
  hachureGap: 1.5,
};

/** The oracle: roughjs's own op sets, written the way core's `PathBuilder` writes numbers. */
function oracle(drawable: Drawable): { set: string; d: PathData }[] {
  return drawable.sets.map((set) => {
    const p = pathBuilder();
    for (const { op, data: n } of set.ops) {
      if (op === 'move') p.moveTo(n[0]!, n[1]!);
      else if (op === 'lineTo') p.lineTo(n[0]!, n[1]!);
      else p.curveTo(n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!);
    }
    return { set: set.type, d: p.done() };
  });
}

const gen = rough.generator();
/** v12's options for a filled, stroked node, as `userNodeOverrides` builds them. */
const v12 = (extra: Options = {}): Options => ({
  ...NODE,
  fill: '#ffeeaa',
  stroke: '#333',
  strokeWidth: 1.3,
  strokeLineDash: [0, 0],
  ...extra,
});

const paint = { fill: FILL, stroke: STROKE };
const cases: [string, Parameters<typeof sketch>[0], Attrs, (o: Options) => Drawable][] = [
  ['rect', 'rect', { x: -5, y: 3, width: 80, height: 50 }, (o) => gen.rectangle(-5, 3, 80, 50, o)],
  ['circle', 'circle', { cx: 30, cy: 40, r: 14 }, (o) => gen.circle(30, 40, 28, o)],
  [
    'ellipse',
    'ellipse',
    { cx: 30, cy: 40, rx: 50, ry: 20 },
    (o) => gen.ellipse(30, 40, 100, 40, o),
  ],
  [
    'polygon',
    'polygon',
    { points: [0, 25, 40, 0, 80, 25, 40, 50] },
    (o) =>
      gen.polygon(
        [
          [0, 25],
          [40, 0],
          [80, 25],
          [40, 50],
        ],
        o
      ),
  ],
  ['line', 'line', { x1: 0, y1: 10, x2: 140, y2: 10 }, (o) => gen.line(0, 10, 140, 10, o)],
  [
    'path',
    'path',
    { d: 'M0,0L60,0C80,0 80,40 60,40L0,40Z' as PathData },
    (o) => gen.path('M0,0L60,0C80,0 80,40 60,40L0,40Z', o),
  ],
  [
    "rounded rect (v12's createRoundedRectPathD)",
    'rect',
    { x: 10, y: 20, width: 100, height: 40, rx: 5, ry: 5 },
    (o) =>
      gen.path(
        'M 15 20 H 105 A 5 5 0 0 1 110 25 V 55 A 5 5 0 0 1 105 60 H 15 A 5 5 0 0 1 10 55 V 25 A 5 5 0 0 1 15 20 Z',
        o
      ),
  ],
];
const optionSets: [string, SketchOptions][] = [
  ['node', NODE],
  ['group', { ...NODE, fillWeight: 3 }],
  ['solid part', { ...NODE, fillStyle: 'solid' }],
  ['mark', { ...NODE, hachureAngle: 120 }],
  ['edge', { ...NODE, roughness: 0.3 }],
];

describe('sketch (H1)', () => {
  it("sketches a rect as roughjs's rectangle: hachure, then the outline", () => {
    const attrs: Attrs = { x: 10, y: 20, width: 120, height: 40, fill: FILL, stroke: STROKE };
    const out = sketch('rect', attrs, NODE, 42);
    expect(out?.map((p) => ({ set: p.set, d: p.attrs.d }))).toEqual(
      oracle(gen.rectangle(10, 20, 120, 40, v12({ seed: 42 })))
    );
  });

  describe("each tag is roughjs's matching generator call, op for op", () => {
    for (const [name, tag, geometry, draw] of cases)
      for (const [role, options] of optionSets)
        for (const seed of [1, 42, 2147483647])
          it(`${name}, ${role} options, seed ${seed}`, () => {
            const out = sketch(tag, { ...geometry, ...paint }, options, seed);
            expect(out?.map((p) => ({ set: p.set, d: p.attrs.d }))).toEqual(
              oracle(draw(v12({ ...options, seed })))
            );
          });
  });

  it('returns undefined, for the plain leaf, when the geometry cannot be sketched', () => {
    expect(sketch('rect', { width: '100%', height: 20, ...paint }, NODE, 1)).toBeUndefined();
    expect(sketch('rect', { width: 20, ...paint }, NODE, 1)).toBeUndefined();
    expect(sketch('circle', { cx: 1, cy: 1, ...paint }, NODE, 1)).toBeUndefined();
    expect(sketch('ellipse', { rx: 4, ...paint }, NODE, 1)).toBeUndefined();
    expect(sketch('polygon', { points: [1, 2], ...paint }, NODE, 1)).toBeUndefined();
    expect(sketch('path', { ...paint }, NODE, 1)).toBeUndefined();
  });

  describe('seeds (D304)', () => {
    const box: Attrs = { x: 0, y: 0, width: 60, height: 30, fill: FILL, stroke: STROKE };
    const at = (seed: number) => sketch('rect', box, NODE, seed);

    it("passes seed | 0 through, so a non-zero seed is v12's roughjs output", () => {
      expect(at(1.9)).toEqual(at(1));
      expect(at(2 ** 32 + 5)).toEqual(at(5));
      expect(at(-3)).not.toEqual(at(3));
    });

    it('maps 0, and what | 0 makes 0, to 2147483647', () => {
      expect(at(0)).toEqual(at(2147483647));
      expect(at(Number.NaN)).toEqual(at(2147483647));
      expect(at(0.5)).toEqual(at(2147483647));
      expect(at(2 ** 32)).toEqual(at(2147483647));
    });

    it('gives a different sketch for a different seed, and the same one every time', () => {
      expect(at(1)).not.toEqual(at(2));
      expect(at(42)).toEqual(at(42));
    });
  });

  describe('never reaches Math.random (R-ARCH-6, D304)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    const trap = () =>
      vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random');
      });

    it('the trap is real: roughjs itself calls Math.random for seed 0', () => {
      trap();
      expect(() => gen.rectangle(0, 0, 10, 10, v12({ seed: 0 }))).toThrow('Math.random');
    });

    it('over every tag, role option set and seed, 0 included', () => {
      trap();
      for (const [, tag, geometry] of cases)
        for (const [, options] of optionSets)
          for (const seed of [0, 1, -7, 2147483647])
            for (const fill of [FILL, 'none' as const])
              expect(
                sketch(tag, { ...geometry, fill, stroke: STROKE }, options, seed)
              ).toBeDefined();
    });

    it("refuses roughness 1 or more and other fill styles, roughjs's other Math.random paths", () => {
      const box: Attrs = { width: 10, height: 10, fill: FILL };
      expect(() => sketch('rect', box, { ...NODE, roughness: 1 }, 1)).toThrow(RangeError);
      expect(() => sketch('rect', box, { ...NODE, fillStyle: 'dots' as 'solid' }, 1)).toThrow(
        RangeError
      );
    });
  });

  // v12's `getStrokeDashArray` (handDrawnShapeStyles.ts at fa796a943), which turns the
  // `stroke-dasharray` style into roughjs's `strokeLineDash`. Its spec has no cases of its own.
  describe("strokeLineDash: v12's stroke-dasharray to roughjs", () => {
    it.each([
      [undefined, [0, 0]],
      ['', [0, 0]],
      ['5', [5, 5]],
      ['5 3', [5, 3]],
      ['  4   2  ', [4, 2]],
      ['5 3 1', [5, 3]],
      ['dash', [0, 0]],
      ['5 x', [5, 0]],
      ['x 5', [0, 5]],
      ['5,3', [0, 0]],
    ])('%j → %j', (value, dash) => {
      expect(strokeLineDash(value)).toEqual(dash);
    });
  });

  // roughjs moves a point by at most roughness × maxRandomnessOffset (2; 2.3 for a path's
  // curves), plus the bowing, which grows with a line's length (1/200 of it). A solid path fill
  // adds fillShapeRoughnessGain (0.8) to the roughness; hachure lines can end one scan-line step
  // past a sloped edge; an ellipse's radii vary by curveFitting (5 %) and its curve overshoots
  // between points. The viewBox padding must cover this (H3).
  describe('every sketched point stays within the outline box plus roughjs’s maximum offset', () => {
    const margin = (set: string, kind: string, o: SketchOptions, diag: number, radius: number) =>
      (o.roughness + (set === 'fillPath' && kind === 'path' ? 0.8 : 0)) * 2.3 * (1 + diag / 200) +
      (set === 'fillSketch' ? 2 * o.hachureGap : 0) +
      (kind === 'ellipse' ? 0.06 * radius : 0);
    const sizes = [
      [10, 10],
      [40, 30],
      [120, 40],
      [300, 60],
      [900, 500],
    ] as const;
    for (const [w, h] of sizes)
      it(`${w}×${h}`, () => {
        const outlines: [string, Parameters<typeof sketch>[0], Attrs][] = [
          ['rect', 'rect', { x: 0, y: 0, width: w, height: h }],
          ['path', 'rect', { x: 0, y: 0, width: w, height: h, rx: 5 }],
          ['ellipse', 'ellipse', { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 }],
          ['polygon', 'polygon', { points: [0, h / 2, w / 2, 0, w, h / 2, w / 2, h] }],
          ['line', 'line', { x1: 0, y1: 0, x2: w, y2: h }],
          ['path', 'path', { d: `M0,0L${w},0L${w},${h}L0,${h}Z` as PathData }],
        ];
        let worst = -Infinity;
        for (const [kind, tag, geometry] of outlines)
          for (const [, options] of optionSets)
            for (let seed = 1; seed <= 20; seed++)
              for (const p of sketch(
                tag,
                { ...geometry, fill: FILL, stroke: STROKE },
                options,
                seed
              )!) {
                const m = margin(p.set, kind, options, Math.hypot(w, h), Math.max(w, h) / 2);
                const n = (p.attrs.d ?? '').match(/-?[\d.]+/g)!.map(Number);
                for (let i = 0; i < n.length; i += 2) {
                  const out = Math.max(-n[i]!, n[i]! - w, -n[i + 1]!, n[i + 1]! - h);
                  worst = Math.max(worst, out - m);
                }
              }
        expect(worst).toBeLessThanOrEqual(0);
      });
  });

  describe('paints map back onto the op sets; colours never enter roughjs', () => {
    const DASH = '5 3' as SafeValue;
    const box: Attrs = { x: 0, y: 0, width: 50, height: 30 };
    const paints = (tag: 'rect', attrs: Attrs, options: SketchOptions = NODE) =>
      sketch(tag, attrs, options, 7)?.map(({ set, attrs: { d, ...rest } }) => ({ set, ...rest }));

    it('hachure takes the fill as its stroke, at the fill weight; the outline takes the stroke', () => {
      expect(
        paints('rect', {
          ...box,
          fill: FILL,
          stroke: STROKE,
          'stroke-width': 2,
          'stroke-dasharray': DASH,
        })
      ).toEqual([
        { set: 'fillSketch', fill: 'none', stroke: FILL, 'stroke-width': 1.5 },
        { set: 'path', fill: 'none', stroke: STROKE, 'stroke-width': 2, 'stroke-dasharray': DASH },
      ]);
    });

    it('a solid fill takes the fill, with no stroke', () => {
      expect(
        paints('rect', { ...box, fill: FILL, stroke: STROKE }, { ...NODE, fillStyle: 'solid' })
      ).toEqual([
        { set: 'fillPath', fill: FILL, stroke: 'none' },
        { set: 'path', fill: 'none', stroke: STROKE },
      ]);
    });

    it('fill none (or no fill) draws no fill set; stroke none (or none given) no outline', () => {
      expect(paints('rect', { ...box, fill: 'none', stroke: STROKE })?.map((p) => p.set)).toEqual([
        'path',
      ]);
      expect(paints('rect', { ...box, stroke: STROKE })?.map((p) => p.set)).toEqual(['path']);
      expect(paints('rect', { ...box, fill: FILL, stroke: 'none' })?.map((p) => p.set)).toEqual([
        'fillSketch',
      ]);
      expect(paints('rect', { ...box, fill: FILL })?.map((p) => p.set)).toEqual(['fillSketch']);
    });

    it('keeps theme variables and the gradient as they are', () => {
      const out = sketch(
        'rect',
        { ...box, fill: 'var(--mermaid-mainBkg)' as never, stroke: 'url(#m-gradient)' as never },
        NODE,
        7
      );
      expect(out?.map((p) => p.attrs.stroke)).toEqual([
        'var(--mermaid-mainBkg)',
        'url(#m-gradient)',
      ]);
    });
  });
});
