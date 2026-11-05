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
  INTEGRATOR_ONLY_KEYS,
  resolveText,
  type MermaidConfig,
  type ResolvedConfig,
} from '@mermaid-js/core/config';
import {
  cellProfile,
  pxProfile,
  type LayoutEngine,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { checkSource } from '@mermaid-js/core/limits';
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
import { createDomAdapter } from './dom.ts';
import { toMermaidError } from './errors.ts';
import { selectMeasurer } from './measurer.ts';
import {
  Registry,
  type AnyPlugin,
  type Detected,
  type DiscoveredPlugin,
  type ExternalDiagram,
  type FirstPartyEntry,
  type LayoutLoader,
} from './registry.ts';
import { VERSION } from './version.ts';

export type { InitializeConfig, IntegratorOptions } from './config-snapshot.ts';
export { defaultIdPrefix } from './config-snapshot.ts';

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
}

/** What `detect` found, for a type with a plugin package. */
interface Found {
  readonly detected: Detected & { readonly id: string };
  readonly pre: PreprocessResult;
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
  /** Text output: the config with its `ascii` section, and what the text entry reads besides. */
  readonly text?: Pick<TextRenderContext, 'config' | 'title' | 'ast'>;
}

/** The analyses of recent texts, each valid only for the snapshot it was made with. */
class AnalysisCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(text: string, snap: Snapshot): Analysis | undefined {
    const hit = this.entries.get(text);
    return hit && hit.snap === snap ? hit.analysis : undefined;
  }

  set(text: string, snap: Snapshot, analysis: Analysis): void {
    this.entries.delete(text);
    this.entries.set(text, { snap, analysis });
    if (this.entries.size > CACHE_SIZE) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void {
    this.entries.clear();
  }
}

function layoutName(config: ResolvedConfig): string {
  return String(config.layout ?? 'layered');
}

function themeNames(config: ResolvedConfig): ThemeName[] {
  const choice = resolveThemeName(config.theme);
  return choice.dark ? [choice.name, choice.dark] : [choice.name];
}

