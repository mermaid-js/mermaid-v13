/// <reference types="node" />
/**
 * The plugin scan (D165, D589, R-PLUG-5): the packages an app declares in its own package.json,
 * installed in its own `node_modules`, with a `mermaid` manifest. Asynchronous and read-only
 * (`node:fs/promises`): it runs no package code and never blocks the event loop. `autoload`
 * (`autoload.ts`) imports what it finds; the language server scans with it too.
 *
 * Confinement (D157): ancestor folders' `node_modules` are never scanned; every module path of
 * a manifest must resolve, symlinks followed, inside the package directory. Nothing here
 * throws: an unreadable `package.json`, a manifest `readManifest` rejects, a missing or
 * escaping path skips that package with one `PLUGIN_SKIPPED` warning.
 *
 * This file is also copied into `mermaid` (`pnpm gen:registry` writes
 * `packages/mermaid/src/generated/autoload-scan.gen.ts`), for its first-use Node discovery and
 * `mermaid/node-scan`, until spec #867's ticket 4 removes them. Edit it here only.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readManifest, type PluginManifest } from '@mermaid-js/core';

/** A package the scan found, with its manifest's module paths resolved and confined. */
export interface ScannedPackage {
  /** The npm package name (`@scope/name`), the D166 sort key. */
  readonly package: string;
  /** The package directory, symlinks followed. */
  readonly dir: string;
  /** The `mermaid` value of its package.json, as written (`readManifest` accepted it). */
  readonly raw: unknown;
  readonly manifest: PluginManifest;
  /**
   * Absolute real paths of the manifest's `entry`, `detector` and `ascii` modules, and of a
   * layout manifest's `config` module (D177).
   */
  readonly files: {
    readonly entry: string;
    readonly detector?: string;
    readonly ascii?: string;
    readonly config?: string;
  };
}

/**
 * A scan warning: a package skipped (the `PLUGIN_SKIPPED` shape), or a root with no
 * `node_modules` or no readable package.json (so an empty result can be told from a broken
 * one). The two root warnings are log-only.
 */
export type ScanWarning =
  | { readonly code: 'PLUGIN_SKIPPED'; readonly message: string; readonly package: string }
  | { readonly code: 'PLUGIN_DISCOVERY_NO_MODULES'; readonly message: string }
  | { readonly code: 'PLUGIN_DISCOVERY_NO_PACKAGE_JSON'; readonly message: string };

export interface ScanResult {
  /** Sorted by package name, in code-unit order (R-ARCH-6). */
  readonly packages: readonly ScannedPackage[];
  /** Root warning first, then package warnings sorted by package name. */
  readonly warnings: readonly ScanWarning[];
}

export interface ScanOptions {
  /**
   * First-party diagram ids. A `@mermaid-js/*` package whose diagram manifest has one of them
   * is `mermaid`'s own package (an app may list it) and is left out silently. Anyone else claiming such an id is still found (the registry skips it, D166).
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

/**
 * Whether a dependency key can name a folder directly in `node_modules`: `name` or
 * `@scope/name`, no path separators beyond the scope's, no dot segments. Anything else (a
 * key that would lead out of `node_modules`) is not looked at.
 */
function isPackageKey(key: string): boolean {
  if (key.includes('\\')) return false;
  const parts = key.split('/');
  const scoped = parts.length === 2 && parts[0]!.startsWith('@') && parts[0]!.length > 1;
  if (parts.length !== 1 && !scoped) return false;
  return parts.every(
    (p, i) => p !== '' && !p.startsWith('.') && (i > 0 || scoped || !p.startsWith('@'))
  );
}

/**
 * The dependency keys of the app's package.json (D589): the keys of its `dependencies`,
 * `devDependencies`, `peerDependencies` and `optionalDependencies`, deduplicated, keeping
 * only keys that name a `node_modules` folder. Undefined when the file is missing, not JSON or
 * not an object.
 */
async function declaredKeys(root: string): Promise<string[] | undefined> {
  let pkg: unknown;
  try {
    pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg)) return undefined;
  const keys = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const deps = (pkg as Record<string, unknown>)[field];
    if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) continue;
    for (const key of Object.keys(deps)) if (isPackageKey(key)) keys.add(key);
  }
  return [...keys];
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

class Skip extends Error {
  /** The path does not exist (rather than leading out of the package). */
  readonly missing: boolean;
  constructor(message: string, missing = false) {
    super(message);
    this.missing = missing;
  }
}

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
    throw new Skip(`"${key}" (${path}) does not exist`, true);
  }
  if (outside(root, real)) throw new Skip(`"${key}" is outside the package`);
  return real;
}

