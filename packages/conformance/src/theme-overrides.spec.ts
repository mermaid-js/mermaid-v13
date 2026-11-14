/**
 * #796 (spec #795 T0): core's shared colour variables in the five classic themes against v12
 * 12.2.0's resolved `getThemeVariables()` (D151: v12 is the oracle), at the theme values and
 * under one `themeVariables` override at a time: each base colour set alone to a light and to a
 * dark probe, and `darkMode`. Every colour variable of core's vocabulary that v12 also resolves
 * is compared. Each difference is listed in `DIFFERENCES` as `theme / override / variable`,
 * under the open issue or decision that accounts for it, and the list has to match the
 * differences found exactly: an unlisted difference fails, and so does a listed one that has
 * gone. A ticket that fixes a difference deletes its entries. Built like
 * `theme-palettes.spec.ts`, which covers the palettes.
 */
import {
  THEME_VARIABLES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { D332_INPUTS } from './diagram-themes.ts';
import { loadOracle } from './oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

const THEMES = ['default', 'dark', 'forest', 'neutral', 'base'] as const satisfies ThemeName[];
type Classic = (typeof THEMES)[number];

/** The base colours an author overrides one at a time, each to a light and a dark probe. */
const OVERRIDDEN = [
  'primaryColor',
  'secondaryColor',
  'tertiaryColor',
  'background',
  'primaryTextColor',
  'lineColor',
] as const;
const PROBES = { light: '#ffd966', dark: '#2a4d69' } as const;

/** The overrides by label: `none`, `<variable>:light`, `<variable>:dark` and `darkMode`. */
const CASES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  none: {},
  ...Object.fromEntries(
    OVERRIDDEN.flatMap((name) =>
      Object.entries(PROBES).map(([probe, value]) => [`${name}:${probe}`, { [name]: value }])
    )
  ),
  darkMode: { darkMode: true },
};

/** Every colour variable in core's vocabulary. */
const COLOURS = Object.entries(THEME_VARIABLES)
  .filter(([, d]) => d.kind === 'color')
  .map(([name]) => name);

const ALL = Object.keys(CASES);
/** The light and dark probe of each named override. */
const both = (...names: (typeof OVERRIDDEN)[number][]): string[] =>
  names.flatMap((n) => [`${n}:light`, `${n}:dark`]);
/** One entry per theme / override / variable: `keys('base', both('primaryColor'), ['mainBkg'])`. */
const keys = (theme: Classic, cases: readonly string[], names: readonly string[]): string[] =>
  cases.flatMap((c) => names.map((n) => `${theme} / ${c} / ${n}`));

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the open issue or
 * decision that accounts for it. Groups naming #795 wait on a maintainer decision (tickets/796.md).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "#773 (T2): v12's named themes set mainBkg in the constructor; v13 derives it from primaryColor":
    [
      ...keys('default', both('primaryColor'), ['actorBkg', 'mainBkg']),
      ...keys('dark', both('primaryColor'), ['actorBkg', 'mainBkg']),
      ...keys('forest', both('primaryColor'), ['actorBkg', 'mainBkg']),
      ...keys('neutral', both('primaryColor'), ['actorBkg', 'mainBkg']),
    ],
  '#798 (T2): another v12 constructor value, which no override moves; v13 derives it by a shared rule':
    [
      ...keys('default', ALL, [
        'border1',
        'gradientStart',
        'gradientStop',
        'primaryBorderColor',
        'secondaryBorderColor',
        'secondaryTextColor',
        'tertiaryBorderColor',
        'tertiaryTextColor',
      ]),
      ...keys('default', both('lineColor'), ['arrowheadColor']),
      ...keys('default', ['background:dark'], ['errorTextColor']),
      ...keys('default', ['darkMode'], ['errorBkgColor', 'noteBkgColor']),
      ...keys('dark', ALL, [
        'border1',
        'gradientStart',
        'gradientStop',
        'primaryBorderColor',
        'secondaryBorderColor',
        'tertiaryBorderColor',
        'tertiaryTextColor',
      ]),
      ...keys('dark', both('lineColor'), ['arrowheadColor', 'defaultLinkColor']),
      ...keys('dark', both('secondaryColor'), ['noteBkgColor']),
      ...keys('forest', ALL, [
        'border1',
        'gradientStart',
        'gradientStop',
        'primaryBorderColor',
        'secondaryBorderColor',
        'secondaryTextColor',
        'tertiaryBorderColor',
      ]),
      ...keys('forest', ['tertiaryColor:dark', ...both('primaryTextColor')], ['tertiaryTextColor']),
      ...keys('forest', ['background:dark'], ['errorTextColor']),
      ...keys('forest', ['darkMode'], ['errorBkgColor', 'noteBkgColor']),
      ...keys('neutral', ALL, [
        'border1',
        'gradientStart',
        'gradientStop',
        'primaryBorderColor',
        'secondaryBorderColor',
        'secondaryTextColor',
        'tertiaryBorderColor',
      ]),
      ...keys(
        'neutral',
        ['tertiaryColor:dark', ...both('primaryTextColor')],
        ['tertiaryTextColor']
      ),
      ...keys('neutral', ['background:dark'], ['errorTextColor']),
      ...keys('neutral', ['darkMode'], ['errorBkgColor']),
    ],
  "D29 (R-THEME-9): v13 meets AA where v12 does not: dark's #b8b6b6 text on #474949 (4.49:1) and #585858 label fill under #ccc text (4.43:1); base's #333 node text on a dark primaryColor":
    [
      ...keys('dark', ALL, ['edgeLabelBackground', 'noteTextColor', 'secondaryTextColor']),
      ...keys('base', ['primaryColor:dark'], ['nodeTextColor']),
    ],
  "D71: v13's shared border rule (15% black, 20% white under darkMode) approximates v12's mkBorder (saturation -40, lightness ∓10)":
    [
      ...keys('base', ALL, [
        'actorBorder',
        'border2',
        'clusterBorder',
        'gradientStart',
        'gradientStop',
        'nodeBorder',
        'noteBorderColor',
        'primaryBorderColor',
        'secondaryBorderColor',
        'tertiaryBorderColor',
      ]),
    ],
  "D71: v13 picks text ink by contrast (primaryTextColor or background) where v12 base inverts the fill's colour":
    [...keys('base', ALL, ['secondaryTextColor', 'tertiaryTextColor', 'titleColor'])],
  'D71: under darkMode v13 mixes 30% black into secondaryColor for the edge label where v12 base darkens its HSL lightness by 30':
    [...keys('base', ['darkMode'], ['edgeLabelBackground'])],
  '#825 (T8): v12 base derives errorBkgColor from tertiaryColor and errorTextColor from tertiaryTextColor; v13 uses the shared #552222 rules':
    [...keys('base', ALL, ['errorBkgColor', 'errorTextColor'])],
  "#795 (maintainer question): v12's darkMode turns base's primaryTextColor (and the text that follows it) to #eee and dark's and neutral's scaleLabelColor to black; v13's darkMode switches only the derivation rules":
    [
      ...keys(
        'base',
        ['darkMode'],
        ['nodeTextColor', 'primaryTextColor', 'scaleLabelColor', 'textColor']
      ),
      ...keys('dark', ['darkMode'], ['scaleLabelColor']),
      ...keys('neutral', ['darkMode'], ['scaleLabelColor']),
    ],
  '#825 (T8): v12 base sets noteBkgColor (#fff5ad) and noteTextColor (#333) in the constructor; v13 derives them':
    [
      ...keys('base', ['darkMode'], ['noteBkgColor']),
      ...keys('base', both('primaryTextColor'), ['noteTextColor']),
    ],
};

