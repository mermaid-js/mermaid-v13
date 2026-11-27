/**
 * #513: the XY chart's thirteen theme variables (its own `DiagramPlugin.theme` table, D322,
 * D331) against what v12 12.2.0's renderer drew with, in all eleven themes (D151: v12 is the
 * oracle). v12 keeps them in a nested `xyChart` object, and its DB merges the theme's object
 * over theme-default's (`xychartDb.ts:42-46`, `cleanAndMerge` of the two `xyChart` blocks), so
 * a key a theme's block leaves out (the six redux/neo themes have no `dataLabelColor`) drew
 * with theme-default's. Colours compare as hex; the plot
 * palette as its list of colours (v12 split the string on `,`).
 *
 * Every value that differs is in `DIFFERENCES` with its decision, and the list must match the
 * differences found exactly: D333(b), the data labels of the three light themes whose v12 block
 * leaves them out take the theme's own `primaryTextColor` where v12 drew theme-default's
 * `#131300`. The three dark ones (redux-dark, redux-dark-color, neo-dark) draw `#131300` again,
 * as v12 did, because their light text is unreadable on the light bars (D749, amending D333(b)).
 * Author overrides: a nested `themeVariables.xyChart` key wins key by key as in v12 (D335),
 * colours and the palette (a string or an array) alike; the flat name wins over it (D540); a
 * shared `primaryTextColor` or `background` override moves the derived colours as in v12: in
 * every theme but `default`, which keeps its block (D656, replacing D388; `OVERRIDES` lists none).
 */
