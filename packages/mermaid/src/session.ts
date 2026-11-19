/**
 * The state of one API object: its registry, hooks, analyser, site config and the rest, held in
 * one `Session` that the draw, prepare and parse steps (`draw.ts`, `prepare.ts`) read. The
 * public methods in `api.ts` write it after a registration or `initialize`; `prepare.ts` sets
 * `textBackend`, and `rebuildHooks` and `hooksFor` here write `hooks`, `extensionList` and
 * `layoutRunners`.
 */
import { HookRunner } from '@mermaid-js/core';
import { layoutName } from './registry.ts';
import type { Warning } from '@mermaid-js/core';
import type { Measurer } from '@mermaid-js/core/text';
import type { ExtensionPlugin, ParseErrorHandler, RenderResult } from './api-types.ts';
import type { Analysis } from './analysis-cache.ts';
import type { Analyser } from './analyser.ts';
import type * as TextModule from './ascii.ts';
import type { Overlays, SiteConfigs, Snapshot } from './config-snapshot.ts';
import type { BlockLoader } from './embeds.ts';
import type { iconPackRegistry } from './icon-packs.ts';
import type { Registry } from './registry.ts';
import type { DiscoveryQueue } from './seam.ts';

export type TextBackend = typeof TextModule;
export type Hooks = HookRunner<Element, RenderResult>;

export interface Session {
  readonly registry: Registry;
  readonly analyser: Analyser;
  readonly discovery: DiscoveryQueue;
  /** Discovery's warnings, which leave only with a draw that succeeds. */
  readonly skipped: Warning[];
  /** One pack registry per API object (D294); an icons extension reads it, keeping no state. */
  readonly iconPacks: ReturnType<typeof iconPackRegistry>[0];
  /** What a draw reads: the packs without their loader, so a draw cannot start one (R-ARCH-6). */
  readonly packs: Omit<ReturnType<typeof iconPackRegistry>[0], 'load'>;
  readonly siteConfigs: SiteConfigs;
  readonly overlays: Overlays;
  /** `hooks` plus one layout loader's extension, per extension (D174), rebuilt on registration. */
  readonly layoutRunners: Map<ExtensionPlugin, Hooks>;
  /** The hooks of the registered extensions, rebuilt after each registration (D166 order). */
  hooks: Hooks;
  /** Every registered extension in hook order, for the per-layout runners. */
  extensionList: readonly ExtensionPlugin[];
  site: Snapshot;
  parseErrorHandler: ParseErrorHandler | undefined;
  /** `core/ascii`'s cell measurer and width, loaded by the first text `prepare` (D87). */
  textBackend: TextBackend | undefined;
  /** Embedded diagrams (ADR-15): a host's blocks, parsed and drawn before the host draws. */
  blocks: BlockLoader;
  /** The table measurer of each `fontTables` list, made by the font-table chunk (D645). */
  readonly fontTables: WeakMap<object, Measurer>;
}

/** Rebuilds the hooks after a registration, so they run in D166 order whenever plugins arrived. */
export function rebuildHooks(k: Session): void {
  const next = new HookRunner<Element, RenderResult>();
  k.extensionList = k.registry.extensions();
  for (const e of k.extensionList) next.register(e);
  k.hooks = next;
  k.layoutRunners.clear();
}

/**
 * The hooks of a render: the registered extensions, plus the extension of the layout loader
 * that lays it out, if it brought one. Other renders never run a layout's hooks, so with no
 * other extension they keep the stream writer.
 */
export function hooksFor(k: Session, analysis: Analysis, text = false): Hooks {
  // Text output never runs a layout's hooks: no registered engine lays it out (D179).
  if (text || analysis.plugin.layoutKind !== 'graph') return k.hooks;
  const own = k.registry.layoutExtension(layoutName(analysis.prepared.config, analysis.plugin));
  if (!own) return k.hooks;
  let runner = k.layoutRunners.get(own);
  if (!runner) {
    runner = new HookRunner<Element, RenderResult>();
    for (const e of k.extensionList) runner.register(e);
    runner.register(own);
    k.layoutRunners.set(own, runner);
  }
  return runner;
}
