/**
 * D537: what `mermaid`'s static part knows of line hops. It only asks whether hops could be on
 * for a render, and loads core's line-hop chunk (`@mermaid-js/core/layout/hops`) when they
 * could; the chunk decides the precedence and draws them (R-PERF-8, "Lazy chunk for hops").
 */
import type { EdgeStep, Resource } from '@mermaid-js/core';
import { CORE_DEFAULTS, type ConfigFragment, type ResolvedConfig } from '@mermaid-js/core/config';
import type * as Hops from '@mermaid-js/core/layout/hops';
import { layoutName, type AnyPlugin, type Registry } from './registry.ts';

/** What line hops read of a render's analysis: the plugin, the config, the author's layers. */
interface Render {
  readonly plugin: AnyPlugin;
  readonly prepared: { readonly config: ResolvedConfig };
  readonly sources: readonly (Readonly<Record<string, unknown>> | undefined)[];
}

/**
 * The config section of the engine that lays an SVG render of a graph diagram out: `elk` for
 * `elk.stress`, the stand-in's, or none (`''`) when `layered` draws in place of the name asked
 * for (LAYOUT_UNKNOWN, ELK_NOT_INSTALLED). A custom layout has none.
 */
export function hopSection(registry: Registry, { plugin, prepared: { config } }: Render): string {
  if (plugin.layoutKind !== 'graph') return '';
  const name = layoutName(config, plugin);
  const found = registry.layout(name, plugin.layoutEngine);
  return (
    found.standIn ?? (found.state === 'ready' || found.state === 'missing' ? name : '')
  ).split('.')[0]!;
}

type HopsKeys =
  | (Record<string, { lineHops?: unknown } | undefined> & { lineHops?: unknown })
  | undefined;

/** Whether line hops could be on in config `c` under `section`, so the chunk is needed. */
export const mayHop = (c: unknown, section = ''): boolean =>
  !!((c as HopsKeys)?.lineHops || (c as HopsKeys)?.[section]?.lineHops);

/**
 * Whether `preload` should load the chunk for `layouts`: when `lineHops` is set through
 * `initialize()` (`site`), or a layout's own section defaults it on (core's `swimlane`, a
 * plugin fragment's `elk`).
 */
export const hopsByDefault = (
  site: unknown,
  fragments: readonly ConfigFragment[],
  layouts: readonly string[]
): boolean =>
  [site, CORE_DEFAULTS, ...fragments.map((f) => f.defaults)].some((c) =>
    ['', ...layouts].some((l) => mayHop(c, l.split('.')[0]))
  );

/** The resource a render that may hop needs while the chunk is not loaded. */
export const HOPS: Resource = { kind: 'chunk', name: 'lineHops' };

/**
 * The chunk, once loaded. Shared by every API object, as loaded themes are: it holds no state.
 */
let chunk: typeof Hops | undefined;
export const loadedHops = (): typeof Hops | undefined => chunk;
export const loadHops = async (): Promise<void> => {
  chunk = await import('@mermaid-js/core/layout/hops');
};

/** The draw step's line-hop wrapper for an SVG render, once the chunk is loaded and it hops. */
export const hopStepFor = (registry: Registry, a: Render): EdgeStep | undefined =>
  chunk?.hopStep(a.prepared.config, a.sources, hopSection(registry, a));
