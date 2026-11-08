import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { Theme } from '@mermaid-js/core/theme';
import { parseXyChart } from '../parser/index.ts';
import { xyChartTestContext, xyChartTestTheme } from '../test-context.ts';
import type { XyChartModel } from '../model.ts';
import { xyChartLayoutViolations } from './invariants.ts';
import {
  layoutXyChart,
  XYCHART_EMPTY_RANGE,
  XYCHART_LABEL_TOO_SMALL,
  XYCHART_MISSING_VALUE,
  type XyBarPlotLayout,
  type XyChartLayout,
  type XyLinePlotLayout,
} from './index.ts';

// The layout seam: parser-produced models of small sources, laid out with the table measurer.
// v12's numbers are checked by packages/conformance/src/xychart/layout-parity.spec.ts; these
// pin what v13 decided differently (D382, D383, D385) and the shape of the result.
let theme: Theme;
beforeAll(async () => {
  theme = await xyChartTestTheme();
});

function parse(source: string): XyChartModel {
  const r = parseXyChart(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
}

function lay(
  source: string,
  section: Record<string, unknown> = {}
): { layout: XyChartLayout; warnings: Warning[]; model: XyChartModel } {
  const model = parse(source);
  const warnings: Warning[] = [];
  const layout = layoutXyChart(model, xyChartTestContext(theme, section, { warnings }));
  expect(xyChartLayoutViolations(model, layout)).toEqual([]);
  return { layout, warnings, model };
}

const bars = (l: XyChartLayout, i = 0): XyBarPlotLayout => l.plots[i] as XyBarPlotLayout;
const line = (l: XyChartLayout, i = 0): XyLinePlotLayout => l.plots[i] as XyLinePlotLayout;

describe('layoutXyChart: the frame', () => {
  it('puts the x axis under the plot and the y axis left of it when vertical', () => {
    const { layout } = lay('xychart\n  title "T"\n  x-axis [a, b]\n  bar [1, 2]\n');
    const { plot, xAxis, yAxis, title } = layout;
    expect(layout.orientation).toBe('vertical');
    expect([xAxis.position, yAxis.position]).toEqual(['bottom', 'left']);
    expect(xAxis.box.y).toBe(plot.y + plot.height);
    expect(yAxis.box.x + yAxis.box.width).toBe(plot.x);
    expect(title?.text).toBe('T');
    expect([layout.width, layout.height]).toEqual([700, 500]);
  });

  it('puts the x axis left and the y axis on top when horizontal, from the text or the config', () => {
    for (const [src, section] of [
      ['xychart horizontal\n  bar [1, 2]\n', {}],
      ['xychart\n  bar [1, 2]\n', { chartOrientation: 'horizontal' }],
    ] as const) {
      const { layout } = lay(src, section);
      expect(layout.orientation).toBe('horizontal');
      expect([layout.xAxis.position, layout.yAxis.position]).toEqual(['left', 'top']);
      expect(layout.yAxis.box.y + layout.yAxis.box.height).toBe(layout.plot.y);
    }
  });

  it('gives a left linear axis its domain reversed and its ticks counting down', () => {
    const { layout } = lay('xychart\n  y-axis 0 --> 100\n  bar [1, 2]\n');
    expect(layout.yAxis.domain).toEqual([100, 0]);
    expect(layout.yAxis.ticks.map((t) => t.value)).toEqual([
      100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0,
    ]);
  });

  it('drops the title when it does not fit, and the legend when it does not', () => {
    const src = 'xychart\n  title "Too short"\n  line "CPU" [1, 2, 3]\n';
    expect(lay(src).layout.title).toBeDefined();
    expect(lay(src).layout.legend?.rows.map((r) => r.label.text)).toEqual(['CPU']);
    const { layout } = lay(src, { height: 60, width: 120 });
    expect(layout.title).toBeUndefined();
    expect(layout.legend).toBeUndefined();
  });

  it('reads a labelRotation outside ±90 as 0, as v12 did', () => {
    const src = 'xychart\n  x-axis [Monitor, Mouse]\n  bar [1, 2]\n';
    const rot = (r: unknown): number[] =>
      lay(src, { xAxis: { labelRotation: r } }).layout.xAxis.ticks.map((t) => t.label!.rotation);
    expect(rot(45)).toEqual([45, 45]);
    expect(rot(120)).toEqual([0, 0]);
    expect(rot(-100)).toEqual([0, 0]);
  });

  it('lays out author text by core label layout (D385): `<br>` breaks a category', () => {
    const { layout } = lay('xychart\n  x-axis ["one<br>two", b]\n  bar [1, 2]\n');
    const [first, second] = layout.xAxis.ticks;
    expect(first!.label!.label!.lines.length).toBe(2);
    expect(second!.label!.label!.lines.length).toBe(1);
  });

  it('covers every drawn part with the bounds, past the canvas when a label sticks out', () => {
    const { layout } = lay('xychart\n  x-axis [a, b]\n  line [1, 2]\n', {
      width: 200,
      height: 100,
    });
    expect(layout.bounds.x).toBeLessThanOrEqual(0);
    expect(layout.bounds.width).toBeGreaterThanOrEqual(200);
  });
});

describe('layoutXyChart: bars and lines', () => {
  it('draws a vertical bar from the plot bottom to its value, 0.95 · min(2 · outer padding, tick distance) wide', () => {
    const { layout } = lay('xychart\n  x-axis [a, b, c]\n  y-axis 0 --> 10\n  bar [5, 10, 0]\n');
    const { plot } = layout;
    const [b0, b1, b2] = bars(layout).bars;
    for (const b of [b0!, b1!, b2!]) expect(b.y + b.height).toBe(plot.y + plot.height);
    // The y scale runs inside the axis's outer padding: 10 at its top, 0 at its bottom.
    const [top, low] = layout.yAxis.range;
    expect([b1!.y, b2!.y]).toEqual([top, low]);
    const { range, outerPadding, ticks } = layout.xAxis;
    const tickDistance = Math.abs(range[1] - range[0]) / 3;
    // With a bar plot the outer padding grew to ⌊0.7 · tickDistance / 2⌋, read before it grew.
    expect(outerPadding).toBeGreaterThan(0);
    expect(b0!.width).toBeCloseTo(Math.min(2 * outerPadding, tickDistance) * 0.95, 9);
    expect(b0!.x + b0!.width / 2).toBeCloseTo(ticks[0]!.at, 9);
  });

  it('holds a bar past either end of the y range inside the plot box (v12 drew it outside)', () => {
    const { layout } = lay(
      'xychart\n  x-axis [a, b]\n  y-axis 4000 --> 12000\n  bar [500, 20000]\n'
    );
    const { plot } = layout;
    const [low, high] = bars(layout).bars;
    expect(low!.height).toBe(0);
    expect(low!.y).toBe(plot.y + plot.height);
    expect(high!.y).toBe(plot.y);
  });

  it('draws a line through its points as d3 line(), and one point as `M…Z`', () => {
    const { layout } = lay('xychart\n  line [1, 2, 3]\n');
    expect(line(layout).points.length).toBe(3);
    expect(line(layout).path).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+L[\d.]+,[\d.]+$/);
    expect(line(lay('xychart\n  line [4]\n').layout).path).toMatch(/^M[\d.]+,[\d.]+Z$/);
  });

  it('places point labels 10 px above the point, or right of it when horizontal', () => {
    const v = line(lay('xychart\n  x-axis [a, b]\n  line [1 "one", 2]\n').layout);
    expect(v.pointLabels.map((t) => [t.text, t.x, t.y, t.font.size])).toEqual([
      ['one', v.points[0]!.x, v.points[0]!.y - 10, 12],
    ]);
    const h = line(lay('xychart horizontal\n  x-axis [a, b]\n  line [1, 2 "two"]\n').layout);
    expect(h.pointLabels.map((t) => [t.text, t.x, t.y, t.anchor])).toEqual([
      ['two', h.points[1]!.x + 10, h.points[1]!.y, 'start'],
    ]);
  });
});

