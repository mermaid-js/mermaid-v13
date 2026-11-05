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
 */
import type { LayoutEngine } from '@mermaid-js/core/layout';
import type { ElkAlgorithm } from './adapter.ts';

/** A layout name and its engine, loaded on first use (`mermaid`'s `LayoutLoader`). */
export interface ElkLayoutLoader {
  readonly name: string;
  loader(): Promise<LayoutEngine>;
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

const elkLayouts: readonly ElkLayoutLoader[] = NAMES.map(([name, algorithm]) => ({
  name,
  loader: async () => (await import('./adapter.ts')).elkEngine(algorithm),
}));

export default elkLayouts;
