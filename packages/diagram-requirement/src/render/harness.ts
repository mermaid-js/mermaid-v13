/**
 * Test harness (`@mermaid-js/diagram-requirement/testing`): renders a requirement source or
 * model through the plugin's own seam, `parse` → `layout` → `render`, with a render context
 * built as the pipeline builds one (`themeFor` in `mermaid/src/api.ts`, and
 * `core/src/pipeline/draw.ts`): core's config defaults under the integrator's config and the source's front matter
 * and directives, the theme with the plugin's table, its `themeVariables` and its dark half for
 * `theme: 'auto'`, the table measurer, the layout engine (`layered`, or the one given), and the
 * stream writer with the theme's gradient and an optional outline drawer. The manifest is T5's
 * (#587); until then this is how requirement renders, and after it, how to render the plugin
 * alone with what the public API does not take (a model, an engine, a drawer, a measurer).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { layered, pxProfile, type LayoutEngine } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { RequirementLayout } from '../layout/layout.ts';
import type { RequirementModel } from '../model.ts';
import type { RequirementDocument } from '../parser/index.ts';
import { requirement } from '../plugin.ts';

export interface RenderRequirementOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** The graph engine (`ctx.layout`); core's `layered` when absent. */
  readonly engine?: LayoutEngine;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
}

export interface RenderedRequirement {
  readonly svg: string;
  readonly model: RequirementModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: RequirementDocument;
  readonly layout: RequirementLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderRequirementForTest(
  input: string | RequirementModel,
  options: RenderRequirementOptions = {}
): Promise<RenderedRequirement> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = typeof input === 'string' ? preprocess(input) : undefined;
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  const config = resolveConfig(
    CORE_DEFAULTS,
    options.config,
    pre?.frontMatter?.config,
    directives,
    undefined,
    { warn, section: 'requirement' }
  );
  const limits = resolveLimits(config);
  let model: RequirementModel;
  let ast: RequirementDocument | undefined;
  if (typeof input === 'string') {
    const parse = requirement.parse(input, { config, preprocessed: pre!, limits });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`requirement parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: requirement.theme,
    warn,
    idPrefix: () => idPrefix,
  });
  const engine = options.engine ?? layered;
  const ctx: RenderContext = {
    config,
    measurer: options.measurer ?? tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix,
    version: TEST_VERSION,
    layout: (graph) => engine(graph, { config }),
    limits,
    warn,
  };
  const layout = requirement.layout(model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  requirement.render(model, layout, ctx, w);
  return {
    svg: w.finish(),
    model,
    ...(ast ? { ast } : {}),
    layout,
    config,
    warnings,
    gradient: gradient?.id ?? false,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
