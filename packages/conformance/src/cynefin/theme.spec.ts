/**
 * #469: the fifteen cynefin theme variables (the plugin's own table, D331, D335, D540) against
 * what v12 12.2.0 draws, in all eleven themes (D151: v12 is the oracle). v12's renderer and
 * styles read the `cynefin` block of `theme-default.getThemeVariables()` cleaned and merged
 * under `getConfig().themeVariables` (`cynefinRenderer.ts:61-66`, `styles.ts:11-27`): a
 * theme's own `cynefin` block where it has one (the five classic themes), else `default`'s
 * literals (neo, neo-dark and the four redux themes). Colours compare as hex, lengths as px
 * numbers.
 *
 * Every pair that differs is in `DIFFERENCES` with the decision that makes it, and the list has
 * to match the differences found exactly, so none is unlisted and none is stale:
 * - D333(b): the six redux/neo themes derive from their own `lineColor`, `textColor` and
 *   `primaryTextColor`, and `neo-dark`, `redux-dark` and `redux-dark-color` take the dark
 *   entry, where v12 left all six on `default`'s literal block (R-THEME-11);
 * - D541: `forest` takes the light entry (no trait separates it from `default`), where v12
 *   forest had literals of its own.
 */
import { cynefin } from '@mermaid-js/diagram-cynefin';
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

function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

type Block = Record<string, unknown>;

/** `theme-default.getThemeVariables().cynefin`: v12's fallback block, with no overrides. */
const DEFAULT_BLOCK = v12Vars('default').cynefin as Block;

/** The cynefin block v12 draws with: the theme's own over `default`'s (a shallow block merge). */
function v12Drawn(theme: string, themeVariables?: object): Block {
  return { ...DEFAULT_BLOCK, ...(v12Vars(theme, themeVariables).cynefin as Block | undefined) };
}

const VARS = cynefin.theme.vars;
/** Flat v13 name → v12's key in the `cynefin` block (the table's `nested`). */
const NESTED = Object.fromEntries(Object.entries(VARS).map(([flat, v]) => [flat, v.nested!]));
const NAMES = Object.keys(VARS);
const isColour = (name: string): boolean => VARS[name]?.kind === 'color';

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

function now(t: Theme, name: string): string | number | undefined {
  return isColour(name) ? hex(t.value(name)) : t.number(name);
}

function then(block: Block, name: string): string | number | undefined {
  const v = block[NESTED[name]!];
  return isColour(name) ? hex(v) : Number.parseFloat(String(v));
}

