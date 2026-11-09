/**
 * Test harness (`@mermaid-js/diagram-usecase/testing`, as kanban's and venn's): renders a
 * usecase source or model through the plugin's own seam, `parse` → `layout` → `render`, with the
 * config, theme and render context of the tests' one builder (`../test-context.ts`, as the
 * pipeline builds them), and the stream writer with the theme's gradient and an optional outline
 * drawer. Until T5's manifest the public API does not render usecase; this renders the plugin
 * alone, with what the API does not take (a model, an outline drawer, a measurer, an engine, an
 * icon lookup) and gives back what it does not return (the model, the AST, the layout).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import type { UsecaseLayout } from '../layout/layout.ts';
import type { UsecaseModel } from '../model.ts';
import type { UsecaseDocument } from '../parser/index.ts';
import { usecase } from '../plugin.ts';
import { usecaseRenderContext, usecaseTestConfig, usecaseTestTheme } from '../test-context.ts';

export interface RenderUsecaseOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
  /** The layout engine `layout` config would pick; core's `layered` when left out. */
  readonly engine?: LayoutEngine;
  /** The extensions' glyphs (D293), as an icons extension gives them. */
  readonly icon?: RenderContext['icon'];
}

export interface RenderedUsecase {
  readonly svg: string;
  readonly model: UsecaseModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: UsecaseDocument;
  readonly layout: UsecaseLayout;
  readonly config: ResolvedConfig;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderUsecaseForTest(
  input: string | UsecaseModel,
  options: RenderUsecaseOptions = {}
): Promise<RenderedUsecase> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = typeof input === 'string' ? preprocess(input) : undefined;
  const config = usecaseTestConfig(pre, options.config, warn);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  let model: UsecaseModel;
  let ast: UsecaseDocument | undefined;
  if (typeof input === 'string') {
    const parse = usecase.parse(input, {
      config,
      preprocessed: pre!,
      limits: resolveLimits(config),
    });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`usecase parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const theme = await usecaseTestTheme(config, warn, idPrefix);
  const ctx = usecaseRenderContext(config, theme, {
    ...(options.measurer ? { measurer: options.measurer } : {}),
    ...(options.engine ? { engine: options.engine } : {}),
    ...(options.icon ? { icon: options.icon } : {}),
    idPrefix,
    warn,
  });
  const layout = usecase.layout(model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  usecase.render(model, layout, ctx, w);
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