const LISTED = Object.values(DIFFERENCES).flat();

const hex = (v: unknown): string | undefined => {
  const rgba = typeof v === 'string' ? parseColor(v) : undefined;
  return rgba ? formatColor(rgba) : undefined;
};

function v12Vars(theme: Classic, themeVariables: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme, themeVariables });
  const vars = { ...v12.mermaidAPI.getConfig().themeVariables };
  v12.mermaidAPI.reset();
  return vars;
}

interface Compared {
  /** Colour variables v12 resolves to no colour, so they are not compared. */
  readonly skipped: string[];
  /** `theme / override / variable` for each compared variable that differs. */
  readonly differences: string[];
}

async function compare(theme: Classic, label: string): Promise<Compared> {
  const themeVariables = CASES[label]!;
  const old = v12Vars(theme, themeVariables);
  const now = createTheme(await loadTheme(theme), { cssVariables: false, themeVariables });
  const skipped: string[] = [];
  const differences: string[] = [];
  for (const name of COLOURS) {
    const was = hex(old[name]);
    if (was === undefined) skipped.push(name);
    else if (hex(now.value(name)) !== was) differences.push(`${theme} / ${label} / ${name}`);
  }
  return { skipped, differences };
}

/**
 * The colour variables v12 does not resolve: v13's shared inputs (D332), `nodeTextColor`, which
 * only v12 base sets, and `border1`, which v12 base leaves unset.
 */
function notInV12(theme: Classic): string[] {
  const own = COLOURS.filter((n) => D332_INPUTS.includes(n));
  return [...own, theme === 'base' ? 'border1' : 'nodeTextColor'];
}

describe('shared colour variables under one override, against v12 12.2.0 (#796, D151)', () => {
  it('lists each difference once, keyed by a theme, an override and a compared variable', () => {
    expect(new Set(LISTED).size).toBe(LISTED.length);
    for (const key of LISTED) {
      const [theme, label, name] = key.split(' / ');
      expect(THEMES, key).toContain(theme);
      expect(ALL, key).toContain(label);
      expect(COLOURS, key).toContain(name);
    }
  });

  it('names an open issue or a decision for each group', () => {
    for (const why of Object.keys(DIFFERENCES)) expect(why).toMatch(/^(#\d+|D\d+)\b/);
  });

  describe.each(THEMES)('%s', (theme) => {
    it.each(ALL)('%s: compares every colour v12 resolves', async (label) => {
      expect((await compare(theme, label)).skipped.sort()).toEqual(notInV12(theme).sort());
    });

    it.each(ALL)('%s: differs from v12 only where DIFFERENCES says', async (label) => {
      const listed = LISTED.filter((k) => k.startsWith(`${theme} / ${label} / `));
      expect((await compare(theme, label)).differences.sort()).toEqual(listed.sort());
    });
  });
});
