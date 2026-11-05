/**
 * The discovered-list seam (D166): the one way the discovery paths — the Node scan (T4), the
 * bundler's `mermaid/discovered` module (T5) and the CDN `globalThis.mermaidPlugins` queue (T6)
 * — hand what they found to an API object. Pure: no `node:fs`, no globals; the caller reads
 * packages and builds the list.
 */
import type { Warning } from '@mermaid-js/core';
import { seamOf, type Mermaid } from './api.ts';
import type { DiscoveredPlugin } from './registry.ts';

export type { DiscoveredPlugin, SkippedPlugin } from './registry.ts';

/**
 * Registers discovered packages on `api`. Diagrams are detected after every first-party type
 * and before explicit `registerExternalDiagrams` ones, in package-name order whatever the order
 * of `list` or of earlier calls. Extensions load now; layouts load when a diagram names them.
 * Never throws: a skipped package gives one `PLUGIN_SKIPPED` warning, returned here and added
 * to the next render's warnings.
 */
export function addDiscovered(
  api: Mermaid,
  list: readonly DiscoveredPlugin[]
): Promise<readonly Warning[]> {
  return seamOf(api).add(list);
}

/**
 * Sets the source `api` runs once, before its first `prepare`, `render`, `parse` or `preload`
 * (the async Node scan). It gets the `initialize()` config, so it can honour a switch such as
 * `discovery: false`. A source that rejects registers nothing. One source per API object.
 */
export function discoverOnFirstUse(
  api: Mermaid,
  source: (
    config: Readonly<Record<string, unknown>>
  ) => readonly DiscoveredPlugin[] | Promise<readonly DiscoveredPlugin[]>
): void {
  seamOf(api).onFirstUse(source);
}
