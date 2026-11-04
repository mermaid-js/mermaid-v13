/**
 * Third-party language facets (DESIGN §4.5, D89): packages in `node_modules` whose
 * package.json has a `mermaid` diagram manifest with a `language` entry. The manifest's
 * `detector` module is imported now (detection is synchronous); the `language` module is
 * imported by `preload`, so a broken one shows as `LANGUAGE_LOAD_FAILED` on its documents.
 *
 * Nothing here throws: an unreadable directory, a package.json that is not JSON, a manifest
 * without `id`, `detector` or `language`, or a detector module that fails to load skips that
 * package and is reported through `log`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FacetEntry, LanguageFacet } from '@mermaid-js/language-service';
import { firstPartyFacets } from '@mermaid-js/language-service';

type Detector = FacetEntry['detector'];

export interface DiscoverOptions {
  /** Called once per package that is skipped, with the reason. */
  log?: (message: string) => void;
}

/** `node_modules` directories from `root` up to the file system root, nearest first. */
function nodeModulesDirs(root: string): string[] {
  const out: string[] = [];
  for (let dir = resolve(root); ; dir = dirname(dir)) {
    out.push(join(dir, 'node_modules'));
    if (dirname(dir) === dir) return out;
  }
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

const moduleUrl = (dir: string, path: string) => pathToFileURL(resolve(dir, path)).href;

/** The detector a detector module exports: `detector`, else the default export. */
function detectorOf(module: unknown): Detector | undefined {
  const m = module as Record<string, unknown> | null;
  const fn = m?.detector ?? m?.default;
  return typeof fn === 'function' ? (fn as Detector) : undefined;
}

/**
 * Facet rows for every third-party language facet visible from `root` (its `node_modules`
 * and those of its parents), in discovery order. Packages with a first-party diagram id, and
 * a second package with an id already found, are skipped.
 */
export async function discoverFacets(
  root: string,
  options: DiscoverOptions = {}
): Promise<FacetEntry[]> {
  const log = options.log ?? ((): void => undefined);
  const ids = new Set(firstPartyFacets.map((e) => e.id));
  const found: Candidate[] = [];
  for (const modules of nodeModulesDirs(root))
    for (const dir of packageDirs(modules)) {
      const c = candidate(dir, log);
      if (c === undefined || ids.has(c.id)) continue;
      ids.add(c.id);
      found.push(c);
    }
  const rows = await Promise.all(
    found.map(async (c): Promise<FacetEntry | undefined> => {
      let detector: Detector | undefined;
      try {
        detector = detectorOf(await import(moduleUrl(c.dir, c.detector)));
      } catch (error) {
        log(`${c.name}: detector failed to load (${(error as Error).message})`);
        return undefined;
      }
      if (!detector) return void log(`${c.name}: the detector module exports no function`);
      const url = moduleUrl(c.dir, c.language);
      return {
        type: c.id,
        id: c.id,
        detector,
        load: () =>
          import(url).then((m: { language?: LanguageFacet }) => m.language as LanguageFacet),
      };
    })
  );
  return rows.filter((r) => r !== undefined);
}
