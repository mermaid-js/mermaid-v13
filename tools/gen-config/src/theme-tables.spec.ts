import { describe, expect, it } from 'vitest';
import type { DiagramThemeTable } from '../../../packages/core/src/theme/diagram.ts';
import {
  BASE_VARIABLES,
  THEME_NAMES,
  createTheme,
  loadTheme,
  parseColor,
  type Theme,
  type ThemeFamily,
  type ThemeSpec,
  type ThemeWarning,
} from '../../../packages/core/src/theme/index.ts';
import { themePackages } from './theme-packages.ts';

/**
 * Every row of every diagram theme table resolves under every theme, and under a twelfth theme
 * that has only base colours and a family (spec #414 T0b, "Theme scaling"). Core can't import
 * the diagram packages, so this runs here, over each package's `plugin.theme`, the bench's
 * themed stub (`packages/bench/src/__fixtures__/stub-diagram/themed.ts`) and the gen-config
 * fixture package, until the ports' tables exist.
 */
const STUB = '../../../packages/bench/src/__fixtures__/stub-diagram/themed.ts';
const stub = ((await import(STUB)) as { stub: { theme: DiagramThemeTable } }).stub.theme;
const FIXTURES = new URL('./fixtures/packages', import.meta.url).pathname;

const TABLES: readonly (readonly [string, DiagramThemeTable])[] = [
  ...[...(await themePackages()), ...(await themePackages(FIXTURES))].flatMap((p) =>
    p.table ? [[p.type, p.table] as const] : []
  ),
  ['stub', stub],
];

const specs = await Promise.all(THEME_NAMES.map((n) => loadTheme(n)));
const base = await loadTheme('base');

/**
 * A theme no table knows by name: the eight base colours, the shared tokens `ThemeSpec` requires,
 * a family and the dark trait. No values, rules or palettes.
 */
const twelfth = (family: ThemeFamily, dark: boolean): ThemeSpec => ({
  name: 'twelfth',
  dark,
  family,
  base: dark
    ? {
        ...base.base,
        primaryColor: '#1f2a44',
        secondaryColor: '#3b2f4a',
        tertiaryColor: '#24303a',
        background: '#111418',
        primaryTextColor: '#e8e8e8',
        lineColor: '#9aa4b2',
      }
    : base.base,
  tokens: base.tokens,
});

/**
 * What each variable of `table` fails to resolve to, in `theme`. A theme with no palettes reads
 * every slot past the end, as `currentColor` (D332): that counts as resolved where `carrier`, a
 * built-in theme with the same traits (so the same entries apply) and palettes, gives a colour.
 */
function unresolved(
  theme: Theme,
  table: DiagramThemeTable,
  carrier?: Theme,
  authorOnly: readonly string[] = []
): string[] {
  const out: string[] = [];
  for (const [name, { kind }] of Object.entries(table.vars)) {
    const v = theme.value(name);
    const ok = authorOnly.includes(name)
      ? v === 'currentColor'
      : kind === 'color'
        ? parseColor(v) !== undefined ||
          (v === 'currentColor' &&
            carrier !== undefined &&
            parseColor(carrier.value(name)) !== undefined)
        : kind === 'length'
          ? Number.isFinite(theme.number(name))
          : kind === 'padding'
            ? Number.isFinite(theme.padding(name, 8))
            : kind === 'opacity'
              ? theme.number(name) >= 0 && theme.number(name) <= 1
              : kind === 'flag'
                ? v === 'true' || v === 'false'
                : v !== '' && v !== 'currentColor';
    if (!ok) out.push(`${name}=${v}`);
  }
  return out;
}

/**
 * Rows no theme sets, only an author: journey's `actor0`–`actor5` (D249), which win over
 * `journey.actorColours` when set. Unset, they resolve to `currentColor` in every theme.
 */
