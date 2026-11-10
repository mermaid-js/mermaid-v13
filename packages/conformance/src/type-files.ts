/**
 * Per-type files of the conformance package, found by name: `src/<type>/<file>`. A shared table
 * (the parity suites, the jison, Langium and harvest rows, the outlining types) is the union of
 * one file per type folder, so a diagram port adds its own file and edits no shared list.
 *
 * Folders are read in name order. Each module is imported by its file URL, which both vitest
 * and the tsx CLIs resolve.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));

/** The folders of `src` that hold `file`, in name order. */
export function typeDirs(file: string): string[] {
  return readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(SRC, e.name, file)))
    .map((e) => e.name)
    .sort();
}

/**
 * Each `src/<dir>/<file>` module, in folder-name order, as `shape` reads it: `shape` throws
 * when the module does not export what the table needs (a misnamed export would otherwise drop
 * the type from the table without a word).
 */
export async function importTypeFiles<T>(
  file: string,
  shape: (module: Readonly<Record<string, unknown>>, where: string) => T
): Promise<{ dir: string; module: T }[]> {
  return Promise.all(
    typeDirs(file).map(async (dir) => {
      const module = (await import(pathToFileURL(join(SRC, dir, file)).href)) as Record<
        string,
        unknown
      >;
      return { dir, module: shape(module, `src/${dir}/${file}`) };
    })
  );
}

/** The module's exports, which must be exactly some of `names`, each an object. */
export function exportsOnly(
  module: Readonly<Record<string, unknown>>,
  where: string,
  names: readonly string[]
): void {
  const keys = Object.keys(module);
  const unknown = keys.filter((k) => !names.includes(k));
  if (keys.length === 0 || unknown.length > 0)
    throw new Error(
      `${where} must export ${names.join(', ')} (some of them)` +
        (unknown.length > 0 ? `, not ${unknown.join(', ')}` : '')
    );
  for (const k of keys)
    if (typeof module[k] !== 'object' || module[k] === null)
      throw new Error(`${where}: \`${k}\` must be an object`);
}

/**
 * One record from each folder's part, in folder order: a key two folders both define is an
 * error, so two ports cannot claim the same row.
 */
export function mergeRecords<V>(
  parts: readonly { dir: string; record: Readonly<Record<string, V>> | undefined }[],
  what: string
): Record<string, V> {
  const out: Record<string, V> = {};
  const owner = new Map<string, string>();
  for (const { dir, record } of parts) {
    for (const [key, value] of Object.entries(record ?? {})) {
      const other = owner.get(key);
      if (other !== undefined)
        throw new Error(`${what}: "${key}" is defined by both src/${other} and src/${dir}`);
      owner.set(key, dir);
      out[key] = value;
    }
  }
  return out;
}
