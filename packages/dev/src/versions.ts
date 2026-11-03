/**
 * `GET /dev/api/versions` (#61; v12 `.esbuild/server.ts:215-248, 541-548`): npm's published
 * `mermaid` versions for the Compare tab, as `VersionsResponse` (`browser/explorer/compare-model.ts`).
 *
 * The registry is read server-side (npm's abbreviated document) and cached in memory for an
 * hour. When it can't be reached the last good answer is served with `stale: true`; with
 * nothing cached the route answers 502 `{ error }`.
 */
import { sortVersionsDesc, type VersionsResponse } from './browser/explorer/compare-model.ts';
import type { Route } from './routes.ts';

export type { VersionsResponse } from './browser/explorer/compare-model.ts';

export const VERSIONS_TTL_MS = 60 * 60 * 1000;
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export interface VersionsOptions {
  /** The npm registry's origin (a test seam). Default: registry.npmjs.org. */
  readonly registry?: string;
  /** The clock (a test seam). */
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

async function fetchMermaid(
  registry: string,
  timeoutMs: number
): Promise<VersionsResponse['mermaid']> {
  let res: Response;
  try {
    res = await fetch(`${registry}/mermaid`, {
      // The abbreviated document: versions and dist-tags without the multi-MB metadata.
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(
      `npm registry unreachable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!res.ok) throw new Error(`npm registry answered HTTP ${res.status}`);
  const doc: unknown = await res.json();
  if (!isRecord(doc) || !isRecord(doc.versions)) {
    throw new Error('npm registry sent an unexpected document');
  }
  const tags = isRecord(doc['dist-tags']) ? doc['dist-tags'] : {};
  return {
    versions: sortVersionsDesc(Object.keys(doc.versions)),
    distTags: Object.fromEntries(
      Object.entries(tags).filter((e): e is [string, string] => typeof e[1] === 'string')
    ),
  };
}

export function versionsRoute(options: VersionsOptions = {}): Route {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let cache: VersionsResponse | undefined;
  let inFlight: Promise<VersionsResponse> | undefined;

  const load = (): Promise<VersionsResponse> => {
    if (cache && now() - cache.fetchedAt < VERSIONS_TTL_MS) return Promise.resolve(cache);
    inFlight ??= (async () => {
      try {
        cache = {
          mermaid: await fetchMermaid(registry, timeoutMs),
          fetchedAt: now(),
          stale: false,
        };
        return cache;
      } catch (error) {
        if (cache) return { ...cache, stale: true };
        throw error;
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  };

  return {
    path: '/dev/api/versions',
    method: 'GET',
    handle: async (_req, res) => {
      let status = 200;
      let body: unknown;
      try {
        body = await load();
      } catch (error) {
        status = 502;
        body = { error: error instanceof Error ? error.message : String(error) };
      }
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    },
  };
}
