/// <reference types="node" />
/**
 * Plugins for the `mermaid` bin (D589): `--plugin <package>` and `--autoload`. Node builtins
 * and this package only (R-PERF-2, `pnpm check:deps`): the bin does not depend on
 * `@mermaid-js/plugin-autoload`, it imports it at run time, from the user's project, when
 * `--autoload` asks for it.
 *
 * Packages resolve from the working directory, the user's project, never from where `mermaid`
 * itself is installed (a global install would not see the project's plugins). The lookup is
 * Node's own: the nearest `node_modules/<name>` at or above the folder, its `exports` read
 * with the conditions this process runs with (`node`, `import`, `default` and any `--conditions`).
 * Naming a package on the command line is the user's explicit choice, as writing the
 * registration in code is, so there is no confinement; a package's own files load as they do
 * from any import.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Mermaid } from './index.ts';

/** A problem with a plugin the user named: the message names the package and says what to do. */
export class PluginError extends Error {}

export const AUTOLOAD_PACKAGE = '@mermaid-js/plugin-autoload';

/** The export conditions of this process: `node`, `import`, and `--conditions`/`-C` flags. */
function conditions(): Set<string> {
  const found = new Set(['node', 'import', 'default']);
  const args = process.execArgv;
  for (const [i, arg] of args.entries()) {
    if (arg.startsWith('--conditions=')) found.add(arg.slice('--conditions='.length));
    else if ((arg === '--conditions' || arg === '-C') && args[i + 1] !== undefined)
      found.add(args[i + 1]!);
  }
  return found;
}

/** A package name as `node_modules` holds it: `name` or `@scope/name`, no path tricks. */
const isPackageName = (name: string): boolean =>
  /^(@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/.test(name);

interface PackageJson {
  main?: unknown;
  exports?: unknown;
  mermaid?: { export?: unknown };
}

/** The file a package `exports` target names for `.` under `active`, or undefined. */
function target(value: unknown, active: ReadonlySet<string>): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const v of value as unknown[]) {
      const found = target(v, active);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  for (const [key, v] of Object.entries(value)) {
    if (!active.has(key)) continue;
    const found = target(v, active);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The `.` target of an `exports` field: its `.` key, or the field itself when it only has conditions. */
function exportsDot(exports: unknown): unknown {
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports)) return exports;
  const map = exports as Record<string, unknown>;
  return Object.keys(map).some((k) => k.startsWith('.')) ? map['.'] : map;
}

/** The entry file of package `name` found from `cwd` (symlinks followed), and its package.json. */
function findPackage(name: string, cwd: string): { file: string; pkg: PackageJson } | undefined {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const manifest = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) {
      const home = dirname(manifest);
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson;
      const dot = exportsDot(pkg.exports);
      const entry =
        target(dot, conditions()) ?? (typeof pkg.main === 'string' ? pkg.main : './index.js');
      const file = join(home, entry);
      return existsSync(file) ? { file: realpathSync(file), pkg } : undefined;
    }
    if (dirname(dir) === dir) return undefined;
  }
}

/** Imports package `name` as the project at `cwd` resolves it. */
async function importPackage(
  name: string,
  cwd: string
): Promise<{ module: Record<string, unknown>; pkg: PackageJson } | undefined> {
  const found = findPackage(name, cwd);
  if (found === undefined) return undefined;
  const module = (await import(pathToFileURL(found.file).href)) as Record<string, unknown>;
  return { module, pkg: found.pkg };
}

const hasId = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { id?: unknown }).id === 'string' &&
  (value as { id: string }).id !== '';

/**
 * The plugin a package's main module holds: its default export, else the export its `mermaid`
 * manifest names (`export`), else its only export that looks like one (an object with an `id`).
 */
function pluginOf(module: Record<string, unknown>, pkg: PackageJson): unknown {
  if (module.default !== undefined) return module.default;
  const named = pkg.mermaid?.export;
  if (typeof named === 'string' && named in module) return module[named];
  const candidates = Object.values(module).filter(hasId);
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Registers the plugin package `name` on `mermaid`: a lazy diagram (`{ id, detector, loader }`,
 * D586), a full diagram plugin or an extension, as `registerExternalDiagrams` takes them. It
 * must be the package's default export, the export its `mermaid` manifest names, or its only
 * plugin-shaped export. A layout package is not taken here: use `--autoload`.
 */
export async function registerPlugin(
  mermaid: Pick<Mermaid, 'registerExternalDiagrams'>,
  name: string,
  cwd: string
): Promise<void> {
  const label = `--plugin ${name}`;
  if (!isPackageName(name)) throw new PluginError(`${label}: not a package name`);
  let loaded: Awaited<ReturnType<typeof importPackage>>;
  try {
    loaded = await importPackage(name, cwd);
  } catch (e) {
    throw new PluginError(
      `${label}: cannot import it (${e instanceof Error ? e.message : String(e)})`,
      {
        cause: e,
      }
    );
  }
  if (loaded === undefined)
    throw new PluginError(`${label}: package not found from ${cwd} (install it in your project)`);
  const plugin = pluginOf(loaded.module, loaded.pkg);
  if (!hasId(plugin))
    throw new PluginError(
      `${label}: its main export is not a plugin (expected a lazy diagram, a diagram plugin or an extension)`
    );
  try {
    await mermaid.registerExternalDiagrams([plugin as never]);
  } catch (e) {
    throw new PluginError(`${label}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

/** What `--autoload` calls: `autoload(mermaid, { root })` of `@mermaid-js/plugin-autoload`. */
type Autoload = (
  mermaid: Pick<Mermaid, 'registerExternalDiagrams'>,
  options: { root: string }
) => Promise<readonly { code: string; message: string }[]>;

/**
 * Autoloads the project's plugins, importing `@mermaid-js/plugin-autoload` from `cwd` only now.
 * Returns the warnings; a project without the package gets an error naming it.
 */
export async function autoloadPlugins(
  mermaid: Pick<Mermaid, 'registerExternalDiagrams'>,
  cwd: string
): Promise<readonly { code: string; message: string }[]> {
  let loaded: Awaited<ReturnType<typeof importPackage>>;
  try {
    loaded = await importPackage(AUTOLOAD_PACKAGE, cwd);
  } catch (e) {
    throw new PluginError(
      `--autoload: cannot import ${AUTOLOAD_PACKAGE} (${e instanceof Error ? e.message : String(e)})`,
      { cause: e }
    );
  }
  const autoload = loaded?.module.autoload as Autoload | undefined;
  if (loaded === undefined)
    throw new PluginError(
      `--autoload needs ${AUTOLOAD_PACKAGE}, which is not installed in ${cwd}: install it next to your plugins (npm install -D ${AUTOLOAD_PACKAGE})`
    );
  if (typeof autoload !== 'function')
    throw new PluginError(`--autoload: ${AUTOLOAD_PACKAGE} does not export autoload`);
  return autoload(mermaid, { root: cwd });
}
