/**
 * The icon pack registry (D290, D294): one per `mermaid` API object, as layout loaders are.
 * Packs reach an icons extension through `ResourceRequest.iconPacks` and
 * `RenderContext.iconPacks`, so the extension keeps no state and packs registered before it
 * still count. A loader runs only when a diagram names its pack (or `preload` does); a
 * rejecting loader leaves its pack `failed`, which the next `prepare()` retries (D299).
 */
import type { IconifyJSON, IconPacks, IconPackSource, IconPackState } from '@mermaid-js/core';

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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** `value` as pack `name`, or why it is not an Iconify JSON pack. */
function asPack(value: unknown, name: string): IconifyJSON | string {
  if (!isObject(value) || !isObject(value.icons)) return 'it is not Iconify JSON (no icons object)';
  return { ...(value as unknown as IconifyJSON), prefix: name };
}

export class IconPackRegistry implements IconPackSource {
  private readonly entries = new Map<string, Entry>();
  /** What render contexts get: reads only, no loader (D294). */
  readonly view: IconPacks = Object.freeze({
    names: () => this.names(),
    state: (name: string) => this.state(name),
    get: (name: string) => this.get(name),
  });

  /** Checks every loader first, so a bad one registers none (v12 threw on the first). */
  register(loaders: readonly IconLoader[]): void {
    if (!Array.isArray(loaders))
      throw new TypeError(
        'registerIconPacks() takes an array of { name, icons } or { name, loader }'
      );
    const next: [string, Entry][] = [];
    for (const l of loaders as readonly unknown[]) {
      if (!isObject(l) || typeof l.name !== 'string' || l.name === '')
        throw new TypeError('An icon pack needs a "name": a non-empty string');
      const { name } = l;
      if (typeof l.loader === 'function' && !('icons' in l)) {
        next.push([name, { loader: l.loader as AsyncIconLoader['loader'] }]);
      } else if ('icons' in l && !('loader' in l)) {
        const pack = asPack(l.icons, name);
        if (typeof pack === 'string') throw new TypeError(`Icon pack "${name}": ${pack}`);
        next.push([name, { pack }]);
      } else {
        throw new TypeError(`Icon pack "${name}" needs either "icons" or a "loader" function`);
      }
    }
    // A name registered again replaces the pack, keeping its place.
    for (const [name, entry] of next) this.entries.set(name, entry);
  }

  get size(): number {
    return this.entries.size;
  }

  names(): readonly string[] {
    return [...this.entries.keys()];
  }

  state(name: string): IconPackState | undefined {
    const e = this.entries.get(name);
    if (!e) return undefined;
    if (e.pack) return 'ready';
    return e.error !== undefined && !e.pending ? 'failed' : 'pending';
  }

  get(name: string): IconifyJSON | undefined {
    return this.entries.get(name)?.pack;
  }

  /** Why pack `name`'s last load failed, while it is `failed`. */
  failure(name: string): string | undefined {
    return this.state(name) === 'failed' ? this.entries.get(name)!.error : undefined;
  }

  load(name: string): Promise<void> {
    const e = this.entries.get(name);
    if (!e?.loader || e.pack) return Promise.resolve();
    if (e.pending) return e.pending;
    const pending = Promise.resolve()
      .then(() => e.loader!())
      .then(
        (value) => {
          const pack = asPack(value, name);
          if (typeof pack === 'string') e.error = `the loader's result: ${pack}`;
          else {
            e.pack = pack;
            delete e.error;
          }
        },
        (err: unknown) => {
          e.error = err instanceof Error ? err.message : String(err);
        }
      )
      .finally(() => {
        if (e.pending === pending) delete e.pending;
      });
    e.pending = pending;
    return pending;
  }
}
