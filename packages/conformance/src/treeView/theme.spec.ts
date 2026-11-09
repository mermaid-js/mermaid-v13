/**
 * #577: the seven style options a tree view draws with, against v12 12.2.0 in all eleven themes
 * (D151: v12 is the oracle) and base with `darkMode`: treeView's own variables (`theme/table.ts`,
 * D483) against the CSS v12's own treeView `styles()` writes for the theme's resolved variables
 * (`styles.ts`: `.treeView-node-label`, `-line`, `-icon`, `-description`, `.treeView-highlight-bg`),
 * read back from it.
 *
 * v12 drew its seven literals in every theme (its `styles()` reads only `themeVariables.treeView`,
 * merged over its defaults). Colours compare per channel within 1.5 and alpha within 0.01. Every
 * value that differs is in `DIFFERENCES` with its decision, and the list has to match the
 * differences found exactly, so none is unlisted and none is stale: D483's dark entry, in each
 * theme with the `dark` trait (v12's black label ink and connectors did not read on a dark
 * background, nor its `#546e7a` icons). Base with `darkMode` keeps the light entry, as v12 did
 * (#575: the entry is keyed by the trait, not the author's `darkMode`).
 *
 * Nested `themeVariables.treeView.*` set the flat variables key by key, as v12's styles read them
 * (D335, D540), in every theme; the flat name wins over the nested key.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { treeView } from '@mermaid-js/diagram-treeview';
import {
  THEME_NAMES,
  createTheme,
  loadTheme,
  parseColor,
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

/** v12's treeView diagram module (the chunk holding `src/diagrams/treeView/styles.ts`). */
async function v12TreeViewStyles(): Promise<(options: object) => string> {
  const pkg = realpathSync(
    dirname(createRequire(import.meta.url).resolve('mermaid-v12/package.json'))
  );
  const dir = join(pkg, 'dist', 'chunks', 'mermaid.core');
  const file = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .find((f) => readFileSync(join(dir, f), 'utf8').includes('// src/diagrams/treeView/styles.ts'));
  if (!file) throw new Error('v12 treeView chunk not found');
  const mod = (await import(pathToFileURL(join(dir, file)).href)) as {
    diagram: { styles: (options: object) => string };
  };
  return mod.diagram.styles;
}
const styles = await v12TreeViewStyles();

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

/** Each v13 variable, and where v12's `styles()` writes it: rule and property. */
const WHERE: Readonly<Record<string, readonly [string, string]>> = {
  treeViewLabelFontSize: ['.treeView-node-label', 'font-size'],
  treeViewLabelColor: ['.treeView-node-label', 'fill'],
  treeViewLineColor: ['.treeView-node-line', 'stroke'],
  treeViewIconColor: ['.treeView-node-icon', 'color'],
  treeViewDescriptionColor: ['.treeView-node-description', 'fill'],
  treeViewHighlightBg: ['.treeView-highlight-bg', 'fill'],
  treeViewHighlightStroke: ['.treeView-highlight-bg', 'stroke'],
};
const NAMES = Object.keys(WHERE);
const COLOURS = NAMES.filter((n) => n !== 'treeViewLabelFontSize');

/** v12's resolved theme variables of `theme`, with author `themeVariables`. */
function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

/** v12's value of each variable, read back from the CSS its `styles()` writes for the theme. */
function v12Styles(theme: string, themeVariables?: object): Record<string, string> {
  const css = styles(v12Vars(theme, themeVariables));
  const out: Record<string, string> = {};
  for (const [name, [rule, prop]] of Object.entries(WHERE)) {
    const at = css.indexOf(`${rule} {`);
    const body = at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    out[name] = new RegExp(`[\\s{;]${prop}:\\s*([^;]*);`).exec(body)?.[1]?.trim() ?? '';
  }
  return out;
}

