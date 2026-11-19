/**
 * The public API (DESIGN §3): `render` = `prepare` + `renderSync`, plus `parse`, `initialize`,
 * `detectType`, `preload`, `supportsFormat` and the register functions. Each API object owns
 * one Registry and one frozen defaults snapshot; `initialize` swaps the snapshot, so a render
 * in flight keeps the one it started with (R-ARCH-4, D72).
 *
 * This file is the wiring: the session state (`session.ts`), the analyser (`analyser.ts`), the
 * draw context (`draw-context.ts`), the draw (`draw.ts`) and the loads (`prepare.ts`).
 */
import { HookRunner } from '@mermaid-js/core';
import type { MermaidConfig } from '@mermaid-js/core/config';
import type {
  ParseErrorHandler,
  ParseOptions,
  ParseResult12,
  PreloadRequest,
  Prepared,
  RenderOptions,
  RenderResult,
  SvgRenderOptions,
  TextRenderOptions,
  TextRenderResult,
} from './api-types.ts';
import { Analyser } from './analyser.ts';
import {
  isPlain,
  Overlays,
  SiteConfigs,
  snapshot,
  type InitializeConfig,
  type Snapshot,
} from './config-snapshot.ts';
import { createDomAdapter } from './dom.ts';
import { blockLoader, type BlockLoader } from './embeds.ts';
import { loadFor } from './draw-context.ts';
import { draw, drawAscii, drawSvg } from './draw.ts';
import { toMermaidError } from './errors.ts';
import { iconPackRegistry, type IconLoader } from './icon-packs.ts';
import { loadText, parseText, preload, prepareWith } from './prepare.ts';
import {
  Registry,
  type ExternalDiagram,
  type FirstPartyEntry,
  type LayoutLoader,
} from './registry.ts';
import { DiscoveryQueue, registerSeam } from './seam.ts';
import { rebuildHooks, type Session } from './session.ts';

export type { InitializeConfig, IntegratorOptions } from './config-snapshot.ts';
export { defaultIdPrefix } from './config-snapshot.ts';

/** `render`'s third argument: v12's container element, or an options object (D80). */
function renderOptions(arg: unknown): RenderOptions | undefined {
  if (!isPlain(arg) || typeof arg.nodeType === 'number') return undefined;
  return arg as RenderOptions;
}

/**
 * Embedded diagrams (ADR-15): a host's blocks, parsed and drawn before the host draws. The
 * pass is a chunk of its own, loaded for the first text with a block (D553).
 */
function blocksOf(k: Session): BlockLoader {
  const { analyser } = k;
  return blockLoader({
    detect: (text, s) => analyser.detect(text, s),
    analyse: (text, s, { detected, pre }, plugin, host) =>
      analyser.analyse(text, s, plugin, detected, pre, host),
    load: (id) => k.registry.load(id),
    loaded: (id) => k.registry.plugin(id),
    resources: async (a, format) => {
      if (format === 'svg') return loadFor(k, a, false);
      // A block without text output is a stand-in, which needs nothing loaded.
      if (analyser.textOf(a)) await Promise.all([loadText(k, a), loadFor(k, a, true)]);
    },
    draw: (text, s, options, a, id, inner) => {
      const { now, placeholders } = options ?? {};
      const { drawn, ctx, warnings, mount } = drawSvg(
        k,
        text,
        s,
        { id, now, placeholders },
        a,
        inner
      );
      const own = warnings.slice(k.skipped.length);
      return {
        ...drawn,
        securityLevel: ctx.securityLevel,
        linkSchemes: ctx.linkSchemes,
        warnings: own,
        // A block binds in its own root, so its ids never meet the host's or another block's.
        bind: mount({ ...drawn, diagramType: a.prepared.diagramType, warnings: own }),
      };
    },
    drawText: (b, s, options, a, id, inner) => {
      if (!analyser.textOf(a)) return k.textBackend!.blockStandIn(a.detected.type, b.id);
      const { now, ascii } = (options ?? {}) as Partial<TextRenderOptions>;
      const call = { format: 'ascii', id, now, ascii } as const;
      const { warnings, ...drawn } = drawAscii(k, b.text, s, call, a, () => inner);
      return { ...drawn, warnings: warnings.slice(k.skipped.length) };
    },
  });
}

