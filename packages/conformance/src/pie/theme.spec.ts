/**
 * #325: the 21 pie theme variables against v12 12.2.0's resolved `getThemeVariables()` in all
 * eleven themes (D151: v12 is the oracle). Colours compare as hex, sizes as px numbers,
 * `pieOpacity` (kind `opacity`, D221) as a number. The listed exceptions are `DIFFERENCES`: D228
 * (v12 `dark` leaves `pie12` unset, so a twelfth slice drew black; v13 gives it `cScale0`, as
 * `neutral` has) and D333(a)'s rounding artefacts, which v13 derives instead.
 */
import {
  THEME_NAMES,
  createTheme,
  loadTheme,
  type Theme,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { DIAGRAM_TABLES } from '../diagram-themes.ts';
import { describe, expect, it } from 'vitest';
import { v12Vars } from '../v12-theme.ts';
import { hex } from '../hex.ts';

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

/**
 * D333(a): slots v12 stepped from its unrounded HSL base colour, which lands a few steps off the
 * hex one. v13 derives them from the theme's hex base colour, by v12's own formula (the rule).
 */
const D333A: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  default: { pie3: 'darkenHsl(tertiaryColor, 40%)', pie6: 'darkenHsl(tertiaryColor, 20%)' },
  forest: { pie6: 'darkenHsl(adjustHue(tertiaryColor, 40), 40%)' },
  'redux-dark': { pie5: 'darkenHsl(secondaryColor, 10%)' },
  'neo-dark': { pie5: 'darkenHsl(secondaryColor, 10%)' },
};

/** Each pie variable that differs from v12, by theme, with the decision that makes it. */
const DIFFERENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  dark: { [D228.name]: 'D228: v12 leaves pie12 unset; v13 gives it cScale0' },
  ...Object.fromEntries(
    Object.entries(D333A).map(([theme, slots]) => [
      theme,
      Object.fromEntries(Object.keys(slots).map((n) => [n, 'D333(a): the derived value'])),
    ])
  ),
};

describe('pie theme variables against v12 12.2.0 (#325, D221, D228)', () => {
  it('covers every pie variable v12 themes set: 12 slots, 3 texts × 2, 2 strokes × 2, opacity', () => {
    expect(PIE_VARIABLES).toHaveLength(23);
  });

  it.each(THEME_NAMES.map((n) => [n]))('%s: every pie variable is v12’s', async (name) => {
    const old = v12Vars(name);
    const theme = createTheme(await loadTheme(name), {
      diagram: DIAGRAM_TABLES.pie,
      cssVariables: false,
    });
    const exception = Object.keys(DIFFERENCES[name] ?? {});
    const names = PIE_VARIABLES.filter((n) => !exception.includes(n));
    expect(Object.fromEntries(names.map((n) => [n, now(theme, n)]))).toEqual(
      Object.fromEntries(names.map((n) => [n, then(old, n)]))
    );
    // Each listed difference is one: none is stale.
    for (const n of exception) expect(now(theme, n), n).not.toBe(then(old, n));
  });

  it.each(Object.entries(D333A))(
    '%s: a v12 rounding artefact is the derived value (D333(a))',
    async (name, slots) => {
      const spec = await loadTheme(name as ThemeName);
      const theme = createTheme(spec, { diagram: DIAGRAM_TABLES.pie, cssVariables: false });
      const names = Object.keys(slots);
      const derived = createTheme(spec, {
        cssVariables: false,
        diagram: {
          vars: Object.fromEntries(
            names.map((n, i) => [`d${n}`, { alias: `d${i}`, kind: 'color' as const }])
          ),
          rules: { light: Object.fromEntries(names.map((n) => [`d${n}`, slots[n]!])) },
        },
      });
      expect(names.map((n) => now(theme, n))).toEqual(
        names.map((n) => hex(derived.value(`d${n}`)))
      );
    }
  );

  it('dark: pie12 is cScale0, where v12 leaves it unset (D228)', async () => {
    const old = v12Vars('dark');
    expect(old.pie12).toBeUndefined();
    const theme = createTheme(await loadTheme('dark'), {
      diagram: DIAGRAM_TABLES.pie,
      cssVariables: false,
    });
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
      const theme = createTheme(await loadTheme(name), {
        diagram: DIAGRAM_TABLES.pie,
        themeVariables,
        cssVariables: false,
      });
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
    const theme = createTheme(await loadTheme('base'), {
      diagram: DIAGRAM_TABLES.pie,
      themeVariables,
      cssVariables: false,
    });
    const derived = SLOTS.slice(0, 6);
    expect(derived.map((n) => now(theme, n))).toEqual(derived.map((n) => then(old, n)));
  });
});
