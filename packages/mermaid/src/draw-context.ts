/**
 * The context of one draw (DESIGN §3 steps 5–6): what is missing and how a placeholder stands
 * in for it, which layout engine draws and what it warns of, then the context literal.
 */
import {
  NotLoadedError,
  type ExtensionNeed,
  type Resource,
  type TextRenderContext,
  type Warning,
} from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { layered, type LayoutEngine, type UnitProfile } from '@mermaid-js/core/layout';
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
import type { RenderOptions } from './api-types.ts';
import type { Analysis } from './analysis-cache.ts';
import type { DrawBlocks, LazyBlocks } from './block-pass.ts';
import { defaultIdPrefix, optionsKey, type Snapshot } from './config-snapshot.ts';
import { toWarning, type DrawContext } from './errors.ts';
import { packsUnsupported } from './icon-packs.ts';
import { selectMeasurer } from './measurer.ts';
import {
  builtIn,
  isElkName,
  layoutName,
  LINE_HOPS,
  type AnyPlugin,
  type LayoutFound,
  type Registry,
} from './registry.ts';
import type { Session } from './session.ts';
import { VERSION } from './version.ts';

/** How a render measures and sizes: px for SVG, cells for text (D77, D84). */
export interface Units {
  readonly units: UnitProfile;
  readonly measurer?: Measurer;
  /** `availableWidth` in the profile's units. */
  readonly width?: number;
  /** Text output: the config with its `ascii` section, and what the text entry reads besides. */
  readonly text?: Pick<TextRenderContext, 'config' | 'title' | 'ast' | 'embedText'>;
  /** The blocks (ADR-15) of an SVG draw, drawn at the first lookup. */
  readonly blocks?: DrawBlocks;
}

/** What `contextFor` makes of a draw: its context, its warnings sink and its binder maker. */
export interface DrawSetup {
  readonly ctx: DrawContext;
  readonly warnings: Warning[];
  readonly mounter: LazyBlocks['mounter'];
}

function themeNames(config: ResolvedConfig): ThemeName[] {
  const choice = resolveThemeName(config.theme);
  return choice.dark ? [choice.name, choice.dark] : [choice.name];
}

/** The themes of `config` that are not loaded yet. */
function missingThemes(config: ResolvedConfig, missing: Resource[]): void {
  for (const name of themeNames(config)) {
    if (!loadedTheme(name)) missing.push({ kind: 'theme', name });
  }
}

/** The layout engine and part `a` needs that are not loaded yet. */
function missingLayout(registry: Registry, a: Analysis, missing: Resource[]): void {
  if (a.plugin.layoutKind !== 'graph') return;
  const name = layoutName(a.prepared.config, a.plugin);
  const { need } = registry.layout(name, a.plugin.layoutEngine);
  if (need !== undefined) missing.push({ kind: 'layout', name: need });
  const [part, loaded] = registry.layoutPart(a.plugin, name);
  if (part && !loaded) missing.push({ kind: 'layout', name: part });
}