/** The state of one API object, with discovery and the blocks wired to it. */
function createSession(
  firstParty: readonly FirstPartyEntry[],
  firstPartyNames: readonly { readonly type: string; readonly id?: string }[] | undefined,
  iconPacks: Session['iconPacks']
): Session {
  const registry = new Registry(firstParty, firstPartyNames);
  const siteConfigs = new SiteConfigs();
  // The analyser reads the claims of the hooks as they are at each parse.
  const analyser = new Analyser(registry, siteConfigs, () => k.hooks.claims());
  // Discovery (D166): its warnings wait for the next draw that succeeds; a first-use source
  // (the Node scan, T4) runs once, before the first prepare, render, parse or preload.
  const discovery = new DiscoveryQueue(
    (list) =>
      registry.registerDiscovered(list).then((warnings) => {
        rebuildHooks(k);
        return warnings;
      }),
    () => analyser.invalidate(),
    () => k.site.config
  );
  const k: Session = {
    registry,
    analyser,
    discovery,
    skipped: discovery.skipped,
    siteConfigs,
    iconPacks,
    // What a draw reads: the packs without their loader, so a draw cannot start one (R-ARCH-6).
    packs: (({ load: _, ...rest }) => rest)(iconPacks),
    overlays: new Overlays(),
    layoutRunners: new Map(),
    hooks: new HookRunner<Element, RenderResult>(),
    extensionList: [],
    site: snapshot(),
    parseErrorHandler: undefined,
    textBackend: undefined,
    blocks: undefined as unknown as BlockLoader,
  };
  // The block loader's callbacks read the session when a text with a block draws.
  k.blocks = blocksOf(k);
  return k;
}

/**
 * One `mermaid` API object with its own registry and defaults, detecting the types of
 * `firstParty` in its order. `mermaid` passes the generated table with loaders, `mermaid/slim`
 * the detectors with only the integrator's diagrams loadable.
 */
