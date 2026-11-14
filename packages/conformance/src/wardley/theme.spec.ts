/**
 * #497: wardley's thirteen theme variables (its own `DiagramPlugin.theme` table, D322, D331)
 * against v12 12.2.0 in all eleven themes (D151: v12 is the oracle). v12's renderer read each
 * colour as `themeVariables.wardley?.<key> ?? <fallback>` (`wardleyRenderer.ts:31-50`), and only
 * the five classic themes set a `wardley` block (`theme-default.js:356-371`, …), so the redux and
 * neo themes drew with the renderer's fallbacks: `background` and `primaryTextColor`, else black
 * strokes, white fills, a translucent grey grid and `#dc3545` trends. `wardleyEvolutionColor` is
 * v12's flat variable, which only the classic blocks read; where a theme sets none, its v12 value
 * is the `#dc3545` the trends fell back to. Colours compare as hex.
 *
 * The three annotation variables are compared as v12 resolved them, not as v12 drew them: v12's
 * renderer read `annotationStroke`, `annotationTextColor` and `annotationFill` and never used
 * them, drawing the markers and box with literal `white` and the axis colours in every theme.
 * What v13 draws there instead (D426) is the "D426 colours" test below; the render spec
 * (`render.spec.ts`, paints) checks the drawn attributes.
 *
 * Every value that differs is in `DIFFERENCES` with its decision, and the list must match the
 * differences found exactly:
 * - D333(b), one entry per redux/neo theme: v12 sets no `wardley` block there, so v13 takes the
 *   family's rules (`lineColor`, `background`, `mainBkg` under the `dark` trait, `#ff6b6b` trends
 *   in a dark theme) where v12 drew its fallbacks;
 * - neutral's grid (orchestrator choice, GAPS #430): `wardleyGridColor` is gantt's literal
 *   `lightgrey` in every theme, v12's own in default, base, dark and forest; neutral's v12 grid is
 *   its `gridColor`, `lighten(border1, 30)`.
 *
 * Under author overrides of shared variables, each of `OVERRIDES` lists in `differs`, as exactly,
 * where core's own derivations (not wardley's table) give another colour than v12's (GAPS, the T4
 * review): base's `primaryTextColor` is fixed where v12 derived it from `darkMode` (D571), and
 * v12's `default` built its `wardley` block in its constructor, before an author's `background`
 * or `wardleyEvolutionColor` was applied, so it ignored both. Base's `lineColor` follows
 * `background` (#797) and dark's `mainBkg` is pinned (#798), both as in v12.
 */
import { wardley } from '@mermaid-js/diagram-wardley';
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
type Vars = Readonly<Record<string, unknown>>;

/** v12's resolved theme variables of `theme`, with author `themeVariables`. */
function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

/** v12's renderer fallback for each nested key (`wardleyRenderer.ts:31-50`). */
const FALLBACK: Readonly<Record<string, (vars: Vars) => unknown>> = {
  backgroundColor: (v) => v.background ?? '#fff',
  axisColor: () => '#000',
  axisTextColor: (v) => v.primaryTextColor ?? '#222',
  gridColor: () => 'rgba(100, 100, 100, 0.2)',
  componentFill: () => '#fff',
  componentStroke: () => '#000',
  componentLabelColor: (v) => v.primaryTextColor ?? '#222',
  linkStroke: () => '#000',
  evolutionStroke: () => '#dc3545',
  annotationStroke: () => '#000',
  annotationTextColor: (v) => v.primaryTextColor ?? '#222',
  annotationFill: (v) => v.background ?? '#fff',
};

const VARS = wardley.theme.vars;
const NAMES = Object.keys(VARS);

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

/** The colour v12 drew for each flat variable in `theme` with author `themeVariables`. */
function v12Wardley(theme: string, themeVariables?: object): Record<string, string | undefined> {
  const vars = v12Vars(theme, themeVariables);
  const block = (vars.wardley ?? {}) as Block;
  const out: Record<string, string | undefined> = {};
  for (const name of NAMES) {
    const key = VARS[name]!.nested;
    out[name] =
      key === undefined ? hex(vars[name] ?? '#dc3545') : hex(block[key] ?? FALLBACK[key]!(vars));
  }
  return out;
}

const v13Theme = async (name: ThemeName, themeVariables?: Vars): Promise<Theme> =>
  createTheme(await loadTheme(name), {
    cssVariables: false,
    diagram: wardley.theme,
    ...(themeVariables ? { themeVariables } : {}),
  });

const v13Wardley = async (name: ThemeName, themeVariables?: Vars) => {
  const theme = await v13Theme(name, themeVariables);
  return Object.fromEntries(NAMES.map((n) => [n, hex(theme.value(n))]));
};

/** The variables whose v13 colour is not v12's, in one theme. */
async function differing(name: ThemeName, themeVariables?: Vars): Promise<string[]> {
  const old = v12Wardley(name, themeVariables);
  const now = await v13Wardley(name, themeVariables);
  return NAMES.filter((n) => now[n] !== old[n]);
}

