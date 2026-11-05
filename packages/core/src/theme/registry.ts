/**
 * The built-in themes (D64, D151): each spec is its own file behind a dynamic `import()`, so
 * an unused theme costs no bundle size. `redux-color`, the default (D151), is imported
 * statically so `renderSync` always has a theme.
 */
import type { ThemeSpec } from './spec.ts';
import reduxColor from './specs/redux-color.ts';
import type { ThemeWarning } from './theme.ts';

/** The themes 13.0 ships (D64, D151, D180). */
export const THEME_NAMES = [
  'redux-color',
  'redux',
  'redux-dark',
  'redux-dark-color',
  'default',
  'dark',
  'forest',
  'neutral',
  'base',
  'neo',
  'neo-dark',
] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** The theme used when none is set (D151, amending D55). */
export const DEFAULT_THEME: ThemeName = 'redux-color';

const LOADERS: Readonly<Record<ThemeName, () => Promise<{ default: ThemeSpec }>>> = {
  'redux-color': () => Promise.resolve({ default: reduxColor }),
  redux: () => import('./specs/redux.ts'),
  'redux-dark': () => import('./specs/redux-dark.ts'),
  'redux-dark-color': () => import('./specs/redux-dark-color.ts'),
  default: () => import('./specs/default.ts'),
  dark: () => import('./specs/dark.ts'),
  forest: () => import('./specs/forest.ts'),
  neutral: () => import('./specs/neutral.ts'),
  base: () => import('./specs/base.ts'),
  neo: () => import('./specs/neo.ts'),
  'neo-dark': () => import('./specs/neo-dark.ts'),
};

/**
 * v12 themes that are not shipped yet, and the shipped theme that stands in for each, always
 * with a `THEME_UNAVAILABLE` warning (D151).
 */
const STAND_INS: Readonly<Record<string, ThemeName>> = {
  null: 'base',
};

const loaded = new Map<ThemeName, ThemeSpec>([['redux-color', reduxColor]]);

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
  const name = (own(STAND_INS, key) ? STAND_INS[key] : undefined) ?? DEFAULT_THEME;
  warn?.({
    code: 'THEME_UNAVAILABLE',
    message: `Theme ${JSON.stringify(key.slice(0, 40))} is not available; using ${name}.`,
  });
  return { name };
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

/** A theme spec that is already loaded, for synchronous rendering; the default always is. */
export function loadedTheme(name: ThemeName): ThemeSpec | undefined {
  return loaded.get(name);
}
