/**
 * #325: the 21 pie theme variables against v12 12.2.0's resolved `getThemeVariables()` in all
 * eleven themes (D151: v12 is the oracle). Colours compare as hex, sizes as px numbers,
 * `pieOpacity` (kind `opacity`, D221) as a number. The one listed exception is D228: v12 `dark`
 * leaves `pie12` unset (a twelfth slice drew black); v13 gives it `cScale0`, as `neutral` has.
 */
import {
  THEME_NAMES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type Theme,
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

function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

const SLOTS = Array.from({ length: 12 }, (_, i) => `pie${i + 1}`);
const COLOURS = [
  ...SLOTS,
  'pieTitleTextColor',
  'pieSectionTextColor',
  'pieLegendTextColor',
  'pieStrokeColor',
  'pieOuterStrokeColor',
];
const SIZES = [
  'pieTitleTextSize',
  'pieSectionTextSize',
  'pieLegendTextSize',
  'pieStrokeWidth',
  'pieOuterStrokeWidth',
];
const PIE_VARIABLES = [...COLOURS, ...SIZES, 'pieOpacity'];

/** v13's value in v12's terms: hex for a colour, a number for a size or the opacity. */
function now(t: Theme, name: string): string | number | undefined {
  return COLOURS.includes(name) ? hex(t.value(name)) : t.number(name);
}

function then(old: Record<string, unknown>, name: string): string | number | undefined {
  const v = old[name];
  return COLOURS.includes(name) ? hex(v) : Number.parseFloat(String(v));
}

/** D228: the one variable v13 sets where v12 does not, with what it is set to. */
const D228 = { theme: 'dark', name: 'pie12', from: 'cScale0' } as const;

describe('pie theme variables against v12 12.2.0 (#325, D221, D228)', () => {
  it('covers every pie variable v12 themes set: 12 slots, 3 texts × 2, 2 strokes × 2, opacity', () => {
    expect(PIE_VARIABLES).toHaveLength(23);
  });

  it.each(THEME_NAMES.map((n) => [n]))('%s: every pie variable is v12’s', async (name) => {
    const old = v12Vars(name);
    const theme = createTheme(await loadTheme(name), { cssVariables: false });
    const exception = name === D228.theme ? [D228.name] : [];
    const names = PIE_VARIABLES.filter((n) => !exception.includes(n));
    expect(Object.fromEntries(names.map((n) => [n, now(theme, n)]))).toEqual(
      Object.fromEntries(names.map((n) => [n, then(old, n)]))
    );
  });

  it('dark: pie12 is cScale0, where v12 leaves it unset (D228)', async () => {
    const old = v12Vars('dark');
    expect(old.pie12).toBeUndefined();
    const theme = createTheme(await loadTheme('dark'), { cssVariables: false });
    expect(hex(theme.value('pie12'))).toBe(hex(old[D228.from]));
  });

  it('neutral: pie12 is cScale0 in v12 already (the shape D228 copies)', () => {
    const old = v12Vars('neutral');
    expect(hex(old.pie12)).toBe(hex(old.cScale0));
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: an author pie variable wins, as v12 re-applies overrides',
    async (name) => {
      const themeVariables = {
        pie1: '#123456',
        pie12: '#abcdef',
        pieStrokeColor: '#ff0000',
        pieTitleTextSize: '30px',
        pieOpacity: 0.4,
      };
      const old = v12Vars(name, themeVariables);
      const theme = createTheme(await loadTheme(name), { themeVariables, cssVariables: false });
      const names = Object.keys(themeVariables);
      expect(Object.fromEntries(names.map((n) => [n, now(theme, n)]))).toEqual(
        Object.fromEntries(names.map((n) => [n, then(old, n)]))
      );
    }
  );

  it('base: the slots v12 derives by lightness follow custom base colours', async () => {
    const themeVariables = {
      primaryColor: '#1d3557',
      secondaryColor: '#a8dadc',
      tertiaryColor: '#f1faee',
    };
    const old = v12Vars('base', themeVariables);
    const theme = createTheme(await loadTheme('base'), { themeVariables, cssVariables: false });
    const derived = SLOTS.slice(0, 6);
    expect(derived.map((n) => now(theme, n))).toEqual(derived.map((n) => then(old, n)));
  });
});
