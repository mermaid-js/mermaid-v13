/// <reference types="node" />
/**
 * The Node-only plugin scan (D165, R-PLUG-5): the packages in an app's own `node_modules` with
 * a `mermaid` manifest. Read-only and synchronous: it runs no package code. The Node entry
 * (`node.ts`) imports what it finds at runtime; the bundler plugin (T5) imports this module,
 * through `mermaid/node-scan`, to do the same scan at build time with the bundler's root.
 *
 * Confinement (D157): ancestor folders' `node_modules` are never scanned; every module path of
 * a manifest must resolve, symlinks followed, inside the package directory. Nothing here
 * throws: an unreadable `package.json`, a manifest `readManifest` rejects, a missing or
 * escaping path skips that package with one `PLUGIN_SKIPPED` warning.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
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
  /** Absolute real paths of the manifest's `entry`, `detector` and `ascii` modules. */
  readonly files: {
    readonly entry: string;
    readonly detector?: string;
    readonly ascii?: string;
  };
}

/** A package the scan skipped (the seam's `PLUGIN_SKIPPED` shape). */
export interface ScanWarning {
  readonly code: 'PLUGIN_SKIPPED';
  readonly message: string;
  readonly package: string;
}

export interface ScanResult {
  /** Sorted by package name, in code-unit order (R-ARCH-6). */
  readonly packages: readonly ScannedPackage[];
  readonly warnings: readonly ScanWarning[];
}

export interface ScanOptions {
  /** Package names left out silently (`mermaid`'s own first-party packages). */
  readonly ignore?: Iterable<string>;
}

/** The nearest directory at or above `from` with a `package.json`; undefined when none. */
export function findAppRoot(from: string): string | undefined {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

function list(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Package directories directly in `modules` (scoped ones one level down). */
function packageDirs(modules: string): string[] {
  return list(modules)
    .filter((name) => !name.startsWith('.'))
    .flatMap((name) =>
      name.startsWith('@')
        ? list(join(modules, name))
            .filter((sub) => !sub.startsWith('.'))
            .map((sub) => join(modules, name, sub))
        : [join(modules, name)]
    );
}

class Skip extends Error {}

const outside = (from: string, to: string): boolean => {
  const rel = relative(from, to);
  return rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel);
};

/** The real path of `path` in package `dir`; `Skip` when it is missing or escapes the package. */
function confined(dir: string, path: string, key: string): string {
  const target = resolve(dir, path);
  if (outside(resolve(dir), target)) throw new Skip(`"${key}" is outside the package`);
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    throw new Skip(`"${key}" (${path}) does not exist`);
  }
  if (outside(realpathSync(dir), real)) throw new Skip(`"${key}" is outside the package`);
  return real;
}

/** Code-unit order of package names (R-ARCH-6), never `localeCompare`. */
function byName(a: { package: string }, b: { package: string }): number {
  if (a.package < b.package) return -1;
  return a.package > b.package ? 1 : 0;
}

/** One package directory: a found plugin, a skip reason, or undefined (not a plugin). */
function scanOne(
  dir: string,
  folder: string,
  ignore: ReadonlySet<string>
): ScannedPackage | ScanWarning | undefined {
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch (error) {
    // No package.json is not a package (a stray folder); anything else is worth a warning.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    const why = `unreadable package.json (${(error as Error).message})`;
    return { code: 'PLUGIN_SKIPPED', message: `${folder}: ${why}`, package: folder };
  }
  if (typeof pkg !== 'object' || pkg === null) return undefined;
  const { name, mermaid: raw } = pkg as { name?: unknown; mermaid?: unknown };
  const label = typeof name === 'string' && name !== '' ? name : folder;
  if (raw === undefined || ignore.has(label)) return undefined;
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
    if (manifest.entry === undefined) throw new Skip('the manifest has no "entry"');
    const diagram = manifest.plugin === 'diagram' ? manifest : undefined;
    if (diagram && diagram.detector === undefined) throw new Skip('the manifest has no "detector"');
    const entry = confined(dir, manifest.entry, 'entry');
    const detector = diagram?.detector && confined(dir, diagram.detector, 'detector');
    const ascii = diagram?.ascii && confined(dir, diagram.ascii, 'ascii');
    return {
      package: label,
      dir: realpathSync(dir),
      raw,
      manifest,
      files: { entry, ...(detector ? { detector } : {}), ...(ascii ? { ascii } : {}) },
    };
  } catch (error) {
    if (!(error instanceof Skip)) throw error;
    return { code: 'PLUGIN_SKIPPED', message: `${label}: ${error.message}`, package: label };
  }
}

/**
 * Scans `root`'s own `node_modules` (top-level and `@scope/*` entries) for `mermaid`
 * manifests. Packages without a package.json or a `mermaid` key are not plugins and give no
 * warning; neither do the `ignore`d ones.
 */
export function scanPlugins(root: string, options: ScanOptions = {}): ScanResult {
  const ignore = new Set(options.ignore ?? []);
  const modules = join(resolve(root), 'node_modules');
  const packages: ScannedPackage[] = [];
  const warnings: ScanWarning[] = [];
  for (const dir of packageDirs(modules)) {
    const folder = relative(modules, dir).split('\\').join('/');
    let found: ScannedPackage | ScanWarning | undefined;
    try {
      found = scanOne(dir, folder, ignore);
    } catch (error) {
      // A file system error mid-scan (a package removed while reading it).
      const why = error instanceof Error ? error.message : String(error);
      found = { code: 'PLUGIN_SKIPPED', message: `${folder}: ${why}`, package: folder };
    }
    if (found === undefined) continue;
    if ('code' in found) warnings.push(found);
    else packages.push(found);
  }
  packages.sort(byName);
  warnings.sort(byName);
  return { packages, warnings };
}
