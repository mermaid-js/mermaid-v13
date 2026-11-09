/**
 * Test harness (`@mermaid-js/diagram-ishikawa/testing`): renders an ishikawa source or model
 * through the plugin's own seam, `parse` → `layout` → `render`, with the config, theme and render
 * context of the tests' one builder (`../test-context.ts`, as the pipeline builds them), and the
 * stream writer with an optional outline drawer. Until the manifest lands (T5) `createMermaid()`
 * cannot render ishikawa; this renders the plugin alone, with what the public API does not take
 * (a model, an outline drawer, a measurer) and gives back what it does not return (the model,
 * the AST, the layout).
 */
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import type { IshikawaLayout } from '../layout/index.ts';
import type { IshikawaModel } from '../model.ts';
import type { IshikawaDocument } from '../parser/index.ts';
import { ishikawa } from '../plugin.ts';
import { ishikawaRenderContext, ishikawaTestConfig, ishikawaTestTheme } from '../test-context.ts';

export interface RenderIshikawaOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
}

export interface RenderedIshikawa {
  readonly svg: string;
  readonly model: IshikawaModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: IshikawaDocument;
  readonly layout: IshikawaLayout;
  readonly config: ResolvedConfig;
  readonly warnings: readonly Warning[];
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

/**
 * Renders `input` (a source, parsed with its front matter and directives, or a model); throws
 * `ishikawa parse error: …` for a source the parser rejects.
 */
export async function renderIshikawaForTest(
  input: string | IshikawaModel,
  options: RenderIshikawaOptions = {}
): Promise<RenderedIshikawa> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = typeof input === 'string' ? preprocess(input) : undefined;
  const config = ishikawaTestConfig(pre, options.config, warn);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  let model: IshikawaModel;
  let ast: IshikawaDocument | undefined;
  if (typeof input === 'string') {
    const parse = ishikawa.parse(input, {
      config,
      preprocessed: pre!,
      limits: resolveLimits(config),
    });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`ishikawa parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const theme = await ishikawaTestTheme(config, warn, idPrefix);
  const ctx = ishikawaRenderContext(config, theme, {
    ...(options.measurer ? { measurer: options.measurer } : {}),
    idPrefix,
    warn,
  });
  const layout = ishikawa.layout(model, ctx);
  // Ishikawa paints no gradient (D227): the writer gets none.
  const w = streamWriter({ outline: options.outline });
  ishikawa.render(model, layout, ctx, w);
  return {
    svg: w.finish(),
    model,
    ...(ast ? { ast } : {}),
    layout,
    config,
    warnings,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