describe('layoutXyChart: D383, never NaN or Infinity, one warning per kind', () => {
  it('draws no bar, point or label for a missing band value: XYCHART_MISSING_VALUE once', () => {
    const { layout, warnings } = lay('xychart\n  x-axis [a, b, c]\n  bar [1]\n  line [1, 2]\n', {
      showDataLabel: true,
    });
    expect(bars(layout).bars.map((b) => b.datum)).toEqual([0]);
    expect(line(layout, 1).points.map((p) => p.datum)).toEqual([0, 1]);
    expect(warnings.filter((w) => w.code === XYCHART_MISSING_VALUE).map((w) => w.astIds)).toEqual([
      ['plot:1', 'plot:2'],
    ]);
  });

  it('breaks a line at a missing value', () => {
    const src = 'xychart\n  x-axis [a, b, c, d]\n  line [1, 2]\n  bar [1, 2, 3, 4]\n';
    const m = parse(src);
    // The bar plot has every value; the line stops after two.
    expect(m.plots[0]!.data.map((d) => d.y)).toEqual([1, 2, undefined, undefined]);
    expect(line(lay(src).layout).path).not.toContain('NaN');
  });

  it('maps an empty range to the axis middle: XYCHART_EMPTY_RANGE once', () => {
    const { layout, warnings } = lay(
      'xychart\n  x-axis 0 --> 0\n  y-axis 3 --> 3\n  line [3, 3]\n'
    );
    const { plot } = layout;
    const pts = line(layout).points;
    for (const p of pts) {
      expect(p.x).toBeCloseTo(plot.x + plot.width / 2, 6);
      expect(p.y).toBeCloseTo(plot.y + plot.height / 2, 6);
    }
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      [XYCHART_EMPTY_RANGE, ['x-axis', 'y-axis']],
    ]);
  });

  it('draws a 309-digit value at a finite place', () => {
    const big = '9'.repeat(320);
    const { layout } = lay(`xychart\n  bar [1, ${big}]\n  line [${big}, -${big}]\n`);
    expect(bars(layout).bars.length).toBe(2);
  });
});