async function v13Theme(
  name: ThemeName,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> {
  return createTheme(await loadTheme(name), {
    diagram: treeView.theme,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

const near = (a: Rgba | undefined, b: Rgba | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= 1.5) &&
  Math.abs(a[3] - b[3]) <= 0.01;

/** v13's value of `name` equals v12's `css` value. */
function same(theme: Theme, name: string, css: string): boolean {
  if (name === 'treeViewLabelFontSize') return `${theme.number(name)}px` === css;
  return near(theme.rgba(name), parseColor(css));
}

/** The variables of one theme whose v13 value is not v12's. */
async function differing(c: Case, author?: Readonly<Record<string, unknown>>): Promise<string[]> {
  const vars = { ...c.vars, ...author };
  const old = v12Styles(c.theme, vars);
  const theme = await v13Theme(c.theme, vars);
  return NAMES.filter((n) => !same(theme, n, old[n]!));
}

/** The four dark themes: of the eleven, those with the `dark` trait (D483's dark entry). */
const DARK_THEMES = ['dark', 'redux-dark', 'redux-dark-color', 'neo-dark'];
/** What D483's dark entry writes: the label ink and connectors, and the icons. */
const DARK_ENTRY = ['treeViewLabelColor', 'treeViewLineColor', 'treeViewIconColor'];
const D483 =
  'D483: the dark entry (label ink textColor, connectors lineColor, icons #90a4ae); v12 drew its light literals in every theme';

/** `theme/variable` → the decision that makes v13 draw it differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = Object.fromEntries(
  DARK_THEMES.flatMap((t) => DARK_ENTRY.map((n) => [`${t}/${n}`, D483] as const))
);

/** An author value for each nested key, and the flat one beside it. */
const NESTED = {
  labelFontSize: '20px',
  labelColor: '#102030',
  lineColor: '#203040',
  iconColor: '#304050',
  descriptionColor: '#405060',
  highlightBg: 'rgba(16, 32, 48, 0.5)',
  highlightStroke: '#506070',
} as const;
const flatOf = (key: string): string => `treeView${key[0]!.toUpperCase()}${key.slice(1)}`;

describe('treeView theme variables against v12 12.2.0 (#577, D483)', () => {
  it('compares each of the seven, in section treeView', () => {
    expect(Object.keys(treeView.theme.vars).sort()).toEqual([...NAMES].sort());
    expect(Object.keys(NESTED).map(flatOf).sort()).toEqual([...NAMES].sort());
    expect(treeView.theme.section).toBe('treeView');
  });

  it('lists the dark themes as the themes with the dark trait', async () => {
    const dark: string[] = [];
    for (const name of THEME_NAMES) if ((await loadTheme(name)).dark) dark.push(name);
    expect(dark.sort()).toEqual([...DARK_THEMES].sort());
  });

  it('differs from v12 only where a decision says so, in all eleven themes and base+darkMode', async () => {
    const found: string[] = [];
    for (const c of CASES) for (const n of await differing(c)) found.push(`${c.label}/${n}`);
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it.each(DARK_THEMES.map((n) => [n]))(
    '%s: the dark entry follows the theme’s textColor and lineColor (D483)',
    async (name) => {
      const theme = await v13Theme(name as ThemeName);
      expect(theme.rgba('treeViewLabelColor')).toEqual(theme.rgba('textColor'));
      expect(theme.rgba('treeViewLineColor')).toEqual(theme.rgba('lineColor'));
      expect(theme.value('treeViewIconColor')).toBe('#90a4ae');
    }
  );

  // v12's styles merge `themeVariables.treeView` over its defaults, key by key, in every theme.
  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: nested themeVariables.treeView keys win, as in v12 (D335, D540)',
    async (name) => {
      const author = { treeView: NESTED };
      const old = v12Styles(name, author);
      const theme = await v13Theme(name, author);
      for (const [key, value] of Object.entries(NESTED)) {
        expect(old[flatOf(key)], key).toBe(value);
        expect(same(theme, flatOf(key), value), key).toBe(true);
      }
      expect(await differing({ label: name, theme: name }, author)).toEqual([]);
    }
  );

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: the flat name wins over the nested key when both are set (D540)',
    async (name) => {
      const flat = Object.fromEntries(COLOURS.map((n) => [n, '#654321']));
      const theme = await v13Theme(name, {
        ...flat,
        treeViewLabelFontSize: 30,
        treeView: NESTED,
      });
      for (const n of COLOURS) expect(theme.value(n), n).toBe('#654321');
      expect(theme.number('treeViewLabelFontSize')).toBe(30);
    }
  );

  it('one nested key sets only its own variable', async () => {
    const plain = await v13Theme('neo-dark');
    const theme = await v13Theme('neo-dark', { treeView: { iconColor: '#abcdef' } });
    expect(theme.value('treeViewIconColor')).toBe('#abcdef');
    for (const n of NAMES.filter((x) => x !== 'treeViewIconColor'))
      expect(theme.value(n), n).toBe(plain.value(n));
  });
});
