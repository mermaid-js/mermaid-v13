/**
 * The public API (DESIGN §3): `render` = `prepare` + `renderSync`, plus `parse`, `initialize`,
 * `detectType`, `preload`, `supportsFormat` and the register functions. Each API object owns
 * one Registry and one frozen defaults snapshot; `initialize` swaps the snapshot, so a render
 * in flight keeps the one it started with (R-ARCH-4, D72).
 */
import {
  drawDiagram,
  errorFromDiagnostics,
  HookRunner,
  MermaidError,
  NotLoadedError,
  renderErrorSvg,
  UnsupportedFormatError,
  type ExtensionPlugin as CoreExtensionPlugin,
  type RenderContext,
  type Resource,
  type Warning,
} from '@mermaid-js/core';
import {
  CORE_DEFAULTS,
  INTEGRATOR_ONLY_KEYS,
  resolveConfig,
  type ConfigInput,
  type MermaidConfig,
  type ResolvedConfig,
} from '@mermaid-js/core/config';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { asLimitError, checkSource, resolveLimits, type Limits } from '@mermaid-js/core/limits';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { resolveSecurityLevel } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import {
  createTheme,
  loadedTheme,
  loadTheme,
  resolveThemeName,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { stageEnd, stageStart } from '@mermaid-js/core/timing';
import { selectMeasurer } from './measurer.ts';
import {
  Registry,
  type AnyPlugin,
  type Detected,
  type ExternalDiagram,
  type LayoutLoader,
} from './registry.ts';
import { VERSION } from './version.ts';

/** Options only the integrator can set; never read from diagram text (R-SEC-5, R-SEC-6). */
export interface IntegratorOptions {
  /** Measures label text. Wins over `deterministic` (DESIGN §5.1). */
  measurer?: Measurer;
  /** Use the built-in metric tables, never the canvas (R-TEXT-7). */
  deterministic?: boolean;
  /** Replaces the default link schemes (http, https, mailto). */
  linkSchemes?: readonly string[];
  output?: { cssVariables?: boolean };
  /**
   * Resource limits (R-SEC-5); each wins over v12's `maxTextSize`/`maxEdges`. Over a limit,
   * render rejects with `MermaidError { code: 'LIMIT' }`. Diagram text cannot change them.
   */
  limits?: Partial<Limits>;
}

/** `initialize()` input: the schema config plus the integrator-only options. */
export type InitializeConfig = MermaidConfig & IntegratorOptions;

export interface RenderOptions {
  /** Prefix of the ids in the output (`render(id)` passes its id). Default `mermaid`. */
  id?: string;
  /** Per-call integrator config, merged over `initialize()`'s. */
  config?: InitializeConfig;
  /** Draw placeholders for missing resources, with a warning, instead of throwing. */
  placeholders?: boolean;
  /** Output format. Only `svg` exists in M1. */
  format?: 'svg' | 'ascii';
}

export interface RenderResult {
  svg: string;
  diagramType: string;
  width: number;
  height: number;
  warnings: Warning[];
  /**
   * Set only when a registered extension has an `afterMount` hook (the interactions plugin,
   * DESIGN §12.3): runs those hooks on the element the svg was mounted in. The DOM adapter
   * (`run`/`mount`, #16) calls it after inserting the svg.
   */
  bindFunctions?: (element: Element) => void;
}

/**
 * An extension plugin (DESIGN §12.2): hooks for every diagram type, registered through
 * `registerExternalDiagrams`. `afterMount` runs only in the DOM adapter (`bindFunctions`).
 */
export type ExtensionPlugin = CoreExtensionPlugin<Element, RenderResult>;

/** What `prepare` found: cached so `renderSync` right after does not parse again. */
export interface Prepared {
  readonly diagramType: string;
  readonly config: ResolvedConfig;
  /** The diagram plugin's parse result (model, AST, diagnostics, symbols). */
  readonly parse: ParseResult<unknown>;
  readonly warnings: readonly Warning[];
}

export interface ParseOptions {
  /** Resolve to `false` instead of rejecting when the diagram is invalid. */
  suppressErrors?: boolean;
}

export interface ParseResult12 {
  /** The v12 diagram type, e.g. `flowchart-v2`. */
  diagramType: string;
  /** The config given in front matter and directives, without the integrator-only keys. */
  config: Omit<MermaidConfig, 'securityLevel'>;
  warnings: Warning[];
}

export interface PreloadRequest {
  /** Diagram types or plugin ids. */
  types?: readonly string[];
  layouts?: readonly string[];
  themes?: readonly string[];
  /** Accepted and ignored until the icons plugin exists. */
  iconPacks?: readonly string[];
  math?: boolean;
}

/** @deprecated v12 compatibility: receives the `MermaidError` of a failed `parse`. */
export type ParseErrorHandler = (error: MermaidError) => void;

const INTEGRATOR_KEYS = ['measurer', 'deterministic', 'linkSchemes', 'output', 'limits'] as const;

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

function mergeInto(target: Plain, source: Plain): Plain {
  for (const [k, v] of Object.entries(source)) {
    if (UNSAFE.has(k) || v === undefined) continue;
    const t = target[k];
    target[k] = isPlain(v) ? mergeInto(isPlain(t) ? { ...t } : {}, v) : v;
  }
  return target;
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

interface Snapshot {
  readonly config: Readonly<MermaidConfig>;
  readonly options: Readonly<IntegratorOptions>;
  /** From the integrator's config alone, before any diagram text is read. */
  readonly limits: Readonly<Limits>;
}

function withLimits(
  config: Readonly<MermaidConfig>,
  options: Readonly<IntegratorOptions>
): Snapshot {
  return { config, options, limits: resolveLimits(config, options.limits) };
}

function snapshot(input: InitializeConfig = {}): Snapshot {
  const config: Plain = {};
  const options: Plain = {};
  for (const [k, v] of Object.entries(input)) {
    if ((INTEGRATOR_KEYS as readonly string[]).includes(k)) options[k] = v;
    else if (!UNSAFE.has(k)) config[k] = v;
  }
  const merged = mergeInto({}, config) as MermaidConfig;
  // v12's legacy location of the font: `fontFamily` also sets `themeVariables.fontFamily`.
  if (typeof merged.fontFamily === 'string') {
    const vars = (merged.themeVariables ?? {}) as Plain;
    if (vars.fontFamily === undefined)
      merged.themeVariables = { ...vars, fontFamily: merged.fontFamily };
  }
  return withLimits(freeze(merged), Object.freeze(options) as IntegratorOptions);
}

function overlay(base: Snapshot, extra: InitializeConfig | undefined): Snapshot {
  if (!extra) return base;
  const next = snapshot(extra);
  const limits =
    base.options.limits || next.options.limits
      ? { ...base.options.limits, ...next.options.limits }
      : undefined;
  return withLimits(
    freeze(mergeInto(mergeInto({}, base.config as Plain), next.config as Plain)),
    Object.freeze({ ...base.options, ...next.options, ...(limits ? { limits } : {}) })
  );
}

/** Init directive config in source order (v12's `config` key moved into the section). */
function directiveConfig(pre: PreprocessResult, section: string | undefined): ConfigInput[] {
  const out: ConfigInput[] = [];
  for (const d of pre.directives) {
    if (d.kind === 'wrap') out.push({ wrap: true });
    else if (d.kind === 'init' && isPlain(d.args)) {
      const args = { ...d.args };
      // v12 detectInit: an init `config` key belongs to the detected diagram's section.
      if (args.config !== undefined && section) {
        args[section] =
          isPlain(args[section]) && isPlain(args.config)
            ? mergeInto({ ...args[section] }, args.config)
            : args.config;
        delete args.config;
      }
      out.push(args);
    }
  }
  return out;
}

const toWarning = (w: {
  code: string;
  message: string;
  path?: string;
  source?: string;
}): Warning => {
  const out: { code: string; message: string; path?: string; source?: string } = {
    code: w.code,
    message: w.message,
  };
  if (w.path !== undefined) out.path = w.path;
  if (w.source !== undefined) out.source = w.source;
  return out;
};

function internal(e: unknown): MermaidError {
  if (e instanceof MermaidError) return e;
  // A LimitError (source/output size, a stack overflow from deep nesting) is LIMIT; any other
  // RangeError (e.g. a NaN coordinate from the writer) is an internal error.
  const limit = asLimitError(e);
  if (limit) return new MermaidError('LIMIT', limit.message, { cause: limit });
  return new MermaidError('INTERNAL', e instanceof Error ? e.message : String(e), { cause: e });
}

interface Analysis {
  readonly detected: Detected;
  readonly plugin: AnyPlugin;
  readonly prepared: Prepared;
}

interface CacheEntry {
  readonly snap: Snapshot;
  readonly analysis: Analysis;
}

const CACHE_SIZE = 32;

/** One `mermaid` API object with its own registry and defaults. */
export function createMermaid() {
  const registry = new Registry();
  const hooks = new HookRunner<Element, RenderResult>();
  let site: Snapshot = snapshot();
  let parseErrorHandler: ParseErrorHandler | undefined;
  let iconPacksRequested = false;
  const cache = new Map<string, CacheEntry>();

  function sectionOf(detected: Detected, plugin?: AnyPlugin): string | undefined {
    return plugin?.id ?? detected.id;
  }

  // Detect, resolve config and parse with a loaded plugin (DESIGN §3 steps 1–4).
  function analyse(
    text: string,
    snap: Snapshot,
    plugin: AnyPlugin,
    detected: Detected,
    pre: PreprocessResult
  ): Analysis {
    const warnings: Warning[] = [];
    const warn = (w: Parameters<typeof toWarning>[0]): void => void warnings.push(toWarning(w));
    for (const d of pre.diagnostics) if (d.severity === 'warning') warn(d);
    const section = sectionOf(detected, plugin);
    const pluginDefaults: Plain = {};
    if (plugin.configDefaults && section) pluginDefaults[section] = plugin.configDefaults;
    // v12's flowchart-elk detector sets `layout: 'elk'` below the user's config.
    if (detected.type === 'flowchart-elk') pluginDefaults.layout = 'elk';
    const config = resolveConfig(
      CORE_DEFAULTS,
      snap.config,
      pre.frontMatter?.config,
      directiveConfig(pre, section),
      pluginDefaults as MermaidConfig,
      { warn, section }
    );
    const t = stageStart();
    const claims = hooks.claims();
    const parse = plugin.parse(
      text,
      claims.length > 0
        ? { config, preprocessed: pre, limits: snap.limits, claims }
        : { config, preprocessed: pre, limits: snap.limits }
    );
    stageEnd('parse', t);
    const error = errorFromDiagnostics(text, [...pre.diagnostics, ...parse.diagnostics]);
    if (error) throw error;
    for (const d of parse.diagnostics) if (d.severity === 'warning') warn(d);
    return {
      detected,
      plugin,
      prepared: freeze({ diagramType: detected.type, config, parse, warnings }) as Prepared,
    };
  }

  function detect(text: string, s: Snapshot): { detected: Detected; pre: PreprocessResult } {
    // DESIGN §3 step 1: the source limit, before the text is read at all.
    checkSource(text, s.limits);
    const pre = preprocess(text);
    const error = errorFromDiagnostics(
      text,
      pre.diagnostics.filter((d) => d.severity === 'error')
    );
    if (error) throw error;
    return { detected: registry.detect(text, pre), pre };
  }

  function unsupported(detected: Detected): MermaidError {
    return new MermaidError(
      'UNSUPPORTED_DIAGRAM',
      `Diagram type "${detected.type}" is not supported by this version of mermaid.`
    );
  }

  function cached(text: string, snap: Snapshot): Analysis | undefined {
    const hit = cache.get(text);
    return hit && hit.snap === snap ? hit.analysis : undefined;
  }

  function remember(text: string, snap: Snapshot, analysis: Analysis): void {
    cache.delete(text);
    cache.set(text, { snap, analysis });
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }

  function themeNames(config: ResolvedConfig): ThemeName[] {
    const choice = resolveThemeName(config.theme);
    return choice.dark ? [choice.name, choice.dark] : [choice.name];
  }

  function missingFor(a: Analysis): Resource[] {
    const missing: Resource[] = [];
    const { config } = a.prepared;
    if (a.plugin.layoutKind === 'graph') {
      const name = String(config.layout ?? 'layered');
      if (registry.layout(name).state === 'missing') missing.push({ kind: 'layout', name });
    }
    for (const name of themeNames(config)) {
      if (!loadedTheme(name)) missing.push({ kind: 'theme', name });
    }
    for (const r of a.plugin.resources?.(a.prepared.parse, config) ?? []) missing.push(r);
    return missing;
  }

  async function loadResources(missing: readonly Resource[]): Promise<void> {
    await Promise.all(
      missing.map(async (r) => {
        if (r.kind === 'layout') await registry.loadLayout(r.name);
        else if (r.kind === 'theme') await loadTheme(r.name as ThemeName);
        else if (r.kind === 'diagram') await registry.load(r.name);
      })
    );
  }

  function snap(options?: RenderOptions): Snapshot {
    return overlay(site, options?.config);
  }

  async function prepareWith(text: string, s: Snapshot): Promise<Analysis> {
    const hit = cached(text, s);
    if (hit) {
      await loadResources(missingFor(hit));
      return hit;
    }
    const { detected, pre } = detect(text, s);
    const plugin = detected.id === undefined ? undefined : await registry.load(detected.id);
    if (!plugin) throw unsupported(detected);
    const analysis = analyse(text, s, plugin, detected, pre);
    await loadResources(missingFor(analysis));
    remember(text, s, analysis);
    return analysis;
  }

  async function prepare(text: string, options?: RenderOptions): Promise<Prepared> {
    try {
      return (await prepareWith(text, snap(options))).prepared;
    } catch (e) {
      throw internal(e);
    }
  }

  function draw(text: string, s: Snapshot, options: RenderOptions | undefined): RenderResult {
    if (options?.format !== undefined && options.format !== 'svg') {
      const type = (() => {
        try {
          return detect(text, s).detected.type;
        } catch {
          return 'unknown';
        }
      })();
      throw new UnsupportedFormatError(type, options.format);
    }
    let analysis = cached(text, s);
    if (!analysis) {
      const { detected, pre } = detect(text, s);
      if (detected.id === undefined) throw unsupported(detected);
      const plugin = registry.plugin(detected.id);
      if (!plugin) {
        const missing = new NotLoadedError([{ kind: 'diagram', name: detected.id }]);
        if (!options?.placeholders) throw missing;
        const drawn = renderErrorSvg(missing, { version: VERSION });
        return {
          svg: drawn,
          diagramType: detected.type,
          width: 0,
          height: 0,
          warnings: [{ code: 'PLACEHOLDER', message: missing.message }],
        };
      }
      analysis = analyse(text, s, plugin, detected, pre);
      remember(text, s, analysis);
    }
    const { prepared, plugin } = analysis;
    const { config } = prepared;
    const warnings: Warning[] = [...prepared.warnings];
    const warn = (w: Parameters<typeof toWarning>[0]): void => void warnings.push(toWarning(w));
    const missing = missingFor(analysis);
    if (missing.length > 0) {
      if (!options?.placeholders) throw new NotLoadedError(missing);
      warn({
        code: 'PLACEHOLDER',
        message: `Drawn with stand-ins for what is not loaded: ${missing
          .map((r) => `${r.kind} "${r.name}"`)
          .join(', ')}.`,
      });
    }
    if (iconPacksRequested) {
      warn({
        code: 'ICON_PACKS_UNSUPPORTED',
        message: 'registerIconPacks() has no effect until the icons plugin exists.',
      });
    }
    let engine: LayoutEngine | undefined;
    if (plugin.layoutKind === 'graph') {
      const name = String(config.layout ?? 'layered');
      const found = registry.layout(name);
      if (found.state === 'unknown') {
        warn({
          code: 'LAYOUT_UNKNOWN',
          message: `Unknown layout "${name}"; using the built-in layered engine.`,
        });
      }
      engine = found.engine;
    }
    const choice = resolveThemeName(config.theme, warn);
    const spec = loadedTheme(choice.name) ?? loadedTheme('redux')!;
    const dark = choice.dark ? loadedTheme(choice.dark) : undefined;
    const theme = createTheme(spec, {
      themeVariables: config.themeVariables as Record<string, unknown> | undefined,
      dark,
      cssVariables: s.options.output?.cssVariables,
      warn,
    });
    const layoutEngine = engine;
    const ctx: RenderContext = {
      config,
      measurer: selectMeasurer({
        measurer: s.options.measurer,
        deterministic: s.options.deterministic,
      }),
      theme,
      securityLevel: resolveSecurityLevel(config.securityLevel, warn),
      idPrefix: options?.id ?? 'mermaid',
      version: VERSION,
      linkSchemes: s.options.linkSchemes,
      limits: s.limits,
      layout: (graph) => {
        if (!layoutEngine) throw new TypeError(`${plugin.id} has no graph layout`);
        return layoutEngine(graph);
      },
      warn,
    };
    if (hooks.size === 0) {
      const drawn = drawDiagram(plugin, prepared.parse.model, ctx);
      return { ...drawn, diagramType: prepared.diagramType, warnings };
    }
    const run = hooks.start(ctx, plugin.id);
    const drawn = drawDiagram(plugin, prepared.parse.model, ctx, { run, ast: prepared.parse.ast });
    const result: RenderResult = { ...drawn, diagramType: prepared.diagramType, warnings };
    // The DOM adapter's afterMount entry point (DESIGN §12.2, §12.3); `run`/`mount` call it.
    if (run.mounts) result.bindFunctions = (element) => run.afterMount(element, result);
    return result;
  }

  function renderSync(text: string, options?: RenderOptions): RenderResult {
    try {
      return draw(text, snap(options), options);
    } catch (e) {
      throw internal(e);
    }
  }

  async function render(
    id: string,
    text: string,
    // v12 measured in a DOM container; v13 is DOM-free and does not need it.
    container?: Element
  ): Promise<RenderResult> {
    void container;
    const s = site;
    try {
      await prepareWith(text, s);
      return draw(text, s, { id });
    } catch (e) {
      throw internal(e);
    }
  }

  async function parse(
    text: string,
    parseOptions: ParseOptions & { suppressErrors: true }
  ): Promise<ParseResult12 | false>;
  async function parse(text: string, parseOptions?: ParseOptions): Promise<ParseResult12>;
  async function parse(text: string, parseOptions?: ParseOptions): Promise<ParseResult12 | false> {
    const s = site;
    try {
      const { detected, pre } = detect(text, s);
      const plugin = detected.id === undefined ? undefined : await registry.load(detected.id);
      if (!plugin) throw unsupported(detected);
      const a = cached(text, s) ?? analyse(text, s, plugin, detected, pre);
      const config: Plain = {};
      const front = pre.frontMatter?.config;
      for (const c of [
        ...(front ? [front] : []),
        ...directiveConfig(pre, sectionOf(detected, plugin)),
      ])
        mergeInto(config, c as Plain);
      for (const key of INTEGRATOR_ONLY_KEYS) delete config[key];
      return {
        diagramType: a.prepared.diagramType,
        config: config as Omit<MermaidConfig, 'securityLevel'>,
        warnings: [...a.prepared.warnings],
      };
    } catch (e) {
      if (parseOptions?.suppressErrors) return false;
      const error = internal(e);
      parseErrorHandler?.(error);
      throw error;
    }
  }

  function initialize(config: InitializeConfig): void {
    site = snapshot(config);
  }

  function detectType(text: string, config?: MermaidConfig): string {
    void config; // v12 passed it to detectors; v13 detection reads the text only.
    try {
      return detect(text, site).detected.type;
    } catch (e) {
      throw internal(e);
    }
  }

  async function preload(req: PreloadRequest): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const t of req.types ?? []) {
      tasks.push(
        registry.load(t).then((p) => {
          if (!p)
            throw new MermaidError('UNSUPPORTED_DIAGRAM', `Diagram type "${t}" is not supported.`);
        })
      );
    }
    for (const l of req.layouts ?? []) tasks.push(registry.loadLayout(l));
    for (const name of req.themes ?? []) {
      tasks.push(loadTheme(resolveThemeName(name).name));
    }
    try {
      await Promise.all(tasks);
    } catch (e) {
      throw internal(e);
    }
  }

  function supportsFormat(type: string, format: 'svg' | 'ascii'): boolean {
    return registry.formats(type).includes(format);
  }

  async function registerExternalDiagrams(
    diagrams: readonly ExternalDiagram[],
    { lazyLoad = true }: { lazyLoad?: boolean } = {}
  ): Promise<void> {
    cache.clear();
    const extensions = await registry.registerExternal(diagrams, lazyLoad);
    for (const e of extensions) hooks.register(e as ExtensionPlugin);
  }

  function registerLayoutLoaders(loaders: readonly LayoutLoader[]): void {
    cache.clear();
    registry.registerLayouts(loaders);
  }

  /** No-op until the icons plugin exists; renders then carry an `ICON_PACKS_UNSUPPORTED` warning. */
  function registerIconPacks(...packs: unknown[]): void {
    void packs;
    iconPacksRequested = true;
  }

  /** @deprecated Catch the `MermaidError` that `parse()` rejects with instead. */
  function setParseErrorHandler(handler: ParseErrorHandler): void {
    parseErrorHandler = handler;
  }

  return {
    render,
    prepare,
    renderSync,
    preload,
    parse,
    initialize,
    detectType,
    supportsFormat,
    registerExternalDiagrams,
    registerLayoutLoaders,
    registerIconPacks,
    setParseErrorHandler,
  };
}

export type Mermaid = ReturnType<typeof createMermaid>;
