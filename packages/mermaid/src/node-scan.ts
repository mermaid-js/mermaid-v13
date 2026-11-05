/// <reference types="node" />
/**
 * The Node-only plugin scan (D165, R-PLUG-5): the packages in an app's own `node_modules` with
 * a `mermaid` manifest. Asynchronous and read-only (`node:fs/promises`): it runs no package
 * code and never blocks the event loop. The Node entry (`node.ts`) imports what it finds at
 * runtime; the bundler plugin (T5) imports this module, through `mermaid/node-scan`, to do the
 * same scan at build time with the bundler's root.
 *
 * Confinement (D157): ancestor folders' `node_modules` are never scanned; every module path of
 * a manifest must resolve, symlinks followed, inside the package directory. Nothing here
 * throws: an unreadable `package.json`, a manifest `readManifest` rejects, a missing or
 * escaping path skips that package with one `PLUGIN_SKIPPED` warning.
 */
import { readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readManifest, type PluginManifest } from '@mermaid-js/core';
import { DETECTORS } from './generated/detectors.gen.ts';

/**
 * `mermaid`'s own diagram ids, the `firstPartyIds` to pass to `scanPlugins` (the Node entry and
 * the bundler plugin do): their `@mermaid-js/*` packages are never discovered.
 */
export const FIRST_PARTY_IDS: readonly string[] = DETECTORS.flatMap((e) =>
  e.id === undefined ? [] : [e.id]
);

/** A package the scan found, with its manifest's module paths resolved and confined. */
export interface ScannedPackage {
  /** The npm package name (`@scope/name`), the D166 sort key. */
  readonly package: string;
  /** The package directory, symlinks followed. */
  readonly dir: string;
  /** The `mermaid` value of its package.json, as written (`readManifest` accepted it). */
  readonly raw: unknown;
  readonly manifest: PluginManifest;
  /** Absolute real paths of the manifest's `entry`, `detector` and `ascii` modules. */
  readonly files: {
    readonly entry: string;
    readonly detector?: string;
    readonly ascii?: string;
  };
}

/**
 * A scan warning: a package skipped (the seam's `PLUGIN_SKIPPED` shape), or a root with no
 * `node_modules` (so an empty result can be told from a broken one).
 */
export type ScanWarning =
  | { readonly code: 'PLUGIN_SKIPPED'; readonly message: string; readonly package: string }
  | { readonly code: 'PLUGIN_DISCOVERY_NO_MODULES'; readonly message: string };

export interface ScanResult {
  /** Sorted by package name, in code-unit order (R-ARCH-6). */
  readonly packages: readonly ScannedPackage[];
  /** Root warning first, then package warnings sorted by package name. */
  readonly warnings: readonly ScanWarning[];
}

export interface ScanOptions {
  /**
   * First-party diagram ids. A `@mermaid-js/*` package whose diagram manifest has one of them
   * is `mermaid`'s own package (npm hoists them next to the app's plugins) and is left out
   * silently. Anyone else claiming such an id is still found (the registry skips it, D166).
   */
  readonly firstPartyIds?: Iterable<string>;
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * Whether a package.json is a package root, not a type marker (`dist/package.json` holding
 * only `{"type": "commonjs"}`): it has a `name` or a dependency field. One that is not JSON
 * counts as a root, so the scan reports it rather than walking past it.
 */
async function isPackageRoot(file: string): Promise<boolean | undefined> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const pkg = JSON.parse(text) as unknown;
    if (typeof pkg !== 'object' || pkg === null) return false;
    const p = pkg as Record<string, unknown>;
    return typeof p.name === 'string' || DEPENDENCY_FIELDS.some((f) => f in p);
  } catch {
    return true;
  }
}

/**
 * The app root for `from`: the nearest directory at or above it whose package.json is a
 * package root (type markers are walked past). Undefined when there is none.
 */
export async function findAppRoot(from: string): Promise<string | undefined> {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if ((await isPackageRoot(join(dir, 'package.json'))) === true) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

async function list(dir: string): Promise<string[] | undefined> {
  try {
    return await readdir(dir);
  } catch {
    return undefined;
  }
}

/** Package directories directly in `modules` (scoped ones one level down). */
async function packageDirs(modules: string, names: readonly string[]): Promise<string[]> {
  const visible = names.filter((name) => !name.startsWith('.'));
  const nested = await Promise.all(
    visible.map(async (name) =>
      name.startsWith('@')
        ? ((await list(join(modules, name))) ?? [])
            .filter((sub) => !sub.startsWith('.'))
            .map((sub) => join(modules, name, sub))
        : [join(modules, name)]
    )
  );
  return nested.flat();
}

class Skip extends Error {}

const outside = (from: string, to: string): boolean => {
  const rel = relative(from, to);
  return rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel);
};

