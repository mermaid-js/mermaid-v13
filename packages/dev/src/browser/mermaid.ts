/**
 * The dev build of mermaid, served at `/mermaid.esm.mjs`: the public `mermaid` package plus
 * `@mermaid-js/plugin-interactions` and the plugins the e2e page renders with (`plugins.ts`:
 * math, icons with the static packs, hand-drawn, ELK), bundled from the workspace TypeScript
 * sources as ESM and rebuilt on every source change. It splits as production does: diagram types
 * and the ELK engine (elkjs) are chunks, loaded when a render first needs them. Set an instance up
 * with `setUpDevMermaid(createMermaid())`, so the explorer draws what the e2e page draws (#391).
 *
 * It also tells the Dev Explorer what this build supports, so its selectors offer nothing
 * else: `devThemes` (the shipped themes plus `auto`) and `devLayouts` (the built-in engine
 * plus every loader in `devLayoutLoaders`). Register a new layout engine here.
 *
 * The server builds it with `__MERMAID_BENCH__` = true, so `@mermaid-js/core/timing` is on: the
 * Profile tab installs a clock with `installStageClock` and reads per-stage times. One bundle
 * holds one copy of core, so that clock is the one the pipeline reads.
 */
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { interactions } from '@mermaid-js/plugin-interactions';
import type { Mermaid } from 'mermaid';
import { devLayoutLoaders, registerDevPlugins } from '../plugins.ts';

export * from 'mermaid';
export { default } from 'mermaid';
export { interactions };
export { devLayoutLoaders };
export { installStageClock, STAGE_TIMING } from '@mermaid-js/core/timing';
export type { Stage, StageClock } from '@mermaid-js/core/timing';

/**
 * Registers what every explorer instance renders with: the interactions plugin, then the e2e
 * page's layouts, extensions and icon packs (`plugins.ts`). Resolves when they are active.
 */
export const setUpDevMermaid = (instance: Mermaid): Promise<void> =>
  registerDevPlugins(instance, [interactions]);

/** The `theme` values this build ships, plus `auto`. */
export const devThemes: readonly string[] = [...THEME_NAMES, 'auto'];

/** The `layout` values this build renders with: `layered` (core's) and the registered ones. */
export const devLayouts: readonly string[] = ['layered', ...devLayoutLoaders.map((l) => l.name)];
