/**
 * Test harness (`@mermaid-js/diagram-venn/testing`): renders a venn source or model through
 * the plugin's own seam, `parse` → `layout` → `render`, with a render context built as the
 * pipeline builds one (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): core's
 * config defaults under the integrator's config and the source's front matter and directives,
 * the theme with the plugin's table, its `themeVariables` and its dark half for `theme: 'auto'`,
 * the table measurer, and the stream writer with the theme's gradient and an optional outline
 * drawer. Until the manifest lands (#501) this is the only way to render venn; after it, it
 * renders the plugin alone, with what the public API does not take (a model, an outline
 * drawer, a measurer).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { VennLayout } from '../layout/index.ts';
import type { VennModel } from '../model.ts';
import type { VennDocument } from '../parser/index.ts';
import { venn } from '../plugin.ts';

export interface RenderVennOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
}

export interface RenderedVenn {
  readonly svg: string;
  readonly model: VennModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: VennDocument;
  readonly layout: VennLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderVennForTest(
  input: string | VennModel,
  options: RenderVennOptions = {}
): Promise<RenderedVenn> {
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
    { warn, section: 'venn' }
  );
  const limits = resolveLimits(config);
  let model: VennModel;
  let ast: VennDocument | undefined;
  if (typeof input === 'string') {
    const parse = venn.parse(input, { config, preprocessed: pre!, limits });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`venn parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: venn.theme,
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
      throw new Error('venn lays itself out (layoutKind: custom)');
    },
    limits,
    warn,
  };
  const layout = venn.layout(model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  venn.render(model, layout, ctx, w);
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
