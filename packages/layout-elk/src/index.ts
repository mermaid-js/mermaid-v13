/**
 * `@mermaid-js/layout-elk`: ELK layouts for Mermaid (D171). The default export keeps v12's
 * `LayoutLoader[]` shape, so v12's registration still works:
 *
 * ```ts
 * import elkLayouts from '@mermaid-js/layout-elk';
 * mermaid.registerLayoutLoaders(elkLayouts);
 * ```
 *
 * Each loader imports the engine (and elkjs) on first use. Installing the package changes no
 * default: ELK lays out only diagrams that name it (D127, R-LAYOUT-7).
 *
 * Every loader carries the package's config fragment (the `elk` section, D153), so core knows
 * the `elk.*` keys from registration on, and the package's extension (`elkExtension`): its
 * `postLayout` turns what the engine noted into warnings. It is small and does nothing until an
 * ELK engine has loaded. `elk.lineHops` is drawn by core (D537): it overrides the shared
 * `lineHops` key whenever an ELK layout lays the diagram out, with no hook here.
 */
import type { ExtensionPlugin } from '@mermaid-js/core';
import type { ConfigFragment } from '@mermaid-js/core/config';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import type * as Engine from './adapter.ts';
import type { ElkAlgorithm } from './adapter.ts';
import { configFragment } from './generated/config-fragment.ts';

/** A layout name and its engine, loaded on first use (`mermaid`'s `LayoutLoader`). */
export interface ElkLayoutLoader {
  readonly name: string;
  loader(): Promise<LayoutEngine>;
  /** The `elk` config section (D153), shared by every loader. */
  readonly config: ConfigFragment;
  /** The package's hooks, shared by every loader. */
  readonly extension: ExtensionPlugin;
}

/** Every v12 ELK layout name and the ELK algorithm it selects (D171). */
const NAMES: readonly (readonly [string, ElkAlgorithm])[] = [
  ['elk', 'layered'],
  ['elk.layered', 'layered'],
  ['elk.stress', 'stress'],
  ['elk.force', 'force'],
  ['elk.mrtree', 'mrtree'],
  ['elk.sporeOverlap', 'sporeOverlap'],
  ['elk.box', 'box'],
  ['elk.rectpacking', 'rectpacking'],
  ['elk.radial', 'radial'],
];
/** The engine module, once a loader has imported it (the hooks below wait for it). */
let engine: typeof Engine | undefined;

/**
 * The package's extension (`id: layout-elk`), on every loader: `mermaid` runs it only on renders
 * laid out with one of the names above. It has no `postRender`, so every render keeps the stream
 * writer.
 */
export const elkExtension: ExtensionPlugin = {
  id: 'layout-elk',
  postLayout(laidOut, ctx) {
    if (engine) for (const n of engine.takeNotes(ctx.config)) ctx.warn(n);
    return laidOut;
  },
};

const elkLayouts: readonly ElkLayoutLoader[] = NAMES.map(([name, algorithm]) => ({
  name,
  config: configFragment,
  extension: elkExtension,
  // The engine carries core's line-hop step (D537), which `elk.lineHops` (default on) needs, so
  // `preload({ layouts: ['elk'] })` covers `renderSync`.
  loader: async () => {
    engine = await import('./adapter.ts');
    return Object.assign(engine.elkEngine(algorithm), { lineHops: engine.lineHops });
  },
}));

export default elkLayouts;
