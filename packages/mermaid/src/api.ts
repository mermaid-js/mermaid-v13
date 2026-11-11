/**
 * The public API (DESIGN §3): `render` = `prepare` + `renderSync`, plus `parse`, `initialize`,
 * `detectType`, `preload`, `supportsFormat` and the register functions. Each API object owns
 * one Registry and one frozen defaults snapshot; `initialize` swaps the snapshot, so a render
 * in flight keeps the one it started with (R-ARCH-4, D72).
 */
import {
  drawDiagram,
  drawText,
  errorFromDiagnostics,
  HookRunner,
  MermaidError,
  NotLoadedError,
  renderErrorSvg,
  UnsupportedFormatError,
  type EmbeddedText,
  type RenderContext,
  type Resource,
  type TextRenderContext,
  type Warning,
} from '@mermaid-js/core';
import {
  INTEGRATOR_ONLY_KEYS,
  resolveText,
  type MermaidConfig,
  type ResolvedConfig,
} from '@mermaid-js/core/config';
import {
  cellProfile,
  layered,
  pxProfile,
  type LayoutEngine,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { checkSource } from '@mermaid-js/core/limits';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { resolveSecurityLevel } from '@mermaid-js/core/svg';
import { inlineSpans, type Measurer } from '@mermaid-js/core/text';
import {
  createTheme,
  DEFAULT_THEME,
  loadedTheme,
  loadTheme,
  resolveThemeName,
  type ThemeName,
  type ThemeOptions,
} from '@mermaid-js/core/theme';
import { stageEnd, stageStart } from '@mermaid-js/core/timing';
import type {
  ExtensionPlugin,
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
import type * as TextModule from './ascii.ts';
import {
  defaultIdPrefix,
  directiveConfig,
  isPlain,
  mergeInto,
  optionsKey,
  Overlays,
  SiteConfigs,
  snapshot,
  type InitializeConfig,
  type Plain,
  type Snapshot,
} from './config-snapshot.ts';
import { AnalysisCache } from './analysis-cache.ts';
import { createDomAdapter } from './dom.ts';
import { blockConfig, blockLayers, blockPass, lazyEmbed, outsideBlocks } from './embeds.ts';
import type { DrawBlocks } from './embeds.ts';
import { toMermaidError, toWarning, unsupportedDiagram } from './errors.ts';
import { iconPackRegistry, packsUnsupported, type IconLoader } from './icon-packs.ts';
import { selectMeasurer } from './measurer.ts';
import {
  builtIn,
  isElkName,
  LINE_HOPS,
  Registry,
  type AnyPlugin,
  layoutName,
  type LayoutFound,
  type Detected,
  type ExternalDiagram,
  type FirstPartyEntry,
  type LayoutLoader,
} from './registry.ts';
import { DiscoveryQueue, registerSeam } from './seam.ts';
import { VERSION } from './version.ts';

export type { InitializeConfig, IntegratorOptions } from './config-snapshot.ts';
export { defaultIdPrefix } from './config-snapshot.ts';

/** `render`'s third argument: v12's container element, or an options object (D80). */
function renderOptions(arg: unknown): RenderOptions | undefined {
  if (!isPlain(arg) || typeof arg.nodeType === 'number') return undefined;
  return arg as RenderOptions;
}

type TextBackend = typeof TextModule;

interface Analysis {
  readonly detected: Detected;
  readonly plugin: AnyPlugin;
  readonly prepared: Prepared;
  /** The front-matter title, for text output (D82). */
  readonly title?: string;
  /** The author's config layers (`initialize`, front matter, directives), for line hops (D537). */
  readonly sources: readonly (Readonly<Record<string, unknown>> | undefined)[];
}

/** What `detect` found. */
interface Detection {
  readonly detected: Detected;
  readonly pre: PreprocessResult;
}

/** What `detect` found, for a type with a plugin package. */
interface Found {
  readonly detected: Detected & { readonly id: string };
  readonly pre: PreprocessResult;
}

/** How a render measures and sizes: px for SVG, cells for text (D77, D84). */
interface Units {
  readonly units: UnitProfile;
  readonly measurer?: Measurer;
  /** `availableWidth` in the profile's units. */
  readonly width?: number;
  /** Text output: the config with its `ascii` section, and what the text entry reads besides. */
  readonly text?: Pick<TextRenderContext, 'config' | 'title' | 'ast' | 'embedText'>;
}

function themeNames(config: ResolvedConfig): ThemeName[] {
  const choice = resolveThemeName(config.theme);
  return choice.dark ? [choice.name, choice.dark] : [choice.name];
}

/** The layout, themes and plugin resources `a` needs that are not loaded yet. */
function missingFor(registry: Registry, a: Analysis, text = false): Resource[] {
  const missing: Resource[] = [];
  const { config } = a.prepared;
  // Text output lays out with core's own `layered`, never a registered engine (D179).
  if (a.plugin.layoutKind === 'graph' && !text) {
    const name = layoutName(config, a.plugin);
    const { need } = registry.layout(name, a.plugin.layoutEngine);
    if (need !== undefined) missing.push({ kind: 'layout', name: need });
    const [part, loaded] = registry.layoutPart(a.plugin, name);
    if (part && !loaded) missing.push({ kind: 'layout', name: part });
  }
  // D537: the line-hop chunk when the shared key turns hops on. An engine whose own `lineHops`
  // defaults on (`swimlane`, ELK) carries the step, so loading it loads them.
  if (!text && !registry.hops && config.lineHops) missing.push({ kind: 'layout', name: LINE_HOPS });
  // Text output draws no colours, so it needs no theme (D82).
  for (const name of text ? [] : themeNames(config)) {
    if (!loadedTheme(name)) missing.push({ kind: 'theme', name });
  }
  for (const r of a.plugin.resources?.(a.prepared.parse, config) ?? []) missing.push(r);
  return missing;
}

async function loadResources(registry: Registry, missing: readonly Resource[]): Promise<void> {
  await Promise.all(
    missing.map(async (r) => {
      if (r.kind === 'layout') await registry.loadLayout(r.name);
      else if (r.kind === 'theme') await loadTheme(r.name as ThemeName);
      else if (r.kind === 'diagram') await registry.load(r.name);
    })
  );
}

/** The theme a draw paints with: the config's choice, or the default when it is not loaded. */
function themeFor(
  config: ResolvedConfig,
  s: Snapshot,
  warn: (w: Warning) => void,
  tables: Pick<ThemeOptions, 'rules' | 'diagram'>,
  idPrefix: () => string
) {
  const choice = resolveThemeName(config.theme, warn);
  const spec = loadedTheme(choice.name) ?? loadedTheme(DEFAULT_THEME)!;
  return createTheme(spec, {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? loadedTheme(choice.dark) : undefined,
    ...tables,
    cssVariables: s.options.output?.cssVariables,
    warn,
    idPrefix,
  });
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
  const registry = new Registry(firstParty, firstPartyNames);
  // Rebuilt after each registration, so hooks run in D166 order whenever plugins arrived.
  let hooks = new HookRunner<Element, RenderResult>();
  // Every registered extension in hook order, for the per-layout runners below.
  let extensionList: readonly ExtensionPlugin[] = [];
  // `hooks` plus one layout loader's extension, per extension (D174), rebuilt on registration.
  const layoutRunners = new Map<ExtensionPlugin, HookRunner<Element, RenderResult>>();
  const rebuildHooks = (): void => {
    const next = new HookRunner<Element, RenderResult>();
    extensionList = registry.extensions();
    for (const e of extensionList) next.register(e);
    hooks = next;
    layoutRunners.clear();
  };
  /**
   * The hooks of a render: the registered extensions, plus the extension of the layout loader
   * that lays it out, if it brought one. Other renders never run a layout's hooks, so with no
   * other extension they keep the stream writer.
   */
  const hooksFor = (analysis: Analysis, text = false): HookRunner<Element, RenderResult> => {
    // Text output never runs a layout's hooks: no registered engine lays it out (D179).
    if (text || analysis.plugin.layoutKind !== 'graph') return hooks;
    const own = registry.layoutExtension(layoutName(analysis.prepared.config, analysis.plugin));
    if (!own) return hooks;
    let runner = layoutRunners.get(own);
    if (!runner) {
      runner = new HookRunner<Element, RenderResult>();
      for (const e of extensionList) runner.register(e);
      runner.register(own);
      layoutRunners.set(own, runner);
    }
    return runner;
  };
  // Discovery (D166): its warnings wait for the next draw that succeeds; a first-use source
  // (the Node scan, T4) runs once, before the first prepare, render, parse or preload.
  const discovery = new DiscoveryQueue(
    (list) =>
      registry.registerDiscovered(list).then((warnings) => {
        rebuildHooks();
        return warnings;
      }),
    () => cache.clear(),
    () => site.config
  );
  const skipped = discovery.skipped;
  let site: Snapshot = snapshot();
  let parseErrorHandler: ParseErrorHandler | undefined;
  // One pack registry per API object (D294); an icons extension reads it, keeping no state.
  const [iconPacks, registerPacks] = iconPackRegistry();
  // What a draw reads: the packs without their loader, so a draw cannot start one (R-ARCH-6).
  const { load: _, ...packs } = iconPacks;
  const cache = new AnalysisCache<Analysis>();
  const siteConfigs = new SiteConfigs();
  const overlays = new Overlays();
  // `core/ascii`'s cell measurer and width, loaded by the first text `prepare` (D87).
  let textBackend: TextBackend | undefined;

  // A type may read its own section on top of its plugin's (`swimlane` over `flowchart`,
  // D534): both are given, highest first.
  function sectionOf(detected: Detected, plugin?: AnyPlugin) {
    const own = plugin?.configSection ?? plugin?.id ?? detected.id;
    return detected.section && detected.section !== own ? [detected.section, own!] : own;
  }

  // Detect, resolve config and parse with a loaded plugin (DESIGN §3 steps 1–4).
  function analyse(
    text: string,
    snap: Snapshot,
    plugin: AnyPlugin,
    detected: Detected,
    pre: PreprocessResult,
    host?: ResolvedConfig
  ): Analysis {
    const warnings: Warning[] = [];
    const warn = (w: Warning): void => void warnings.push(toWarning(w, registry.fragments()));
    for (const d of pre.diagnostics) if (d.severity === 'warning') warn(d);
    const section = sectionOf(detected, plugin);
    let front = pre.frontMatter?.config;
    let directives = directiveConfig(pre, section);
    const hit = siteConfigs.get(snap, plugin, detected, section, registry.fragments());
    for (const w of hit.warnings) warn(w);
    // An embedded diagram (ADR-15) sets only its own options, with one warning for the rest.
    if (host) ({ front, directives } = blockLayers(front, directives, hit.site.secure, warn));
    let config: ResolvedConfig = resolveText(hit.site, front, directives, { warn });
    // An embedded diagram takes its host's theme and font, at its natural size.
    if (host) config = blockConfig(config, host, [section ?? []].flat());
    const t = stageStart();
    const claims = hooks.claims();
    const parse = plugin.parse(
      text,
      claims.length > 0
        ? { config, preprocessed: pre, limits: snap.limits, claims }
        : { config, preprocessed: pre, limits: snap.limits }
    );
    stageEnd('parse', t);
    // A directive inside a block belongs to the block (ADR-15): parse again without it.
    const outside = outsideBlocks(pre, parse);
    if (outside !== pre) return analyse(text, snap, plugin, detected, outside, host);
    const error = errorFromDiagnostics(text, [...pre.diagnostics, ...parse.diagnostics]);
    if (error) throw error;
    for (const d of parse.diagnostics) if (d.severity === 'warning') warn(d);
    const title = pre.frontMatter?.title;
    return {
      detected,
      plugin,
      prepared: { diagramType: detected.type, config, parse, warnings },
      ...(title !== undefined ? { title } : {}),
      sources: [hit.site.site, front, ...directives],
    };
  }

  function detect(text: string, s: Snapshot): Detection {
    // DESIGN §3 step 1: the source limit, before the text is read at all.
    checkSource(text, s.limits);
    const pre = preprocess(text);
    const error = errorFromDiagnostics(
      text,
      pre.diagnostics.filter((d) => d.severity === 'error')
    );
    if (error) throw error;
    return {
      detected: registry.detect(text, pre, s.config as Readonly<Record<string, unknown>>),
      pre,
    };
  }

  /** `detect`, for a type with a plugin package that can draw `ascii` when that is asked for. */
  function detectSupported(text: string, s: Snapshot, ascii: boolean): Found {
    const { detected, pre } = detect(text, s);
    if (detected.id === undefined) throw unsupportedDiagram(detected.type);
    if (ascii) checkText(detected);
    return { detected: { ...detected, id: detected.id }, pre };
  }

  /** Parses with the loaded `plugin` and caches the analysis (DESIGN §3 steps 2–4). */
  function analysisOf(
    text: string,
    s: Snapshot,
    { detected, pre }: Found,
    plugin: AnyPlugin | undefined
  ): Analysis {
    if (!plugin) throw unsupportedDiagram(detected.type);
    const analysis = analyse(text, s, plugin, detected, pre);
    cache.set(text, s, analysis);
    return analysis;
  }

  // Embedded diagrams (ADR-15): a host's blocks, parsed and drawn before the host draws.
  const blocks = blockPass<Analysis, Detection, Snapshot, AnyPlugin, RenderOptions | undefined>({
    detect,
    idOf: (f) => f.detected.id,
    typeOf: (f) => f.detected.type,
    maxEdges: (s) => s.limits.maxEdges,
    analyse: (text, s, { detected, pre }, plugin, host) =>
      analyse(text, s, plugin, detected, pre, host.prepared.config),
    load: (id) => registry.load(id),
    loaded: (id) => registry.plugin(id),
    resources: async (a, format) => {
      if (format === 'svg') return loadFor(a, false);
      // A block without text output is a stand-in, which needs nothing loaded.
      if (textOf(a)) await Promise.all([loadText(a), loadFor(a, true)]);
    },
    draw: (text, s, options, a, id, inner) => {
      const { now, placeholders } = options ?? {};
      const { drawn, ctx, warnings, mount } = drawSvg(text, s, { id, now, placeholders }, a, inner);
      const own = warnings.slice(skipped.length);
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
      if (!textOf(a)) return textBackend!.blockStandIn(a.detected.type, b.id);
      const { now, ascii } = (options ?? {}) as Partial<TextRenderOptions>;
      const call = { format: 'ascii', id, now, ascii } as const;
      const { warnings, ...drawn } = drawAscii(b.text, s, call, a, () => inner);
      return { ...drawn, warnings: warnings.slice(skipped.length) };
    },
  });

  function snapshotFor(options?: RenderOptions): Snapshot {
    const extra = options?.config;
    return extra ? overlays.get(site, extra) : site;
  }

  /** Whether `a`'s type has text output (R-ASCII-5, D80). */
  const textOf = (a: { detected: Detected }): boolean =>
    a.detected.id !== undefined && registry.formats(a.detected.id).includes('ascii');

  /** Throws `UnsupportedFormatError` unless `detected` declares ascii (R-ASCII-5, D80). */
  function checkText(detected: Detected): void {
    if (!textOf({ detected })) throw new UnsupportedFormatError(detected.type, 'ascii');
  }

  /** Loads the ascii entry and the text backend (D76, D80): only for `format: 'ascii'`. */
  async function loadText(a: Analysis): Promise<void> {
    checkText(a.detected);
    const [hook, backend] = await Promise.all([
      registry.loadAscii(a.plugin.id),
      textBackend ?? import('./ascii.ts'),
    ]);
    textBackend = backend;
    if (!hook) throw new UnsupportedFormatError(a.detected.type, 'ascii');
  }

  /** `svg` or `ascii`; anything else is an `UnsupportedFormatError` in both phases (D80). */
  function checkFormat(text: string, s: Snapshot, f = 'svg'): 'svg' | 'ascii' {
    if (f === 'svg' || f === 'ascii') return f;
    let type = 'unknown';
    try {
      type = detect(text, s).detected.type;
    } catch {
      // The format error wins over whatever else is wrong with the text.
    }
    throw new UnsupportedFormatError(type, f);
  }

  /** What the registered extensions still need for `a` (R-API-2, D178): `math`, say. */
  function extensionNeeds(a: Analysis, ascii: boolean) {
    if (hooks.size === 0) return [];
    const { parse, config } = a.prepared;
    const { plugin } = a;
    return hooks.resources(parse, {
      iconPacks,
      config,
      format: ascii ? 'ascii' : 'svg',
      labels: plugin.labels && (() => plugin.labels!(parse.model)),
      icons: plugin.icons && (() => plugin.icons!(parse.model)),
    });
  }

  async function prepareWith(text: string, s: Snapshot, format?: string): Promise<Analysis> {
    if (discovery.pending) await discovery.settle();
    const ascii = checkFormat(text, s, format) === 'ascii';
    let analysis = cache.get(text, s);
    if (!analysis) {
      const f = detectSupported(text, s, ascii);
      analysis = analysisOf(text, s, f, await registry.load(f.detected.id));
    }
    if (ascii) await loadText(analysis);
    await blocks.prepare(text, 0, analysis, s, ascii ? 'ascii' : 'svg');
    await loadFor(analysis, ascii);
    return analysis;
  }

  /** Loads what `a` draws with: layout, themes, plugin and extension resources. */
  function loadFor(a: Analysis, ascii: boolean): Promise<unknown> {
    return Promise.all([
      loadResources(registry, missingFor(registry, a, ascii)),
      ...extensionNeeds(a, ascii).map((n) => n.load()),
    ]);
  }

  async function prepare(text: string, options?: RenderOptions): Promise<Prepared> {
    try {
      return (await prepareWith(text, snapshotFor(options), options?.format)).prepared;
    } catch (e) {
      throw toMermaidError(e);
    }
  }

  /** The cached or fresh analysis of `text`, or a placeholder svg for an unloaded plugin. */
  function analysisFor(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    ascii: boolean
  ): Analysis | RenderResult {
    const hit = cache.get(text, s);
    if (hit) return hit;
    const f = detectSupported(text, s, ascii);
    const plugin = registry.plugin(f.detected.id);
    if (plugin) return analysisOf(text, s, f, plugin);
    const missing = new NotLoadedError([{ kind: 'diagram', name: f.detected.id }]);
    if (ascii || !options?.placeholders) throw missing;
    return {
      svg: renderErrorSvg(missing, { version: VERSION }),
      diagramType: f.detected.type,
      width: 0,
      height: 0,
      warnings: [...skipped, { code: 'PLACEHOLDER', message: missing.message }],
    };
  }

  /**
   * The render context of one draw, the warnings sink it writes to, and the binders of the
   * blocks it drew (#669).
   */
  function contextFor(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    analysis: Analysis,
    { units, measurer, width, text: textOnly }: Units,
    drawBlocks?: DrawBlocks
  ) {
    const { prepared, plugin } = analysis;
    const { config } = prepared;
    // A usage error, as a bad `limits` option is: `+now` of a bad Date or a string is NaN.
    const now = +(options?.now ?? Date.now());
    if (!Number.isFinite(now))
      throw new TypeError(`RenderOptions.now is no instant: ${String(options?.now)}`);
    const textOutput = units.id === 'cell';
    const warnings: Warning[] = [...skipped, ...prepared.warnings];
    const warn = (w: Warning): void => void warnings.push(toWarning(w, registry.fragments()));
    const missing = [
      ...missingFor(registry, analysis, textOutput),
      // An icon pack is missing only while `pending`: an unregistered one is unresolved (D291),
      // and so is a `failed` one until the next prepare() retries it (D299).
      ...extensionNeeds(analysis, textOutput).flatMap(({ resource: r }) =>
        r.kind !== 'iconPack' || iconPacks.state(r.name) === 'pending' ? r : []
      ),
    ];
    if (missing.length > 0) {
      if (textOutput || !options?.placeholders) throw new NotLoadedError(missing);
      warn({
        code: 'PLACEHOLDER',
        message: `Drawn with stand-ins for what is not loaded: ${missing
          .map((r) => `${r.kind} "${r.name}"`)
          .join(', ')}.`,
      });
    }
    for (const w of packsUnsupported(iconPacks, hooks.claims())) warn(w);
    let engine: LayoutEngine | undefined, part: unknown;
    let elkName: string | undefined;
    if (plugin.layoutKind === 'graph') {
      const asked = layoutName(config, plugin);
      // D179: no other engine knows cells (ELK ignores `grid`), so the name only warns. Text
      // output never loads it, and gives no ELK_NOT_INSTALLED or LAYOUT_UNKNOWN for it.
      if (textOutput && !builtIn(asked)) {
        warn({
          code: 'ASCII_DROPPED',
          feature: 'layout',
          message: `Text output lays out with the built-in layered engine; layout "${asked}" is not used.`,
        });
      }
      // Text output: core's `layered` itself, even when a loader replaced the name for SVG.
      const name = textOutput ? 'layered' : asked;
      const found = textOutput
        ? ({ engine: layered, state: 'ready' } as LayoutFound)
        : registry.layout(name, plugin.layoutEngine);
      const using = `using the built-in ${found.standIn ?? 'layered'} engine`;
      // Only when ELK lays the graph out: with LAYOUT_UNKNOWN or ELK_NOT_INSTALLED, layered
      // draws every group, as that warning says.
      if (isElkName(name) && (found.state === 'ready' || found.state === 'missing')) elkName = name;
      if (found.state === 'unknown') {
        warn({
          code: 'LAYOUT_UNKNOWN',
          message: `Unknown layout "${name}"; ${using}.`,
        });
      } else if (found.state === 'elk') {
        // D173: `mermaid` names the package; core never does (D153).
        warn({
          code: 'ELK_NOT_INSTALLED',
          message: `Layout "${name}" needs @mermaid-js/layout-elk, which is not registered; ${using}.`,
        });
      }
      engine = found.engine;
      // The layout's part of the drawing (`layoutParts`), only when that layout lays it out:
      // ready (a stand-in engine never is).
      if (found.state === 'ready') part = registry.layoutPart(plugin, name)[1];
    }
    // The theme reads the id prefix only for the gradient (D182), after ctx exists.
    const tables = { rules: registry.themeRules(), diagram: plugin.theme };
    const theme = themeFor(config, s, warn, tables, () => ctx.idPrefix);
    let idPrefix: string | undefined;
    // Inline boxes (D177) are SVG only: text output shows every span as written, and warns
    // ASCII_DROPPED once per feature (D179). Glyphs (D293) are SVG only too, absent without an
    // extension that has them, and share the inline spans' once-per-render warnings (D291).
    const inline = inlineSpans(hooks.inline(), warn, textOutput ? 'ascii' : 'svg', packs);
    const icon = textOutput ? undefined : hooks.icon(inline, packs);
    // The blocks (ADR-15) are drawn at the first lookup, with this draw's id prefix.
    const { embed, mounter } = lazyEmbed(drawBlocks, () => ctx.idPrefix, warn);
    const ctx: RenderContext = {
      config,
      measurer:
        measurer ??
        selectMeasurer({ measurer: s.options.measurer, deterministic: s.options.deterministic }),
      units,
      theme,
      securityLevel: resolveSecurityLevel(config.securityLevel, warn),
      get idPrefix() {
        return (idPrefix ??=
          options?.id ?? defaultIdPrefix(text, config, optionsKey(s.options), units));
      },
      version: VERSION,
      linkSchemes: s.options.linkSchemes,
      limits: s.limits,
      now,
      availableWidth: width,
      iconPacks: packs,
      layoutPart: part,
      layout: (graph) => {
        if (!engine) throw new TypeError(`${plugin.id} has no graph layout`);
        // D174: `@{ algorithm }` is parsed but not applied yet. `mermaid` says so, not the engine
        // (which has no warning channel), once per render.
        if (elkName !== undefined) {
          const asked = [...new Set(graph.groups.flatMap((g) => g.algorithm ?? []))];
          if (asked.length > 0) {
            warn({
              code: 'ELK_ALGORITHM_IGNORED',
              message: `Per-group layout algorithms (@{ algorithm }) are not applied yet: ${asked.join(', ')}. Those groups are laid out with "${elkName}".`,
            });
            elkName = undefined;
          }
        }
        return engine(
          width !== undefined && graph.availableWidth === undefined
            ? { ...graph, availableWidth: width }
            : graph,
          { config }
        );
      },
      inline,
      icon,
      embed,
      warn,
      // Spread into the literal, not over `ctx`: a spread would run the lazy idPrefix getter.
      ...textOnly,
    };
    return { ctx, warnings, mounter };
  }

  /**
   * Text output (DESIGN §6.3): cell layout, the ascii hook, columns and rows (D80, D84).
   * `blocksFor` draws the blocks (ADR-15) with the options it is given: this draw's charset and
   * padding, never its width (only the outermost drawing is fitted to `maxWidth`).
   */
  function drawAscii(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    analysis: Analysis,
    blocksFor?: (options: TextRenderOptions) => DrawBlocks<EmbeddedText> | undefined
  ): TextRenderResult {
    const { prepared, plugin } = analysis;
    checkText(analysis.detected);
    const hook = registry.ascii(plugin.id);
    const backend = textBackend;
    if (!hook || !backend)
      throw new NotLoadedError([{ kind: 'diagram', name: `${plugin.id}/ascii` }]);
    const explicit = (options as TextRenderOptions | undefined)?.ascii;
    const { charset, padding, maxWidth } = backend.asciiOptions(prepared.config, explicit);
    const { title } = analysis;
    // The diagram's text entry reads the section from the config: hand it the resolved one.
    const ascii = Object.freeze({
      charset,
      padding,
      ...(maxWidth === undefined ? {} : { maxWidth }),
    });
    // The blocks (ADR-15), drawn in this charset and padding at the first lookup.
    const inner = blocksFor?.({ format: 'ascii', now: options?.now, ascii: { charset, padding } });
    const { embed: embedText } = lazyEmbed(
      inner,
      () => ctx.idPrefix,
      (w) => ctx.warn(w)
    );
    const { ctx, warnings } = contextFor(text, s, options, analysis, {
      units: cellProfile(padding),
      measurer: backend.cellMeasurer,
      width: maxWidth,
      text: {
        config: Object.freeze({ ...prepared.config, ascii }),
        ...(title !== undefined ? { title } : {}),
        ast: prepared.parse.ast,
        ...(embedText ? { embedText } : {}),
      },
    });
    const textCtx = ctx as TextRenderContext;
    // D86: postParse and postLayout run (LaidOut.units 'cell'); postRender, afterMount never.
    const textHooks = hooksFor(analysis, true);
    const run = textHooks.size === 0 ? undefined : textHooks.start(textCtx, plugin.id);
    const out = drawText(
      plugin,
      hook,
      prepared.parse.model,
      textCtx,
      run ? { run, ast: prepared.parse.ast } : undefined
    );
    const lines = out === '' ? [] : out.split('\n');
    const columns = lines.reduce((m, l) => Math.max(m, backend.cellWidth(l)), 0);
    // D84: never cropped; say so when it still does not fit.
    if (maxWidth !== undefined && columns > maxWidth)
      ctx.warn({
        code: 'ASCII_TOO_WIDE',
        message: `The drawing is ${columns} columns wide; ascii.maxWidth is ${maxWidth}.`,
      });
    return {
      format: 'ascii',
      text: out,
      columns,
      rows: lines.length,
      diagramType: prepared.diagramType,
      warnings,
    };
  }

  /** `drawWith`; the queued discovery warnings leave the queue only once a draw has them. */
  function draw(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined
  ): RenderResult | TextRenderResult {
    const queued = skipped.length;
    const result = drawWith(text, s, options);
    skipped.splice(0, queued);
    return result;
  }

  function drawWith(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined
  ): RenderResult | TextRenderResult {
    const format = checkFormat(text, s, options?.format);
    const analysis = analysisFor(text, s, options, format === 'ascii');
    if (!('prepared' in analysis)) return analysis;
    if (format === 'ascii')
      return drawAscii(text, s, options, analysis, (o) => blocks.drawText(text, 0, analysis, s, o));
    const blockDraw = blocks.draw(text, 0, analysis, s, options);
    const { drawn, warnings, mount } = drawSvg(text, s, options, analysis, blockDraw);
    const result: RenderResult = { ...drawn, diagramType: analysis.prepared.diagramType, warnings };
    // The DOM adapter's afterMount entry point (DESIGN §12.2, §12.3); `run`/`mount` call it.
    const bind = mount(result, true);
    if (bind) result.bindFunctions = bind;
    return result;
  }

  /** One SVG draw of `a`, with its blocks (ADR-15) drawn at the first lookup. */
  function drawSvg(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    a: Analysis,
    blockDraw: DrawBlocks | undefined
  ) {
    const units = { units: pxProfile, width: options?.availableWidth };
    const { ctx, warnings, mounter } = contextFor(text, s, options, a, units, blockDraw);
    const renderHooks = hooksFor(a);
    const run = renderHooks.size === 0 ? undefined : renderHooks.start(ctx, a.plugin.id);
    const { parse } = a.prepared;
    // D537: the line-hop step, when its chunk is loaded and decides that this render hops.
    const edges = registry.hops?.(a);
    const drawn = drawDiagram(a.plugin, parse.model, ctx, run && { run, ast: parse.ast }, edges);
    // Binds the run's interactions, then each block's in its own nested root (#669).
    return { drawn, ctx, warnings, mount: mounter<RenderResult>(run) };
  }

  /**
   * Draws synchronously what `prepare`/`preload` loaded. It neither runs nor waits for plugin
   * discovery (the first-use Node scan): `await preload()` or `prepare()` first.
   */
  function renderSync(text: string, options: TextRenderOptions): TextRenderResult;
  function renderSync(text: string, options?: SvgRenderOptions): RenderResult;
  function renderSync(text: string, options?: RenderOptions): RenderResult | TextRenderResult {
    try {
      return draw(text, snapshotFor(options), options);
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
      await prepareWith(text, s, options?.format);
      return draw(text, s, { ...options, id });
    } catch (e) {
      throw toMermaidError(e);
    }
  }

  async function parse(
    text: string,
    parseOptions: ParseOptions & { suppressErrors: true }
  ): Promise<ParseResult12 | false>;
  async function parse(text: string, parseOptions?: ParseOptions): Promise<ParseResult12>;
  async function parse(text: string, parseOptions?: ParseOptions): Promise<ParseResult12 | false> {
    if (discovery.pending) await discovery.settle();
    const s = site;
    try {
      const f = detectSupported(text, s, false);
      const { detected, pre } = f;
      const plugin = await registry.load(detected.id);
      const a = cache.get(text, s) ?? analysisOf(text, s, f, plugin);
      await blocks.prepare(text, 0, a, s, undefined);
      const config: Plain = {};
      const front = pre.frontMatter?.config;
      for (const c of [
        ...(front ? [front] : []),
        ...directiveConfig(outsideBlocks(pre, a.prepared.parse), sectionOf(detected, plugin)),
      ])
        mergeInto(config, c as Plain);
      for (const key of INTEGRATOR_ONLY_KEYS) delete config[key];
      return {
        diagramType: a.prepared.diagramType,
        config: config as ParseResult12['config'],
        warnings: [...a.prepared.warnings],
      };
    } catch (e) {
      if (parseOptions?.suppressErrors) return false;
      const error = toMermaidError(e);
      parseErrorHandler?.(error);
      throw error;
    }
  }

  function initialize(config: InitializeConfig): void {
    site = snapshot(config);
  }

  /**
   * The v12 type of `text`. Synchronous: it neither runs nor waits for plugin discovery, so a
   * discovered type is known only after an awaited `preload()`, `prepare()`, `parse()` or `render()`.
   */
  function detectType(text: string, config?: MermaidConfig): string {
    // v12 passed `config` to detectors; v13 detectors get the `initialize()` config.
    void config;
    try {
      return detect(text, site).detected.type;
    } catch (e) {
      throw toMermaidError(e);
    }
  }

  async function preload(req: PreloadRequest): Promise<void> {
    if (discovery.pending) await discovery.settle();
    const tasks: Promise<unknown>[] = [];
    const ascii = req.formats?.includes('ascii');
    if (ascii) tasks.push(import('./ascii.ts').then((b) => void (textBackend = b)));
    for (const t of req.types ?? []) {
      tasks.push(
        registry.load(t).then((p) => {
          if (!p)
            throw new MermaidError('UNSUPPORTED_DIAGRAM', `Diagram type "${t}" is not supported.`);
          // The plugin's own default engine (D284), or the type's (D534), comes with it.
          const layout = registry.layoutOf(t) ?? p.layoutEngine?.default;
          return Promise.all(
            [layout, registry.layoutPart(p, layout!)[0]].map((n) => n && registry.loadLayout(n))
          );
        })
      );
      if (ascii)
        tasks.push(
          registry.loadAscii(t).then((hook) => {
            if (!hook) throw new UnsupportedFormatError(t, 'ascii');
          })
        );
    }
    for (const l of req.layouts ?? []) tasks.push(registry.loadLayout(l));
    // `auto` needs its dark spec too.
    for (const name of req.themes ?? []) {
      const choice = resolveThemeName(name);
      tasks.push(loadTheme(choice.name));
      if (choice.dark) tasks.push(loadTheme(choice.dark));
    }
    // Extensions' resources by kind: `math: true` loads what a math extension provides (D178).
    if (req.math) for (const n of hooks.provided('math')) tasks.push(n.load());
    for (const name of req.iconPacks ?? []) tasks.push(iconPacks.load(name));
    try {
      await Promise.all(tasks);
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
    cache.clear();
    try {
      await registry.registerExternal(diagrams, lazyLoad, replace);
    } finally {
      rebuildHooks();
      // Again after the await, as `DiscoveryQueue.add` does: a render while it was pending
      // resolved its config without the new fragments and hooks.
      cache.clear();
    }
  }

  function registerLayoutLoaders(loaders: readonly LayoutLoader[]): void {
    const before = registry.fragments();
    const hooked = registry.registerLayouts(loaders);
    layoutRunners.clear();
    // A new fragment changes how config resolves, and a new hook how texts draw: parsed texts
    // must resolve again.
    if (registry.fragments() !== before || hooked) cache.clear();
  }

  /**
   * v12's icon packs (D290, D294), `{ name, icons }` or `{ name, loader }`: `name` overrides the
   * pack's `prefix`. A loader runs in `prepare()` only for a diagram that names its pack, or in
   * `preload({ iconPacks })`. Without an extension that claims `icons`, renders carry an
   * `ICON_PACKS_UNSUPPORTED` warning (D299). A name registered again replaces its pack.
   */
  const registerIconPacks: (packs: readonly IconLoader[]) => void = registerPacks;

  /** @deprecated Catch the `MermaidError` that `parse()` rejects with instead. */
  function setParseErrorHandler(handler: ParseErrorHandler): void {
    parseErrorHandler = handler;
  }

  // The DOM adapter (run, mount) reads the defaults at the start of each call, like render.
  const { run, mount, contentLoaded } = createDomAdapter({
    prepare,
    renderSync,
    siteConfig: () => site.config,
    onParseError: (error) => parseErrorHandler?.(error),
  });

  const api = {
    render,
    prepare,
    renderSync,
    preload,
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
  };
  registerSeam(api, discovery);
  return api;
}

export type Mermaid = ReturnType<typeof createMermaid>;