export function createMermaid(
  firstParty: readonly FirstPartyEntry[],
  firstPartyNames?: readonly { readonly type: string; readonly id?: string }[]
) {
  const [iconPacks, registerPacks] = iconPackRegistry();
  const k = createSession(firstParty, firstPartyNames, iconPacks);
  const { registry, analyser } = k;

  function snapshotFor(options?: RenderOptions): Snapshot {
    const extra = options?.config;
    return extra ? k.overlays.get(k.site, extra) : k.site;
  }

  async function prepare(text: string, options?: RenderOptions): Promise<Prepared> {
    try {
      return (await prepareWith(k, text, snapshotFor(options), options?.format)).prepared;
    } catch (e) {
      throw toMermaidError(e);
    }
  }

  /**
   * Draws synchronously what `prepare`/`preload` loaded. It neither runs nor waits for plugin
   * discovery (the first-use Node scan): `await preload()` or `prepare()` first.
   */
  function renderSync(text: string, options: TextRenderOptions): TextRenderResult;
  function renderSync(text: string, options?: SvgRenderOptions): RenderResult;
  function renderSync(text: string, options?: RenderOptions): RenderResult | TextRenderResult {
    try {
      return draw(k, text, snapshotFor(options), options);
    } catch (e) {
      throw toMermaidError(e);
    }
  }

  // The third argument is v12's DOM container (v13 is DOM-free and does not need it) or an
  // options object (D80); render's `id` wins over `options.id`.
  async function render(
    id: string,
    text: string,
    options: TextRenderOptions
  ): Promise<TextRenderResult>;
  async function render(
    id: string,
    text: string,
    containerOrOptions?: Element | SvgRenderOptions
  ): Promise<RenderResult>;
  async function render(
    id: string,
    text: string,
    containerOrOptions?: Element | RenderOptions
  ): Promise<RenderResult | TextRenderResult> {
    const options = renderOptions(containerOrOptions);
    const s = snapshotFor(options);
    try {
      await prepareWith(k, text, s, options?.format);
      return draw(k, text, s, { ...options, id });
    } catch (e) {
      // v12's render() passed every failure to `parseError` too (#757).
      const error = toMermaidError(e);
      k.parseErrorHandler?.(error);
      throw error;
    }
  }

  async function parse(
    text: string,
    parseOptions: ParseOptions & { suppressErrors: true }
  ): Promise<ParseResult12 | false>;
  async function parse(text: string, parseOptions?: ParseOptions): Promise<ParseResult12>;
  async function parse(text: string, parseOptions?: ParseOptions): Promise<ParseResult12 | false> {
    return parseText(k, text, parseOptions);
  }

  function initialize(config: InitializeConfig): void {
    k.site = snapshot(config);
  }

  /**
   * The v12 type of `text`. Synchronous: it neither runs nor waits for plugin discovery, so a
   * discovered type is known only after an awaited `preload()`, `prepare()`, `parse()` or `render()`.
   */
  function detectType(text: string, config?: MermaidConfig): string {
    // v12 passed `config` to detectors; v13 detectors get the `initialize()` config.
    void config;
    try {
      return analyser.detect(text, k.site).detected.type;
    } catch (e) {
      throw toMermaidError(e);
    }
  }

  /**
   * Whether `type` can draw `format`. Synchronous: it neither runs nor waits for plugin
   * discovery (`await preload()` first for discovered types).
   */
  function supportsFormat(type: string, format: 'svg' | 'ascii'): boolean {
    return registry.formats(type).includes(format);
  }

  /**
   * Third-party diagrams and extensions, detected after first-party and discovered types, in
   * call order (D166). A first-party id or v12 type (`flowchart`, `pie`, `classDiagram`) throws
   * `TypeError` unless `replace: true`, which makes the plugin take over that id or type
   * (detected in its first-party slot), e.g. to fill a type v13 has no package for.
   */
  async function registerExternalDiagrams(
    diagrams: readonly ExternalDiagram[],
    { lazyLoad = true, replace = false }: { lazyLoad?: boolean; replace?: boolean } = {}
  ): Promise<void> {
    analyser.invalidate();
    try {
      await registry.registerExternal(diagrams, lazyLoad, replace);
    } finally {
      rebuildHooks(k);
      // Again after the await, as `DiscoveryQueue.add` does: a render while it was pending
      // resolved its config without the new fragments and hooks.
      analyser.invalidate();
    }
  }

  function registerLayoutLoaders(loaders: readonly LayoutLoader[]): void {
    const before = registry.fragments();
    const hooked = registry.registerLayouts(loaders);
    k.layoutRunners.clear();
    // A new fragment changes how config resolves, and a new hook how texts draw: parsed texts
    // must resolve again.
    if (registry.fragments() !== before || hooked) analyser.invalidate();
  }

  /**
   * v12's icon packs (D290, D294), `{ name, icons }` or `{ name, loader }`: `name` overrides the
   * pack's `prefix`. A loader runs in `prepare()` only for a diagram that names its pack, or in
   * `preload({ iconPacks })`. Without an extension that claims `icons`, renders carry an
   * `ICON_PACKS_UNSUPPORTED` warning (D299). A name registered again replaces its pack.
   */
  const registerIconPacks: (packs: readonly IconLoader[]) => void = registerPacks;

  /**
   * @deprecated Catch the `MermaidError` that `parse()` or `render()` rejects with instead.
   * The same hook as `mermaid.parseError = handler`, as in v12.
   */
  function setParseErrorHandler(handler: ParseErrorHandler): void {
    k.parseErrorHandler = handler;
  }

  // The DOM adapter (run, mount) reads the defaults at the start of each call, like render.
  const { run, mount, contentLoaded } = createDomAdapter({
    prepare,
    renderSync,
    siteConfig: () => k.site.config,
    onParseError: (error) => k.parseErrorHandler?.(error),
  });

  const api = {
    render,
    prepare,
    renderSync,
    preload: (req: PreloadRequest) => preload(k, req),
    parse,
    initialize,
    run,
    mount,
    contentLoaded,
    detectType,
    supportsFormat,
    registerExternalDiagrams,
    registerLayoutLoaders,
    registerIconPacks,
    setParseErrorHandler,
    /**
     * @deprecated v12's hook, the one `setParseErrorHandler` sets: called with the
     * `MermaidError` of a failed `parse()`, `render()` or `run()` element (R-API-4, #757).
     */
    get parseError(): ParseErrorHandler | undefined {
      return k.parseErrorHandler;
    },
    set parseError(handler: ParseErrorHandler | undefined) {
      k.parseErrorHandler = handler;
    },
  };
  registerSeam(api, k.discovery);
  return api;
}

export type Mermaid = ReturnType<typeof createMermaid>;
