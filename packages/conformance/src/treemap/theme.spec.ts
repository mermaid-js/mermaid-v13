/**
 * #514: the colours and sizes a treemap draws with, against v12 12.2.0 in all eleven themes
 * (D151: v12 is the oracle), and base with `darkMode` (T4's note):
 *
 * - the shared `cScale` and `cScaleLabel` palettes (core's, D258) and treemap's own
 *   `cScalePeer0`–`cScalePeer11` (its table, D406) against v12's `getThemeVariables()`, which
 *   v12's renderer read slot by slot (`renderer.ts:79-123`);
 * - `treemapTitleColor` and `treemapTitleFontSize` (D407) against the `.treemapTitle` rule
 *   v12's own treemap `styles()` writes for the theme (the only rule of v12's `<style>` that
 *   took effect), read back from its CSS.
 *
 * Colours compare per channel within 1.5 (v12 kept HSL fractions, v13 rounds to bytes). Every
 * value that differs is in `DIFFERENCES` with its decision, and the list has to match the
 * differences found exactly, so none is unlisted and none is stale:
 * - D406, D541: `default` and `forest` derive v12's peers as `darken(cScale<i>, 25)`, slots 1
 *   and 2 from other colours; v13 takes the light family rule `darkenHsl(cScale<i>, 10%)`;
 * - D406, the `dark` trait: `redux-dark`, `redux-dark-color` and `neo-dark` are dark themes,
 *   but v12 derived their peers with the light branch (they set no `darkMode`); v13 takes the
 *   dark rule `lightenHsl(cScale<i>, 10%)`;
 * - core's own values, which treemap reads and does not own: `titleColor` in `base` and the
 *   redux light themes (core's `contrast(clusterBkg, textColor, background)` rule, R-THEME-9),
 *   which `treemapTitleColor` follows (D407); `cScaleLabel8` in `redux-dark` (D544); and the
 *   labels of base under `darkMode` (D258, D334: the theme keeps its `scaleLabelColor`).
 *
 * Under an author `cScale4` and `cScalePeer3`, the same list holds but for `cScalePeer3` (drawn
 * as given in both), plus `OVERRIDE_DIFFERENCES`, matched as exactly: the peer v12 drew for the
 * author's slot by another rule than the theme's own (`redux`, `base`, `neo`).
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { treemap } from '@mermaid-js/diagram-treemap';
import {
  THEME_NAMES,
  createTheme,
  parseColor,
  loadTheme,
  type DiagramThemeTable,
  type Rgba,
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

/** v12's treemap diagram module (the chunk holding `src/diagrams/treemap/styles.ts`). */
async function v12TreemapStyles(): Promise<(options: object) => string> {
  const pkg = realpathSync(
    dirname(createRequire(import.meta.url).resolve('mermaid-v12/package.json'))
  );
  const dir = join(pkg, 'dist', 'chunks', 'mermaid.core');
  const file = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .find((f) => readFileSync(join(dir, f), 'utf8').includes('// src/diagrams/treemap/styles.ts'));
  if (!file) throw new Error('v12 treemap chunk not found');
  const mod = (await import(pathToFileURL(join(dir, file)).href)) as {
    diagram: { styles: (options: object) => string };
  };
  return mod.diagram.styles;
}
const styles = await v12TreemapStyles();

/** A theme to compare: one of the eleven, or base with the author's `darkMode`. */
interface Case {
  readonly label: string;
  readonly theme: ThemeName;
  readonly vars?: Readonly<Record<string, unknown>>;
}
const CASES: readonly Case[] = [
  ...THEME_NAMES.map((theme) => ({ label: theme, theme })),
  { label: 'base+darkMode', theme: 'base', vars: { darkMode: true } },
];

/** v12's resolved theme variables of `theme`, with author `themeVariables`. */
function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

