// The XY chart theme table (spec #426 §Theme, D331, D335, D381, D388, D540, D545), resolved
// with `createTheme(spec, { diagram: table })` in every theme: the twelve colours follow
// `primaryTextColor` and `background`, the palette reads `plotColorArray`, and an author sets
// either by the flat name or by v12's nested `themeVariables.xyChart` key, the flat name
// winning. The v12 oracle comparison in all eleven themes is
// `packages/conformance/src/xychart/theme.spec.ts`.
import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, THEME_NAMES, type ThemeName } from '@mermaid-js/core/theme';
import { xychart } from '../plugin.ts';
import { theme as table } from './table.ts';
import { THEME_VARIABLES } from './vocabulary.ts';

const COLOURS = Object.keys(THEME_VARIABLES).filter((n) => THEME_VARIABLES[n]!.kind === 'color');
const TEXT = COLOURS.filter((n) => n !== 'xyChartBackgroundColor');

const resolve = async (name: ThemeName, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name), { diagram: table, cssVariables: false, themeVariables });

describe('xychart theme table', () => {
  it("is the plugin's table, under the xyChart section, with v12's thirteen keys nested", () => {
    expect(xychart.theme).toBe(table);
    expect(table.section).toBe('xyChart');
    expect(Object.keys(table.vars)).toHaveLength(13);
    expect(table.vars.xyChartPlotColorPalette).toMatchObject({
      kind: 'palette',
      nested: 'plotColorPalette',
    });
    expect(table.vars.xyChartXAxisLineColor!.nested).toBe('xAxisLineColor');
  });

  it.each(THEME_NAMES)(
    '%s: text and axis colours are primaryTextColor, the background background',
    async (name) => {
      const t = await resolve(name);
      for (const n of TEXT) expect(t.value(n), n).toBe(t.value('primaryTextColor'));
      expect(t.value('xyChartBackgroundColor')).toBe(t.value('background'));
      expect(t.palette('xyChartPlotColorPalette')).toEqual(t.palette('plotColorArray'));
      expect(t.palette('xyChartPlotColorPalette')).toHaveLength(10);
    }
  );

  it('gives each classic light theme its own v12 palette through plotColorArray (D381)', async () => {
    const first = async (name: ThemeName) =>
      (await resolve(name)).palette('xyChartPlotColorPalette')[0];
    expect(
      await Promise.all((['default', 'base', 'forest', 'neutral', 'dark'] as const).map(first))
    ).toEqual(['#ECECFF', '#FFF4DD', '#CDE498', '#EEE', '#3498db']);
  });

  it('follows primaryTextColor and background overrides, under default too (D388)', async () => {
    const t = await resolve('default', { primaryTextColor: '#102030', background: '#fafafa' });
    expect(t.value('xyChartTitleColor')).toBe('#102030');
    expect(t.value('xyChartDataLabelColor')).toBe('#102030');
    expect(t.value('xyChartBackgroundColor')).toBe('#fafafa');
  });

  it('takes the nested xyChart keys, the flat name winning (D335, D540)', async () => {
    const t = await resolve('redux', {
      xyChart: { titleColor: '#aa0000', legendTextColor: '#00aa00', backgroundColor: '#eeeeee' },
      xyChartLegendTextColor: '#0000aa',
    });
    expect(t.value('xyChartTitleColor')).toBe('#aa0000');
    expect(t.value('xyChartLegendTextColor')).toBe('#0000aa');
    expect(t.value('xyChartBackgroundColor')).toBe('#eeeeee');
    expect(t.value('xyChartXAxisLabelColor')).toBe(t.value('primaryTextColor'));
  });

  it('takes a palette as a comma-separated string or an array, nested or flat; an empty one is unset (D545)', async () => {
    const nested = await resolve('neo', { xyChart: { plotColorPalette: '#111111, #222222' } });
    expect(nested.palette('xyChartPlotColorPalette')).toEqual(['#111111', '#222222']);
    const flat = await resolve('neo', {
      xyChartPlotColorPalette: ['#333333'],
      xyChart: { plotColorPalette: '#111111' },
    });
    expect(flat.palette('xyChartPlotColorPalette')).toEqual(['#333333']);
    // An empty flat list is unset, so the nested key applies (D545).
    const under = await resolve('neo', {
      xyChartPlotColorPalette: [],
      xyChart: { plotColorPalette: ['#555555'] },
    });
    expect(under.palette('xyChartPlotColorPalette')).toEqual(['#555555']);
    const empty = await resolve('neo', { xyChart: { plotColorPalette: [] } });
    expect(empty.palette('xyChartPlotColorPalette')).toEqual(empty.palette('plotColorArray'));
    const shared = await resolve('neo', { plotColorArray: '#444444' });
    expect(shared.palette('xyChartPlotColorPalette')).toEqual(['#444444']);
  });
});