import { xychart } from '@mermaid-js/diagram-xychart';
import {
  THEME_NAMES,
  createTheme,
  loadTheme,
  type Theme,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { flatName, paletteColours } from '../diagram-themes.ts';
import { v12Vars } from '../v12-theme.ts';
import { hex } from '../hex.ts';

type Block = Readonly<Record<string, unknown>>;
type Vars = Readonly<Record<string, unknown>>;

/** What v12's XY chart drew with: the theme's `xyChart` over theme-default's (`xychartDb.ts:42`). */
function v12XyChart(theme: string, themeVariables?: object): Block {
  const fallback = v12Vars('default').xyChart as Block;
  const own = v12Vars(theme, themeVariables).xyChart as Block | undefined;
  return { ...fallback, ...own };
}

const VARS = xychart.theme.vars;
/**
 * v13's own variable, which v12 has no key for: labels outside the bars, which v12 drew in
 * `dataLabelColor` like the ones inside (D749). Compared with v12 on its own below.
 */
const OUTSIDE = 'xyChartDataLabelOutsideColor';
/** Flat v13 name → v12's nested `xyChart` key (the table's `nested`, D335). */
const NESTED = Object.entries(VARS)
  .filter(([name]) => name !== OUTSIDE)
  .map(([name, v]) => [name, v.nested ?? ''] as const);
const PALETTE = 'xyChartPlotColorPalette';

const SECTION = xychart.theme.section!;

const v13Theme = async (name: ThemeName, themeVariables?: Vars): Promise<Theme> =>
  createTheme(await loadTheme(name), {
    cssVariables: false,
    diagram: xychart.theme,
    ...(themeVariables ? { themeVariables } : {}),
  });

/** A variable's v13 value, comparable with v12's. */
const v13Of = (t: Theme, name: string): string | undefined =>
  name === PALETTE ? paletteColours(t.palette(name)) : hex(t.value(name));
/** The value v12 drew a variable with, from its `xyChart` block. */
const v12Of = (block: Block, key: string, name: string): string | undefined =>
  name === PALETTE ? paletteColours(block[key]) : hex(block[key]);

/** Every variable where v13 differs from v12, by theme, with its decision. */
const D333B =
  'D333(b): v12’s block here sets no dataLabelColor, so it drew theme-default’s #131300; v13 takes the theme’s primaryTextColor';
const UNTHEMED: readonly ThemeName[] = ['redux', 'redux-color', 'neo'];
/** The dark themes whose v12 block also sets no dataLabelColor: v13 draws v12's ink (D749). */
const DARK_INK: readonly ThemeName[] = ['redux-dark', 'redux-dark-color', 'neo-dark'];
const DIFFERENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.fromEntries(
  UNTHEMED.map((t) => [t, { xyChartDataLabelColor: D333B }])
);

/** The variables whose v13 value is not v12's, in one theme. */
async function differing(name: ThemeName, themeVariables?: Vars): Promise<string[]> {
  const old = v12XyChart(name, themeVariables);
  const theme = await v13Theme(name, themeVariables);
  return NESTED.filter(([n, key]) => v13Of(theme, n) !== v12Of(old, key, n)).map(([n]) => n);
}

/**
 * Shared-variable overrides and the variables in which v13 differs from v12, with why. Since
 * D656 `default` keeps its block under both overrides, as v12's does. In the three dark themes of
 * D749 a dark author `primaryTextColor` reads on the light bars, so the labels take it where v12
 * kept `#131300`.
 */
const D749 =
  'D749: the labels take the canvas text where it reads on the first bar colour, else v12’s #131300';
const OVERRIDES: readonly {
  readonly theme: ThemeName;
  readonly vars: Vars;
  readonly differ: Readonly<Record<string, string>>;
}[] = DARK_INK.map((theme) => ({
  theme,
  vars: { primaryTextColor: '#102030' },
  differ: { xyChartDataLabelColor: D749 },
}));

describe('xychart theme variables against v12 12.2.0 (#513, D333(b), D335, D381, D540, D656, D749)', () => {
  it("covers v12's thirteen xyChart keys, each a flat xyChart variable nested under `xyChart`", () => {
    const keys = Object.keys(v12Vars('default').xyChart as Block).sort();
    expect(NESTED.map(([, key]) => key).sort()).toEqual(keys);
    expect(xychart.theme.section).toBe('xyChart');
    expect(NESTED.every(([n, key]) => n === flatName(SECTION, key))).toBe(true);
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: every xychart variable is v12’s, apart from the listed differences',
    async (name) => {
      const listed = Object.keys(DIFFERENCES[name] ?? {});
      expect(await differing(name)).toEqual(listed);
      const old = v12XyChart(name);
      const theme = await v13Theme(name);
      const names = NESTED.filter(([n]) => !listed.includes(n));
      expect(Object.fromEntries(names.map(([n]) => [n, v13Of(theme, n)]))).toEqual(
        Object.fromEntries(names.map(([n, key]) => [n, v12Of(old, key, n)]))
      );
    }
  );

  it.each(UNTHEMED.map((n) => [n]))(
    '%s: data labels are #131300 in v12 and the theme’s primaryTextColor in v13 (D333(b))',
    async (name) => {
      expect(hex(v12XyChart(name).dataLabelColor)).toBe('#131300');
      expect((v12Vars(name).xyChart as Block).dataLabelColor).toBeUndefined();
      const theme = await v13Theme(name);
      expect(hex(theme.value('xyChartDataLabelColor'))).toBe(hex(theme.value('primaryTextColor')));
    }
  );

  it.each(DARK_INK.map((n) => [n]))(
    '%s: data labels are v12’s #131300, not the theme’s light primaryTextColor (D749)',
    async (name) => {
      expect((v12Vars(name).xyChart as Block).dataLabelColor).toBeUndefined();
      const theme = await v13Theme(name);
      expect(hex(theme.value('xyChartDataLabelColor'))).toBe(hex(v12XyChart(name).dataLabelColor));
      expect(hex(theme.value('primaryTextColor'))).not.toBe('#131300');
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: labels outside the bars are v12’s dataLabelColor, or the canvas text where v12 fell back to #131300 (D749)',
    async (name) => {
      const theme = await v13Theme(name);
      const fallback = (v12Vars(name).xyChart as Block).dataLabelColor === undefined;
      expect(hex(theme.value(OUTSIDE))).toBe(
        fallback ? hex(theme.value('primaryTextColor')) : hex(v12XyChart(name).dataLabelColor)
      );
      // An author's dataLabelColor colours both, as in v12; the outside key only the outside.
      const shared = await v13Theme(name, { xyChart: { dataLabelColor: '#0a0b0c' } });
      expect(hex(shared.value(OUTSIDE))).toBe('#0a0b0c');
      const own = await v13Theme(name, {
        xyChart: { dataLabelColor: '#0a0b0c', dataLabelOutsideColor: '#fefdfc' },
      });
      expect(hex(own.value(OUTSIDE))).toBe('#fefdfc');
      expect(hex(own.value('xyChartDataLabelColor'))).toBe('#0a0b0c');
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: an author `themeVariables.xyChart` object wins key by key, as in v12 (D335)',
    async (name) => {
      for (const nested of [
        { titleColor: '#123456', xAxisLineColor: '#abcdef', dataLabelColor: '#0a0b0c' },
        { plotColorPalette: '#111111, #222222,#333333' },
        { plotColorPalette: ['#444444', '#555555'], backgroundColor: '#fefefe' },
      ]) {
        const theme = await v13Theme(name, { xyChart: nested });
        // v12 split only a string; an array is v13's other form of the same list.
        const asV12 = Array.isArray(nested.plotColorPalette)
          ? { ...nested, plotColorPalette: nested.plotColorPalette.join(',') }
          : nested;
        const old = v12XyChart(name, { xyChart: asV12 });
        const listed = Object.keys(nested).map((k) => flatName(SECTION, k));
        for (const n of listed)
          expect(v13Of(theme, n), `${name} ${n}`).toBe(v12Of(old, VARS[n]!.nested!, n));
        // The keys not set keep the theme's values.
        expect(await differing(name, { xyChart: nested }), JSON.stringify(nested)).toEqual(
          Object.keys(DIFFERENCES[name] ?? {}).filter((n) => !listed.includes(n))
        );
      }
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: a flat xychart variable wins over the nested key (D540)',
    async (name) => {
      const theme = await v13Theme(name, {
        xyChartTitleColor: '#ff0000',
        xyChartPlotColorPalette: ['#00ffff'],
        xyChart: { titleColor: '#00ff00', plotColorPalette: '#0000ff', legendTextColor: '#0000aa' },
      });
      expect(hex(theme.value('xyChartTitleColor'))).toBe('#ff0000');
      expect(theme.palette(PALETTE)).toEqual(['#00ffff']);
      expect(hex(theme.value('xyChartLegendTextColor'))).toBe('#0000aa');
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: shared primaryTextColor and background overrides, against v12 (D656)',
    async (name) => {
      for (const vars of [{ primaryTextColor: '#102030' }, { background: '#fafafa' }]) {
        const listed = OVERRIDES.find(
          (o) => o.theme === name && JSON.stringify(o.vars) === JSON.stringify(vars)
        );
        const want = [
          ...new Set([
            ...Object.keys(DIFFERENCES[name] ?? {}),
            ...Object.keys(listed?.differ ?? {}),
          ]),
        ];
        const got = await differing(name, vars);
        expect(got.sort(), `${name} ${JSON.stringify(vars)}`).toEqual(want.sort());
      }
    }
  );
});
