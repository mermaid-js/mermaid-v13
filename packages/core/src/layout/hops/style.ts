/**
 * D537: which line hops a render draws. The precedence is decided here.
 */
import type { ResolvedConfig } from '../../config/resolve.ts';
import type { EdgeStep } from '../../pipeline/draw.ts';
import type { DiagramPlugin } from '../../pipeline/types.ts';
import type { HopStyle } from './hops.ts';
import { hopWriter } from './writer.ts';

type Layer = Readonly<Record<string, unknown>> | undefined;

/** A value an author may give `lineHops`; anything else the resolver drops counts as unset. */
const VALUES: ReadonlySet<unknown> = new Set([false, true, 'arc', 'gap']);
const lineHopsOf = (o: unknown): unknown => (o as { lineHops?: unknown } | undefined)?.lineHops;
const setIn = (layers: readonly Layer[], pick: (l: Layer) => unknown): boolean =>
  layers.some((l) => VALUES.has(lineHopsOf(pick(l))));

/**
 * A render's line-hop style, or `false` for none. `section` is the config section of the engine
 * that lays the render out (`elk` for `elk.stress`, `swimlane`; none for a custom layout), whose
 * `lineHops` overrides the shared key; `config` holds both resolved, with their defaults.
 * `layers` are the author's config layers (`initialize()`, front matter, directives), which tell
 * a value the author set from a default. In order: a shared `false` the author set turns hops off
 * everywhere; else the engine's key the author set; the shared key the author set; the engine's
 * default; the shared default, `false` (D689; D672 had `true`).
 */
export function hopStyle(
  config: ResolvedConfig,
  layers: readonly Layer[],
  section?: string
): HopStyle | false {
  const own =
    section === undefined
      ? undefined
      : lineHopsOf((config as Readonly<Record<string, unknown>>)[section]);
  const shared = setIn(layers, (l) => l);
  if (shared && config.lineHops === false) return false;
  let v: unknown = own ?? config.lineHops;
  if (section !== undefined && setIn(layers, (l) => l?.[section])) v = own;
  else if (shared) v = config.lineHops;
  if (!v) return false;
  return v === 'gap' ? 'gap' : 'arc';
}

/**
 * The draw step's writer wrapper for a render (`drawDiagram`'s `edges`), from `mermaid`'s analysis
 * of it (the resolved config, the author's config layers, the plugin), or undefined when it
 * draws no hops (see {@link hopStyle}). A graph diagram's layout, through the
 * plugin's aliases, names the engine section (`elk` for `elk.stress`). `mermaid` imports it
 * statically (D672).
 */
export function lineHops({
  prepared: { config },
  sources,
  plugin,
}: {
  readonly prepared: { readonly config: ResolvedConfig };
  readonly sources: readonly Layer[];
  readonly plugin: Pick<DiagramPlugin, 'layoutKind' | 'layoutEngine'>;
}): EdgeStep | undefined {
  const name = String(config.layout);
  const section =
    plugin.layoutKind === 'graph'
      ? (plugin.layoutEngine?.aliases?.[name] ?? name).split('.')[0]
      : undefined;
  const style = hopStyle(config, sources, section);
  return style ? (w) => hopWriter(w, style) : undefined;
}
