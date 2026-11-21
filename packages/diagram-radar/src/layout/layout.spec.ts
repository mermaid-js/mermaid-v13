import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { RadarModel } from '../model.ts';
import { radar as plugin } from '../plugin.ts';
import { parseRadar } from '../parser/index.ts';
import { FIXTURES, axis, curve, model } from './fixtures.ts';
import { layoutRadar, type RadarLayout } from './index.ts';
import type { Rect } from './types.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

// A measurer with round numbers, so expected positions are worked by hand from v12's code:
// every character is 10 px wide, the ascent is 0.8 of the size and a line 1.2 of it.
const tenPx: Measurer = {
  id: 'ten',
  width: (text) => text.length * 10,
  metrics: (font) => ({
    ascent: font.size * 0.8,
    descent: font.size * 0.2,
    lineHeight: font.size * 1.2,
  }),
};

function lay(
  m: RadarModel,
  radar: Record<string, unknown> = {},
  warnings: Warning[] = [],
  themeVariables: Record<string, unknown> = {}
): RadarLayout {
  return layoutRadar(m, {
    config: { radar } as unknown as ResolvedConfig,
    measurer: tenPx,
    theme: createTheme(spec, { themeVariables, diagram: plugin.theme }),
    warn: (w) => warnings.push(w),
  });
}

const abc = ['A', 'B', 'C'].map((n) => axis(n));

/** Two boxes share area (touching edges do not count). */
const meets = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('radar layout: the frame, worked from v12 renderer.ts', () => {
  it('centres the chart on the 700 px canvas with radius 300', () => {
    const l = lay(FIXTURES.simple!);
    expect(l.center).toEqual({ x: 350, y: 350 });
    expect(l.radius).toBe(300);
    expect(l.axisLength).toBe(300);
    expect(l.labelRadius).toBeCloseTo(319);
  });

  it('takes width, height and margins from the radar config', () => {
    const l = lay(FIXTURES.simple!, { width: 400, height: 200, marginLeft: 10, marginTop: 100 });
    expect(l.center).toEqual({ x: 210, y: 200 });
    expect(l.radius).toBe(100);
    expect(lay(FIXTURES.simple!, { axisScaleFactor: 0.5 }).axisLength).toBe(150);
  });

  it('falls back to v12’s default for a value outside the schema range, with one warning', () => {
    for (const width of [0, -5, Number.NaN, 'wide', Infinity]) {
      const warnings: Warning[] = [];
      expect(lay(FIXTURES.simple!, { width }, warnings).center.x).toBe(350);
      expect(warnings.map((w) => w.code)).toEqual(['RADAR_CONFIG_INVALID']);
    }
    expect(lay(FIXTURES.simple!, { curveTension: 2 }).curves).toEqual(lay(FIXTURES.simple!).curves);
  });

  it('reads a numeric string as its number', () => {
    const warnings: Warning[] = [];
    expect(lay(FIXTURES.simple!, { width: '300' }, warnings).center.x).toBe(200);
    expect(warnings).toEqual([]);
  });
});

