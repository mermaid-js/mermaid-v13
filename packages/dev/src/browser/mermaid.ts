/**
 * The dev build of mermaid, served at `/mermaid.esm.mjs`: the public `mermaid` package plus
 * `@mermaid-js/plugin-interactions`, bundled from the workspace TypeScript sources as one ESM
 * file and rebuilt on every source change. Register the plugin with
 * `registerExternalDiagrams([interactions])` (or a `createMermaid()` instance's).
 *
 * It also tells the Dev Explorer what this build supports, so its selectors offer nothing
 * else: `devThemes` (the shipped themes plus `auto`) and `devLayouts` (the built-in engine
 * plus every loader in `devLayoutLoaders`). Register a new layout engine here.
 */
import { THEME_NAMES } from '@mermaid-js/core/theme';
import type { LayoutLoader } from 'mermaid';

export * from 'mermaid';
export { default } from 'mermaid';
export { interactions } from '@mermaid-js/plugin-interactions';

/** Layout engines the dev build registers (`registerLayoutLoaders`) besides the built-in one. */
export const devLayoutLoaders: readonly LayoutLoader[] = [];

/** The `theme` values this build ships, plus `auto`. */
export const devThemes: readonly string[] = [...THEME_NAMES, 'auto'];

/** The `layout` values this build renders with: `layered` (core's) and the registered ones. */
export const devLayouts: readonly string[] = ['layered', ...devLayoutLoaders.map((l) => l.name)];
