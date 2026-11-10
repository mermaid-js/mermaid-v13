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
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { inlineSpans, tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { AgentflowLayout } from '../layout/index.ts';
import type { AgentflowDocument, AgentflowModel } from '../parser/index.ts';
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

/** Renders `source`, parsed with its front matter and directives. Throws on a parse error. */
export async function renderAgentflowForTest(
  source: string,
  options: RenderAgentflowOptions = {}
): Promise<RenderedAgentflow> {
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
  const error = parse.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`agentflow parse error: ${error.message}`);
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