/** Where `packageModule` found a module path: its real path, or why it cannot be used. */
export type PackageModule =
  | { readonly file: string }
  | { readonly skip: string; readonly missing: boolean };

/**
 * A module path of a scanned package that the scan does not read itself, such as the LSP
 * server's `language` (D577), confined as the manifest's own paths are: inside the package,
 * symlinks followed. `missing` tells a path that does not exist from one that leads out of the
 * package; `skip` is the warning text, under the manifest key `key`. A path that is missing or
 * leads out resolves with `skip`; only an unexpected error (not a skip) rejects.
 */
export async function packageModule(
  pkg: Pick<ScannedPackage, 'dir'>,
  path: string,
  key: string
): Promise<PackageModule> {
  try {
    return { file: await confined(pkg.dir, pkg.dir, path, key) };
  } catch (error) {
    if (!(error instanceof Skip)) throw error;
    return { skip: error.message, missing: error.missing };
  }
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

/** The manifest's module paths, resolved and confined (`Skip` when one is missing or escapes). */
async function moduleFiles(
  dir: string,
  root: string,
  manifest: PluginManifest,
  entryPath: string
): Promise<ScannedPackage['files']> {
  const diagram = manifest.plugin === 'diagram' ? manifest : undefined;
  const layout = manifest.plugin === 'layout' ? manifest : undefined;
  const entry = await confined(dir, root, entryPath, 'entry');
  const detector = diagram?.detector && (await confined(dir, root, diagram.detector, 'detector'));
  const ascii = diagram?.ascii && (await confined(dir, root, diagram.ascii, 'ascii'));
  const config = layout?.config && (await confined(dir, root, layout.config, 'config'));
  return {
    entry,
    ...(detector ? { detector } : {}),
    ...(ascii ? { ascii } : {}),
    ...(config ? { config } : {}),
  };
}

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
    // No package.json is not a package (a declared package not installed, a stray folder);
    // anything else is worth a warning.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    return skipped(folder, `unreadable package.json (${(error as Error).message})`);
  }
  if (typeof pkg !== 'object' || pkg === null) return undefined;
  const { name, mermaid: raw } = pkg as { name?: unknown; mermaid?: unknown };
  const label = typeof name === 'string' && name !== '' ? name : folder;
  if (raw === undefined) return undefined;
  try {
    // Layout manifests (#238, D177: `plugin: "layout"`, `names`, `entry`, `export`?, `config`?)
    // are found like the others; autoload hands them to the registry as a `ManifestPlugin`.
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
    return {
      package: label,
      dir: root,
      raw,
      manifest,
      files: await moduleFiles(dir, root, manifest, manifest.entry),
    };
  } catch (error) {
    if (!(error instanceof Skip)) throw error;
    return skipped(label, error.message);
  }
}

/**
 * Scans `root`'s own `node_modules` for `mermaid` manifests, looking only at the folders the
 * root package.json declares (D589): the keys of its `dependencies`, `devDependencies`,
 * `peerDependencies` and `optionalDependencies`. `node_modules` is never listed, so a package
 * the package manager hoisted there without the app declaring it is not found. A declared
 * package that is not installed, or has no package.json or no `mermaid` key, is not a plugin
 * and gives no warning. Never rejects.
 */
export async function scanPlugins(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const firstParty = new Set(options.firstPartyIds ?? []);
  const at = resolve(root);
  const keys = await declaredKeys(at);
  if (keys === undefined) {
    const message = `No readable package.json in ${at}: no plugins discovered (only the packages it declares are)`;
    return { packages: [], warnings: [{ code: 'PLUGIN_DISCOVERY_NO_PACKAGE_JSON', message }] };
  }
  const modules = join(at, 'node_modules');
  if (!(await isDirectory(modules))) {
    const message = `No node_modules in ${at}: no plugins discovered (ancestor folders are never scanned)`;
    return { packages: [], warnings: [{ code: 'PLUGIN_DISCOVERY_NO_MODULES', message }] };
  }
  const found = await Promise.all(
    keys.map(async (key) => {
      try {
        return await scanOne(join(modules, key), key, firstParty);
      } catch (error) {
        // A file system error mid-scan (a package removed while reading it).
        return skipped(key, error instanceof Error ? error.message : String(error));
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