describe('radar layout: spokes and axis labels (v12 drawAxes)', () => {
  it('puts axis i at 2πi/n − π/2, clockwise from 12 o’clock', () => {
    const [a, b, c] = lay(FIXTURES.simple!).spokes;
    expect(a!.angle).toBeCloseTo(-Math.PI / 2);
    expect(a!.end.x).toBeCloseTo(350);
    expect(a!.end.y).toBeCloseTo(50);
    // 30° below 3 o'clock, then 30° below 9 o'clock.
    expect(b!.end.x).toBeCloseTo(350 + 300 * Math.cos(Math.PI / 6));
    expect(b!.end.y).toBeCloseTo(350 + 150);
    expect(c!.end.x).toBeCloseTo(350 - 300 * Math.cos(Math.PI / 6));
    expect(c!.end.y).toBeCloseTo(500);
  });

  it('anchors labels at 1.05 · radius + 4 by v12’s ±0.01 dead band', () => {
    const l = lay(
      model(
        ['N', 'E', 'S', 'W'].map((x) => axis(x)),
        []
      )
    );
    expect(l.spokes.map((s) => [s.textAnchor, s.baseline])).toEqual([
      ['middle', 'auto'],
      ['start', 'central'],
      ['middle', 'hanging'],
      ['end', 'central'],
    ]);
    const [n, e, s, w] = l.spokes;
    expect(n!.anchor.x).toBeCloseTo(350);
    expect(n!.anchor.y).toBeCloseTo(350 - 319);
    // "N" is 10 px wide at 12 px (line 14.4, baseline from the line top 11.04 or so).
    expect(n!.label.x).toBeCloseTo(345);
    expect(n!.label.y + n!.label.text.baseline).toBeCloseTo(31);
    expect(e!.label.x).toBeCloseTo(669);
    expect(e!.label.y + e!.label.height / 2).toBeCloseTo(350);
    expect(s!.label.y).toBeCloseTo(669);
    expect(w!.label.x + w!.label.width).toBeCloseTo(31);
    expect(l.fonts.axis.size).toBe(12);
  });

  it('takes axisLabelFactor from the radar config', () => {
    const l = lay(FIXTURES.simple!, { axisLabelFactor: 1.5 });
    expect(l.labelRadius).toBe(454);
    expect(l.spokes[0]!.anchor.y).toBeCloseTo(350 - 454);
  });

  it('lays out labels with core label layout: <br> breaks, away from the chart (D355)', () => {
    const l = lay(FIXTURES.wide!);
    const [, two, , three] = l.spokes;
    expect(two!.label.text.lines).toHaveLength(2);
    // Axis D is at 9 o'clock: `central`, so its three lines centre on the anchor.
    expect(three!.label.text.lines).toHaveLength(3);
    expect(three!.label.y + three!.label.height / 2).toBeCloseTo(three!.anchor.y);
    // An `auto` label of two lines keeps its last baseline on the anchor.
    const up = lay(model([axis('A', 'One<br>Two'), axis('B'), axis('C')], [])).spokes[0]!;
    expect(
      up.label.y + up.label.height - up.label.text.lineHeight + up.label.text.baseline
    ).toBeCloseTo(up.anchor.y);
  });
});

describe('radar layout: graticule (v12 drawGraticule)', () => {
  it('draws ticks circles at radius · k / ticks', () => {
    const l = lay(FIXTURES.simple!);
    expect(l.ticks).toBe(5);
    expect(l.rings.map((r) => r.radius)).toEqual([60, 120, 180, 240, 300]);
    expect(l.rings.every((r) => r.points.length === 0)).toBe(true);
  });

  it('draws polygons through the spoke directions', () => {
    const l = lay(FIXTURES.ninjas!);
    expect(l.rings).toHaveLength(3);
    const outer = l.rings[2]!;
    expect(outer.points).toHaveLength(5);
    expect(outer.points[0]!.x).toBeCloseTo(350);
    expect(outer.points[0]!.y).toBeCloseTo(50);
    expect(outer.points[1]!.x).toBeCloseTo(l.spokes[1]!.end.x);
  });

  it('keeps v12’s rings for fractional ticks: the last one is past the radius (Q4)', () => {
    expect(lay(FIXTURES.halfTicks!).rings.map((r) => r.radius)).toEqual([200, 400]);
    expect(lay(FIXTURES.noTicks!).rings).toEqual([]);
    expect(lay(FIXTURES.maxTicks!).rings).toHaveLength(32);
    // The model holds ticks at 32 (`RADAR_TICKS_CLAMPED`); the layout draws what it is given.
    expect(lay(parseRadar('radar-beta\nticks 40').model).rings).toHaveLength(32);
    expect(lay(model(abc, [], { ticks: 40 })).rings).toHaveLength(40);
  });

  it('draws no polygon ring without axes (v12 wrote points="")', () => {
    expect(lay(FIXTURES.empty!).rings).toEqual([]);
    expect(lay(model([], [])).rings).toHaveLength(5);
  });
});

