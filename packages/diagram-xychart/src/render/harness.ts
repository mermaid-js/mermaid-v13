/**
 * Test harness (`@mermaid-js/diagram-xychart/testing`): renders an XY chart source or model
 * through the plugin's own seam, `parse` → `layout` → `render`, with a render context built as
 * the pipeline builds one (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): core's
 * config defaults under the integrator's config and the source's front matter and directives,
 * the theme with the plugin's table, its `themeVariables` and its dark half for `theme: 'auto'`,
 * the table measurer, and the stream writer with the theme's gradient. `mermaid` renders the XY
 * chart through the registry once T5's manifest lands (#513); this renders the plugin alone,
 * with what the public API does not take (a model, a measurer).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { XyChartLayout } from '../layout/index.ts';
import type { XyChartModel } from '../model.ts';
import type { XyChartDocument } from '../parser/index.ts';
import { xychart } from '../plugin.ts';

export interface RenderXyChartOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, `xyChart`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  readonly measurer?: Measurer;
  /** `output.cssVariables`: false writes literal colours. */
  readonly cssVariables?: boolean;
}

export interface RenderedXyChart {
  readonly svg: string;
  readonly model: XyChartModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: XyChartDocument;
  readonly layout: XyChartLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

/** The message a source's first parse error throws with. */
export const XYCHART_PARSE_ERROR = 'xychart parse error';

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderXyChartForTest(
  input: string | XyChartModel,
  options: RenderXyChartOptions = {}
): Promise<RenderedXyChart> {
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
    { warn, section: 'xyChart' }
  );
  const limits = resolveLimits(config);
  let model: XyChartModel;
  let ast: XyChartDocument | undefined;
  if (typeof input === 'string') {
    const parse = xychart.parse(input, { config, preprocessed: pre!, limits });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`${XYCHART_PARSE_ERROR}: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: xychart.theme,
    ...(options.cssVariables === undefined ? {} : { cssVariables: options.cssVariables }),
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
      throw new Error('the XY chart lays itself out (layoutKind: custom)');
    },
    limits,
    warn,
  };
  const layout = xychart.layout(model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient });
  xychart.render(model, layout, ctx, w);
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