/** v12's `.treemapTitle` fill and font size (its `styles()` reads the current config too). */
function v12Title(theme: string, themeVariables?: object): { fill: string; size: string } {
  const vars = v12Vars(theme, themeVariables);
  const css = styles(vars);
  const body = /\.treemapTitle\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const decl = (prop: string) => new RegExp(`${prop}:\\s*([^;]*);`).exec(body)?.[1]?.trim() ?? '';
  return { fill: decl('fill'), size: decl('font-size') };
}

async function v13Theme(
  name: ThemeName,
  themeVariables?: Readonly<Record<string, unknown>>,
  table: DiagramThemeTable = treemap.theme
): Promise<Theme> {
  return createTheme(await loadTheme(name), {
    diagram: table,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

const SLOTS = 12;
const slots = (prefix: string): string[] =>
  Array.from({ length: SLOTS }, (_, i) => `${prefix}${i}`);
const PEERS = slots('cScalePeer');
const COLOURS = [...slots('cScale'), ...slots('cScaleLabel'), ...PEERS, 'treemapTitleColor'];

/** v13's colour of `name`: a palette slot for the shared palettes, else the variable. */
function v13Colour(t: Theme, name: string): Rgba | undefined {
  const slot = /^(cScale|cScaleLabel)(\d+)$/.exec(name);
  return slot ? parseColor(t.palette(slot[1]!)[Number(slot[2])] ?? '') : t.rgba(name);
}

/** v12's colour of `name` in `vars`, the title's from its CSS. */
function v12Colour(c: Case, vars: Record<string, unknown>, name: string): Rgba | undefined {
  const v = name === 'treemapTitleColor' ? v12Title(c.theme, c.vars).fill : vars[name];
  return typeof v === 'string' ? parseColor(v) : undefined;
}

const near = (a: Rgba | undefined, b: Rgba | undefined): boolean =>
  a !== undefined && b !== undefined && [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= 1.5);

/** The colours of one theme whose v13 value is not v12's. */
async function differing(c: Case): Promise<string[]> {
  const vars = v12Vars(c.theme, c.vars);
  const theme = await v13Theme(c.theme, c.vars);
  return COLOURS.filter((n) => !near(v13Colour(theme, n), v12Colour(c, vars, n)));
}

const D406_CLASSIC =
  'D406, D541: v12 derived it as darken(cScale<i>, 25), slots 1 and 2 from other colours; v13 the light rule darkenHsl(cScale<i>, 10%)';
const D406_DARK =
  'D406: a dark theme, where v12 took the light branch (no darkMode); v13 the dark rule lightenHsl(cScale<i>, 10%)';
const CORE_TITLE =
  'core titleColor (contrast(clusterBkg, textColor, background), R-THEME-9), which treemapTitleColor follows (D407)';
const D544 = 'core cScaleLabel (D544): black where v12’s #e0dfdf did not read on the slot';
const D334 = 'core cScaleLabel (D258, D334): base keeps its scaleLabelColor under darkMode';

const listed = (theme: string, names: readonly string[], why: string): [string, string][] =>
  names.map((n) => [`${theme}/${n}`, why]);

/**
 * The themes v12 gives `darken(…, 25)` peers (`theme-default.js`, `theme-forest.js`), as HSL
 * points under the drawn `cScale`: default's `updateColors()` runs twice and darkens each slot
 * by 10 once more after its peer is set, so its peers sit 15 under.
 */
const CLASSIC_STEP: Readonly<Record<string, number>> = { default: 15, forest: 25 };
const CLASSIC = Object.keys(CLASSIC_STEP);
/** The dark themes v12 derived peers for with the light branch. */
const DARK_ON_LIGHT_BRANCH = ['redux-dark', 'redux-dark-color', 'neo-dark'];

/** `theme/variable` → the decision that makes v13 draw it differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = Object.fromEntries([
  ...CLASSIC.flatMap((t) => listed(t, PEERS, D406_CLASSIC)),
  // Slot 0 of redux-dark and neo-dark is black in v12: darkening it stays black.
  ...DARK_ON_LIGHT_BRANCH.flatMap((t) => listed(t, PEERS, D406_DARK)),
  ...['base', 'base+darkMode', 'redux', 'redux-color'].flatMap((t) =>
    listed(t, ['treemapTitleColor'], CORE_TITLE)
  ),
  ...listed('redux-dark', ['cScaleLabel8'], D544),
  ...listed('base+darkMode', slots('cScaleLabel'), D334),
]);

/** The author overrides the override tests set: a peer as given, and a slot whose peer moves. */
const OVERRIDE = { cScalePeer3: '#123456', cScale4: '#336699' };

/** Why v12 drew `cScalePeer4` of the author's `cScale4` otherwise than its theme's rule. */
const V12_KEPT_PEER =
  'D406: v12 kept the theme’s own peer under an author cScale<n> (it derived the peers first); v13 derives it from the author’s slot';
const V12_35 =
  'D406: v12 darkened the author’s slot by 35 HSL points (updateColors() runs again over it); v13 by the theme’s rule';

/**
 * `theme/variable` → why v13 differs from v12 under {@link OVERRIDE} beyond `DIFFERENCES`: the
 * author's `cScale4` moved v12's `cScalePeer4` by another rule than the theme's own in `redux`
 * (not at all), `base` and `neo` (35 points). Under the override, a theme's `DIFFERENCES` hold
 * but for `cScalePeer3`, which both draw as given.
 */
const OVERRIDE_DIFFERENCES: Readonly<Record<string, string>> = {
  'redux/cScalePeer4': V12_KEPT_PEER,
  'base/cScalePeer4': V12_35,
  'neo/cScalePeer4': V12_35,
};

/** Treemap's table with the peers `step(cScale<i>, <pct>%)` under both traits. */
const peerRule = (step: 'darkenHsl' | 'lightenHsl', pct: number): DiagramThemeTable => {
  const rules = Object.fromEntries(PEERS.map((n, i) => [n, `${step}(cScale${i}, ${pct}%)`]));
  return {
    ...treemap.theme,
    rules: { light: { ...treemap.theme.rules.light, ...rules }, dark: rules },
  };
};

describe('treemap colours against v12 12.2.0 (#514, D258, D406, D407)', () => {
  it('compares every slot v12’s renderer read, and both title keys', () => {
    expect(COLOURS).toHaveLength(37);
    expect(Object.keys(treemap.theme.vars).sort()).toEqual(
      [...PEERS, 'treemapTitleColor', 'treemapTitleFontSize'].sort()
    );
    expect(treemap.theme.section).toBe('treemap');
  });

  it('differs from v12 only where a decision says so, in all eleven themes and base+darkMode', async () => {
    const found: string[] = [];
    for (const c of CASES) for (const n of await differing(c)) found.push(`${c.label}/${n}`);
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  // Which of v13's two rules v12's peers equal, theme by theme: v12 lightened under a dark theme
  // (`dark`) or `darkMode` (the others) and darkened otherwise, but in default and forest.
  it.each(CASES.map((c) => [c.label, c]))(
    '%s: v12’s peers follow its branch (D406)',
    async (_label, c) => {
      const spec = await loadTheme(c.theme);
      const v13Dark = spec.dark || c.vars?.darkMode === true;
      const vars = v12Vars(c.theme, c.vars);
      const matches = async (table: DiagramThemeTable): Promise<boolean> => {
        const t = await v13Theme(c.theme, c.vars, table);
        return PEERS.every((n) => near(t.rgba(n), parseColor(String(vars[n]))));
      };
      const branch = (await matches(peerRule('lightenHsl', 10)))
        ? 'dark'
        : (await matches(peerRule('darkenHsl', 10)))
          ? 'light'
          : 'other';
      const expected = CLASSIC.includes(c.label)
        ? 'other'
        : DARK_ON_LIGHT_BRANCH.includes(c.label) || !v13Dark
          ? 'light'
          : 'dark';
      expect(branch).toBe(expected);
    }
  );

  it.each(CLASSIC.map((n) => [n]))(
    '%s: v12’s peers are darken(cScale<i>, 25), but for slots 1 and 2 (D406, D541)',
    async (name) => {
      const vars = v12Vars(name);
      const step = CLASSIC_STEP[name]!;
      const at = await v13Theme(name as ThemeName, undefined, peerRule('darkenHsl', step));
      const off = PEERS.filter((n) => !near(at.rgba(n), parseColor(String(vars[n]))));
      expect(off).toEqual(['cScalePeer1', 'cScalePeer2']);
    }
  );

  it.each(CASES.map((c) => [c.label, c]))(
    '%s: the title is 14 px, as v12’s .treemapTitle',
    async (_label, c) => {
      expect(v12Title(c.theme, c.vars).size).toBe('14px');
      expect((await v13Theme(c.theme, c.vars)).number('treemapTitleFontSize')).toBe(14);
    }
  );

  // v12 merges an author's `themeVariables` over the theme's, so a nested `treemap` value wins
  // in every theme; `styles.ts` reads `treemap.titleColor` before `titleColor` (D407).
  const NESTED = { treemap: { titleColor: '#123456', titleFontSize: '20px' } };

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: a nested themeVariables.treemap title wins, as in v12 (D335, D407)',
    async (name) => {
      const old = v12Title(name, NESTED);
      const theme = await v13Theme(name, NESTED);
      expect(old).toEqual({ fill: '#123456', size: '20px' });
      expect(theme.value('treemapTitleColor')).toBe('#123456');
      expect(theme.number('treemapTitleFontSize')).toBe(20);
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: the flat name wins over the nested key when both are set (D540)',
    async (name) => {
      const theme = await v13Theme(name, {
        treemapTitleColor: '#654321',
        treemapTitleFontSize: 30,
        treemap: { titleColor: '#123456', titleFontSize: '20px' },
      });
      expect(theme.value('treemapTitleColor')).toBe('#654321');
      expect(theme.number('treemapTitleFontSize')).toBe(30);
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: an author cScalePeer<n> is drawn as given, and a cScale<n> moves its peer',
    async (name) => {
      const theme = await v13Theme(name, OVERRIDE);
      expect(theme.value('cScalePeer3')).toBe('#123456');
      expect(String(v12Vars(name, OVERRIDE).cScalePeer3).toLowerCase()).toBe('#123456');
      const plain = await v13Theme(name);
      expect(near(theme.rgba('cScalePeer4'), plain.rgba('cScalePeer4'))).toBe(false);
    }
  );

  it('under author overrides, differs from v12 only where a decision says so', async () => {
    const found: string[] = [];
    for (const theme of THEME_NAMES)
      for (const n of await differing({ label: theme, theme, vars: OVERRIDE }))
        found.push(`${theme}/${n}`);
    const expected = [
      ...Object.keys(DIFFERENCES).filter(
        (k) => !k.endsWith('/cScalePeer3') && !k.startsWith('base+darkMode/')
      ),
      ...Object.keys(OVERRIDE_DIFFERENCES),
    ];
    expect(found.sort()).toEqual(expected.sort());
  });

  it('redux: v12 kept the theme’s own cScalePeer4 under an author cScale4 (D406)', () => {
    const kept = parseColor(String(v12Vars('redux', OVERRIDE).cScalePeer4));
    expect(near(kept, parseColor(String(v12Vars('redux').cScalePeer4)))).toBe(true);
  });

  it.each([['base'], ['neo']] as const)(
    '%s: v12’s cScalePeer4 is the author’s cScale4 darkened by 35 HSL points (D406)',
    async (name) => {
      const at35 = await v13Theme(name, OVERRIDE, peerRule('darkenHsl', 35));
      const drawn = parseColor(String(v12Vars(name, OVERRIDE).cScalePeer4));
      expect(near(at35.rgba('cScalePeer4'), drawn)).toBe(true);
    }
  );
});