const D333B_LIGHT =
  'D333(b): v12 sets no wardley block here and drew a translucent grey grid; v13 takes the family rule, lightgrey';
const D333B_DARK =
  'D333(b): v12 sets no wardley block here and drew black strokes, white component fills and #dc3545 trends on the dark page; v13 takes the dark rules (lineColor, mainBkg, #ff6b6b)';
const D333B_DARK_ANNOTATION =
  'D333(b), D426: v12’s annotationFill resolved to the page background (#333333), and v12 drew the markers and box white whatever it was; v13 draws them in this variable, the dark rule mainBkg';
const NEUTRAL_GRID =
  'GAPS #430: wardleyGridColor is gantt’s literal lightgrey in every theme; v12 neutral’s grid was its gridColor, lighten(border1, 30)';

const LIGHT_UNTHEMED: readonly ThemeName[] = ['redux', 'redux-color', 'neo'];
const DARK_UNTHEMED: readonly ThemeName[] = ['redux-dark', 'redux-dark-color', 'neo-dark'];
const UNTHEMED: readonly ThemeName[] = [...LIGHT_UNTHEMED, ...DARK_UNTHEMED];

/** What a dark theme without a v12 block draws otherwise. */
const DARK_DIFFERS = [
  'wardleyAxisColor',
  'wardleyGridColor',
  'wardleyComponentFill',
  'wardleyComponentStroke',
  'wardleyLinkStroke',
  'wardleyEvolutionStroke',
  'wardleyAnnotationStroke',
  'wardleyEvolutionColor',
];

const each = (names: readonly string[], why: string): Record<string, string> =>
  Object.fromEntries(names.map((n) => [n, why]));

/** Theme → variable → the decision that makes v13 draw it otherwise than v12. */
const DIFFERENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ...Object.fromEntries(LIGHT_UNTHEMED.map((t) => [t, each(['wardleyGridColor'], D333B_LIGHT)])),
  ...Object.fromEntries(
    DARK_UNTHEMED.map((t) => [
      t,
      {
        ...each(DARK_DIFFERS, D333B_DARK),
        ...each(['wardleyAnnotationFill'], D333B_DARK_ANNOTATION),
      },
    ])
  ),
  neutral: each(['wardleyGridColor'], NEUTRAL_GRID),
};

const listedIn = (name: string): string[] =>
  NAMES.filter((n) => DIFFERENCES[name]?.[n] !== undefined);

const STROKES = [
  'wardleyAxisColor',
  'wardleyComponentStroke',
  'wardleyLinkStroke',
  'wardleyAnnotationStroke',
];
const TEXTS = ['wardleyAxisTextColor', 'wardleyComponentLabelColor', 'wardleyAnnotationTextColor'];

/** An author override of a shared variable, in one theme. */
interface Override {
  readonly label: string;
  readonly theme: ThemeName;
  readonly vars: Vars;
  /** Beyond the theme's own `DIFFERENCES`: variable → why v13 differs from v12. */
  readonly differs: Readonly<Record<string, string>>;
}

const OVERRIDES: readonly Override[] = [
  {
    label: 'base + background',
    theme: 'base',
    vars: { background: '#abcdef' },
    // base derives lineColor as invert(background), as v12 does (#797).
    differs: {},
  },
  {
    label: 'base + darkMode',
    theme: 'base',
    vars: { darkMode: true },
    differs: each(
      TEXTS,
      'core: base’s primaryTextColor is its own #333333, where v12 switched it to #eeeeee under darkMode (core behaviour for every type, as quadrant’s MIGRATION row says)'
    ),
  },
  // dark pins v12's mainBkg #1f2020 (#798), so primaryColor leaves the fills as v12 did.
  { label: 'dark + primaryColor', theme: 'dark', vars: { primaryColor: '#123456' }, differs: {} },
  {
    label: 'default + background',
    theme: 'default',
    vars: { background: '#abcdef' },
    differs: each(
      ['wardleyBackgroundColor', 'wardleyComponentFill', 'wardleyAnnotationFill'],
      'v12 default built its wardley block before the author’s background was applied, so ignored it; v13 follows it'
    ),
  },
  {
    label: 'default + wardleyEvolutionColor',
    theme: 'default',
    vars: { wardleyEvolutionColor: '#00ff00' },
    differs: each(
      ['wardleyEvolutionStroke'],
      'v12 default built its wardley block before the author’s wardleyEvolutionColor was applied, so its trends stayed #dc3545; v13 follows it'
    ),
  },
  // Shared overrides v12 followed as v13 does.
  { label: 'forest + background', theme: 'forest', vars: { background: '#abcdef' }, differs: {} },
  { label: 'neutral + lineColor', theme: 'neutral', vars: { lineColor: '#ff00ff' }, differs: {} },
];

