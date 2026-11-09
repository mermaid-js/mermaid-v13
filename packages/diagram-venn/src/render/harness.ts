/**
 * Test harness (`@mermaid-js/diagram-venn/testing`): renders a venn source or model through
 * the plugin's own seam, `parse` → `layout` → `render`, with the config, theme and render
 * context of the tests' one builder (`../test-context.ts`, as the pipeline builds them), and the
 * stream writer with the theme's gradient and an optional outline drawer. `createMermaid()`
 * renders venn through its registry row; this renders the plugin alone, with what the public API
 * does not take (a model, an outline drawer, a measurer) and gives back what it does not return
 * (the model, the AST, the layout).
 */
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import type { VennLayout } from '../layout/index.ts';
import type { VennModel } from '../model.ts';
import type { VennDocument } from '../parser/index.ts';
import { venn } from '../plugin.ts';
import { vennRenderContext, vennTestConfig, vennTestTheme } from '../test-context.ts';

export { TEST_VERSION } from '../test-context.ts';

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
  readonly config: ResolvedConfig;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderVennForTest(
  input: string | VennModel,
  options: RenderVennOptions = {}
): Promise<RenderedVenn> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = typeof input === 'string' ? preprocess(input) : undefined;
  const config = vennTestConfig(pre, options.config, warn);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  let model: VennModel;
  let ast: VennDocument | undefined;
  if (typeof input === 'string') {
    const parse = venn.parse(input, { config, preprocessed: pre!, limits: resolveLimits(config) });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`venn parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const theme = await vennTestTheme(config, warn, idPrefix);
  const ctx = vennRenderContext(config, theme, {
    ...(options.measurer ? { measurer: options.measurer } : {}),
    idPrefix,
    warn,
  });
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
