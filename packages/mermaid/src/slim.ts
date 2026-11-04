/**
 * `mermaid/slim`: the `mermaid` API without the first-party diagram loaders. Only the diagram
 * plugins passed to `createMermaid` can render, so a bundle holds only those. Every v12 type is
 * still detected, in v12 order (ADR-6); a type that was not passed rejects with
 * `UNSUPPORTED_DIAGRAM`, as an unported type does in `mermaid`. There is no default instance
 * and nothing runs on page load: call `run()` on your instance.
 */
import { createMermaid as createInstance, type Mermaid } from './api.ts';
import { DETECTORS } from './generated/detectors.gen.ts';
import type { AnyPlugin, FirstPartyEntry } from './registry.ts';

export * from './exports.ts';

export interface SlimOptions {
  /**
   * First-party diagram plugins, e.g. `flowchart` from `@mermaid-js/diagram-flowchart`. Text
   * output needs the plugin's `ascii` hook: `{ ...flowchart, ascii }`, with `ascii` from
   * `@mermaid-js/diagram-flowchart/ascii`. Third-party diagrams go to `registerExternalDiagrams`.
   */
  readonly diagrams?: readonly AnyPlugin[];
}

/** The detector row, loading `plugin` when one was passed for its id. */
function row(entry: FirstPartyEntry, plugin: AnyPlugin | undefined): FirstPartyEntry {
  if (plugin === undefined) return { type: entry.type, pattern: entry.pattern };
  // Without its hook a plugin cannot draw text, whatever its manifest lists.
  const declared: readonly string[] = plugin.formats ?? entry.formats ?? ['svg'];
  const formats = declared.filter(
    (f): f is 'svg' | 'ascii' =>
      f === 'svg' || (f === 'ascii' && typeof plugin.ascii === 'function')
  );
  const loaded: AnyPlugin = { ...plugin, formats };
  return { ...entry, formats, load: () => Promise.resolve(loaded) };
}

/** A new `mermaid` API object that renders only `options.diagrams`. */
export function createMermaid(options: SlimOptions = {}): Mermaid {
  const given = new Map<string, AnyPlugin>();
  for (const plugin of options.diagrams ?? []) {
    if (!DETECTORS.some((e) => e.id === plugin.id))
      throw new TypeError(
        `"${String(plugin.id)}" is not a first-party diagram; register it with registerExternalDiagrams()`
      );
    given.set(plugin.id, plugin);
  }
  return createInstance(
    DETECTORS.map((e) => row(e, e.id === undefined ? undefined : given.get(e.id)))
  );
}
