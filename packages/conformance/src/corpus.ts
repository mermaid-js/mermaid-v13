import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CorpusItem, DiagramAdapter } from './types.ts';

/** Repository root, for in-repo corpus dirs. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A diagram's parity suite: its adapter and the in-repo fixture dirs (relative to the repo root). */
export interface ParitySuite {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapters of any model type
  adapter: DiagramAdapter<any>;
  corpusDirs: string[];
}

/** Every `.mmd` file under `dir`, sorted by path, with ids `<idPrefix>/<path relative to dir>`. */
export async function* corpusFromDir(dir: string, idPrefix: string): AsyncGenerator<CorpusItem> {
  for (const file of await mmdFiles(dir)) {
    const rel = relative(dir, file).split(sep).join('/');
    yield { id: `${idPrefix}/${rel}`, source: await readFile(file, 'utf8') };
  }
}

/**
 * The corpus for a parity run. Normally the in-repo fixture dirs of `suites`. With
 * `PARSE_FIXTURE_PATH` set (QA's external set, D65), every `.mmd` under that folder instead,
 * with ids prefixed `external/`. CI never sets it.
 */
export async function* resolveCorpus(
  env: Record<string, string | undefined>,
  suites: ParitySuite[]
): AsyncGenerator<CorpusItem> {
  const external = env.PARSE_FIXTURE_PATH;
  if (external) {
    yield* corpusFromDir(external, 'external');
    return;
  }
  const dirs = [...new Set(suites.flatMap((s) => s.corpusDirs))];
  for (const dir of dirs) yield* corpusFromDir(join(REPO_ROOT, dir), dir);
}

async function mmdFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await mmdFiles(path)));
    else if (entry.name.endsWith('.mmd')) out.push(path);
  }
  return out.sort();
}
