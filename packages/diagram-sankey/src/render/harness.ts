/**
 * Test harness (`@mermaid-js/diagram-sankey/testing`): renders a sankey source or model through
 * the plugin's own seam, `parse` → `layout` → `render`, with a render context built as the
 * pipeline builds one (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): core's
 * config defaults under the integrator's config and the source's front matter and directives,
 * the theme with its `themeVariables` and its dark half for `theme: 'auto'` (sankey has no
 * theme table), the table measurer, and the stream or tree writer with the theme's gradient and
 * the render's id prefix (for the user-space gradient ids, D391). `mermaid` renders sankey
 * through the registry once T5 (#503) adds the manifest; this renders the plugin alone, with
 * what the public API does not take (a model, a measurer, the writer backing).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, treeWriter } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { SankeyLayout } from '../layout/index.ts';
import type { SankeyModel } from '../model.ts';
import type { SankeyDocument } from '../parser/index.ts';
import { sankey } from '../plugin.ts';

export interface RenderSankeyOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `sankey`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  readonly measurer?: Measurer;
  /** The tree backing, as the pipeline uses when a hook runs; the stream one by default. */
  readonly tree?: boolean;
}

export interface RenderedSankey {
  readonly svg: string;
  readonly model: SankeyModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: SankeyDocument;
  readonly layout: SankeyLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  /** The warnings of the render (the parse's warnings stay in `model.warnings`). */
  readonly warnings: readonly Warning[];
  /** The render's D182 gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderSankeyForTest(
  input: string | SankeyModel,
  options: RenderSankeyOptions = {}
): Promise<RenderedSankey> {
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
    { warn, section: 'sankey' }
  );
  const limits = resolveLimits(config);
  let model: SankeyModel;
  let ast: SankeyDocument | undefined;
  if (typeof input === 'string') {
    const parse = sankey.parse(input, { config, preprocessed: pre!, limits });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`sankey parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    warn,
    idPrefix: () => idPrefix,
  });
  const ctx: RenderContext = {
    config,
    measurer: options.measurer ?? tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix,
    version: TEST_VERSION,
    layout: () => {
      throw new Error('sankey lays itself out (layoutKind: custom)');
    },
    limits,
    warn,
  };
  const layout = sankey.layout(model, ctx);
  const gradient = theme.gradient();
  const writerOptions = { gradient, idPrefix: () => idPrefix };
  const w = options.tree ? treeWriter(writerOptions) : streamWriter(writerOptions);
  sankey.render(model, layout, ctx, w);
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