/** The layout, themes and plugin resources `a` needs that are not loaded yet. */
function missingFor(registry: Registry, a: Analysis, text = false): Resource[] {
  const missing: Resource[] = [];
  const { config } = a.prepared;
  if (a.plugin.layoutKind === 'graph') {
    const name = layoutName(config);
    if (registry.layout(name).state === 'missing') missing.push({ kind: 'layout', name });
  }
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
function themeFor(config: ResolvedConfig, s: Snapshot, warn: (w: Warning) => void) {
  const choice = resolveThemeName(config.theme, warn);
  const spec = loadedTheme(choice.name) ?? loadedTheme(DEFAULT_THEME)!;
  const dark = choice.dark ? loadedTheme(choice.dark) : undefined;
  return createTheme(spec, {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark,
    cssVariables: s.options.output?.cssVariables,
    warn,
  });
}

/** How long a draw waits for a discovered registration still in flight (D165's import limit). */
const ADD_TIME_LIMIT_MS = 5000;

/** Options of the discovered-list seam's `add`. */
export interface AddOptions {
  /** How long a draw waits for this registration; default 5 s. */
  readonly timeLimitMs?: number;
}

/** Whether `p` settles before `deadline` (a time from `Date.now()`). */
function settlesBy(p: Promise<unknown>, deadline: number): Promise<boolean> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.resolve(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.then(
      () => true,
      () => true
    ),
    new Promise<boolean>((done) => (timer = setTimeout(() => done(false), left))),
  ]).finally(() => clearTimeout(timer));
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
  const rebuildHooks = (): void => {
    const next = new HookRunner<Element, RenderResult>();
    for (const e of registry.extensions()) next.register(e as ExtensionPlugin);
    hooks = next;
  };
  // Discovery (D166): its warnings wait for the next draw that succeeds; a first-use source
  // (the Node scan, T4) runs once, before the first prepare, render, parse or preload.
  const skipped: Warning[] = [];
  let firstUse: ((deadline: number) => Promise<void>) | undefined;
  let firstUseLimit = ADD_TIME_LIMIT_MS;
  let ready: Promise<void> | undefined;
  // Additions still registering (the CDN queue's pushes, T6), with the time each one's wait
  // ends: a draw waits for each until then, and renders without it after (one warning).
  const adding = new Map<Promise<unknown>, { deadline: number; limit: number }>();
  const discovered = async (): Promise<void> => {
    if (firstUse) {
      // One limit for the whole first use: the source, then its registration (which joins
      // `adding` with what is left of the limit). Past it the draw goes on; what the source
      // finds still registers when it ends (as a late CDN queue entry does).
      ready ??= (async () => {
        const deadline = Date.now() + firstUseLimit;
        const run = firstUse!(deadline).catch((e: unknown) => {
          skipped.push({
            code: 'PLUGIN_DISCOVERY_FAILED',
            message: `Plugin discovery failed: ${e instanceof Error ? e.message : String(e)}`,
          });
        });
        if (!(await settlesBy(run, deadline)))
          skipped.push({
            code: 'PLUGIN_DISCOVERY_FAILED',
            message: `Plugin discovery did not finish within ${firstUseLimit} ms; rendering without it.`,
          });
      })();
      await ready;
    }
    while (adding.size > 0) {
      const [pending, { deadline, limit }] = adding.entries().next().value!;
      if (!(await settlesBy(pending, deadline)) && adding.delete(pending))
        skipped.push({
          code: 'PLUGIN_DISCOVERY_FAILED',
          message: `A plugin registration did not finish within ${limit} ms; rendering without it.`,
        });
    }
  };
  let site: Snapshot = snapshot();
  let parseErrorHandler: ParseErrorHandler | undefined;
  let iconPacksRequested = false;
  const cache = new AnalysisCache();
  const siteConfigs = new SiteConfigs();
  const overlays = new Overlays();
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
    const hit = siteConfigs.get(snap, plugin, detected, section);
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

  /** `detect`, for a type with a plugin package that can draw `ascii` when that is asked for. */
  function detectSupported(text: string, s: Snapshot, ascii: boolean): Found {
    const { detected, pre } = detect(text, s);
    if (detected.id === undefined) throw unsupported(detected);
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
    if (!plugin) throw unsupported(detected);
    const analysis = analyse(text, s, plugin, detected, pre);
    cache.set(text, s, analysis);
    return analysis;
  }

  function unsupported(detected: Detected): MermaidError {
    return new MermaidError(
      'UNSUPPORTED_DIAGRAM',
      `Diagram type "${detected.type}" is not supported by this version of mermaid.`
    );
  }

  function snapshotFor(options?: RenderOptions): Snapshot {
    const extra = options?.config;
    return extra ? overlays.get(site, extra) : site;
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

  async function prepareWith(text: string, s: Snapshot, format?: string): Promise<Analysis> {
    if (firstUse || adding.size > 0) await discovered();
    const ascii = checkFormat(text, s, format) === 'ascii';
    let analysis = cache.get(text, s);
    if (!analysis) {
      const f = detectSupported(text, s, ascii);
      analysis = analysisOf(text, s, f, await registry.load(f.detected.id));
    }
    if (ascii) await loadText(analysis);
    await loadResources(registry, missingFor(registry, analysis, ascii));
    return analysis;
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
    const { detected } = f;
    const plugin = registry.plugin(detected.id);
    if (plugin) return analysisOf(text, s, f, plugin);
    const missing = new NotLoadedError([{ kind: 'diagram', name: detected.id }]);
    if (ascii || !options?.placeholders) throw missing;
    return {
      svg: renderErrorSvg(missing, { version: VERSION }),
      diagramType: detected.type,
      width: 0,
      height: 0,
      warnings: [...skipped, { code: 'PLACEHOLDER', message: missing.message }],
    };
  }

  /** The render context of one draw, and the warnings sink it writes to. */
  function contextFor(
    text: string,
    s: Snapshot,
    options: RenderOptions | undefined,
    analysis: Analysis,
    { units, measurer, width, text: textOnly }: Units
  ): { ctx: RenderContext; warnings: Warning[] } {
    const { prepared, plugin } = analysis;
    const { config } = prepared;
    const textOutput = units.id === 'cell';
    const warnings: Warning[] = [...skipped, ...prepared.warnings];
    const warn = (w: Warning): void => void warnings.push(toWarning(w));
    const missing = missingFor(registry, analysis, textOutput);
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
      const name = layoutName(config);
      const found = registry.layout(name);
      if (found.state === 'unknown') {
        warn({
          code: 'LAYOUT_UNKNOWN',
          message: `Unknown layout "${name}"; using the built-in layered engine.`,
        });
      }
      engine = found.engine;
    }
    const theme = themeFor(config, s, warn);
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
        return (idPrefix ??=
          options?.id ?? defaultIdPrefix(text, config, optionsKey(s.options), units));
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
      // Spread into the literal, not over `ctx`: a spread would run the lazy idPrefix getter.
      ...textOnly,
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
    const { title } = analysis;
    // The diagram's text entry reads the section from the config: hand it the resolved one.
    const ascii = Object.freeze({
      charset,
      padding,
      ...(maxWidth === undefined ? {} : { maxWidth }),
    });
    const { ctx, warnings } = contextFor(text, s, options, analysis, {
      units: cellProfile(padding),
      measurer: backend.cellMeasurer,
      width: maxWidth,
      text: {
        config: Object.freeze({ ...prepared.config, ascii }),
        ...(title !== undefined ? { title } : {}),
        ast: prepared.parse.ast,
      },
    });
    const textCtx = ctx as TextRenderContext;
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
    if (firstUse || adding.size > 0) await discovered();
    const s = site;
    try {
      const f = detectSupported(text, s, false);
      const { detected, pre } = f;
      const plugin = await registry.load(detected.id);
      const a = cache.get(text, s) ?? analysisOf(text, s, f, plugin);
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
    if (firstUse || adding.size > 0) await discovered();
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
    }
  }

  function addDiscovered(
    list: readonly DiscoveredPlugin[],
    { timeLimitMs = ADD_TIME_LIMIT_MS }: AddOptions = {}
  ): Promise<readonly Warning[]> {
    return register(list, Date.now() + timeLimitMs, timeLimitMs);
  }

  /** `addDiscovered`, waited for by draws until `deadline`; `undefined`: not waited for. */
  function register(
    list: readonly DiscoveredPlugin[],
    deadline: number | undefined,
    limit: number
  ): Promise<readonly Warning[]> {
    cache.clear();
    // Never rejects; leaves `adding` before its awaiter resumes, so a draw right after it
    // does not wait. The cache is cleared again: a draw during the wait may have filled it.
    const pending: Promise<readonly Warning[]> = registry
      .registerDiscovered(list)
      .then(
        (warnings) => {
          rebuildHooks();
          skipped.push(...warnings);
          return warnings;
        },
        (e: unknown): readonly Warning[] => {
          const w: Warning = {
            code: 'PLUGIN_DISCOVERY_FAILED',
            message: `Plugin registration failed: ${e instanceof Error ? e.message : String(e)}`,
          };
          skipped.push(w);
          return [w];
        }
      )
      .finally(() => {
        cache.clear();
        adding.delete(pending);
      });
    if (deadline !== undefined) adding.set(pending, { deadline, limit });
    return pending;
  }

  function registerLayoutLoaders(loaders: readonly LayoutLoader[]): void {
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
  seams.set(api, {
    add: addDiscovered,
    onFirstUse(source, { timeLimitMs = ADD_TIME_LIMIT_MS } = {}) {
      if (firstUse || ready) throw new Error('A first-use discovery source is already set');
      firstUseLimit = timeLimitMs;
      firstUse = async (deadline) => {
        const list = await source(site.config, (w) => void skipped.push(w));
        // Past the deadline (the draw already went on with a warning) it registers unwaited.
        void register(list, Date.now() < deadline ? deadline : undefined, timeLimitMs);
      };
    },
  });
  return api;
}

export type Mermaid = ReturnType<typeof createMermaid>;

/**
 * A first-use discovery source (see discovery.ts): gets the `initialize()` config and `warn`,
 * which queues a warning for the first render (a package the scan skipped).
 */
export type FirstUseSource = (
  config: Readonly<Record<string, unknown>>,
  warn: (warning: Warning) => void
) => readonly DiscoveredPlugin[] | Promise<readonly DiscoveredPlugin[]>;

/** The discovered-list seam of one API object (see discovery.ts). */
interface Seam {
  add(list: readonly DiscoveredPlugin[], options?: AddOptions): Promise<readonly Warning[]>;
  onFirstUse(source: FirstUseSource, options?: AddOptions): void;
}

const seams = new WeakMap<object, Seam>();

/** The discovered-list seam of `api`, an object `createMermaid` made. */
export function seamOf(api: Mermaid): Seam {
  const seam = seams.get(api);
  if (!seam) throw new TypeError('Not a mermaid API object');
  return seam;
}
