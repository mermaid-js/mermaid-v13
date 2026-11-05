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
 */
import { pathToFileURL } from 'node:url';
import type { ExtensionPlugin, Warning } from '@mermaid-js/core';
import type { ConfigFragment } from '@mermaid-js/core/config';
import { bundledSource } from './bundled.ts';
import { discoverOnFirstUse, type DiscoveredPlugin, type FirstUseSource } from './discovery.ts';
import mermaid, { createMermaid as createBase, type Mermaid } from './index.ts';
import { FIRST_PARTY_IDS, findAppRoot, scanPlugins, type ScannedPackage } from './node-scan.ts';

export * from './index.ts';

/** Default time limit on one discovery-time import (a detector or an extension entry), in ms. */
const IMPORT_TIMEOUT_MS = 5000;

export interface NodeDiscoveryOptions {
  /** Where to look for the app's package.json (default `process.cwd()`). */
  readonly cwd?: string;
  /** Time limit on each discovery-time import (detectors, extension entries), in ms (default 5000). */
  readonly importTimeoutMs?: number;
  /**
   * Gets every warning of the scan: each skipped package (also on the first render's
   * warnings) and `PLUGIN_DISCOVERY_NO_MODULES` (only here: a server deployed without
   * `node_modules` is normal, so renders do not carry it).
   */
  readonly log?: (warning: Warning) => void;
}

/**
 * A real runtime `import()` of a file found on disk. The magic comments keep webpack (Next.js
 * server builds take the `node` condition) and Vite from trying to resolve it at build time.
 */
const importFile = (path: string): Promise<unknown> =>
  import(/* webpackIgnore: true */ /* @vite-ignore */ pathToFileURL(path).href);

/** `importFile(path)`, rejected after `ms`. */
function importWithin(path: string, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error(`timed out after ${ms} ms`)), ms);
    timer.unref();
  });
  return Promise.race([importFile(path), limit]).finally(() => clearTimeout(timer));
}

type Detector = (text: string, config?: Readonly<Record<string, unknown>>) => boolean;

function detectorOf(module: unknown): Detector | undefined {
  const m = module as Record<string, unknown> | null;
  const fn = m?.detector ?? m?.default;
  return typeof fn === 'function' ? (fn as Detector) : undefined;
}

/** A layout's `config` module: the fragment (`config`, else default) and its `extension`, if any. */
function configModuleOf(module: unknown): { config: unknown; extension: unknown } {
  const m = module as Record<string, unknown> | null;
  return { config: m?.config ?? m?.default, extension: m?.extension };
}

/** One scanned package as a seam entry; a detector that fails to load gives a skip warning. */
async function toDiscovered(p: ScannedPackage, ms: number): Promise<DiscoveredPlugin | Warning> {
  const skip = (why: string): Warning =>
    ({ code: 'PLUGIN_SKIPPED', message: `${p.package}: ${why}`, package: p.package }) as Warning;
  const entry = p.files.entry;
  const ascii = p.files.ascii;
  if (p.manifest.plugin === 'extension')
    // Loaded now, at discovery (its activation): under the time limit.
    return {
      kind: 'plugin',
      package: p.package,
      plugin: { manifest: p.raw, load: () => importWithin(entry, ms) },
    };
  // Loaded on first detection (or first use of a layout name), during a render: no limit.
  const load = (): Promise<unknown> => importFile(entry);
  if (p.manifest.plugin === 'layout') {
    let config: unknown;
    let extension: unknown;
    if (p.files.config !== undefined) {
      try {
        ({ config, extension } = configModuleOf(await importWithin(p.files.config, ms)));
      } catch (error) {
        return skip(
          `config failed to load (${error instanceof Error ? error.message : String(error)})`
        );
      }
      if (config === undefined) return skip('the config module exports no fragment');
    }
    return {
      kind: 'plugin',
      package: p.package,
      plugin: {
        manifest: p.raw,
        load,
        ...(config !== undefined ? { config: config as ConfigFragment } : {}),
        ...(extension !== undefined ? { extension: extension as ExtensionPlugin } : {}),
      },
    };
  }
  const loadAscii = ascii === undefined ? {} : { loadAscii: () => importFile(ascii) };
  if (p.files.detector === undefined) return skip('the manifest has no "detector"');
  let detector: Detector | undefined;
  try {
    detector = detectorOf(await importWithin(p.files.detector, ms));
  } catch (error) {
    return skip(
      `detector failed to load (${error instanceof Error ? error.message : String(error)})`
    );
  }
  if (!detector) return skip('the detector module exports no function');
  return {
    kind: 'plugin',
    package: p.package,
    plugin: { manifest: p.raw, detector, load, ...loadAscii },
  };
}

interface Found {
  readonly list: readonly DiscoveredPlugin[];
  readonly warnings: readonly Warning[];
}

const cache = new Map<string, Promise<Found>>();

/** The scan of `root` and its detector imports, once per root and time limit. */
function discover(root: string, ms: number): Promise<Found> {
  const key = `${ms}\0${root}`;
  let found = cache.get(key);
  if (!found) {
    found = (async () => {
      const { packages, warnings } = await scanPlugins(root, { firstPartyIds: FIRST_PARTY_IDS });
      const entries = await Promise.all(packages.map((p) => toDiscovered(p, ms)));
      const list = entries.filter((e): e is DiscoveredPlugin => 'kind' in e);
      const skipped = entries.filter((e): e is Warning => !('kind' in e));
      return { list, warnings: [...warnings, ...skipped] };
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
      if (w.code !== 'PLUGIN_DISCOVERY_NO_MODULES') warn(w);
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

// A server build made with `@mermaid-js/bundler-plugin` already has its plugins (bundled.ts):
// the build-time scan of the same root, so Node discovery stays off there.
if (bundledSource === undefined) discoverOnFirstUse(mermaid, nodeDiscovery(), FIRST_USE_LIMIT);

/** A new `mermaid` API object, with every first-party diagram and Node plugin discovery. */
export function createMermaid(): Mermaid {
  const api = createBase();
  if (bundledSource === undefined) discoverOnFirstUse(api, nodeDiscovery(), FIRST_USE_LIMIT);
  return api;
}

export default mermaid;
