/**
 * Test harness (`@mermaid-js/diagram-railroad/testing`, as venn's): renders a railroad source
 * or model through the plugin's own seam, `parse` → `layout` → `render`, with the config, theme
 * and render context the pipeline would build (`../test-context.ts`), and the stream writer.
 * Until T5 (#615) adds the manifest, `createMermaid()` reports railroad as unsupported; this
 * renders the plugin alone, and gives back what the public API does not return (the model, the
 * AST, the layout).
 */
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, treeWriter, type SvgTree } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import type { RailroadLayout } from '../layout/index.ts';
import type { RailroadModel } from '../model.ts';
import type { RailroadDocument } from '../parser/index.ts';
import { railroad } from '../plugin.ts';
import { railroadRenderContext, railroadTestConfig, railroadTestTheme } from '../test-context.ts';

export { TEST_VERSION } from '../test-context.ts';

export interface RenderRailroadOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, `railroad`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  readonly measurer?: Measurer;
  /** Also draw into a tree writer and return its tree (the same layout, drawn twice). */
  readonly tree?: boolean;
  /** Render a source whose parse has errors (the rules that parsed), as the language service would. */
  readonly allowErrors?: boolean;
}

export interface RenderedRailroad {
  readonly svg: string;
  readonly model: RailroadModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: RailroadDocument;
  readonly layout: RailroadLayout;
  /** With `tree: true`, the drawing as a tree. */
  readonly tree?: SvgTree;
  readonly config: ResolvedConfig;
  /** The parse's warnings (`RAILROAD_DUPLICATE_RULE`) and the render's. */
  readonly warnings: readonly Warning[];
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderRailroadForTest(
  input: string | RailroadModel,
  options: RenderRailroadOptions = {}
): Promise<RenderedRailroad> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = typeof input === 'string' ? preprocess(input) : undefined;
  const config = railroadTestConfig(pre, options.config, warn);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  let model: RailroadModel;
  let ast: RailroadDocument | undefined;
  if (typeof input === 'string') {
    const parse = railroad.parse(input, {
      config,
      preprocessed: pre!,
      limits: resolveLimits(config),
    });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error && !options.allowErrors) throw new Error(`railroad parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
    warnings.push(...model.warnings);
  } else model = input;
  const theme = await railroadTestTheme(config, warn, idPrefix);
  const ctx = railroadRenderContext(config, theme, {
    ...(options.measurer ? { measurer: options.measurer } : {}),
    idPrefix,
    warn,
  });
  const layout = railroad.layout(model, ctx);
  const w = streamWriter({ gradient: theme.gradient() });
  railroad.render(model, layout, ctx, w);
  const svg = w.finish();
  let tree: SvgTree | undefined;
  if (options.tree) {
    const t = treeWriter({ gradient: theme.gradient() });
    railroad.render(model, layout, { ...ctx, warn: () => undefined }, t);
    t.finish();
    tree = t.tree;
  }
  return {
    svg,
    ...(tree ? { tree } : {}),
    model,
    ...(ast ? { ast } : {}),
    layout,
    config,
    warnings,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