describe('radar layout: curves (v12 drawCurves)', () => {
  it('scales by the largest entry when max is unset: point i on spoke i', () => {
    const l = lay(FIXTURES.simple!);
    expect([l.min, l.max]).toEqual([0, 3]);
    const [p0, p1, p2] = l.curves[0]!.points;
    expect(p0!.x).toBeCloseTo(350);
    expect(p0!.y).toBeCloseTo(350 - 100);
    expect(Math.hypot(p1!.x - 350, p1!.y - 350)).toBeCloseTo(200);
    expect(p2!.x).toBeCloseTo(350 - 300 * Math.cos(Math.PI / 6));
  });

  it('takes max and min from the options and clamps values to them', () => {
    const l = lay(FIXTURES.clamped!);
    expect([l.min, l.max]).toEqual([10, 100]);
    const r = l.curves[0]!.points.map((p) => Math.hypot(p.x - 350, p.y - 350));
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo((300 * 40) / 90);
    expect(r[2]).toBeCloseTo(300);
  });

  it('draws a closed Catmull-Rom curve as cubic Bézier segments under circle, at curveTension', () => {
    const l = lay(FIXTURES.simple!, { curveTension: 0.5 });
    const { points, segments } = l.curves[0]!;
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.to)).toEqual([points[1], points[2], points[0]]);
    // Segment 0, from p1 = points[0] to p2 = points[1]: c1 = p1 + (p2 − p0)·t with p0 = points[2].
    expect(segments[0]!.c1.x).toBeCloseTo(points[0]!.x + (points[1]!.x - points[2]!.x) * 0.5);
    expect(segments[0]!.c2.y).toBeCloseTo(points[1]!.y - (points[2]!.y - points[0]!.y) * 0.5);
  });

  it('draws polygons under polygon: no segments', () => {
    expect(lay(FIXTURES.ninjas!).curves.map((c) => c.segments.length)).toEqual([0, 0, 0]);
  });

  it('skips a curve whose entry count is not the axis count, and does not warn (D356)', () => {
    const warnings: Warning[] = [];
    const l = lay(
      model(abc, [
        curve('c1', [1, 2, 3]),
        curve('c2', [1, 2]),
        curve('c3', [1]),
        curve('c4', [3, 2, 1]),
      ]),
      {},
      warnings
    );
    expect(l.curves.map((c) => [c.index, c.slot])).toEqual([
      [0, 0],
      [3, 3],
    ]);
    expect(l.legend.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    // `RADAR_CURVE_SKIPPED` is the parser's, with positions.
    expect(warnings).toEqual([]);
  });

  it('draws an empty range at the centre, never NaN, and does not warn (D356)', () => {
    const warnings: Warning[] = [];
    const l = lay(FIXTURES.emptyRange!, {}, warnings);
    expect(l.curves[0]!.points.every((p) => p.x === 350 && p.y === 350)).toBe(true);
    // `RADAR_EMPTY_RANGE` is the parser's, with positions.
    expect(warnings).toEqual([]);
  });

  it('keeps v12’s formula for max under min: every point on the radius', () => {
    const r = lay(FIXTURES.inverted!).curves[0]!.points.map((p) =>
      Math.hypot(p.x - 350, p.y - 350)
    );
    for (const x of r) expect(x).toBeCloseTo(300);
  });

  it('wraps the colour slot after twelve curves (D353)', () => {
    const l = lay(FIXTURES.many!);
    expect(l.curves[12]!.slot).toBe(0);
    expect(l.legend[12]!.slot).toBe(0);
  });

  it('does not overflow on huge values', () => {
    const r = lay(FIXTURES.huge!).curves[0]!.points.map((p) => Math.hypot(p.x - 350, p.y - 350));
    expect(r[2]).toBeCloseTo(300);
    expect(r[0]).toBeCloseTo((300 * 1) / 1.7);
  });
});

