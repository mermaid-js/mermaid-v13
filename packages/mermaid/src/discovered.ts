/**
 * `mermaid/discovered`: the plugins a bundler found at build time (D164, R-PLUG-5). Empty
 * here. `@mermaid-js/bundler-plugin` replaces this module in the app's build with one that
 * statically imports each discovered detector and lazily imports each entry; without the
 * plugin nothing changes. `index.ts` hands the list to the default instance and every
 * `createMermaid()` before their first render (the D166 seam). Scan warnings stay build-time.
 */
import type { DiscoveredPlugin } from './registry.ts';

/** What the build-time scan found, one entry per plugin (see `discovery.ts`). */
const discovered: readonly DiscoveredPlugin[] = [];
export default discovered;