describe('wardley theme variables against v12 12.2.0 (#497, D333(b), D335, D426, D540)', () => {
  it("covers v12's twelve wardley keys, each nested under `wardley`, and the flat evolution colour", () => {
    const keys = Object.keys(v12Vars('default').wardley as Block).sort();
    const nested = NAMES.map((n) => VARS[n]!.nested).filter((k) => k !== undefined);
    expect(nested.sort()).toEqual(keys);
    expect(Object.keys(FALLBACK).sort()).toEqual(keys);
    expect(NAMES.filter((n) => VARS[n]!.nested === undefined)).toEqual(['wardleyEvolutionColor']);
    expect(v12Vars('default').wardleyEvolutionColor).toBe('#dc3545');
    expect(wardley.theme.section).toBe('wardley');
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: every wardley colour is v12’s, apart from the listed differences',
    async (name) => {
      expect(await differing(name)).toEqual(listedIn(name));
      const old = v12Wardley(name);
      const now = await v13Wardley(name);
      const same = NAMES.filter((n) => !listedIn(name).includes(n));
      expect(Object.fromEntries(same.map((n) => [n, now[n]]))).toEqual(
        Object.fromEntries(same.map((n) => [n, old[n]]))
      );
    }
  );

  it.each(UNTHEMED.map((n) => [n]))(
    '%s: v12 has no wardley block; v13 draws with the family rules (D333(b))',
    async (name) => {
      expect(v12Vars(name).wardley).toBeUndefined();
      const theme = await v13Theme(name);
      const spec = await loadTheme(name);
      for (const n of STROKES) expect(hex(theme.value(n)), n).toBe(hex(theme.value('lineColor')));
      expect(hex(theme.value('wardleyGridColor'))).toBe('#d3d3d3');
      const fill = spec.dark ? 'mainBkg' : 'background';
      expect(hex(theme.value('wardleyComponentFill'))).toBe(hex(theme.value(fill)));
      expect(hex(theme.value('wardleyEvolutionStroke'))).toBe(spec.dark ? '#ff6b6b' : '#dc3545');
    }
  );

  it('lists one D333(b) entry for each redux and neo theme, and neutral’s grid', () => {
    expect(Object.keys(DIFFERENCES).sort()).toEqual([...UNTHEMED, 'neutral'].sort());
    expect(hex(v12Wardley('neutral').wardleyGridColor)).toBe('#e6e6e6');
  });

  // D426: anchor labels, stage dividers and the annotation markers and box, v12's literals
  // (`#000`, `#000`, `white`), take the axis and annotation variables. They equal v12's white
  // annotation fill in the light themes but base, and are readable on the dark pages.
  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: the D426 colours are the axis and annotation variables',
    async (name) => {
      const theme = await v13Theme(name);
      const spec = await loadTheme(name);
      const fill = hex(theme.value('wardleyAnnotationFill'));
      const white = !spec.dark && name !== 'base';
      expect(fill === '#ffffff', String(fill)).toBe(white);
      if (spec.dark) {
        expect(hex(theme.value('wardleyAxisTextColor'))).not.toBe('#000000');
        expect(hex(theme.value('wardleyAxisColor'))).not.toBe('#000000');
      }
    }
  );

  const NESTED = {
    axisColor: '#123456',
    gridColor: '#abcdef',
    componentFill: '#fedcba',
    evolutionStroke: '#00ff00',
    annotationFill: '#654321',
  };

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: an author `themeVariables.wardley` object wins key by key, as in v12 (D335)',
    async (name) => {
      const set = NAMES.filter((n) => Object.hasOwn(NESTED, VARS[n]!.nested ?? ''));
      expect(set).toHaveLength(Object.keys(NESTED).length);
      expect(await differing(name, { wardley: NESTED })).toEqual(
        listedIn(name).filter((n) => !set.includes(n))
      );
      const theme = await v13Theme(name, { wardley: NESTED });
      expect(hex(theme.value('wardleyAxisColor'))).toBe('#123456');
      expect(hex(theme.value('wardleyEvolutionStroke'))).toBe('#00ff00');
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: a flat wardley variable wins over the nested key (D540)',
    async (name) => {
      const theme = await v13Theme(name, {
        wardleyAxisColor: '#ff0000',
        wardley: { axisColor: '#00ff00', linkStroke: '#0000ff' },
      });
      expect(hex(theme.value('wardleyAxisColor'))).toBe('#ff0000');
      expect(hex(theme.value('wardleyLinkStroke'))).toBe('#0000ff');
    }
  );

  it.each(OVERRIDES.map((o) => [o.label, o]))(
    '%s: differs from v12 only where core’s derivation or v12’s order says so',
    async (_label, o) => {
      const expected = NAMES.filter(
        (n) => DIFFERENCES[o.theme]?.[n] !== undefined || o.differs[n] !== undefined
      );
      expect(await differing(o.theme, o.vars)).toEqual(expected);
    }
  );
});