describe('radar layout: legend and title', () => {
  it('rows at (¾(w/2 + mR), −¾(h/2 + mT) + 20·i) from the centre, text 16 px right', () => {
    const l = lay(FIXTURES.multiple!);
    expect(l.legend.map((r) => [r.swatch.x, r.swatch.y])).toEqual([
      [350 + 262.5, 350 - 262.5],
      [350 + 262.5, 350 - 242.5],
    ]);
    expect(l.legend[0]!.swatch).toMatchObject({ width: 12, height: 12 });
    expect(l.legend[0]!.label).toMatchObject({ x: 350 + 262.5 + 16, y: 87.5, width: 20 });
    expect(l.fonts.legend.size).toBe(12);
  });

  it('keeps the text 4 px right of a swatch radarLegendBoxSize wide, as v12’s 16 from 12 (D359)', () => {
    const l = lay(FIXTURES.multiple!, {}, [], { radarLegendBoxSize: 18 });
    expect(l.legend[0]!.swatch).toMatchObject({ width: 18, height: 18 });
    expect(l.legend[0]!.label.x).toBe(350 + 262.5 + 18 + 4);
  });

  it('draws no rows without showLegend', () => {
    expect(lay(FIXTURES.noLegend!).legend).toEqual([]);
  });

  it('a legend label of several lines pushes the next rows down by its extra lines', () => {
    const l = lay(model(abc, [curve('a', [1, 2, 3], 'One<br>Two'), curve('b', [1, 2, 3])]));
    expect(l.legend[1]!.swatch.y - l.legend[0]!.swatch.y).toBeCloseTo(20 + 14.4);
  });

  it('moves the whole legend right of an axis label a row meets, rows kept (#846, D614)', () => {
    // Eight axes: "Axis label 1" at 45° is start-anchored at x ≈ 575.6 and 120 px wide, so at
    // v12's x of 612.5 legend row 1 (y 107.5) sits on it.
    const l = lay(FIXTURES.legendOnLabel!);
    const label = l.spokes[1]!.label;
    const right = label.x + label.width;
    expect(right).toBeGreaterThan(350 + 262.5);
    expect(l.legend.map((r) => [r.swatch.x, r.swatch.y])).toEqual([
      [right + 4, 87.5],
      [right + 4, 107.5],
    ]);
    expect(l.legend[0]!.label.x).toBe(right + 4 + 16);
    for (const row of l.legend)
      for (const spoke of l.spokes) {
        expect(meets(row.swatch, spoke.label)).toBe(false);
        expect(meets(row.label, spoke.label)).toBe(false);
      }
    expect(l.bounds.x + l.bounds.width).toBeGreaterThanOrEqual(l.legend[0]!.label.x + 10);
  });

  it('keeps v12’s legend position when no row meets an axis label (D614)', () => {
    const l = lay(FIXTURES.ninjas!);
    expect(l.legend.every((r) => r.swatch.x === 350 + 262.5)).toBe(true);
  });

  it('the title: middle-anchored on the centre at the canvas top, in fontSize', () => {
    const l = lay(FIXTURES.simple!);
    expect(l.title).toMatchObject({ y: 0, width: 150 });
    expect(l.title!.x + l.title!.width / 2).toBe(350);
    expect(l.fonts.title.size).toBe(16);
    expect(lay(FIXTURES.multiple!).title).toBeUndefined();
    expect(lay(FIXTURES.simple!, {}, [], { fontSize: '80px' }).fonts.title.size).toBe(80);
  });

  it('lays out a markdown string as markdown', () => {
    const l = lay(model([axis('A', '`**bold**`')], [], {}, { title: '`*it*`' }));
    expect(l.spokes[0]!.label.text.lines[0]!.map((r) => r.text).join('')).toBe('bold');
    expect(l.title!.text.lines[0]!.map((r) => r.text).join('')).toBe('it');
  });
});

describe('radar layout: bounds (D354)', () => {
  it('is v12’s 700 px canvas when everything fits', () => {
    expect(lay(FIXTURES.multiple!).bounds).toEqual({ x: 0, y: 0, width: 700, height: 700 });
  });

  it('grows to cover labels, the legend and the title past the canvas', () => {
    const l = lay(FIXTURES.wide!);
    expect(l.bounds.x).toBeLessThan(0);
    expect(l.bounds.x + l.bounds.width).toBeGreaterThan(700);
  });

  it('grows to cover a fractional-ticks ring past the radius', () => {
    const b = lay(FIXTURES.halfTicks!).bounds;
    expect(b.x).toBeCloseTo(350 - 400.5);
    expect(b.height).toBeCloseTo(801);
  });
});

describe('radar layout: an entry past a double (309+ digits, D356)', () => {
  const radii = (l: RadarLayout, i: number): number[] =>
    l.curves[i]!.points.map((p) => Math.hypot(p.x - 350, p.y - 350));

  it('without max: Infinity on the radius, finite values at the centre, never NaN', () => {
    const l = lay(FIXTURES.infinite!);
    expect(l.max).toBe(Infinity);
    expect(radii(l, 0)).toEqual([0, 300, 0]);
    expect(radii(l, 1)).toEqual([300, 0, 0]);
  });

  it('with max: Infinity clamps to the radius', () => {
    const r = radii(lay(FIXTURES.infiniteMax!), 0);
    expect(r[0]).toBeCloseTo(75);
    expect(r[1]).toBeCloseTo(300);
  });

  it('max = min = Infinity: the centre', () => {
    expect(radii(lay(FIXTURES.infiniteRange!), 0)).toEqual([0, 0, 0]);
  });

  it('ticks past a double: 32 rings from the parser, none from a non-finite model', () => {
    expect(lay(parseRadar(`radar-beta\nticks 1${'0'.repeat(400)}`).model).rings).toHaveLength(32);
    for (const ticks of [Infinity, Number.NaN, -1])
      expect(lay(model(abc, [], { ticks })).rings, String(ticks)).toEqual([]);
  });
});