/** The real path of `path` in package `dir`; `Skip` when it is missing or escapes the package. */
async function confined(dir: string, root: string, path: string, key: string): Promise<string> {
  const target = resolve(dir, path);
  if (outside(resolve(dir), target)) throw new Skip(`"${key}" is outside the package`);
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new Skip(`"${key}" (${path}) does not exist`);
  }
  if (outside(root, real)) throw new Skip(`"${key}" is outside the package`);
  return real;
}

/** Code-unit order of package names (R-ARCH-6), never `localeCompare`. */
function byName(a: { package: string }, b: { package: string }): number {
  if (a.package < b.package) return -1;
  return a.package > b.package ? 1 : 0;
}

const skipped = (pkg: string, why: string): ScanWarning => ({
  code: 'PLUGIN_SKIPPED',
  message: `${pkg}: ${why}`,
  package: pkg,
});

/** One package directory: a found plugin, a skip warning, or undefined (not a plugin). */
async function scanOne(
  dir: string,
  folder: string,
  firstParty: ReadonlySet<string>
): Promise<ScannedPackage | ScanWarning | undefined> {
  let pkg: unknown;
  try {
    pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  } catch (error) {
    // No package.json is not a package (a stray folder); anything else is worth a warning.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return skipped(folder, `unreadable package.json (${(error as Error).message})`);
  }
  if (typeof pkg !== 'object' || pkg === null) return undefined;
  const { name, mermaid: raw } = pkg as { name?: unknown; mermaid?: unknown };
  const label = typeof name === 'string' && name !== '' ? name : folder;
  if (raw === undefined) return undefined;
  try {
    // Layout manifests (#238: `plugin: "layout"`, `names`, `entry`, `export`) go to the seam's
    // `layout` arm (node.ts `toDiscovered`) once `readManifest` accepts them; until then it
    // rejects them and they are skipped here. This is the hook for #238.
    let manifest: PluginManifest;
    try {
      manifest = readManifest(raw);
    } catch (error) {
      throw new Skip((error as Error).message);
    }
    const diagram = manifest.plugin === 'diagram' ? manifest : undefined;
    if (diagram && label.startsWith('@mermaid-js/') && firstParty.has(diagram.id)) return undefined;
    if (manifest.entry === undefined) throw new Skip('the manifest has no "entry"');
    if (diagram && diagram.detector === undefined) throw new Skip('the manifest has no "detector"');
    const root = await realpath(dir);
    const entry = await confined(dir, root, manifest.entry, 'entry');
    const detector = diagram?.detector && (await confined(dir, root, diagram.detector, 'detector'));
    const ascii = diagram?.ascii && (await confined(dir, root, diagram.ascii, 'ascii'));
    return {
      package: label,
      dir: root,
      raw,
      manifest,
      files: { entry, ...(detector ? { detector } : {}), ...(ascii ? { ascii } : {}) },
    };
  } catch (error) {
    if (!(error instanceof Skip)) throw error;
    return skipped(label, error.message);
  }
}

/**
 * Scans `root`'s own `node_modules` (top-level and `@scope/*` entries) for `mermaid`
 * manifests. Packages without a package.json or a `mermaid` key are not plugins and give no
 * warning. Never rejects.
 */
export async function scanPlugins(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const firstParty = new Set(options.firstPartyIds ?? []);
  const modules = join(resolve(root), 'node_modules');
  const names = await list(modules);
  if (names === undefined) {
    const message = `No node_modules in ${resolve(root)}: no plugins discovered (ancestor folders are never scanned)`;
    return { packages: [], warnings: [{ code: 'PLUGIN_DISCOVERY_NO_MODULES', message }] };
  }
  const found = await Promise.all(
    (await packageDirs(modules, names)).map(async (dir) => {
      const folder = relative(modules, dir).split('\\').join('/');
      try {
        return await scanOne(dir, folder, firstParty);
      } catch (error) {
        // A file system error mid-scan (a package removed while reading it).
        return skipped(folder, error instanceof Error ? error.message : String(error));
      }
    })
  );
  const packages: ScannedPackage[] = [];
  const warnings: (ScanWarning & { package: string })[] = [];
  for (const f of found) {
    if (f === undefined) continue;
    if (!('code' in f)) packages.push(f);
    else if (f.code === 'PLUGIN_SKIPPED') warnings.push(f);
  }
  return { packages: packages.sort(byName), warnings: warnings.sort(byName) };
}
