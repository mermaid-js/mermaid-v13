/**
 * Test harness (`@mermaid-js/diagram-kanban/testing`): renders a kanban source or model through
 * the plugin's own seam, `parse` → `layout` → `render`, with a render context built as the
 * pipeline builds one (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): core's
 * config defaults under the integrator's config and the source's front matter and directives,
 * the theme with the plugin's table, its `themeVariables` and its dark half for `theme: 'auto'`,
 * the table measurer, and the stream writer with the theme's gradient and an optional outline
 * drawer. Until T5's manifest (#459) registers the plugin, this is how kanban renders.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { KanbanLayout } from '../layout/index.ts';
import type { KanbanModel } from '../model.ts';
import type { KanbanDocument } from '../parser/index.ts';
import { kanban } from '../plugin.ts';

export interface RenderKanbanOptions {
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
}

export interface RenderedKanban {
  readonly svg: string;
  readonly model: KanbanModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: KanbanDocument;
  readonly layout: KanbanLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderKanbanForTest(
  input: string | KanbanModel,
  options: RenderKanbanOptions = {}
): Promise<RenderedKanban> {
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
    { warn, section: 'kanban' }
  );
  let model: KanbanModel;
  let ast: KanbanDocument | undefined;
  if (typeof input === 'string') {
    const limits = resolveLimits(config);
    const parse = kanban.parse(input, { config, preprocessed: pre!, limits });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`kanban parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: kanban.theme,
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
    layout: () => {
      throw new Error('kanban lays itself out (layoutKind: custom)');
    },
    limits: resolveLimits(config),
    warn,
    ...(options.linkSchemes ? { linkSchemes: options.linkSchemes } : {}),
  };
  const layout = kanban.layout(model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  kanban.render(model, layout, ctx, w);
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
