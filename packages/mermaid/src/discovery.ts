/**
 * The discovered-list seam (D166): the one way the discovery paths — the Node scan (T4), the
 * bundler's `mermaid/discovered` module (T5) and the CDN `globalThis.mermaidPlugins` queue (T6)
 * — hand what they found to an API object. Pure: no `node:fs`, no globals; the caller reads
 * packages and builds the list.
 */
import type { Warning } from '@mermaid-js/core';
import type { Mermaid } from './api.ts';
import { seamOf, type AddOptions, type FirstUseSource } from './seam.ts';
import type { DiscoveredPlugin } from './registry.ts';

export type { DiscoveredPlugin, SkippedPlugin } from './registry.ts';
export type { FirstUseSource } from './seam.ts';

/**
 * Registers discovered packages on `api`. Diagrams are detected after every first-party type
 * and before explicit `registerExternalDiagrams` ones, in package-name order whatever the order
 * of `list` or of earlier calls. Extensions load now; layouts load when a diagram names them.
 * Never throws: a skipped package gives one `PLUGIN_SKIPPED` warning, returned here and added
 * to the next render's warnings. A draw waits for it at most `options.timeLimitMs` (5 s), then
 * renders without it with a `PLUGIN_DISCOVERY_FAILED` warning; it still registers if it ends.
 */
export function addDiscovered(
  api: Mermaid,
  list: readonly DiscoveredPlugin[],
  options?: AddOptions
): Promise<readonly Warning[]> {
  return seamOf(api).add(list, options);
}

/**
 * Sets the source `api` runs once, before its first `prepare`, `render`, `parse` or `preload`
 * (the async Node scan, the bundler's list). It gets the `initialize()` config, so it can
 * honour a switch such as `discovery: false`, and `warn`, which queues a warning (a package it
 * skipped) for the first render. A source that rejects registers nothing. One source per API
 * object. The first draw waits for the source and its registration (extension entries load
 * then) at most `options.timeLimitMs` (5 s) in all, then renders without them with a
 * `PLUGIN_DISCOVERY_FAILED` warning; what the source finds still registers when it ends.
 */
export function discoverOnFirstUse(
  api: Mermaid,
  source: FirstUseSource,
  options?: AddOptions
): void {
  seamOf(api).onFirstUse(source, options);
}