/** The layout, themes and plugin resources `a` needs that are not loaded yet. */
function missingFor(registry: Registry, a: Analysis, text = false): Resource[] {
  const { config } = a.prepared;
  // Text output lays out with core's own `layered`, never a registered engine (D179).
  const missing: Resource[] = [];
  if (!text) missingLayout(registry, a, missing);
  // D537: the line-hop chunk when the shared key turns hops on. An engine whose own `lineHops`
  // defaults on (`swimlane`, ELK) carries the step, so loading it loads them.
  if (!text && !registry.hops && config.lineHops) missing.push({ kind: 'layout', name: LINE_HOPS });
  // Text output draws no colours, so it needs no theme (D82).
  if (!text) missingThemes(config, missing);
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

/** What the registered extensions still need for `a` (R-API-2, D178): `math`, say. */
function extensionNeeds(
  { hooks, iconPacks }: Session,
  a: Analysis,
  ascii: boolean
): readonly ExtensionNeed[] {
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

/** Loads what `a` draws with: layout, themes, plugin and extension resources. */
export function loadFor(k: Session, a: Analysis, ascii: boolean): Promise<unknown> {
  return Promise.all([
    loadResources(k.registry, missingFor(k.registry, a, ascii)),
    ...extensionNeeds(k, a, ascii).map((n) => n.load()),
  ]);
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

/** A usage error, as a bad `limits` option is: `+now` of a bad Date or a string is NaN. */
function instantOf(options: RenderOptions | undefined): number {
  const now = +(options?.now ?? Date.now());
  if (!Number.isFinite(now))
    throw new TypeError(`RenderOptions.now is no instant: ${String(options?.now)}`);
  return now;
}

/**
 * The missing-resource policy: a text draw or one without `placeholders` throws; otherwise
 * one `PLACEHOLDER` warning names what the draw stands in for.
 */
function applyMissingPolicy(
  k: Session,
  analysis: Analysis,
  options: RenderOptions | undefined,
  textOutput: boolean,
  warn: (w: Warning) => void
): void {
  const missing = [
    ...missingFor(k.registry, analysis, textOutput),
    // An icon pack is missing only while `pending`: an unregistered one is unresolved (D291),
    // and so is a `failed` one until the next prepare() retries it (D299).
    ...extensionNeeds(k, analysis, textOutput).flatMap(({ resource: r }) =>
      r.kind !== 'iconPack' || k.iconPacks.state(r.name) === 'pending' ? r : []
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
  for (const w of packsUnsupported(k.iconPacks, k.hooks.claims())) warn(w);
}

/** The layout a draw calls: its engine, its part of the drawing and, when ELK lays out, its name. */
interface LayoutChoice {
  readonly engine?: LayoutEngine;
  readonly part?: unknown;
  readonly elkName?: string;
}

/** Warns of a layout name that text output does not use, or that found no engine (D173, D179). */
function warnLayout(
  asked: string,
  name: string,
  found: LayoutFound,
  textOutput: boolean,
  warn: (w: Warning) => void
): void {
  // D179: no other engine knows cells (ELK ignores `grid`), so the name only warns. Text
  // output never loads it, and gives no ELK_NOT_INSTALLED or LAYOUT_UNKNOWN for it.
  if (textOutput && !builtIn(asked)) {
    warn({
      code: 'ASCII_DROPPED',
      feature: 'layout',
      message: `Text output lays out with the built-in layered engine; layout "${asked}" is not used.`,
    });
  }
  const using = `using the built-in ${found.standIn ?? 'layered'} engine`;
  if (found.state === 'unknown') {
    warn({ code: 'LAYOUT_UNKNOWN', message: `Unknown layout "${name}"; ${using}.` });
  } else if (found.state === 'elk') {
    // D173: `mermaid` names the package; core never does (D153).
    warn({
      code: 'ELK_NOT_INSTALLED',
      message: `Layout "${name}" needs @mermaid-js/layout-elk, which is not registered; ${using}.`,
    });
  }
}

/** Picks the engine of a graph layout and warns of what it replaced (D173, D174, D179). */
function chooseLayout(
  registry: Registry,
  plugin: AnyPlugin,
  config: ResolvedConfig,
  textOutput: boolean,
  warn: (w: Warning) => void
): LayoutChoice {
  if (plugin.layoutKind !== 'graph') return {};
  const asked = layoutName(config, plugin);
  // Text output: core's `layered` itself, even when a loader replaced the name for SVG.
  const name = textOutput ? 'layered' : asked;
  const found = textOutput
    ? ({ engine: layered, state: 'ready' } as LayoutFound)
    : registry.layout(name, plugin.layoutEngine);
  warnLayout(asked, name, found, textOutput, warn);
  return {
    engine: found.engine,
    // Only when ELK lays the graph out: with LAYOUT_UNKNOWN or ELK_NOT_INSTALLED, layered
    // draws every group, as that warning says.
    elkName:
      isElkName(name) && (found.state === 'ready' || found.state === 'missing') ? name : undefined,
    // The layout's part of the drawing (`layoutParts`), only when that layout lays it out:
    // ready (a stand-in engine never is).
    part: found.state === 'ready' ? registry.layoutPart(plugin, name)[1] : undefined,
  };
}

/** `ctx.layout` of a draw: the chosen engine, fitted to the width, with D174's one warning. */
function layoutCall(
  { engine, elkName }: LayoutChoice,
  plugin: AnyPlugin,
  config: ResolvedConfig,
  width: number | undefined,
  warn: (w: Warning) => void
): DrawContext['layout'] {
  let elk = elkName;
  return (graph) => {
    if (!engine) throw new TypeError(`${plugin.id} has no graph layout`);
    // D174: `@{ algorithm }` is parsed but not applied yet. `mermaid` says so, not the engine
    // (which has no warning channel), once per render.
    if (elk !== undefined) {
      const asked = [...new Set(graph.groups.flatMap((g) => g.algorithm ?? []))];
      if (asked.length > 0) {
        warn({
          code: 'ELK_ALGORITHM_IGNORED',
          message: `Per-group layout algorithms (@{ algorithm }) are not applied yet: ${asked.join(', ')}. Those groups are laid out with "${elk}".`,
        });
        elk = undefined;
      }
    }
    return engine(
      width !== undefined && graph.availableWidth === undefined
        ? { ...graph, availableWidth: width }
        : graph,
      { config }
    );
  };
}

/**
 * The render context of one draw, the warnings sink it writes to, and the binders of the
 * blocks it drew (#669).
 */
export function contextFor(
  k: Session,
  text: string,
  s: Snapshot,
  options: RenderOptions | undefined,
  analysis: Analysis,
  { units, measurer, width, text: textOnly, blocks: drawBlocks }: Units
): DrawSetup {
  const { registry, blocks, hooks, packs } = k;
  const { prepared, plugin } = analysis;
  const { config } = prepared;
  const now = instantOf(options);
  const textOutput = units.id === 'cell';
  const warnings: Warning[] = [...k.skipped, ...prepared.warnings];
  const warn = (w: Warning): void => void warnings.push(toWarning(w, registry.fragments()));
  applyMissingPolicy(k, analysis, options, textOutput, warn);
  const choice = chooseLayout(registry, plugin, config, textOutput, warn);
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
  const { embed, mounter } = blocks.lookup(drawBlocks, () => ctx.idPrefix, warn);
  const ctx: DrawContext = {
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
    layoutPart: choice.part,
    layout: layoutCall(choice, plugin, config, width, warn),
    inline,
    icon,
    embed,
    foldedType: blocks.foldedType(analysis, s),
    warn,
    // Spread into the literal, not over `ctx`: a spread would run the lazy idPrefix getter.
    ...textOnly,
  };
  return { ctx, warnings, mounter };
}
