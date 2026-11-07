/**
 * #449: radar's ten theme variables (its own `DiagramPlugin.theme` table, D322, D331) against
 * v12 12.2.0's `getThemeVariables()` in all eleven themes (D151: v12 is the oracle). v12 keeps
 * them in a nested `radar` object, and its styles merge the theme's object over theme-default's
 * (`styles.ts:34`), so a theme with no `radar` block (the six redux/neo themes) drew with
 * theme-default's. Colours compare as hex, lengths as px numbers, opacities (D221) as numbers.
 *
 * Every value that differs is in `DIFFERENCES` with its decision, and the list must match the
 * differences found exactly: D333(b), the axes of the six themes v12 left unthemed take the
 * theme's own `lineColor` where v12 drew theme-default's `#333333`.
 */
import { radar } from '@mermaid-js/diagram-radar';
import {
  THEME_NAMES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type Theme,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

type Block = Readonly<Record<string, unknown>>;

/** v12's resolved theme variables of `theme`, with author `themeVariables`. */
function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

/** What v12's radar styles drew with: the theme's `radar` over theme-default's (`styles.ts:34`). */
function v12Radar(theme: string, themeVariables?: object): Block {
  const fallback = v12Vars('default').radar as Block;
  const own = v12Vars(theme, themeVariables).radar as Block | undefined;
  return { ...fallback, ...own };
}

const VARS = radar.theme.vars;
/** Flat v13 name → v12's nested `radar` key (the table's `nested`, D335). */
const NESTED = Object.entries(VARS).map(([name, v]) => [name, v.nested] as const);
const isColour = (name: string): boolean => VARS[name]?.kind === 'color';

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

const v13Theme = async (
  name: ThemeName,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> =>
  createTheme(await loadTheme(name), {
    cssVariables: false,
    diagram: radar.theme,
    ...(themeVariables ? { themeVariables } : {}),
  });

const now = (t: Theme, name: string): string | number | undefined =>
  isColour(name) ? hex(t.value(name)) : t.number(name);
const then = (block: Block, key: string, name: string): string | number | undefined =>
  isColour(name) ? hex(block[key]) : Number.parseFloat(String(block[key]));

/** Every variable where v13 differs from v12, by theme, with its decision. */
const D333B = 'D333(b): v12 sets no radar block here; the axes take the theme’s lineColor';
const UNTHEMED: readonly ThemeName[] = [
  'redux',
  'redux-color',
  'redux-dark',
  'redux-dark-color',
  'neo',
  'neo-dark',
];
const DIFFERENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.fromEntries(
  UNTHEMED.map((t) => [t, { radarAxisColor: D333B }])
);

/** The themes whose v12 axes moved with an author `lineColor` (D351 makes it every theme). */
const V12_FOLLOWS_LINE_COLOR: readonly string[] = ['forest', 'neutral', 'base'];

/** The variables whose v13 value is not v12's, in one theme. */
async function differing(
  name: ThemeName,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<string[]> {
  const old = v12Radar(name, themeVariables);
  const theme = await v13Theme(name, themeVariables);
  return NESTED.filter(([n, key]) => now(theme, n) !== then(old, key, n)).map(([n]) => n);
}

describe('radar theme variables against v12 12.2.0 (#449, D333(b), D335, D351, D540)', () => {
  it("covers v12's ten radar keys, each a flat radar variable nested under `radar`", () => {
    const keys = Object.keys(v12Vars('default').radar as Block).sort();
    expect(NESTED.map(([, key]) => key).sort()).toEqual(keys);
    expect(radar.theme.section).toBe('radar');
    expect(NESTED.every(([n, key]) => n === `radar${key[0]!.toUpperCase()}${key.slice(1)}`)).toBe(
      true
    );
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: every radar variable is v12’s, apart from the listed differences',
    async (name) => {
      const listed = Object.keys(DIFFERENCES[name] ?? {});
      expect(await differing(name)).toEqual(listed);
      const old = v12Radar(name);
      const theme = await v13Theme(name);
      const names = NESTED.filter(([n]) => !listed.includes(n));
      expect(Object.fromEntries(names.map(([n]) => [n, now(theme, n)]))).toEqual(
        Object.fromEntries(names.map(([n, key]) => [n, then(old, key, n)]))
      );
    }
  );

  it.each(UNTHEMED.map((n) => [n]))(
    '%s: the axes are #333333 in v12 and the theme’s lineColor in v13 (D333(b))',
    async (name) => {
      expect(hex(v12Radar(name).axisColor)).toBe('#333333');
      expect(v12Vars(name).radar).toBeUndefined();
      const theme = await v13Theme(name);
      expect(hex(theme.value('radarAxisColor'))).toBe(hex(theme.value('lineColor')));
      expect(hex(theme.value('radarAxisColor'))).not.toBe('#333333');
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: an author `themeVariables.radar` object wins key by key, as in v12 (D335)',
    async (name) => {
      const nested = {
        axisColor: '#123456',
        curveOpacity: 0.8,
        graticuleColor: '#abcdef',
        legendFontSize: 15,
        axisStrokeWidth: 3,
      };
      expect(await differing(name, { radar: nested })).toEqual([]);
      const theme = await v13Theme(name, { radar: nested });
      expect(hex(theme.value('radarAxisColor'))).toBe('#123456');
      expect(theme.number('radarCurveOpacity')).toBe(0.8);
      expect(theme.number('radarLegendFontSize')).toBe(15);
      // The keys not set keep the theme's values.
      expect(theme.number('radarGraticuleOpacity')).toBe(0.3);
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: a flat radar variable wins over the nested key (D540)',
    async (name) => {
      const theme = await v13Theme(name, {
        radarAxisColor: '#ff0000',
        radarCurveStrokeWidth: 5,
        radar: { axisColor: '#00ff00', curveStrokeWidth: 1, graticuleColor: '#0000ff' },
      });
      expect(hex(theme.value('radarAxisColor'))).toBe('#ff0000');
      expect(theme.number('radarCurveStrokeWidth')).toBe(5);
      expect(hex(theme.value('radarGraticuleColor'))).toBe('#0000ff');
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: the axes follow an author lineColor in every theme (D351)',
    async (name) => {
      const old = v12Radar(name, { lineColor: '#ff00ff' });
      // v12's block followed the override only in forest, neutral and base: default kept
      // #333333, dark's updateColors() resets lineColor to mainContrastColor (lightgrey) before
      // it builds the block, and the redux/neo themes have no block.
      expect(hex(old.axisColor) === '#ff00ff').toBe(V12_FOLLOWS_LINE_COLOR.includes(name));
      const theme = await v13Theme(name, { lineColor: '#ff00ff' });
      expect(hex(theme.value('radarAxisColor'))).toBe('#ff00ff');
    }
  );
});
