import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { parseXyChart } from '../parser/index.ts';
import { xyChartTestContext, xyChartTestTheme } from '../test-context.ts';
import { xyChartLayoutViolations } from './invariants.ts';
import { layoutXyChart, type XyBarPlotLayout, type XyChartLayout } from './index.ts';

// Each invariant catches the breakage it names: a sound layout, then one rule broken at a time.
let theme: Theme;
beforeAll(async () => {
  theme = await xyChartTestTheme();
});

const SRC =
  'xychart\n  title "T"\n  x-axis [a, b, c]\n  y-axis 0 --> 10\n  bar "B" [1, 5, 9]\n  line "L" [2, 4, 6]\n';
const model = () => parseXyChart(SRC).model;
const ok = (): XyChartLayout => layoutXyChart(model(), xyChartTestContext(theme));
const broken = (f: (l: XyChartLayout) => XyChartLayout): string[] =>
  xyChartLayoutViolations(model(), f(ok()));
const withBars = (l: XyChartLayout, f: (p: XyBarPlotLayout) => XyBarPlotLayout): XyChartLayout => ({
  ...l,
  plots: l.plots.map((p) => (p.kind === 'bar' ? f(p) : p)),
});

describe('xyChartLayoutViolations', () => {
  it('passes a sound layout', () => {
    expect(xyChartLayoutViolations(model(), ok())).toEqual([]);
  });

  it('catches a NaN or an Infinity anywhere', () => {
    expect(broken((l) => ({ ...l, plot: { ...l.plot, x: Number.NaN } }))).toContain(
      'layout.plot.x is NaN'
    );
    expect(broken((l) => ({ ...l, bounds: { ...l.bounds, width: Infinity } }))).toContain(
      'layout.bounds.width is Infinity'
    );
  });

  it('catches a bar outside the plot, not from the axis, or a missing one', () => {
    const v = broken((l) =>
      withBars(l, (p) => ({
        ...p,
        bars: p.bars
          .slice(1)
          .map((b, i) =>
            i === 0 ? { ...b, y: b.y - 1000, height: b.height + 1000 } : { ...b, y: b.y + 1 }
          ),
      }))
    );
    expect(v).toEqual(
      expect.arrayContaining([
        'plot 0 draws 2 of 3 values',
        'plot 0, bar 1 is outside the plot box',
        'plot 0, bar 2 does not run from the axis to its value',
      ])
    );
  });

  it('catches band centres out of order, and ticks outside the range', () => {
    const v = broken((l) => ({
      ...l,
      xAxis: { ...l.xAxis, ticks: [...l.xAxis.ticks].reverse() },
      yAxis: { ...l.yAxis, ticks: l.yAxis.ticks.map((t) => ({ ...t, at: t.at + 10_000 })) },
    }));
    expect(v.some((x) => x.startsWith('band centre of'))).toBe(true);
    expect(v.some((x) => x.startsWith('y tick'))).toBe(true);
  });

  it('catches a legend outside the canvas and a title under the plot', () => {
    const v = broken((l) => ({
      ...l,
      legend: l.legend && { ...l.legend, box: { ...l.legend.box, x: l.width } },
      title: l.title && { ...l.title, y: l.plot.y + 50, box: { ...l.title.box, y: l.plot.y + 40 } },
    }));
    expect(v).toEqual(
      expect.arrayContaining([
        'the legend is outside the canvas',
        'the title is not above the plot',
      ])
    );
  });

  it('catches NaN written in a path or a number text', () => {
    const v = broken((l) => ({
      ...l,
      plots: l.plots.map((p) => (p.kind === 'line' ? { ...p, path: 'M0,NaNL1,1' } : p)),
      yAxis: {
        ...l.yAxis,
        ticks: l.yAxis.ticks.map((t, i) =>
          i === 0 && t.label ? { ...t, label: { ...t.label, text: 'Infinity' } } : t
        ),
      },
    }));
    expect(v.some((x) => x.endsWith('writes M0,NaNL1,1'))).toBe(true);
    expect(v.some((x) => x.endsWith('writes Infinity'))).toBe(true);
  });

  it('catches legend row labels that overlap', () => {
    const v = broken((l) => ({
      ...l,
      legend: l.legend && {
        ...l.legend,
        rows: l.legend.rows.map((r) => ({
          ...r,
          label: { ...r.label, box: { ...r.label.box, height: 500 } },
        })),
      },
    }));
    expect(v.some((x) => x.includes("label overlaps the next row's"))).toBe(true);
  });

  it('catches contents outside the bounds', () => {
    const v = broken((l) => ({ ...l, bounds: { ...l.bounds, width: l.bounds.width / 2 } }));
    expect(v.some((x) => x.endsWith('is outside the bounds'))).toBe(true);
  });
});
