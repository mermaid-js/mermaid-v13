/// <reference types="node" />
/**
 * `mermaid` in Node (the `node` export condition of `.`): the same API as `index.ts`, with
 * plugin auto-discovery on (D165, R-PLUG-5). Before the first `prepare`, `render`, `parse` or
 * `preload` of an API object, the app's own `node_modules` is scanned (`node-scan.ts`, from
 * the nearest package.json at or above `process.cwd()`); the scan is cached per root.
 *
 * Diagram plugins: the detector module is imported then, with a time limit; the entry loads on
 * first detection. Extensions (`@mermaid-js/plugin-interactions` too, D169) load on discovery.
 * `initialize({ discovery: false })` turns it off; diagram text cannot set `discovery`
 * (integrator-only). A package that fails is skipped with a warning on the first render.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Warning } from '@mermaid-js/core';
import { discoverOnFirstUse, type DiscoveredPlugin, type FirstUseSource } from './discovery.ts';
import mermaid, { createMermaid as createBase, type Mermaid } from './index.ts';
import { findAppRoot, scanPlugins, type ScannedPackage } from './node-scan.ts';

export * from './index.ts';

/** Default time limit on one plugin module import (detector, entry, ascii entry), in ms. */
const IMPORT_TIMEOUT_MS = 5000;

export interface NodeDiscoveryOptions {
  /** Where to look for the app's package.json (default `process.cwd()`). */
  readonly cwd?: string;
  /** Time limit on each module import, in ms (default 5000). */
  readonly importTimeoutMs?: number;
}

/** `import(url)`, rejected after `ms`. */
function importWithin(path: string, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error(`timed out after ${ms} ms`)), ms);
    timer.unref();
  });
  return Promise.race([import(pathToFileURL(path).href), limit]).finally(() => clearTimeout(timer));
}

type Detector = (text: string, config?: Readonly<Record<string, unknown>>) => boolean;

function detectorOf(module: unknown): Detector | undefined {
  const m = module as Record<string, unknown> | null;
  const fn = m?.detector ?? m?.default;
  return typeof fn === 'function' ? (fn as Detector) : undefined;
}

/** `mermaid`'s own dependencies: first-party packages, never discovered (npm hoists them). */
function ownPackages(): string[] {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name?: string;
      dependencies?: Record<string, string>;
    };
    return [pkg.name ?? 'mermaid', ...Object.keys(pkg.dependencies ?? {})];
  } catch {
    return ['mermaid'];
  }
}

/** One scanned package as a seam entry; a detector that fails to load gives a skip warning. */
async function toDiscovered(p: ScannedPackage, ms: number): Promise<DiscoveredPlugin | Warning> {
  const skip = (why: string): Warning =>
    ({ code: 'PLUGIN_SKIPPED', message: `${p.package}: ${why}`, package: p.package }) as Warning;
  const load = (): Promise<unknown> => importWithin(p.files.entry, ms);
  const ascii = p.files.ascii;
  const loadAscii = ascii === undefined ? {} : { loadAscii: () => importWithin(ascii, ms) };
  if (p.files.detector === undefined)
    return { kind: 'plugin', package: p.package, plugin: { manifest: p.raw, load } };
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
      const { packages, warnings } = scanPlugins(root, { ignore: ownPackages() });
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
    const root = findAppRoot(options.cwd ?? process.cwd());
    if (root === undefined) return [];
    const { list, warnings } = await discover(root, options.importTimeoutMs ?? IMPORT_TIMEOUT_MS);
    for (const w of warnings) warn(w);
    return list;
  };
}

discoverOnFirstUse(mermaid, nodeDiscovery());

/** A new `mermaid` API object, with every first-party diagram and Node plugin discovery. */
export function createMermaid(): Mermaid {
  const api = createBase();
  discoverOnFirstUse(api, nodeDiscovery());
  return api;
}

export default mermaid;
