import { readFileSync } from 'node:fs';
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
  /** JSON files of `CorpusItem[]` (relative to the repo root), e.g. harvested spec strings. */
  corpusFiles?: string[];
  /** Further items built in code, e.g. a lexer gate corpus. */
  corpus?: () => Promise<CorpusItem[]>;
}

/**
 * Whether a corpus item is an embedded-diagram fixture (ADR-15): `mermaid <id> { … }` blocks,
 * kept in an `embedded/` folder. v12 rejects them and has no tokens for them, so the specs that
 * compare tokens or parses with v12 leave them out; the parity check lists them as
 * divergences instead.
 */
export const isEmbeddedFixture = (item: CorpusItem): boolean => item.id.includes('/embedded/');

/** Every `.mmd` file under `dir`, sorted by path, with ids `<idPrefix>/<path relative to dir>`. */
export async function* corpusFromDir(dir: string, idPrefix: string): AsyncGenerator<CorpusItem> {
  for (const file of await mmdFiles(dir)) {
    const rel = relative(dir, file).split(sep).join('/');
    yield { id: `${idPrefix}/${rel}`, source: await readFile(file, 'utf8') };
  }
}

/** A JSON file of `packages/conformance/corpus/`, by name: a list of corpus items or cases. */
export const corpusJson = <T = CorpusItem>(name: string): T[] =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'packages/conformance/corpus', name), 'utf8')) as T[];

/**
 * A type's corpus: its e2e fixtures (`e2e/diagrams/<dir>`, `dir` defaulting to `type`, ids
 * prefixed `e2e/`), then `extra`, then the harvested v12 strings of
 * `corpus/<type>-v12-specs.json`.
 */
export async function fixturesAndSpecs(
  type: string,
  { dir = type, extra = [] }: { dir?: string; extra?: readonly CorpusItem[] } = {}
): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams', dir), 'e2e')) {
    items.push(item);
  }
  return [...items, ...extra, ...corpusJson(`${type}-v12-specs.json`)];
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
  for (const file of new Set(suites.flatMap((s) => s.corpusFiles ?? []))) {
    yield* JSON.parse(await readFile(join(REPO_ROOT, file), 'utf8')) as CorpusItem[];
  }
  for (const suite of suites) if (suite.corpus) yield* await suite.corpus();
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
