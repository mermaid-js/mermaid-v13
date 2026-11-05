/**
 * The CDN plugin queue (D167, spec #218 T6): a third-party CDN script pushes itself onto
 * `globalThis.mermaidPlugins`, before or after mermaid loads. `connectPluginQueue` drains what
 * is queued into the discovered-list seam and replaces the array's `push`, so later pushes
 * register at once. Draws wait for registrations still in flight, each for a limited time.
 */
import type { AddOptions, Mermaid } from './api.ts';
import { addDiscovered } from './discovery.ts';
import type { DiscoveredPlugin } from './registry.ts';

/** Where the queue lives: `globalThis` in the CDN build. */
export interface PluginQueueScope {
  mermaidPlugins?: unknown;
}

/**
 * One queue entry as a discovered package. An entry is anything `registerExternalDiagrams`
 * takes (a diagram, a lazy diagram, an extension, or either by manifest), optionally with a
 * `package` name, or a discovered-list entry (`{ kind: 'plugin' | 'layout', package, … }`).
 * Without a `package`, the plugin id (or the manifest's) names it. An entry that cannot even
 * be read (a throwing getter) becomes an unnamed one, which the registry skips with a warning.
 */
function toDiscovered(entry: unknown): DiscoveredPlugin {
  try {
    const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    if ((e.kind === 'plugin' || e.kind === 'layout') && 'package' in e)
      return entry as DiscoveredPlugin;
    const manifest = e.manifest as Record<string, unknown> | undefined;
    const name = e.package ?? manifest?.id ?? e.id;
    return {
      kind: 'plugin',
      package: typeof name === 'string' ? name : '',
      plugin: entry as never,
    };
  } catch {
    return { kind: 'plugin', package: '', plugin: undefined as never };
  }
}

/**
 * Registers every entry queued on `scope.mermaidPlugins` with `api`, empties the queue, and
 * makes later `push` calls register directly (`push` is replaced first, so a push made while
 * the queue drains registers too). A missing or non-array value becomes a new array. Each entry
 * registers on its own, so one that never finishes holds up no other. Never throws: a bad entry
 * is skipped with a `PLUGIN_SKIPPED` warning on the next draw.
 */
export function connectPluginQueue(
  api: Mermaid,
  scope: PluginQueueScope = globalThis as PluginQueueScope,
  options?: AddOptions
): void {
  const queue: unknown[] = Array.isArray(scope.mermaidPlugins) ? scope.mermaidPlugins : [];
  scope.mermaidPlugins = queue;
  const add = (items: readonly unknown[]): void => {
    for (const item of items)
      addDiscovered(api, [toDiscovered(item)], options).catch(() => undefined);
  };
  Object.defineProperty(queue, 'push', {
    configurable: true,
    writable: true,
    value: (...items: unknown[]): number => {
      add(items);
      return queue.length;
    },
  });
  add(queue.splice(0));
}
