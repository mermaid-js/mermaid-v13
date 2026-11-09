import type { ParitySuite } from './corpus.ts';
import { exportsOnly, importTypeFiles } from './type-files.ts';

/**
 * The diagrams under oracle parity: each type's own `src/<type>/suite.ts` exports its suites as
 * `parity`, e.g. `[{ adapter: flowchartAdapter, corpusDirs: ['e2e/diagrams/flowchart'] }]`
 * (ticket #8), and they are gathered here in folder-name order. A port adds its `suite.ts`;
 * no shared list names its type. The runner picks an item's adapter by the oracle's type or the
 * adapter's detector, so the order must not matter: `registry.spec.ts` checks that no two
 * adapters claim the same v12 type.
 */
export const PARITY_SUITES: ParitySuite[] = (
  await importTypeFiles('suite.ts', (module, where) => {
    exportsOnly(module, where, ['parity']);
    if (!Array.isArray(module.parity) || module.parity.length === 0)
      throw new Error(`${where}: \`parity\` must list the type's suites`);
    return module.parity as readonly ParitySuite[];
  })
).flatMap(({ module }) => module);

/**
 * The committed divergence list (R-COMPAT-4): one `<type>.json` per diagram type in this
 * folder, read together by `loadDivergences`, so a port adds its own file.
 */
export const DIVERGENCES_DIR = new URL('../divergences/', import.meta.url);
