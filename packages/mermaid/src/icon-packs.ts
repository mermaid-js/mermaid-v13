/**
 * The icon pack registry (D290, D294): one per `mermaid` API object, as layout loaders are.
 * Packs reach an icons extension through `ResourceRequest.iconPacks` and
 * `RenderContext.iconPacks`, so the extension keeps no state and packs registered before it
 * still count. A loader runs only when a diagram names its pack (or `preload` does); a
 * rejecting loader leaves its pack `failed`, which the next `prepare()` retries (D299).
 */
import type { IconifyJSON, IconPackSource, IconPackState } from '@mermaid-js/core';

/** v12's lazy pack: `loader` may return the pack itself rather than a promise (D294). */
export interface AsyncIconLoader {
  name: string;
  loader: () => Promise<IconifyJSON> | IconifyJSON;
}

/** v12's eager pack. */
export interface SyncIconLoader {
  name: string;
  icons: IconifyJSON;
}

/** What `registerIconPacks` takes: `name` overrides the pack's own `prefix` (v12). */
export type IconLoader = AsyncIconLoader | SyncIconLoader;

interface Entry {
  readonly loader?: AsyncIconLoader['loader'];
  pack?: IconifyJSON;
  /** Why the last load failed. */
  error?: string;
  pending?: Promise<void>;
}

/**
 * One API object's packs (D294): what extensions read (and resource requests load) through, with
 * no `register`, and what `registerIconPacks` calls. Packs are not checked: the extension checks
 * what it reads.
 */
export function iconPackRegistry(): [IconPackSource, (loaders: readonly IconLoader[]) => void] {
  let entries = new Map<string, Entry>();
  const state = (name: string): IconPackState | undefined => {
    const e = entries.get(name);
    if (!e) return undefined;
    if (e.pack) return 'ready';
    return e.error === undefined || e.pending ? 'pending' : 'failed';
  };
  const load = (name: string): Promise<void> => {
    const e = entries.get(name);
    if (!e?.loader || e.pack) return Promise.resolve();
    e.pending ??= Promise.resolve()
      .then(e.loader)
      .then(
        (value) => void (e.pack = { ...value, prefix: name }),
        (err: unknown) => {
          e.error = String((err as Error | undefined)?.message ?? err);
          e.pending = undefined;
        }
      );
    // A pack registered again meanwhile loads in its place, so prepare() never leaves it pending.
    return e.pending.then(() => (entries.get(name) === e ? undefined : load(name)));
  };
  return [
    {
      names: () => [...entries.keys()],
      state,
      get: (name: string) => entries.get(name)?.pack,
      error: (name: string) => entries.get(name)?.error,
      load,
    },
    (loaders) => {
      // Every loader is checked first, so a bad one registers none. A name registered again
      // replaces its pack, keeping its place.
      const next = new Map(entries);
      for (const l of Array.isArray(loaders) ? (loaders as unknown[]) : [0]) {
        const { name, icons, loader } = (l ?? {}) as Partial<AsyncIconLoader & SyncIconLoader>;
        if (
          typeof name !== 'string' ||
          !name ||
          (icons === undefined ? typeof loader !== 'function' : 'loader' in (l as object))
        )
          throw new TypeError('registerIconPacks() takes [{ name, icons } or { name, loader }]');
        next.set(name, icons === undefined ? { loader } : { pack: { ...icons, prefix: name } });
      }
      entries = next;
    },
  ];
}
