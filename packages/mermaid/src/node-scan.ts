/// <reference types="node" />
/**
 * `mermaid/node-scan`: the Node-only plugin scan (D165, R-PLUG-5) for `node.ts` and
 * `@mermaid-js/bundler-plugin`. The scan's home is `@mermaid-js/plugin-autoload` (D589);
 * `pnpm gen:registry` copies its source here (`generated/autoload-scan.gen.ts`), because
 * `mermaid` may not depend on the package. This file only adds the first-party ids. It, the
 * copy and `node.ts`'s first-use discovery are deleted by spec #867's ticket 4.
 */
import { DETECTORS } from './generated/detectors.gen.ts';

export * from './generated/autoload-scan.gen.ts';

/**
 * `mermaid`'s own diagram ids, the `firstPartyIds` to pass to `scanPlugins` (the Node entry and
 * the bundler plugin do): their `@mermaid-js/*` packages are never discovered.
 */
export const FIRST_PARTY_IDS: readonly string[] = DETECTORS.flatMap((e) =>
  e.id === undefined ? [] : [e.id]
);
