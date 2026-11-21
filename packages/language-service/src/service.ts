/**
 * `createLanguageService` (DESIGN §4.5, D90): holds the open documents and the loaded facets.
 * `update(uri, text)` re-parses the whole text and returns an immutable snapshot.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import {
  detectText,
  diagramStart,
  firstPartyDetects,
  preprocess,
} from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { ConfigSchema } from './config/schema.ts';
import { MAX_BLOCK_DEPTH } from '@mermaid-js/core/parser-kit';
import { blockBody } from '@mermaid-js/core/parser-kit/embed-body';
import type { DocumentContext } from './context.ts';
import type { FacetEntry } from './facets.ts';
import { firstPartyFacets } from './generated/facets.gen.ts';
import { createSnapshot } from './snapshot.ts';
import type { DocumentSnapshot } from './snapshot.ts';

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
    typeof f.completions === 'function' &&
    typeof f.hover === 'function' &&
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
      () => {
        schemaLoad = undefined; // a failed load is tried again by the next preload
      }
    ));

  const firstParty = new Set<FacetEntry>(firstPartyFacets);
  /**
   * As the renderer's registry detects: first-party rows test the text from the diagram's first
   * line, then v12's comment-cut text (`firstPartyDetects`); third-party rows get the cleaned
   * text and the front-matter config, as v12 gave them.
   */
  const detect = (text: string, pre: PreprocessResult, start: number): FacetEntry | undefined => {
    let clean: string | undefined;
    const detects = firstPartyDetects(text, start, pre);
    return entries.find((e) => {
      try {
        if (firstParty.has(e)) return detects((t) => e.detector(t));
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

  /** Loaded facets, each once, in detector order. */
  const available = (): LanguageFacet[] => {
    const out: LanguageFacet[] = [];
    for (const e of entries) {
      const state = e.facet ?? loaded.get(e);
      if (state !== undefined && !('failed' in state) && !out.includes(state)) out.push(state);
    }
    return out;
  };

  /**
   * `text` as a snapshot. Each block it embeds (ADR-15) is read the same way, as a document of
   * its own, `depth` counting the blocks around it; a block deeper than the render's limit is
   * not read (its diagnostics say so).
   */
  const build = (uri: string, text: string, depth = 0): DocumentSnapshot => {
    const at = depth === 0 ? ++version : version; // a block shares its host's version
    const pre = preprocess(text);
    const start = diagramStart(text, pre);
    const entry = detect(text, pre, start);
    const state = entry && (entry.facet ?? loaded.get(entry));
    let facet = state === undefined || 'failed' in state ? undefined : state;
    let result: DocumentContext['result'];
    let parseError: string | undefined;
    try {
      result = facet?.parse(text, { keepTokens: true });
    } catch (error) {
      // A (third-party) facet whose parse throws: generic features and an error saying so.
      facet = undefined;
      parseError = reason(error);
    }
    const context: DocumentContext = {
      uri,
      text,
      pre,
      start,
      entry,
      facet,
      result,
      parseError,
      schema,
      loadError: state !== undefined && 'failed' in state ? state.failed : undefined,
      notLoaded: entry?.load !== undefined && state === undefined,
      available: entry === undefined ? available() : [],
      embeds: (result?.embeds ?? []).map((block) => {
        // The body as the render reads it: its common indentation removed (D633).
        const body = blockBody(block.text);
        return {
          block,
          doc:
            depth < MAX_BLOCK_DEPTH ? build(`${uri}#${block.id}`, body.text, depth + 1) : undefined,
          outer: (o: number) => block.offset + body.outer(o),
        };
      }),
    };
    return createSnapshot(Object.freeze(context), at);
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
