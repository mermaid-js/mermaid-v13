/// <reference types="node" />
/**
 * `mermaid` in Node (the `node` export condition of `.`): the same API as `index.ts`, with
 * plugin auto-discovery on (D165, R-PLUG-5). Before the first `prepare`, `render`, `parse` or
 * `preload` of an API object, the app's own `node_modules` is scanned (`node-scan.ts`, from
 * the nearest package.json at or above `process.cwd()`); the scan is cached per root.
 *
 * Diagram plugins: the detector module is imported then, with a time limit; the entry (and the
 * ascii entry) loads on first detection, with no limit: a slow entry delays that render, never
 * fails it. Layout packages (D177): the `config` module is imported then, with the limit (its
 * `extension` export, if any, runs on renders laid out by the package's names); the entry loads
 * when a diagram names one of the layouts. Extensions (`@mermaid-js/plugin-interactions` too, D169) load on discovery.
 * `initialize({ discovery: false })` turns it off; diagram text cannot set `discovery`
 * (integrator-only). A package that fails is skipped with a warning on the first render.
 * The scan and the imports are `@mermaid-js/plugin-autoload`'s code (`generated/autoload-*.gen.ts`).
 */
import type { Warning } from '@mermaid-js/core';
import { bundledSource } from './bundled.ts';
import { discoverOnFirstUse, type DiscoveredPlugin, type FirstUseSource } from './discovery.ts';
import { IMPORT_TIMEOUT_MS, loadPlugins } from './generated/autoload-load.gen.ts';
import mermaid, { createMermaid as createBase, type Mermaid } from './index.ts';
import { FIRST_PARTY_IDS, findAppRoot } from './node-scan.ts';

export * from './index.ts';

export interface NodeDiscoveryOptions {
  /** Where to look for the app's package.json (default `process.cwd()`). */
  readonly cwd?: string;
  /** Time limit on each discovery-time import (detectors, extension entries), in ms (default 5000). */
  readonly importTimeoutMs?: number;
  /**
   * Gets every warning of the scan: each skipped package (also on the first render's
   * warnings) and `PLUGIN_DISCOVERY_NO_MODULES` / `PLUGIN_DISCOVERY_NO_PACKAGE_JSON` (only
   * here: a server deployed without `node_modules` is normal, so renders do not carry them).
   */
  readonly log?: (warning: Warning) => void;
}

interface Found {
  readonly list: readonly DiscoveredPlugin[];
  readonly warnings: readonly Warning[];
}

const cache = new Map<string, Promise<Found>>();

/** The scan of `root` and its discovery-time imports (`loadPlugins`), once per root and time limit. */
function discover(root: string, ms: number): Promise<Found> {
  const key = `${ms}\0${root}`;
  let found = cache.get(key);
  if (!found) {
    found = (async () => {
      const { plugins, warnings } = await loadPlugins(root, {
        firstPartyIds: FIRST_PARTY_IDS,
        importTimeoutMs: ms,
      });
      const list = plugins.map((p): DiscoveredPlugin => ({ kind: 'plugin', ...p }));
      return { list, warnings };
    })();
    cache.set(key, found);
  }
  return found;
}

/**
 * The first-use source of Node discovery: honours `discovery: false`, then scans the app root
 * found from `options.cwd`. Never rejects for a package's sake: each skip becomes a warning.
 */
export function nodeDiscovery(options: NodeDiscoveryOptions = {}): FirstUseSource {
  return async (config, warn) => {
    if (config.discovery === false) return [];
    const root = await findAppRoot(options.cwd ?? process.cwd());
    if (root === undefined) return [];
    const { list, warnings } = await discover(root, options.importTimeoutMs ?? IMPORT_TIMEOUT_MS);
    for (const w of warnings) {
      options.log?.(w);
      if (w.code !== 'PLUGIN_DISCOVERY_NO_MODULES' && w.code !== 'PLUGIN_DISCOVERY_NO_PACKAGE_JSON')
        warn(w);
    }
    return list;
  };
}

/**
 * How long the first draw waits for Node discovery in all: the detector imports, then the
 * extension entry imports, each in parallel under `IMPORT_TIMEOUT_MS`, so a slow package is
 * skipped by its own limit (with its name) before this one ends the wait.
 */
const FIRST_USE_LIMIT = { timeLimitMs: 2 * IMPORT_TIMEOUT_MS + 1000 };

/**
 * `@mermaid-js/plugin-autoload` marks the instance it serves (the symbol below, shared by name):
 * the app registered its plugins itself, so first-use discovery stands down and the instance
 * never registers a package twice or reports a skip twice. It must run first: an instance that
 * already drew has discovered. Deleted with first-use discovery (spec #867, ticket 4).
 */
const AUTOLOADED = Symbol.for('mermaid.autoloaded');

/** `nodeDiscovery()` for `api`, unless the app autoloads it. */
function firstUse(api: Mermaid): FirstUseSource {
  const source = nodeDiscovery();
  return (config, warn) => (AUTOLOADED in api ? [] : source(config, warn));
}

// A server build made with `@mermaid-js/bundler-plugin` already has its plugins (bundled.ts):
// the build-time scan of the same root, so Node discovery stays off there.
if (bundledSource === undefined) discoverOnFirstUse(mermaid, firstUse(mermaid), FIRST_USE_LIMIT);

/** A new `mermaid` API object, with every first-party diagram and Node plugin discovery. */
export function createMermaid(): Mermaid {
  const api = createBase();
  if (bundledSource === undefined) discoverOnFirstUse(api, firstUse(api), FIRST_USE_LIMIT);
  return api;
}

export default mermaid;
