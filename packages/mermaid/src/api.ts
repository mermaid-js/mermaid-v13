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
  type ExtensionPlugin as CoreExtensionPlugin,
  type RenderContext,
  type Resource,
  type TextRenderContext,
  type Warning,
} from '@mermaid-js/core';
import {
  CORE_DEFAULTS,
  INTEGRATOR_ONLY_KEYS,
  resolveSite,
  resolveText,
  type ConfigInput,
  type MermaidConfig,
  type ResolvedConfig,
  type ResolvedSite,
} from '@mermaid-js/core/config';
import {
  cellProfile,
  pxProfile,
  type LayoutEngine,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { asLimitError, checkSource, resolveLimits, type Limits } from '@mermaid-js/core/limits';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { resolveSecurityLevel } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import {
  createTheme,
  DEFAULT_THEME,
  loadedTheme,
  loadTheme,
  resolveThemeName,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { stageEnd, stageStart } from '@mermaid-js/core/timing';
import type * as TextModule from './ascii.ts';
import { createDomAdapter } from './dom.ts';
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
  /** Measures label text. Ignored under `deterministic: true` (R-TEXT-7, DESIGN §5.1). */
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
  /**
   * Prefix of the ids in the output (`render(id)` passes its id). Without one, the prefix is
   * `mermaid-<hash>`, a stable hash of the source text and the resolved config, so different
   * diagrams on one page get distinct ids and the same input stays byte-identical (R-SVG-3,
   * R-ARCH-6). Pass an `id` to render the same text twice on one page.
   */
  id?: string;
  /** Per-call integrator config, merged over `initialize()`'s. */
  config?: InitializeConfig;
  /** Draw placeholders for missing resources, with a warning, instead of throwing. */
  placeholders?: boolean;
  /**
   * Output format (R-ASCII-4, D80): `svg` (default) or `ascii`, text drawn in character cells
   * for the types whose manifest lists it (`supportsFormat`).
   */
  format?: 'svg' | 'ascii';
  /**
   * Width in px the drawing should fit (R-LAYOUT-5): graph layouts tighten their spacing and
   * may turn LR into TB. Off by default; `mount(…, { availableWidth: true })` passes the
   * element's width. SVG only: text output fits `ascii.maxWidth` columns instead (D84).
   */
  availableWidth?: number;
}

/** Options of an SVG render (`format` absent or `svg`). */
export interface SvgRenderOptions extends RenderOptions {
  format?: 'svg';
}

/** Options of a text render (R-ASCII-4, D80). */
export interface TextRenderOptions extends RenderOptions {
  format: 'ascii';
  /**
   * Explicit text options for this call (the CLI's `--charset` and `--width`). Each key set here
   * wins over the same `ascii` key from any config, the diagram's front matter and directives
   * included; unset keys fall back to the config as usual.
   */
  ascii?: { charset?: 'unicode' | 'ascii'; padding?: 'compact' | 'roomy'; maxWidth?: number };
}

/**
 * A text render (R-ASCII-4, D80): `\n` line ends, no trailing spaces, byte-deterministic.
 * `columns` is the widest line in cells (a wide character takes 2), `rows` the line count.
 */
export interface TextRenderResult {
  format: 'ascii';
  text: string;
  columns: number;
  rows: number;
  diagramType: string;
  warnings: Warning[];
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

/**
 * What `prepare` found: cached so `renderSync` right after does not parse again. The object is the
 * cached one, shared with later renders of the same text: read it, never change it. Only the
 * config is frozen (by `resolveText`).
 */
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
  /**
   * The config given in front matter and directives, without the integrator-only keys.
   * `theme` keeps v12's type so v12 callers still compile (R-COMPAT-5); a diagram that asks
   * for v13's `theme: 'auto'` reports it as the string `'auto'` all the same.
   */
  config: Omit<MermaidConfig, 'securityLevel' | 'theme'> & { theme?: V12Theme };
  warnings: Warning[];
}

/** The `theme` names v12 declared: every v13 name except `auto`. */
type V12Theme = Exclude<MermaidConfig['theme'], 'auto'>;

export interface PreloadRequest {
  /** Diagram types or plugin ids. */
  types?: readonly string[];
  layouts?: readonly string[];
  themes?: readonly string[];
  /** `'ascii'` also loads each type's text entry, for `renderSync(…, { format: 'ascii' })`. */
  formats?: readonly ('svg' | 'ascii')[];
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

/** Keys sorted, so equal configs serialise equally whatever their key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Plain)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * `mermaid-<FNV-1a 32 of text + resolved config + integrator options + unit profile>`: distinct
 * per diagram, deterministic (R-SVG-3, R-ARCH-6). Functions (measurer) serialise as null. The
 * px profile adds nothing, so SVG ids are as before units joined the key.
 */
export function defaultIdPrefix(
  text: string,
  config: unknown,
  options: unknown,
  units: UnitProfile
): string {
  const unit = units.id === 'px' ? '' : `\u0000${units.id}`;
  const input = `${text}\u0000${stableJson(config)}\u0000${stableJson(options)}${unit}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `mermaid-${(h >>> 0).toString(36)}`;
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

const WARNING_KEYS = ['path', 'source', 'feature', 'shapes', 'astIds'] as const;

/** A copy of a warning with only the `Warning` keys (text output adds `feature`, `shapes`, `astIds`). */
const toWarning = (w: Warning): Warning => {
  const out: Plain = { code: w.code, message: w.message };
  for (const k of WARNING_KEYS) {
    const v = w[k];
    if (v !== undefined) out[k] = Array.isArray(v) ? [...(v as unknown[])] : v;
  }
  return out as unknown as Warning;
};

/** The `ascii` config section with its defaults (D77, D79, D84). */
/** `render`'s third argument: v12's container element, or an options object (D80). */
function renderOptions(arg: unknown): RenderOptions | undefined {
  if (!isPlain(arg) || typeof arg.nodeType === 'number') return undefined;
  return arg as RenderOptions;
}

type TextBackend = typeof TextModule;

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
  /** The front-matter title, for text output (D82). */
  readonly title?: string;
}

/** The integrator's side of a config, and the warnings resolving it gave. */
interface SiteConfig {
  readonly site: ResolvedSite;
  readonly warnings: readonly Warning[];
}

interface CacheEntry {
  readonly snap: Snapshot;
  readonly analysis: Analysis;
}

const CACHE_SIZE = 32;

/** How a render measures and sizes: px for SVG, cells for text (D77, D84). */
interface Units {
  readonly units: UnitProfile;
  readonly measurer?: Measurer;
  /** `availableWidth` in the profile's units. */
  readonly width?: number;
}

/** One `mermaid` API object with its own registry and defaults. */
export function createMermaid() {
  const registry = new Registry();
  const hooks = new HookRunner<Element, RenderResult>();
  let site: Snapshot = snapshot();
  let parseErrorHandler: ParseErrorHandler | undefined;
  let iconPacksRequested = false;
  const cache = new Map<string, CacheEntry>();
  // Everything but the diagram text's own config depends only on the snapshot, the plugin and
  // the detected type: resolve it once, and replay its warnings on reuse.
  const siteConfigs = new WeakMap<Snapshot, WeakMap<AnyPlugin, Map<string, SiteConfig>>>();
  // `core/ascii`'s cell measurer and width, loaded by the first text `prepare` (D87).
  let textBackend: TextBackend | undefined;

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
    const warn = (w: Warning): void => void warnings.push(toWarning(w));
    for (const d of pre.diagnostics) if (d.severity === 'warning') warn(d);
    const section = sectionOf(detected, plugin);
    const front = pre.frontMatter?.config;
    const directives = directiveConfig(pre, section);
    let byPlugin = siteConfigs.get(snap);
    if (!byPlugin)
      siteConfigs.set(snap, (byPlugin = new WeakMap<AnyPlugin, Map<string, SiteConfig>>()));
    let byType = byPlugin.get(plugin);
    if (!byType) byPlugin.set(plugin, (byType = new Map<string, SiteConfig>()));
    const key = `${section ?? ''}\0${detected.type}`;
    let hit = byType.get(key);
    if (!hit) {
      const pluginDefaults: Plain = {};
      if (plugin.configDefaults && section) pluginDefaults[section] = plugin.configDefaults;
      // v12's flowchart-elk detector sets `layout: 'elk'` below the user's config.
      if (detected.type === 'flowchart-elk') pluginDefaults.layout = 'elk';
      const recorded: Warning[] = [];
      const resolved = resolveSite(CORE_DEFAULTS, snap.config, pluginDefaults as MermaidConfig, {
        warn: (w) => void recorded.push(w),
        section,
      });
      hit = { site: resolved, warnings: recorded };
      byType.set(key, hit);
    }
    for (const w of hit.warnings) warn(w);
    const config: ResolvedConfig = resolveText(hit.site, front, directives, { warn });
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
    const title = pre.frontMatter?.title;
    return {
      detected,
      plugin,
      prepared: { diagramType: detected.type, config, parse, warnings },
      ...(title !== undefined ? { title } : {}),
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
    return {
      detected: registry.detect(text, pre, s.config as Readonly<Record<string, unknown>>),
      pre,
    };
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

  function missingFor(a: Analysis, text = false): Resource[] {
    const missing: Resource[] = [];
    const { config } = a.prepared;
    if (a.plugin.layoutKind === 'graph') {
      const name = String(config.layout ?? 'layered');
      if (registry.layout(name).state === 'missing') missing.push({ kind: 'layout', name });
    }
    // Text output draws no colours, so it needs no theme (D82).
    for (const name of text ? [] : themeNames(config)) {
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

  // The same per-call config object over the same defaults gives the same snapshot, so
  // `prepare(text, o)` then `renderSync(text, o)` hits the parse cache.
  const overlays = new WeakMap<InitializeConfig, { base: Snapshot; snap: Snapshot }>();
  function snap(options?: RenderOptions): Snapshot {
    const extra = options?.config;
    if (!extra) return site;
    const hit = overlays.get(extra);
    if (hit && hit.base === site) return hit.snap;
    const s = overlay(site, extra);
    overlays.set(extra, { base: site, snap: s });
    return s;
  }

  /** Throws `UnsupportedFormatError` unless `detected` declares ascii (R-ASCII-5, D80). */
  function checkText(detected: Detected): void {
    if (detected.id === undefined || !registry.formats(detected.id).includes('ascii'))
      throw new UnsupportedFormatError(detected.type, 'ascii');
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

  async function prepareWith(text: string, s: Snapshot, format?: string): Promise<Analysis> {
    const ascii = format === 'ascii';
    let analysis = cached(text, s);
    if (!analysis) {
      const { detected, pre } = detect(text, s);
      if (ascii && detected.id !== undefined) checkText(detected);
      const plugin = detected.id === undefined ? undefined : await registry.load(detected.id);
      if (!plugin) throw unsupported(detected);
      analysis = analyse(text, s, plugin, detected, pre);
      remember(text, s, analysis);
    }
    if (ascii) await loadText(analysis);
    await loadResources(missingFor(analysis, ascii));
    return analysis;
  }

  async function prepare(text: string, options?: RenderOptions): Promise<Prepared> {
    try {
      return (await prepareWith(text, snap(options), options?.format)).prepared;
    } catch (e) {
      throw internal(e);
    }
  }

  /** The cached or fresh analysis of `text`, or a placeholder svg for an unloaded plugin. */
  function analysisFor(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    ascii: boolean
  ): Analysis | RenderResult {
    const hit = cached(text, s);
    if (hit) return hit;
    const { detected, pre } = detect(text, s);
    if (detected.id === undefined) throw unsupported(detected);
    if (ascii) checkText(detected);
    const plugin = registry.plugin(detected.id);
    if (!plugin) {
      const missing = new NotLoadedError([{ kind: 'diagram', name: detected.id }]);
      if (ascii || !options?.placeholders) throw missing;
      const drawn = renderErrorSvg(missing, { version: VERSION });
      return {
        svg: drawn,
        diagramType: detected.type,
        width: 0,
        height: 0,
        warnings: [{ code: 'PLACEHOLDER', message: missing.message }],
      };
    }
    const analysis = analyse(text, s, plugin, detected, pre);
    remember(text, s, analysis);
    return analysis;
  }

  /** The render context of one draw, and the warnings sink it writes to. */
  function contextFor(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    analysis: Analysis,
    { units, measurer, width }: Units
  ): { ctx: RenderContext; warnings: Warning[] } {
    const { prepared, plugin } = analysis;
    const { config } = prepared;
    const textOutput = units.id === 'cell';
    const warnings: Warning[] = [...prepared.warnings];
    const warn = (w: Warning): void => void warnings.push(toWarning(w));
    const missing = missingFor(analysis, textOutput);
    if (missing.length > 0) {
      if (textOutput || !options?.placeholders) throw new NotLoadedError(missing);
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
    const spec = loadedTheme(choice.name) ?? loadedTheme(DEFAULT_THEME)!;
    const dark = choice.dark ? loadedTheme(choice.dark) : undefined;
    const theme = createTheme(spec, {
      themeVariables: config.themeVariables as Record<string, unknown> | undefined,
      dark,
      cssVariables: s.options.output?.cssVariables,
      warn,
    });
    let idPrefix: string | undefined;
    const ctx: RenderContext = {
      config,
      measurer:
        measurer ??
        selectMeasurer({ measurer: s.options.measurer, deterministic: s.options.deterministic }),
      units,
      theme,
      securityLevel: resolveSecurityLevel(config.securityLevel, warn),
      get idPrefix() {
        return (idPrefix ??= options?.id ?? defaultIdPrefix(text, config, s.options, units));
      },
      version: VERSION,
      linkSchemes: s.options.linkSchemes,
      limits: s.limits,
      layout: (graph) => {
        if (!engine) throw new TypeError(`${plugin.id} has no graph layout`);
        return engine(
          width !== undefined && graph.availableWidth === undefined
            ? { ...graph, availableWidth: width }
            : graph
        );
      },
      warn,
    };
    return { ctx, warnings };
  }

  /** Text output (DESIGN §6.3): cell layout, the ascii hook, columns and rows (D80, D84). */
  function drawAscii(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    analysis: Analysis
  ): TextRenderResult {
    const { prepared, plugin } = analysis;
    checkText(analysis.detected);
    const hook = registry.ascii(plugin.id);
    const backend = textBackend;
    if (!hook || !backend)
      throw new NotLoadedError([{ kind: 'diagram', name: `${plugin.id}/ascii` }]);
    const explicit = (options as TextRenderOptions | undefined)?.ascii;
    const { charset, padding, maxWidth } = backend.asciiOptions(prepared.config, explicit);
    const { ctx, warnings } = contextFor(text, s, options, analysis, {
      units: cellProfile(padding),
      measurer: backend.cellMeasurer,
      width: maxWidth,
    });
    const { title } = analysis;
    // The diagram's text entry reads the section from the config: hand it the resolved one.
    const ascii = { charset, padding, ...(maxWidth === undefined ? {} : { maxWidth }) };
    const textCtx: TextRenderContext = {
      ...ctx,
      config: Object.freeze({ ...ctx.config, ascii }),
      ...(title !== undefined ? { title } : {}),
      ast: prepared.parse.ast,
    };
    // D86: postParse and postLayout run (LaidOut.units 'cell'); postRender, afterMount never.
    const run = hooks.size === 0 ? undefined : hooks.start(textCtx, plugin.id);
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

  function draw(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined
  ): RenderResult | TextRenderResult {
    const format: string = options?.format ?? 'svg';
    if (format !== 'svg' && format !== 'ascii') {
      const type = (() => {
        try {
          return detect(text, s).detected.type;
        } catch {
          return 'unknown';
        }
      })();
      throw new UnsupportedFormatError(type, format);
    }
    const analysis = analysisFor(text, s, options, format === 'ascii');
    if (!('prepared' in analysis)) return analysis;
    if (format === 'ascii') return drawAscii(text, s, options, analysis);
    const { prepared, plugin } = analysis;
    const { ctx, warnings } = contextFor(text, s, options, analysis, {
      units: pxProfile,
      width: options?.availableWidth,
    });
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

  function renderSync(text: string, options: TextRenderOptions): TextRenderResult;
  function renderSync(text: string, options?: SvgRenderOptions): RenderResult;
  function renderSync(text: string, options?: RenderOptions): RenderResult | TextRenderResult {
    try {
      return draw(text, snap(options), options);
    } catch (e) {
      throw internal(e);
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
    const s = snap(options);
    try {
      await prepareWith(text, s, options?.format);
      return draw(text, s, { ...options, id });
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
        config: config as ParseResult12['config'],
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
    // `auto` needs its dark spec too.
    for (const name of req.themes ?? []) {
      const choice = resolveThemeName(name);
      tasks.push(loadTheme(choice.name));
      if (choice.dark) tasks.push(loadTheme(choice.dark));
    }
    if (req.formats?.includes('ascii')) {
      tasks.push(
        import('./ascii.ts').then((b) => {
          textBackend = b;
        })
      );
      for (const t of req.types ?? []) {
        tasks.push(
          registry.loadAscii(t).then((hook) => {
            if (!hook) throw new UnsupportedFormatError(t, 'ascii');
          })
        );
      }
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

  // The DOM adapter (run, mount) reads the defaults at the start of each call, like render.
  const { run, mount, contentLoaded } = createDomAdapter({
    prepare,
    renderSync,
    siteConfig: () => site.config,
    onParseError: (error) => parseErrorHandler?.(error),
  });

  return {
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
}

export type Mermaid = ReturnType<typeof createMermaid>;