const AUTHOR_ONLY: Readonly<Record<string, readonly string[]>> = {
  journey: ['actor0', 'actor1', 'actor2', 'actor3', 'actor4', 'actor5'],
};

/** The built-in theme of each family and dark trait. */
const CARRIERS = new Map(specs.map((s) => [`${s.family} ${s.dark}`, s]));

function resolve(
  spec: ThemeSpec,
  table: DiagramThemeTable,
  synthetic = false,
  authorOnly: readonly string[] = []
): string[] {
  const warnings: ThemeWarning[] = [];
  const options = {
    diagram: table,
    cssVariables: false,
    warn: (w: ThemeWarning) => warnings.push(w),
  };
  const theme = createTheme(spec, options);
  const like = synthetic ? CARRIERS.get(`${spec.family} ${spec.dark}`) : undefined;
  const carrier = like && createTheme(like, { diagram: table, cssVariables: false });
  return [...unresolved(theme, table, carrier, authorOnly), ...warnings.map((w) => w.message)];
}

describe('diagram theme tables resolve in every theme (spec #414 T0b)', () => {
  it('checks every table, the stub and the fixture among them', () => {
    expect(TABLES.map(([type]) => type)).toEqual(expect.arrayContaining(['demo', 'stub']));
    expect(specs.map((s) => s.name)).toEqual([...THEME_NAMES]);
  });

  it.each(TABLES)('%s: every row resolves in all eleven themes', (type, table) => {
    const only = AUTHOR_ONLY[type];
    expect(Object.fromEntries(specs.map((s) => [s.name, resolve(s, table, false, only)]))).toEqual(
      Object.fromEntries(specs.map((s) => [s.name, []]))
    );
  });

  const synthetic = (['classic', 'redux', 'neo'] as const).flatMap((family) =>
    [false, true].map((dark) => twelfth(family, dark))
  );

  it('the twelfth theme has only base colours and traits', () => {
    for (const s of synthetic) {
      expect(Object.keys(s.base).sort()).toEqual([...BASE_VARIABLES].sort());
      expect([s.values, s.rules, s.palettes]).toEqual([undefined, undefined, undefined]);
    }
  });

  it.each(TABLES)(
    '%s: a twelfth theme with only base colours and a family resolves every variable',
    (type, table) => {
      const name = (s: ThemeSpec) => `${s.family}${s.dark ? ' dark' : ''}`;
      const only = AUTHOR_ONLY[type];
      expect(
        Object.fromEntries(synthetic.map((s) => [name(s), resolve(s, table, true, only)]))
      ).toEqual(Object.fromEntries(synthetic.map((s) => [name(s), []])));
    }
  );

  it("takes the family's entries, not a theme's", () => {
    const demo = TABLES.find(([type]) => type === 'demo')![1];
    const gap = (s: ThemeSpec) => createTheme(s, { diagram: demo }).number('demoGap');
    expect(synthetic.map(gap)).toEqual([4, 4, 8, 8, 6, 6]);
    const fill = (s: ThemeSpec) =>
      createTheme(s, { diagram: demo, cssVariables: false }).value('demoFill');
    // redux's dark value, which neo takes through its fallback.
    expect(fill(twelfth('redux', true))).toBe('#222222');
    expect(fill(twelfth('neo', true))).toBe('#222222');
  });

  it('fails on a row no rule or family entry defines, or one only some families do', () => {
    const table: DiagramThemeTable = {
      vars: {
        loneFill: { alias: 'lnf', kind: 'color' },
        loneGap: { alias: 'lng', kind: 'length' },
      },
      rules: { light: {} },
      families: { redux: { tokens: { loneGap: 3 } } },
    };
    expect(resolve(twelfth('redux', false), table, true)).toEqual(['loneFill=currentColor']);
    expect(resolve(specs[THEME_NAMES.indexOf('default')]!, table)).toEqual([
      'loneFill=currentColor',
      'loneGap=currentColor',
    ]);
  });
});