describe('layoutXyChart: data labels', () => {
  const src = 'xychart\n  x-axis [a, b]\n  y-axis 0 --> 100\n  bar [50, 100]\n  bar [10, 20]\n';

  it('labels each bar plot with its own values (D382), at one font size per plot', () => {
    const { layout } = lay(src, { showDataLabel: true });
    expect(bars(layout, 0).dataLabels.map((t) => t.text)).toEqual(['50', '100']);
    expect(bars(layout, 1).dataLabels.map((t) => t.text)).toEqual(['10', '20']);
    const sizes = new Set(bars(layout, 0).dataLabels.map((t) => t.font.size));
    expect(sizes.size).toBe(1);
    expect(Number.isInteger([...sizes][0])).toBe(true);
  });

  it('puts a label inside the bar top, or above it outside', () => {
    const inside = bars(lay(src, { showDataLabel: true }).layout);
    const b = inside.bars[0]!;
    expect(inside.dataLabels[0]).toMatchObject({
      x: b.x + b.width / 2,
      y: b.y + 10,
      baseline: 'top',
    });
    const outside = bars(lay(src, { showDataLabel: true, showDataLabelOutsideBar: true }).layout);
    expect(outside.dataLabels[0]).toMatchObject({ y: b.y - 10, baseline: 'alphabetic' });
  });

  it('gives a horizontal bar its label 10 px inside its end, or outside it', () => {
    const h = 'xychart horizontal\n  x-axis [a, b]\n  y-axis 0 --> 100\n  bar [50, 100]\n';
    const p = bars(lay(h, { showDataLabel: true }).layout);
    const b = p.bars[0]!;
    expect(p.dataLabels[0]).toMatchObject({
      x: b.x + b.width - 10,
      y: b.y + b.height / 2,
      anchor: 'end',
    });
    const o = bars(lay(h, { showDataLabel: true, showDataLabelOutsideBar: true }).layout);
    expect(o.dataLabels[0]).toMatchObject({ x: b.x + b.width + 10, anchor: 'start' });
  });

  it('labels no bar without an area, and none when none has room: XYCHART_LABEL_TOO_SMALL', () => {
    // Without y labels the y axis has no outer padding, so a 0 is a bar with no height.
    const zero = bars(
      lay('xychart\n  x-axis [a, b]\n  y-axis 0 --> 10\n  bar [0, 5]\n', {
        showDataLabel: true,
        yAxis: { showLabel: false },
      }).layout
    );
    expect(zero.bars[0]!.height).toBe(0);
    expect(zero.dataLabels.map((t) => t.text)).toEqual(['5']);
    const { layout, warnings } = lay('xychart\n  x-axis [a, b]\n  bar [1000000, 2000000]\n', {
      showDataLabel: true,
      width: 100,
      height: 60,
    });
    expect(bars(layout).dataLabels).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain(XYCHART_LABEL_TOO_SMALL);
  });

  it('draws no data labels without showDataLabel', () => {
    expect(bars(lay(src).layout).dataLabels).toEqual([]);
  });
});
