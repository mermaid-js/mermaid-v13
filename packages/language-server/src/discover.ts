/**
 * Third-party language facets (DESIGN §4.5, D89, D157): packages in a workspace folder's own
 * `node_modules` whose package.json has a `mermaid` diagram manifest with a `language` entry.
 * The server calls this only when the client opts in (D157); by default it runs no code from
 * the opened folder.
 *
 * Confinement: ancestor folders' `node_modules` are never scanned; `detector` and `language`
 * must resolve (symlinks followed) inside the package directory; each import has a time limit.
 * The `detector` module is imported now (detection is synchronous); the `language` module is
 * imported by `preload`, so a broken one shows as `LANGUAGE_LOAD_FAILED` on its documents.
 *
 * Nothing here throws: an unreadable directory, a package.json that is not JSON, a manifest
 * without `id`, `detector` or `language`, an id or type of a first-party diagram, a path out of
 * the package, or a detector module that fails or takes too long to load skips that package
 * and is reported through `log`.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FacetEntry, LanguageFacet } from '@mermaid-js/language-service';
import { firstPartyFacets } from '@mermaid-js/language-service';

type Detector = FacetEntry['detector'];

/** Default time limit on one detector or language import. */
const IMPORT_TIMEOUT_MS = 5000;

export interface DiscoverOptions {
  /** Called once per package that is skipped, with the reason. */
  log?: (message: string) => void;
  /** Time limit on each detector or language import, in ms (default 5000). */
  importTimeoutMs?: number;
}

function list(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Package directories directly in a `node_modules` (scoped ones one level down). */
function packageDirs(modules: string): string[] {
  return list(modules)
    .filter((name) => !name.startsWith('.'))
    .flatMap((name) =>
      name.startsWith('@')
        ? list(join(modules, name)).map((sub) => join(modules, name, sub))
        : [join(modules, name)]
    );
}

interface Candidate {
  readonly name: string;
  readonly dir: string;
  readonly id: string;
  readonly detector: string;
  readonly language: string;
}

const isPath = (v: unknown): v is string => typeof v === 'string' && v !== '';

function candidate(dir: string, log: (m: string) => void): Candidate | undefined {
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch (error) {
    // No package.json is not a package (a stray folder); anything else is worth a line.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      log(`${dir}: unreadable package.json (${(error as Error).message})`);
    return undefined;
  }
  if (typeof pkg !== 'object' || pkg === null) return undefined;
  const { name, mermaid: m } = pkg as { name?: unknown; mermaid?: unknown };
  if (typeof m !== 'object' || m === null) return undefined;
  const manifest = m as Record<string, unknown>;
  if (manifest.plugin !== 'diagram' || manifest.language === undefined) return undefined;
  const label = typeof name === 'string' ? name : dir;
  if (!isPath(manifest.language)) return void log(`${label}: "language" must be a module path`);
  if (typeof manifest.id !== 'string' || manifest.id === '')
    return void log(`${label}: the manifest has no "id"`);
  if (!isPath(manifest.detector)) return void log(`${label}: the manifest has no "detector"`);
  return {
    name: label,
    dir,
    id: manifest.id,
    detector: manifest.detector,
    language: manifest.language,
  };
}

class OutsideError extends Error {}

/**
 * The file URL of `path` in package `dir`, after following symlinks; throws `OutsideError`
 * when it resolves outside the package, and the file system's error when it does not exist.
 */
function confined(dir: string, path: string): string {
  const root = realpathSync(dir);
  const target = resolve(dir, path);
  const lexical = relative(resolve(dir), target);
  if (lexical.startsWith('..') || isAbsolute(lexical)) throw new OutsideError();
  const real = realpathSync(target);
  const inside = relative(root, real);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new OutsideError();
  return pathToFileURL(real).href;
}

/** `import(url)`, rejected after `ms`. */
function importWithin(url: string, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([import(url), limit]).finally(() => clearTimeout(timer));
}

/** The detector a detector module exports: `detector`, else the default export. */
function detectorOf(module: unknown): Detector | undefined {
  const m = module as Record<string, unknown> | null;
  const fn = m?.detector ?? m?.default;
  return typeof fn === 'function' ? (fn as Detector) : undefined;
}

/**
 * Facet rows for every third-party language facet in the own `node_modules` of each root, in
 * discovery order. Packages whose id is a first-party diagram id or type (`flowchart`,
 * `flowchart-v2`), and a second package with an id already found, are skipped.
 */
export async function discoverFacets(
  roots: string | readonly string[],
  options: DiscoverOptions = {}
): Promise<FacetEntry[]> {
  const log = options.log ?? ((): void => undefined);
  const ms = options.importTimeoutMs ?? IMPORT_TIMEOUT_MS;
  const firstParty = new Set(firstPartyFacets.flatMap((e) => [e.id, e.type]));
  const ids = new Set<string>();
  const found: (Candidate & { languageUrl: string })[] = [];
  for (const root of typeof roots === 'string' ? [roots] : roots)
    for (const dir of packageDirs(join(resolve(root), 'node_modules'))) {
      const c = candidate(dir, log);
      if (c === undefined) continue;
      if (firstParty.has(c.id)) {
        log(`${c.name}: "${c.id}" is a first-party diagram`);
        continue;
      }
      if (ids.has(c.id)) continue;
      let languageUrl: string;
      try {
        languageUrl = confined(c.dir, c.language);
      } catch (error) {
        if (error instanceof OutsideError) {
          log(`${c.name}: "language" is outside the package`);
          continue;
        }
        // A missing file: kept, so its documents say LANGUAGE_LOAD_FAILED.
        languageUrl = pathToFileURL(resolve(c.dir, c.language)).href;
      }
      ids.add(c.id);
      found.push({ ...c, languageUrl });
    }
  const rows = await Promise.all(
    found.map(async (c): Promise<FacetEntry | undefined> => {
      let detector: Detector | undefined;
      try {
        detector = detectorOf(await importWithin(confined(c.dir, c.detector), ms));
      } catch (error) {
        if (error instanceof OutsideError)
          return void log(`${c.name}: "detector" is outside the package`);
        log(`${c.name}: detector failed to load (${(error as Error).message})`);
        return undefined;
      }
      if (!detector) return void log(`${c.name}: the detector module exports no function`);
      return {
        type: c.id,
        id: c.id,
        detector,
        load: () =>
          importWithin(c.languageUrl, ms).then(
            (m) => (m as { language?: LanguageFacet }).language as LanguageFacet
          ),
      };
    })
  );
  return rows.filter((r) => r !== undefined);
}
