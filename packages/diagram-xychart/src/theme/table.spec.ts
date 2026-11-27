// The XY chart theme table (spec #426 §Theme, D331, D335, D381, D540, D545, D656), resolved
// with `createTheme(spec, { diagram: table })` in every theme: the twelve colours read the canvas
// inputs, the palette reads `plotColorArray`, and an author sets
// either by the flat name or by v12's nested `themeVariables.xyChart` key, the flat name
// winning. The v12 oracle comparison in all eleven themes is
// `packages/conformance/src/xychart/theme.spec.ts`.
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  createTheme,
  loadTheme,
  parseColor,
  THEME_NAMES,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { xychart } from '../plugin.ts';
import { theme as table } from './table.ts';
import { THEME_VARIABLES } from './vocabulary.ts';

const COLOURS = Object.keys(THEME_VARIABLES).filter((n) => THEME_VARIABLES[n]!.kind === 'color');
const TEXT = COLOURS.filter((n) => n !== 'xyChartBackgroundColor');

/** The dark redux and neo themes, whose data labels take a dark ink inside the bars (D749). */
const DARK_INK: readonly ThemeName[] = ['redux-dark', 'redux-dark-color', 'neo-dark'];

const resolve = async (name: ThemeName, themeVariables?: Record<string, unknown>) =>
  createTheme(await loadTheme(name), { diagram: table, cssVariables: false, themeVariables });

describe('xychart theme table', () => {
  it("is the plugin's table, under the xyChart section, with v12's thirteen keys and v13's outside-label key nested", () => {
    expect(xychart.theme).toBe(table);
    expect(table.section).toBe('xyChart');
    expect(Object.keys(table.vars)).toHaveLength(14);
    expect(table.vars.xyChartDataLabelOutsideColor!.nested).toBe('dataLabelOutsideColor');
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
      const text = DARK_INK.includes(name)
        ? TEXT.filter((n) => n !== 'xyChartDataLabelColor')
        : TEXT;
      for (const n of text) expect(t.value(n), n).toBe(t.value('primaryTextColor'));
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

  it('follows primaryTextColor and background overrides, but keeps its colours under default (D656)', async () => {
    const vars = { primaryTextColor: '#102030', background: '#fafafa' };
    const forest = await resolve('forest', vars);
    expect(forest.value('xyChartTitleColor')).toBe('#102030');
    expect(forest.value('xyChartDataLabelColor')).toBe('#102030');
    expect(forest.value('xyChartBackgroundColor')).toBe('#fafafa');
    const t = await resolve('default', vars);
    expect(t.value('xyChartTitleColor')).toBe('#131300');
    expect(t.value('xyChartBackgroundColor')).toBe('#ffffff');
  });

  it('follows an author canvasTextColor and canvasBkg in every theme (D656)', async () => {
    const t = await resolve('default', { canvasTextColor: '#102030', canvasBkg: '#fafafa' });
    expect(t.value('xyChartTitleColor')).toBe('#102030');
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

  it.each(DARK_INK)(
    "%s: data labels take v12's dark ink #131300, AA on every palette slot (D749)",
    async (name) => {
      const t = await resolve(name);
      expect(t.value('xyChartDataLabelColor')).toBe('#131300');
      const ink = parseColor(t.value('xyChartDataLabelColor'))!;
      for (const slot of t.palette('xyChartPlotColorPalette'))
        expect(contrastRatio(ink, parseColor(slot)!), slot).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each(DARK_INK)(
    '%s: the canvas text stays the label ink where it reads on the first bar colour (D749)',
    async (name) => {
      const t = await resolve(name, { plotColorArray: ['#202020', '#303030'] });
      expect(t.value('xyChartDataLabelColor')).toBe(t.value('primaryTextColor'));
    }
  );

  it.each(DARK_INK)("%s: an author's dataLabelColor still wins (D749)", async (name) => {
    expect(
      (await resolve(name, { xyChart: { dataLabelColor: '#ffeeaa' } })).value(
        'xyChartDataLabelColor'
      )
    ).toBe('#ffeeaa');
    expect(
      (await resolve(name, { xyChartDataLabelColor: '#aaeeff' })).value('xyChartDataLabelColor')
    ).toBe('#aaeeff');
  });

  it.each(DARK_INK)(
    '%s: labels outside the bars keep the canvas text, AA on the canvas (D749)',
    async (name) => {
      const t = await resolve(name);
      expect(t.value('xyChartDataLabelOutsideColor')).toBe(t.value('primaryTextColor'));
      const ink = parseColor(t.value('xyChartDataLabelOutsideColor'))!;
      const canvas = parseColor(t.value('xyChartBackgroundColor'))!;
      expect(contrastRatio(ink, canvas)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each(DARK_INK)(
    "%s: an author's dataLabelColor sets both, the outside key only the outside labels (D749)",
    async (name) => {
      const both = await resolve(name, { xyChartDataLabelColor: '#ffeeaa' });
      expect(both.value('xyChartDataLabelOutsideColor')).toBe('#ffeeaa');
      const own = await resolve(name, {
        xyChartDataLabelColor: '#ffeeaa',
        xyChartDataLabelOutsideColor: '#aaeeff',
      });
      expect(own.value('xyChartDataLabelColor')).toBe('#ffeeaa');
      expect(own.value('xyChartDataLabelOutsideColor')).toBe('#aaeeff');
      const outside = await resolve(name, { xyChart: { dataLabelOutsideColor: '#aaeeff' } });
      expect(outside.value('xyChartDataLabelColor')).toBe('#131300');
      expect(outside.value('xyChartDataLabelOutsideColor')).toBe('#aaeeff');
    }
  );
});
