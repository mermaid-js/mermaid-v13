/// <reference types="node" />
/**
 * `autoload(mermaid)` (D589, R-PLUG-5): the plugins an app's `package.json` declares,
 * registered on the `mermaid` instance the app passes in. Node only. Opt-in: `mermaid` itself
 * registers nothing it was not told to.
 *
 * Which packages, how far to trust them: the scan (`scan.ts`) reads only the declared packages
 * of the app root, from its own `node_modules`, with every manifest path confined to its
 * package (D157); `load.ts` imports each package's discovery-time modules under a time limit.
 * Registration then calls `registerExternalDiagrams` once per package, in package-name order
 * (D588: registered plugins are detected in registration order), so everything the registry
 * does for an explicit registration holds here: a first-party id or type is never replaced, a
 * layout manifest registers its names, an extension activates now. Nothing throws for a
 * package's sake: every package that fails, at any step, gives one warning and the rest still
 * register.
 */
import { readManifest } from '@mermaid-js/core';
import { FIRST_PARTY_IDS } from './generated/first-party-ids.gen.ts';
import { loadPlugins, type ManifestPlugin } from './load.ts';
import { findAppRoot, type ScanWarning } from './scan.ts';

/**
 * The part of a `mermaid` instance `autoload` uses: its `registerExternalDiagrams`. Any
 * instance from `createMermaid()`, and the default export of `mermaid` and `mermaid/slim`, fits.
 */
export interface PluginHost {
  registerExternalDiagrams(diagrams: readonly ManifestPlugin[]): Promise<void>;
}

export interface AutoloadOptions {
  /**
   * Where to start looking for the app's package.json (default `process.cwd()`): the app root
   * is the nearest folder at or above it with a package.json, as `mermaid`'s Node discovery
   * found it (type-marker package.json files such as `dist/package.json` are walked past).
   */
  readonly root?: string;
  /** Time limit on each discovery-time import (a detector, a layout config, an extension entry), in ms (default 5000). */
  readonly importTimeoutMs?: number;
}

/** What `autoload` reports: a package skipped, or a root with nothing to read (log-only). */
export type AutoloadWarning = ScanWarning;

/**
 * Marks an instance that `autoload` serves. `mermaid`'s own first-use Node discovery (until
 * it is removed, #867) looks for it and stands down, so one instance never registers a package
 * twice or reports a skip twice.
 */
const AUTOLOADED = Symbol.for('mermaid.autoloaded');

/** The registry keys a manifest claims: a package that repeats one an earlier package holds is skipped. */
function claims(raw: unknown): string[] {
  const manifest = readManifest(raw);
  if (manifest.plugin === 'layout') return manifest.names.map((n) => `layout ${n}`);
  return [`${manifest.plugin} ${manifest.id}`];
}

const why = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const skipped = (pkg: string, reason: string): AutoloadWarning => ({
  code: 'PLUGIN_SKIPPED',
  message: `Plugin package "${pkg}" was skipped: ${reason}`,
  package: pkg,
});

/**
 * Registers the plugins the app root's `package.json` declares on `mermaid`, in package-name
 * order, and returns the warnings: the root's (`PLUGIN_DISCOVERY_NO_PACKAGE_JSON`,
 * `PLUGIN_DISCOVERY_NO_MODULES`, meant for a log, not for a render) first, then one
 * `PLUGIN_SKIPPED` per package that could not be used. Never rejects for a package's sake.
 *
 * Call it before the first render. A package that two packages both claim (a diagram or
 * extension id, a layout name) goes to the first by package name; the other is skipped.
 */
export async function autoload(
  mermaid: PluginHost,
  options: AutoloadOptions = {}
): Promise<readonly AutoloadWarning[]> {
  (mermaid as unknown as Record<symbol, unknown>)[AUTOLOADED] = true;
  const at = options.root ?? process.cwd();
  const root = await findAppRoot(at);
  if (root === undefined) {
    return [
      {
        code: 'PLUGIN_DISCOVERY_NO_PACKAGE_JSON',
        message: `No readable package.json at or above ${at}: no plugins discovered (only the packages it declares are)`,
      },
    ];
  }
  const { plugins, warnings } = await loadPlugins(root, {
    firstPartyIds: FIRST_PARTY_IDS,
    importTimeoutMs: options.importTimeoutMs,
  });
  const out: AutoloadWarning[] = [...warnings];
  const owners = new Map<string, string>();
  for (const { package: pkg, plugin } of plugins) {
    try {
      const keys = claims(plugin.manifest);
      const taken = keys.find((k) => owners.has(k));
      if (taken !== undefined) throw new Error(`${taken} belongs to "${owners.get(taken)}"`);
      await mermaid.registerExternalDiagrams([plugin]);
      for (const k of keys) owners.set(k, pkg);
    } catch (error) {
      out.push(skipped(pkg, why(error)));
    }
  }
  return out;
}
