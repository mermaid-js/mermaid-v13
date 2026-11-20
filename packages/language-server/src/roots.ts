/**
 * Where the server scans for third-party facets once the client opts in (D157, D578, D579):
 * the workspace folders the client named, while it answers `initialize`, and then the nearest
 * package root above each opened `file:` document, found as the renderer finds its app root
 * (`findAppRoot`, D165), so a plugin installed in a nested pnpm workspace package is found.
 *
 * A document's root is scanned only when it lies inside a workspace folder: a file opened from
 * elsewhere never runs its `node_modules`. Paths are compared with symlinks followed, so a link
 * inside a folder cannot lead the scan out of it. Each root is scanned once per session, and
 * scans run one at a time, so a root scanned later never takes an id an earlier one holds.
 */
import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import type { FacetEntry } from '@mermaid-js/language-service';
import { findAppRoot } from '@mermaid-js/plugin-autoload';
import { discoverFacets, type DiscoverOptions } from './facets.ts';

export interface PluginRoots {
  /** The facets in the workspace folders' own `node_modules`. Call it once, first. */
  folders(): Promise<FacetEntry[]>;
  /**
   * The new facets in the package root of the document at `file`: none when the root was
   * scanned before or lies outside every workspace folder. Never rejects.
   */
  document(file: string): Promise<FacetEntry[]>;
}

/** The real path of `path`, or undefined when it does not exist. */
const real = (path: string): Promise<string | undefined> => realpath(path).catch(() => undefined);

/** Whether `path` is `folder` or lies inside it. */
function within(path: string, folder: string): boolean {
  const rel = relative(folder, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * The package root of the document at `file` when one of `folders` (real paths) holds both the
 * document and its root (D579).
 */
async function rootOf(file: string, folders: readonly string[]): Promise<string | undefined> {
  const dir = await real(dirname(file));
  if (dir === undefined) return undefined;
  const holding = folders.filter((f) => within(dir, f));
  if (holding.length === 0) return undefined;
  const root = await findAppRoot(dir);
  return root !== undefined && holding.some((f) => within(root, f)) ? root : undefined;
}

/** The plugin roots of a session whose client named `folders` (at least one). */
export function pluginRoots(folders: readonly string[], options: DiscoverOptions): PluginRoots {
  const log = options.log ?? ((): void => undefined);
  const scan = { ...options, owners: new Map<string, string>() };
  const scanned = new Set<string>();
  const reals = Promise.all(folders.map(real)).then((all) => all.filter((r) => r !== undefined));
  let queue: Promise<unknown> = Promise.resolve();
  /** `job`, run after every earlier one. */
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    folders: () =>
      serial(async () => {
        for (const folder of await reals) scanned.add(folder);
        return discoverFacets(folders, scan);
      }),
    document: (file) =>
      serial(async () => {
        const root = await rootOf(file, await reals);
        if (root === undefined || scanned.has(root)) return [];
        scanned.add(root);
        return discoverFacets(root, scan);
      }).catch((error: unknown) => {
        log(`scanning the package root of ${file} failed (${String(error)})`);
        return [];
      }),
  };
}
