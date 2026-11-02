/**
 * The built-in themes (D64): each spec is its own file behind a dynamic `import()`, so an
 * unused theme costs no bundle size. `redux`, the default (D55), is imported statically so
 * `renderSync` always has a theme.
 */
import type { ThemeSpec } from './spec.ts';
import redux from './specs/redux.ts';
import type { ThemeWarning } from './theme.ts';

/** The themes M1 ships (D64). The other v12 themes follow by M3. */
export const THEME_NAMES = ['redux', 'default', 'dark', 'forest', 'neutral', 'base'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** The theme used when none is set (D55). */
export const DEFAULT_THEME: ThemeName = 'redux';

const LOADERS: Readonly<Record<ThemeName, () => Promise<{ default: ThemeSpec }>>> = {
  redux: () => Promise.resolve({ default: redux }),
  default: () => import('./specs/default.ts'),
  dark: () => import('./specs/dark.ts'),
  forest: () => import('./specs/forest.ts'),
  neutral: () => import('./specs/neutral.ts'),
  base: () => import('./specs/base.ts'),
};

/**
 * v12 themes that are not shipped yet, and the shipped theme that stands in for each.
 * `redux-color` is the v12 flowchart section default (`flowchart.theme`); it is the redux
 * family with a per-subgraph colour palette, so it resolves to `redux` without a warning,
 * and a flowchart with no user theme renders redux (D55).
 */
const STAND_INS: Readonly<Record<string, readonly [ThemeName, boolean]>> = {
  'redux-color': ['redux', false],
  'redux-dark': ['dark', true],
  'redux-dark-color': ['dark', true],
  neo: ['redux', true],
  'neo-dark': ['dark', true],
  null: ['base', true],
};

const loaded = new Map<ThemeName, ThemeSpec>([['redux', redux]]);

export function isThemeName(name: unknown): name is ThemeName {
  return typeof name === 'string' && (THEME_NAMES as readonly string[]).includes(name);
}

/** What `theme` (and `theme: 'auto'`) resolves to. */
export interface ThemeChoice {
  readonly name: ThemeName;
  /** For `theme: 'auto'`: the theme used under `prefers-color-scheme: dark`. */
  readonly dark?: ThemeName;
}

/**
 * The shipped theme for a config `theme` value. Unknown names fall back to the default with
 * a warning (v12 passed over unknown theme names too).
 */
export function resolveThemeName(theme: unknown, warn?: (w: ThemeWarning) => void): ThemeChoice {
  if (theme === undefined || theme === null || theme === '') return { name: DEFAULT_THEME };
  if (theme === 'auto') return { name: DEFAULT_THEME, dark: 'dark' };
  if (isThemeName(theme)) return { name: theme };
  const key = String(theme);
  const stand = own(STAND_INS, key) ? STAND_INS[key] : undefined;
  if (!stand || stand[1])
    warn?.({
      code: 'THEME_UNAVAILABLE',
      message: `Theme ${JSON.stringify(key.slice(0, 40))} is not available; using ${stand?.[0] ?? DEFAULT_THEME}.`,
    });
  return { name: stand?.[0] ?? DEFAULT_THEME };
}

function own(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** Loads a built-in theme spec. */
export async function loadTheme(name: ThemeName): Promise<ThemeSpec> {
  const hit = loaded.get(name);
  if (hit) return hit;
  const spec = (await LOADERS[name]()).default;
  loaded.set(name, spec);
  return spec;
}

/** A theme spec that is already loaded, for synchronous rendering; `redux` always is. */
export function loadedTheme(name: ThemeName): ThemeSpec | undefined {
  return loaded.get(name);
}
