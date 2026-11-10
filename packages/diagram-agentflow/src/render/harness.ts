/**
 * Test harness (`@mermaid-js/diagram-agentflow/testing`): renders an agentflow source through
 * the plugin's own seam, `parse` → `layout` → `render`, with a render context built as the
 * pipeline builds one (kanban's harness; `mermaid/src/api.ts` `themeFor`,
 * `core/src/pipeline/draw.ts`): core's config defaults under the integrator's config and the
 * source's front matter and directives, the theme with the plugin's table, its `themeVariables`
 * and its dark half for `theme: 'auto'`, the inline spans of the given providers (math, D176),
 * the table measurer, and the stream writer with the theme's gradient and an optional outline
 * drawer (D302). `mermaid` renders agentflow through the registry from #550 on.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { layered, pxProfile, type LayoutGraph, type LayoutModel } from '@mermaid-js/core/layout';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { inlineSpans, tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName, type Theme } from '@mermaid-js/core/theme';
import type { AgentflowLayout } from '../layout/index.ts';
import type { AgentflowDocument, AgentflowModel, AgentflowParseResult } from '../parser/index.ts';
import { agentflow } from '../plugin.ts';

/** An extension's inline provider (`ExtensionPlugin.inline`), as `inlineSpans` takes it. */
type InlineProvider = Parameters<typeof inlineSpans>[0][number];

export interface RenderAgentflowOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** The resolved security level; `default` when absent. */
  readonly securityLevel?: RenderContext['securityLevel'];
  /** The integrator's link schemes (`RenderContext.linkSchemes`). */
  readonly linkSchemes?: readonly string[];
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
  /** The extensions' inline providers (the math plugin's), in registration order. */
  readonly inline?: readonly InlineProvider[];
  /** Features extensions claim (`callbacks` with the interactions plugin). */
  readonly claims?: readonly string[];
  /** The graph engine; core's `layered` by default. */
  readonly layout?: (graph: LayoutGraph) => LayoutModel;
}

export interface RenderedAgentflow {
  readonly svg: string;
  readonly model: AgentflowModel;
  readonly ast: AgentflowDocument;
  readonly layout: AgentflowLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  /** The parse's warnings, then the render's. */
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

export interface ParseAgentflowOptions {
  /** Integrator config, as `initialize()` would get it. */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** Features extensions claim (`callbacks` with the interactions plugin). */
  readonly claims?: readonly string[];
}

/** One source through the plugin's `parse`, with the config, limits and theme it renders with. */
export interface ParsedAgentflow {
  /** Core's preprocess of the source: its diagnostics are not the parse's. */
  readonly preprocessed: PreprocessResult;
  readonly parse: AgentflowParseResult;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly limits: Readonly<Limits>;
  /** The source's theme (agentflow's own, v12 `redux-color`, unless one is named), with the table. */
  readonly theme: Theme;
  /** The config's warnings, the parse's, then the theme's. */
  readonly warnings: Warning[];
}

/**
 * The plugin's parse path as the pipeline runs it: core's config defaults under the
 * integrator's config and the source's front matter and directives (the `agentflow` section's
 * scoped keys), the limits that config implies, `agentflow.parse`, and the theme with the
 * plugin's table, its `themeVariables` and its dark half for `theme: 'auto'`. Never throws on
 * a parse error: `parse.diagnostics` has it.
 */
export async function parseAgentflowForTest(
  source: string,
  options: ParseAgentflowOptions = {}
): Promise<ParsedAgentflow> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = preprocess(source);
  const directives = pre.directives.flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  const config = resolveConfig(
    CORE_DEFAULTS,
    options.config,
    pre.frontMatter?.config,
    directives,
    undefined,
    { warn, section: 'agentflow' }
  );
  const limits = resolveLimits(config);
  const parse = agentflow.parse(source, {
    config,
    preprocessed: pre,
    limits,
    ...(options.claims ? { claims: options.claims } : {}),
  });
  for (const d of parse.diagnostics) warn({ code: d.code, message: d.message });
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: agentflow.theme,
    warn,
    idPrefix: () => idPrefix,
  });
  return { preprocessed: pre, parse, config, limits, theme, warnings };
}

/** Renders `source`, parsed with its front matter and directives. Throws on a parse error. */
export async function renderAgentflowForTest(
  source: string,
  options: RenderAgentflowOptions = {}
): Promise<RenderedAgentflow> {
  const { parse, config, limits, theme, warnings } = await parseAgentflowForTest(source, options);
  const error = parse.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`agentflow parse error: ${error.message}`);
  const warn = (w: Warning): void => void warnings.push(w);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const ctx: RenderContext = {
    config,
    measurer: options.measurer ?? tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: options.securityLevel ?? 'default',
    idPrefix,
    version: TEST_VERSION,
    layout: options.layout ?? ((graph) => layered(graph)),
    limits,
    inline: inlineSpans(options.inline ?? [], warn),
    warn,
    ...(options.linkSchemes ? { linkSchemes: options.linkSchemes } : {}),
  };
  const layout = agentflow.layout(parse.model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  agentflow.render(parse.model, layout, ctx, w);
  return {
    svg: w.finish(),
    model: parse.model,
    ast: parse.ast,
    layout,
    config,
    warnings,
    gradient: gradient?.id ?? false,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