async function v13Theme(
  name: string,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> {
  return createTheme(await loadTheme(name as ThemeName), {
    diagram: cynefin.theme,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

const BACKGROUNDS = [
  'cynefinComplexBg',
  'cynefinComplicatedBg',
  'cynefinChaoticBg',
  'cynefinClearBg',
  'cynefinConfusionBg',
];
/** The dark entry's variables: dark's five backgrounds and its cliff. */
const DARK_ENTRY = [...BACKGROUNDS, 'cynefinCliffColor'];
/** The light entry's derived colours: line, text and label inks of the theme's own. */
const DERIVED = [
  'cynefinBoundaryColor',
  'cynefinArrowColor',
  'cynefinTextColor',
  'cynefinLabelColor',
];

const D333B_DERIVED =
  'D333(b): derives from the theme’s own lineColor, textColor or primaryTextColor; v12 drew default’s literals (#333333, #333, #131300)';
const D333B_DARK =
  'D333(b): the dark entry (v12 dark’s backgrounds and cliff), as dark; v12 drew default’s light literals';
const D541_FOREST =
  'D541: forest takes the light entry (default’s literals), as no trait separates it from default; v12 forest had its own';

const listed = (theme: string, names: readonly string[], why: string): [string, string][] =>
  names.map((n) => [`${theme}/${n}`, why]);

/** `theme/variable` → the decision that makes v13 draw it differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = Object.fromEntries([
  ...listed('forest', DARK_ENTRY, D541_FOREST),
  // neo's textColor is #333, the same ink as default's literal, so it is no difference.
  ...listed(
    'neo',
    ['cynefinBoundaryColor', 'cynefinArrowColor', 'cynefinLabelColor'],
    D333B_DERIVED
  ),
  ...listed('redux', DERIVED, D333B_DERIVED),
  ...listed('redux-color', DERIVED, D333B_DERIVED),
  ...['neo-dark', 'redux-dark', 'redux-dark-color'].flatMap((t) => [
    ...listed(t, DERIVED, D333B_DERIVED),
    ...listed(t, DARK_ENTRY, D333B_DARK),
  ]),
]);

/** Themes v12 gives a cynefin block of their own (the classic family). */
const CLASSIC = ['default', 'base', 'dark', 'forest', 'neutral'];
const V12_UNTHEMED = THEME_NAMES.filter((n) => !CLASSIC.includes(n));
const DARK_THEMES = ['dark', 'neo-dark', 'redux-dark', 'redux-dark-color'];

describe('cynefin theme variables against v12 12.2.0 (#469, D333(b), D541)', () => {
  it('covers v12’s whole cynefin block: ten colours, five lengths', () => {
    expect(NAMES).toHaveLength(15);
    expect(Object.values(NESTED).sort()).toEqual(Object.keys(DEFAULT_BLOCK).sort());
    expect(NAMES.filter(isColour)).toHaveLength(10);
  });

  it('differs from what v12 draws only where a decision says so', async () => {
    const found: string[] = [];
    for (const name of THEME_NAMES) {
      const old = v12Drawn(name);
      const theme = await v13Theme(name);
      for (const n of NAMES) if (now(theme, n) !== then(old, n)) found.push(`${name}/${n}`);
    }
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('v12 gives only the five classic themes a cynefin block (the six others draw default’s)', () => {
    for (const name of CLASSIC) expect(v12Vars(name).cynefin, name).toBeDefined();
    for (const name of V12_UNTHEMED) expect(v12Vars(name).cynefin, name).toBeUndefined();
  });

  it.each(V12_UNTHEMED.map((n) => [n]))(
    '%s: line, text and label inks are the theme’s own (D333(b))',
    async (name) => {
      const theme = await v13Theme(name);
      const own = v12Vars(name);
      const source = {
        cynefinBoundaryColor: 'lineColor',
        cynefinArrowColor: 'lineColor',
        cynefinTextColor: 'textColor',
        cynefinLabelColor: 'primaryTextColor',
      } as const;
      for (const [n, from] of Object.entries(source))
        expect(now(theme, n), `${name}/${n}`).toBe(hex(own[from]));
    }
  );

  it.each(DARK_THEMES.map((n) => [n]))(
    '%s: backgrounds and cliff are v12 dark’s (the dark entry)',
    async (name) => {
      const theme = await v13Theme(name);
      const dark = v12Drawn('dark');
      for (const n of DARK_ENTRY) expect(now(theme, n), `${name}/${n}`).toBe(then(dark, n));
    }
  );

  it('forest: backgrounds and cliff are default’s (the light entry, D541)', async () => {
    const forest = await v13Theme('forest');
    const old = v12Drawn('default');
    for (const n of DARK_ENTRY) expect(now(forest, n), n).toBe(then(old, n));
  });

  it('the five lengths are v12’s in every theme', async () => {
    const lengths = NAMES.filter((n) => !isColour(n));
    expect(lengths.map((n) => then(DEFAULT_BLOCK, n))).toEqual([16, 12, 2, 4, 2]);
    for (const name of THEME_NAMES) {
      const theme = await v13Theme(name);
      expect(
        lengths.map((n) => now(theme, n)),
        name
      ).toEqual([16, 12, 2, 4, 2]);
    }
  });

  // v12 re-applies an author's `themeVariables` after the theme's `calculate()`, so a nested
  // value wins, `boundaryWidth: 0` stays 0, and in the six unthemed themes it is merged over
  // default's block.
  const NESTED_OVERRIDE = {
    cynefin: {
      complexBg: '#123456',
      confusionBg: '#abcdef',
      boundaryColor: '#ff0000',
      labelColor: '#00ff00',
      itemFontSize: 20,
      boundaryWidth: 0,
    },
  };
  const OVERRIDDEN = NAMES.filter((n) => NESTED[n]! in NESTED_OVERRIDE.cynefin);

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: a nested themeVariables.cynefin value wins, as in v12 (D335)',
    async (name) => {
      const old = v12Drawn(name, NESTED_OVERRIDE);
      const theme = await v13Theme(name, NESTED_OVERRIDE);
      expect(OVERRIDDEN).toHaveLength(6);
      expect(Object.fromEntries(OVERRIDDEN.map((n) => [n, now(theme, n)]))).toEqual(
        Object.fromEntries(OVERRIDDEN.map((n) => [n, then(old, n)]))
      );
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: the flat name wins over the nested key when both are set (D540)',
    async (name) => {
      const theme = await v13Theme(name, {
        cynefinComplexBg: '#654321',
        cynefinArrowWidth: 5,
        cynefin: { complexBg: '#123456', arrowWidth: 9, clearBg: '#fedcba' },
      });
      expect(now(theme, 'cynefinComplexBg')).toBe('#654321');
      expect(now(theme, 'cynefinArrowWidth')).toBe(5);
      expect(now(theme, 'cynefinClearBg')).toBe('#fedcba');
    }
  );

  it('base: a lineColor override moves the boundaries and arrows, as in v12', async () => {
    const themeVariables = { lineColor: '#1d3557' };
    const old = v12Drawn('base', themeVariables);
    const theme = await v13Theme('base', themeVariables);
    expect(then(old, 'cynefinBoundaryColor')).toBe('#1d3557');
    for (const n of ['cynefinBoundaryColor', 'cynefinArrowColor'])
      expect(now(theme, n), n).toBe(then(old, n));
  });

  it.each(V12_UNTHEMED.map((n) => [n]))(
    '%s: a lineColor override moves the boundaries, where v12 kept #333333 (D333(b))',
    async (name) => {
      const themeVariables = { lineColor: '#1d3557' };
      expect(then(v12Drawn(name, themeVariables), 'cynefinBoundaryColor')).toBe('#333333');
      const theme = await v13Theme(name, themeVariables);
      expect(now(theme, 'cynefinBoundaryColor')).toBe('#1d3557');
      expect(now(theme, 'cynefinArrowColor')).toBe('#1d3557');
    }
  );
});
