/**
 * `mermaid/slim`: the `mermaid` API without the first-party diagram loaders. Only the diagrams
 * passed to `createMermaid`, as plugin objects or as loaders (D587), can render, so a bundle
 * holds only those. Every v12 type is still detected, in v12 order (ADR-6); a type that was not
 * passed rejects with `UNSUPPORTED_DIAGRAM`, as an unported type does in `mermaid`. There is no
 * default instance and nothing runs on page load: call `run()` on your instance.
 */
import { createMermaid as createInstance, type Mermaid } from './api.ts';
import { DETECTORS, type FirstPartyDiagramId } from './generated/detectors.gen.ts';
import type { AnyPlugin, FirstPartyEntry } from './registry.ts';

export * from './exports.ts';
export type { FirstPartyDiagramId };

/**
 * A first-party diagram as a loader: `() => import('@mermaid-js/diagram-flowchart')`. It is
 * called on the first render of a type with that id, never at `createMermaid`, and a bundler
 * puts the module in a chunk of its own. It resolves to the module that exports the plugin.
 * Text output needs an ascii hook, which the main module does not hold: resolve to
 * `{ ...module, ascii }` with `ascii` from `@mermaid-js/diagram-<id>/ascii` (a plugin's own
 * `ascii` method works too).
 */
export type DiagramLoader = () => Promise<unknown>;

/** First-party diagrams by plugin id, each a plugin object or a {@link DiagramLoader}. */
export type DiagramsById = Readonly<
  Partial<Record<FirstPartyDiagramId, AnyPlugin | DiagramLoader>>
>;

export interface SlimOptions {
  /**
   * First-party diagrams. Either an array of plugin objects, e.g. `flowchart` from
   * `@mermaid-js/diagram-flowchart`, or an object keyed by plugin id whose values are plugin
   * objects or loaders (`{ flowchart: () => import('@mermaid-js/diagram-flowchart'), pie }`),
   * so objects and loaders mix. A type left out rejects with `UNSUPPORTED_DIAGRAM`. Text output
   * needs the plugin's `ascii` hook: `{ ...flowchart, ascii }`, with `ascii` from
   * `@mermaid-js/diagram-flowchart/ascii`. Third-party diagrams go to `registerExternalDiagrams`.
   */
  readonly diagrams?: readonly AnyPlugin[] | DiagramsById;
}

type Hook = AnyPlugin['ascii'];

/** The plugin `id` that a loader's module holds: the module itself, a named export or `default`. */
function pluginOf(module: unknown, id: string): { plugin: AnyPlugin; ascii?: Hook } {
  const m = module as Record<string, unknown> | null;
  const candidates = typeof m === 'object' && m !== null ? [m, m.default, ...Object.values(m)] : [];
  const plugin = candidates.find(
    (c): c is AnyPlugin =>
      typeof c === 'object' &&
      c !== null &&
      (c as AnyPlugin).id === id &&
      typeof (c as AnyPlugin).parse === 'function' &&
      typeof (c as AnyPlugin).render === 'function'
  );
  if (plugin === undefined)
    throw new TypeError(`The loader for "${id}" did not resolve to the "${id}" diagram plugin`);
  const ascii = (m as { ascii?: unknown }).ascii;
  return typeof ascii === 'function' ? { plugin, ascii: ascii as Hook } : { plugin };
}

/** `plugin` as the registry loads it: formats cut to what it can draw (a text hook is needed). */
function ready(entry: FirstPartyEntry, plugin: AnyPlugin, ascii?: Hook): AnyPlugin {
  const hasHook = ascii !== undefined || typeof plugin.ascii === 'function';
  // Without its hook a plugin cannot draw text, whatever its manifest lists.
  const declared: readonly string[] = plugin.formats ?? entry.formats ?? ['svg'];
  const formats = declared.filter(
    (f): f is 'svg' | 'ascii' => f === 'svg' || (f === 'ascii' && hasHook)
  );
  return { ...plugin, ...(ascii ? { ascii } : {}), formats };
}

/** A loader's plugin and text hook, shared by every row of its id. */
interface Loaded {
  plugin: AnyPlugin;
  ascii?: Hook;
}

/** The detector row, loading what was passed for its id. */
function row(
  entry: FirstPartyEntry,
  given: AnyPlugin | (() => Promise<Loaded>) | undefined
): FirstPartyEntry {
  if (given === undefined) return { type: entry.type, pattern: entry.pattern };
  if (typeof given === 'function') {
    // Before the load only the manifest's formats are known: the row keeps them.
    return { ...entry, load: () => given().then((l) => ready(entry, l.plugin, l.ascii)) };
  }
  const loaded = ready(entry, given);
  return { ...entry, formats: loaded.formats, load: () => Promise.resolve(loaded) };
}

/** `loader` called once for all rows of `id`; a failure is forgotten, so the next render retries. */
function once(id: string, loader: DiagramLoader): () => Promise<Loaded> {
  let pending: Promise<Loaded> | undefined;
  return () => {
    pending ??= loader().then((m) => pluginOf(m, id));
    pending.catch(() => (pending = undefined));
    return pending;
  };
}

/** A new `mermaid` API object that renders only `options.diagrams`. */
export function createMermaid(options: SlimOptions = {}): Mermaid {
  const list = options.diagrams ?? [];
  const pairs: [string, unknown][] = Array.isArray(list)
    ? (list as readonly AnyPlugin[]).map((p) => [p.id, p])
    : Object.entries(list as DiagramsById);
  const given = new Map<string, AnyPlugin | (() => Promise<Loaded>)>();
  for (const [id, diagram] of pairs) {
    // An explicit undefined is a diagram left out.
    if (diagram === undefined) continue;
    if (!DETECTORS.some((e) => e.id === id))
      throw new TypeError(
        `"${String(id)}" is not a first-party diagram; register it with registerExternalDiagrams()`
      );
    if (typeof diagram === 'function') given.set(id, once(id, diagram as DiagramLoader));
    else if (typeof diagram !== 'object' || diagram === null)
      throw new TypeError(`The diagram under "${id}" must be a plugin object or a loader`);
    else if ((diagram as AnyPlugin).id !== id)
      throw new TypeError(
        `The plugin under "${id}" has the id "${String((diagram as AnyPlugin).id)}"`
      );
    else given.set(id, diagram as AnyPlugin);
  }
  // The collision rules (D166) see every first-party id and type, loadable or not.
  return createInstance(
    DETECTORS.map((e) => row(e, e.id === undefined ? undefined : given.get(e.id))),
    DETECTORS
  );
}
