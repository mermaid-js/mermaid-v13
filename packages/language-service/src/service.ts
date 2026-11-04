/**
 * `createLanguageService` (DESIGN §4.5, D90): holds the open documents and the loaded facets.
 * `update(uri, text)` re-parses the whole text and returns an immutable snapshot.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { ConfigSchema } from './config/schema.ts';
import type { DocumentContext } from './context.ts';
import type { FacetEntry } from './facets.ts';
import { firstPartyFacets } from './generated/facets.gen.ts';
import { DocumentSnapshot } from './snapshot.ts';

export interface LanguageServiceOptions {
  /**
   * Third-party rows, detected after the first-party ones. A row whose `type` is a
   * first-party type replaces that row (e.g. to bundle a facet eagerly).
   */
  readonly facets?: readonly FacetEntry[];
  /**
   * The config JSON schema for front-matter completion, hover and warnings (D96). When
   * omitted, `preload` loads the one gen-config generates (`pnpm gen:config`).
   */
  readonly schema?: ConfigSchema;
}

export interface PreloadRequest {
  /** Diagram ids (`flowchart`) or v12 types (`flowchart-v2`); every row's facet when omitted. */
  readonly types?: readonly string[];
}

export interface LanguageService {
  /**
   * Load facets before use (D155): every first-party and third-party row with a `load`, or
   * only `types`. Never rejects: a failed load shows as `LANGUAGE_LOAD_FAILED` on update.
   * Loads each row once, however often it is called. Also loads the generated config schema
   * when none was passed (front-matter features have no schema before that).
   */
  preload(request?: PreloadRequest): Promise<void>;
  /** Re-parse `uri` as `text` and return its new snapshot. */
  update(uri: string, text: string): DocumentSnapshot;
  /** The latest snapshot of `uri`. */
  get(uri: string): DocumentSnapshot | undefined;
  /** Forget `uri`. */
  close(uri: string): void;
}

/**
 * v12 detectType's cleaning of the text after front matter (as the renderer's registry does
 * it): directives removed, and each `%%` comment cut from its line.
 */
function detectText(src: string, start: number, pre: PreprocessResult): string {
  let text = '';
  let at = start;
  for (const { range } of pre.directives) {
    if (range.end <= at) continue;
    text += src.slice(at, Math.max(at, range.start));
    at = range.end;
  }
  text += src.slice(at);
  if (!text.includes('%%')) return text;
  return text
    .split('\n')
    .map((line) => {
      const c = line.indexOf('%%');
      return c < 0 ? line : line.slice(0, c).trimEnd();
    })
    .join('\n');
}

/** A row's facet once loaded, or why loading failed. */
type Loaded = LanguageFacet | { readonly failed: string };

/** Whether a loader's result has the shape of a {@link LanguageFacet}. */
function isFacet(value: unknown): value is LanguageFacet {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.id === 'string' &&
    typeof f.parse === 'function' &&
    typeof f.isValidId === 'function' &&
    typeof f.categories === 'object' &&
    f.categories !== null &&
    Array.isArray(f.namespaces)
  );
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createLanguageService(options: LanguageServiceOptions = {}): LanguageService {
  const extra = options.facets ?? [];
  const entries = [
    ...firstPartyFacets.map((e) => extra.find((x) => x.type === e.type) ?? e),
    ...extra.filter((x) => !firstPartyFacets.some((e) => e.type === x.type)),
  ];
  // Keyed by row, not diagram id: a replaced `flowchart-v2` row must not serve `flowchart-elk`.
  const loaded = new Map<FacetEntry, Loaded>();
  const loading = new Map<FacetEntry, Promise<void>>();
  const docs = new Map<string, DocumentSnapshot>();
  let version = 0;
  let schema = options.schema;
  let schemaLoad: Promise<void> | undefined;
  const loadSchema = (): Promise<void> =>
    (schemaLoad ??= import('./generated/config-schema.gen.ts').then(
      (m) => {
        schema ??= m.configSchema;
      },
      () => undefined
    ));

  const firstParty = new Set<FacetEntry>(firstPartyFacets);
  /** First-party rows test the text from the diagram's first line; third-party rows get the
   * cleaned text and the front-matter config, as v12 and the renderer's registry give them. */
  const detect = (text: string, pre: PreprocessResult, start: number): FacetEntry | undefined => {
    const body = text.slice(start);
    let clean: string | undefined;
    return entries.find((e) => {
      try {
        if (firstParty.has(e)) return e.detector(body);
        return e.detector((clean ??= detectText(text, start, pre)), pre.frontMatter?.config);
      } catch {
        return false;
      }
    });
  };

  /** Start (or join) loading `entry`'s facet. */
  const load = (entry: FacetEntry): Promise<void> => {
    if (loaded.has(entry)) return Promise.resolve();
    const inFlight = loading.get(entry);
    if (inFlight) return inFlight;
    const fail = (error: unknown) => {
      loaded.set(entry, { failed: reason(error) });
    };
    let started: Promise<LanguageFacet>;
    try {
      started = entry.load!();
    } catch (error) {
      fail(error);
      return Promise.resolve();
    }
    const done = Promise.resolve(started)
      .then((facet) => {
        if (isFacet(facet)) loaded.set(entry, facet);
        else fail(new Error('the module has no `language` facet export'));
      }, fail)
      .finally(() => loading.delete(entry));
    loading.set(entry, done);
    return done;
  };

  const build = (uri: string, text: string): DocumentSnapshot => {
    const pre = preprocess(text);
    const start = diagramStart(text, pre);
    const entry = detect(text, pre, start);
    const state = entry && (entry.facet ?? loaded.get(entry));
    const facet = state === undefined || 'failed' in state ? undefined : state;
    const context: DocumentContext = {
      uri,
      text,
      pre,
      start,
      entry,
      facet,
      result: facet?.parse(text, { keepTokens: true }),
      schema,
      loadError: state !== undefined && 'failed' in state ? state.failed : undefined,
      notLoaded: entry?.load !== undefined && state === undefined,
    };
    return new DocumentSnapshot(Object.freeze(context), ++version);
  };

  return {
    async preload(request = {}) {
      const { types } = request;
      const rows = entries.filter(
        (e) =>
          e.load !== undefined &&
          e.facet === undefined &&
          (types === undefined || types.includes(e.id) || types.includes(e.type))
      );
      await Promise.all([...rows.map(load), schema === undefined ? loadSchema() : undefined]);
    },
    update(uri, text) {
      const doc = build(uri, text);
      docs.set(uri, doc);
      return doc;
    },
    get: (uri) => docs.get(uri),
    close(uri) {
      docs.delete(uri);
    },
  };
}
