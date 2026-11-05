/**
 * The CDN plugin queue (D167, spec #218 T6): a third-party CDN script pushes itself onto
 * `globalThis.mermaidPlugins`, before or after mermaid loads. `connectPluginQueue` drains what
 * is queued into the discovered-list seam and replaces the array's `push`, so later pushes
 * register at once. Draws wait for registrations still in flight, each for a limited time.
 *
 * Every API object of one build copy (the default one and each `createMermaid()`) takes every
 * entry, the ones queued before it was made too. A second copy of the build on the page finds
 * the queue already connected: it warns once and leaves the queue to the first copy.
 */
import type { AddOptions, Mermaid } from './api.ts';
import { addDiscovered } from './discovery.ts';
import type { DiscoveredPlugin } from './registry.ts';

/** Where the queue lives: `globalThis` in the CDN build. */
export interface PluginQueueScope {
  mermaidPlugins?: unknown;
}

/** Marks a connected queue; the value is the build copy that owns it. */
const OWNER = Symbol.for('mermaid.pluginQueue');
/** This build copy. */
const COPY = {};

interface Connection {
  /** Every entry the queue took, in order: an API object connected later registers them too. */
  readonly taken: unknown[];
  readonly apis: { readonly api: Mermaid; readonly options?: AddOptions }[];
}

const connections = new WeakMap<object, Connection>();
/** Ids already warned about for a missing `package` (once each per build copy). */
const warnedPackage = new Set<string>();
let warnedCopies = false;

/**
 * One queue entry as a discovered package. An entry is anything `registerExternalDiagrams`
 * takes (a diagram, a lazy diagram, an extension, or either by manifest) with its npm
 * `package` name, or a discovered-list entry (`{ kind: 'plugin' | 'layout', package, … }`).
 * The package name sets the detection and hook order (D166), the same as for an npm install;
 * without one, the plugin id (or the manifest's) stands in, with a console warning. An entry
 * that cannot even be read (a throwing getter) becomes an unnamed one, which the registry
 * skips with a warning.
 */
function toDiscovered(entry: unknown): DiscoveredPlugin {
  try {
    const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    if ((e.kind === 'plugin' || e.kind === 'layout') && 'package' in e)
      return entry as DiscoveredPlugin;
    const manifest = e.manifest as Record<string, unknown> | undefined;
    const fallback = manifest?.id ?? e.id;
    const name = e.package ?? fallback;
    if (e.package === undefined && typeof fallback === 'string' && !warnedPackage.has(fallback)) {
      warnedPackage.add(fallback);
      console.warn(
        `mermaid: the mermaidPlugins entry "${fallback}" has no "package"; give each entry its ` +
          'npm package name ({ package: "<name>", … }) so plugins order as in an npm install (D166).'
      );
    }
    return {
      kind: 'plugin',
      package: typeof name === 'string' ? name : '',
      plugin: entry as never,
    };
  } catch {
    return { kind: 'plugin', package: '', plugin: undefined as never };
  }
}

function register(api: Mermaid, item: unknown, options?: AddOptions): void {
  addDiscovered(api, [toDiscovered(item)], options).catch(() => undefined);
}

/** Warns, once per build copy, that a second copy of mermaid is on the page. */
export function warnTwoCopies(): void {
  if (warnedCopies) return;
  warnedCopies = true;
  console.warn(
    'mermaid: two copies of mermaid are loaded on this page; the later one leaves the plugin ' +
      'queue, globalThis.mermaid and the startOnLoad render to the first. Load mermaid once.'
  );
}

/** Whether another copy of the build connected the queue of `scope` (it warns once). */
export function queueOwnedElsewhere(
  scope: PluginQueueScope = globalThis as PluginQueueScope
): boolean {
  const queue = scope.mermaidPlugins as { [OWNER]?: unknown } | undefined;
  const owner = Array.isArray(queue) ? queue[OWNER] : undefined;
  if (owner === undefined || owner === COPY) return false;
  warnTwoCopies();
  return true;
}

/**
 * Registers every entry queued on `scope.mermaidPlugins` with `api`, empties the queue, and
 * makes later `push` calls register directly (`push` is replaced first, so a push made while
 * the queue drains registers too). `push` returns how many entries the queue has taken in all,
 * as an array's `push` returns its new length. A missing or non-array value becomes a new
 * array. A second API object of the same build copy also gets every entry taken so far. Each
 * entry registers on its own, so one that never finishes holds up no other. Never throws: a
 * bad entry is skipped with a `PLUGIN_SKIPPED` warning on the next draw. Returns false (and
 * connects nothing) when another copy of the build owns the queue.
 */
export function connectPluginQueue(
  api: Mermaid,
  scope: PluginQueueScope = globalThis as PluginQueueScope,
  options?: AddOptions
): boolean {
  if (queueOwnedElsewhere(scope)) return false;
  const current = scope.mermaidPlugins;
  const known = Array.isArray(current) ? connections.get(current) : undefined;
  if (known) {
    if (known.apis.some((a) => a.api === api)) return true;
    known.apis.push({ api, options });
    for (const item of known.taken) register(api, item, options);
    return true;
  }
  const queue: unknown[] = Array.isArray(current) ? current : [];
  scope.mermaidPlugins = queue;
  const connection: Connection = { taken: [], apis: [{ api, options }] };
  connections.set(queue, connection);
  const take = (items: readonly unknown[]): void => {
    for (const item of items) {
      connection.taken.push(item);
      for (const a of [...connection.apis]) register(a.api, item, a.options);
    }
  };
  Object.defineProperty(queue, OWNER, { configurable: true, value: COPY });
  Object.defineProperty(queue, 'push', {
    configurable: true,
    writable: true,
    value: (...items: unknown[]): number => {
      take(items);
      return connection.taken.length;
    },
  });
  take(queue.splice(0));
  return true;
}
