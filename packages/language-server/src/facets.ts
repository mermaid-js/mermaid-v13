/**
 * Third-party language facets (DESIGN §4.5, D89, D157, D577): diagram plugins in a workspace
 * folder's own `node_modules` whose manifest has a `language` entry. The packages are found by
 * the scan `@mermaid-js/plugin-autoload` registers plugins with (D589), so the editor and
 * `autoload` accept and skip the same packages: `readManifest`, confinement, package-name
 * order (D166) and the scan's warnings. The server calls this only when the client opts in (D157); by default it runs no
 * code from the opened folder.
 *
 * The server's own rules on top: a first-party id or type is never replaced, an id an earlier
 * package holds is skipped (as the render's registry does), and each import has a time limit.
 * The `detector` module is imported now (detection is synchronous); the `language` module is
 * imported by `preload`, so a broken or missing one shows as `LANGUAGE_LOAD_FAILED` on its
 * documents. Nothing here throws: every skipped package is reported through `log`.
 */
import { resolve } from 'node:path';
import type { FacetEntry, LanguageFacet } from '@mermaid-js/language-service';
import { firstPartyFacets } from '@mermaid-js/language-service';
import {
  detectorOf,
  FIRST_PARTY_IDS,
  IMPORT_TIMEOUT_MS,
  importWithin,
  packageModule,
  scanPlugins,
  type ScannedPackage,
} from '@mermaid-js/plugin-autoload';

type Detector = FacetEntry['detector'];

export interface DiscoverOptions {
  /** Called once per package that is skipped, with the reason. */
  log?: (message: string) => void;
  /** Time limit on each detector or language import, in ms (default 5000). */
  importTimeoutMs?: number;
  /**
   * The ids earlier calls took, by package. A package claiming one is skipped, and the ids this
   * call takes are added, so a root scanned later never replaces a facet (D579).
   */
  owners?: Map<string, string>;
}

/** A scanned diagram package with a `language` entry, ready to be claimed by its id. */
interface Facet {
  readonly package: string;
  readonly row: FacetEntry;
}

/**
 * The path of a scanned package's `language` module: undefined when it has none (a plugin
 * without editor support), `{ skip }` when it cannot be used. A missing file is kept, so its
 * documents say LANGUAGE_LOAD_FAILED.
 */
async function languagePathOf(p: ScannedPackage): Promise<string | { skip: string } | undefined> {
  const language = (p.raw as { language?: unknown }).language;
  if (language === undefined) return undefined;
  if (typeof language !== 'string' || language === '')
    return { skip: '"language" must be a module path' };
  const at = await packageModule(p, language, 'language');
  if ('file' in at) return at.file;
  return at.missing ? resolve(p.dir, language) : { skip: at.skip };
}

/** The detector of a detector module, imported within `ms`, or why there is none. */
async function loadDetector(path: string, ms: number): Promise<Detector | { skip: string }> {
  let detector: Detector | undefined;
  try {
    detector = detectorOf(await importWithin(path, ms));
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { skip: `detector failed to load (${why})` };
  }
  return detector ?? { skip: 'the detector module exports no function' };
}

/**
 * The facet of one scanned package: undefined when it has no `language` entry, else the row
 * or the reason it is skipped (for the detector, the reasons `mermaid` gives in Node).
 */
async function facetOf(p: ScannedPackage, ms: number): Promise<Facet | string | undefined> {
  if (p.manifest.plugin !== 'diagram') return undefined;
  const languagePath = await languagePathOf(p);
  if (typeof languagePath !== 'string') return languagePath?.skip;
  // The scan skips a diagram manifest without a detector.
  const detector = await loadDetector(p.files.detector!, ms);
  if (typeof detector !== 'function') return detector.skip;
  const { id } = p.manifest;
  const load = (): Promise<LanguageFacet> =>
    importWithin(languagePath, ms).then((m) => (m as { language?: LanguageFacet }).language!);
  return { package: p.package, row: { type: id, id, detector, load } };
}

/** The facets in one root's own `node_modules`, in package-name order; logs every skip. */
async function scanRoot(
  root: string,
  ms: number,
  log: (message: string) => void
): Promise<Facet[]> {
  const { packages, warnings } = await scanPlugins(root, { firstPartyIds: FIRST_PARTY_IDS });
  for (const w of warnings) log(w.message);
  const facets = await Promise.all(packages.map((p) => facetOf(p, ms)));
  return facets.flatMap((f, i) => {
    if (typeof f === 'string') log(`${packages[i]!.package}: ${f}`);
    return typeof f === 'object' ? [f] : [];
  });
}

/**
 * Facet rows for every third-party language facet in the own `node_modules` of each root:
 * roots in the order given, each in package-name order (D166). A package whose id is a
 * first-party diagram id or type (`flowchart`, `flowchart-v2`), or an id an earlier package
 * holds (in this call or, through `owners`, an earlier one), is skipped.
 */
export async function discoverFacets(
  roots: string | readonly string[],
  options: DiscoverOptions = {}
): Promise<FacetEntry[]> {
  const log = options.log ?? ((): void => undefined);
  const ms = options.importTimeoutMs ?? IMPORT_TIMEOUT_MS;
  const firstParty = new Set(firstPartyFacets.flatMap((e) => [e.id, e.type]));
  const owners = options.owners ?? new Map<string, string>();
  const rows: FacetEntry[] = [];
  const found: Facet[] = [];
  for (const root of typeof roots === 'string' ? [roots] : roots)
    found.push(...(await scanRoot(root, ms, log)));
  for (const { package: pkg, row } of found) {
    const owner = owners.get(row.id);
    if (firstParty.has(row.id)) log(`${pkg}: "${row.id}" is a first-party diagram id or type`);
    else if (owner !== undefined) log(`${pkg}: diagram "${row.id}" belongs to "${owner}"`);
    else {
      owners.set(row.id, pkg);
      rows.push(row);
    }
  }
  return rows;
}
