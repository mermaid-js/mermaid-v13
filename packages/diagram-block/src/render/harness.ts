/**
 * Test harness (`@mermaid-js/diagram-block/testing`): renders a block source through the
 * plugin's own seam, `parse` → `layout` → `render`, with the config, theme and render context of
 * the tests' one builder (`../test-context.ts`, as the pipeline builds them), and the stream
 * writer with the theme's gradient and an optional outline drawer. The package's own renderer
 * specs use it to read what the public API does not return (the layout beside the SVG); the
 * conformance gates render through `createMermaid()`.
 */
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import type { BlockLayout } from '../layout/types.ts';
import type { BlockModel } from '../model.ts';
import type { BlockDocument } from '../parser/index.ts';
import { block } from '../plugin.ts';
import { blockTestConfig, blockTestTheme, TEST_VERSION } from '../test-context.ts';

export interface RenderBlockOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
}

export interface RenderedBlock {
  readonly svg: string;
  readonly model: BlockModel;
  readonly ast: BlockDocument;
  readonly layout: BlockLayout;
  readonly config: ResolvedConfig;
  readonly warnings: readonly Warning[];
  /** Whether the parse had an error (the model of what parsed is drawn, as the pipeline would not). */
  readonly rejected: boolean;
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

/** Renders `source`, parsed with its front matter and directives. */
export async function renderBlockForTest(
  source: string,
  options: RenderBlockOptions = {}
): Promise<RenderedBlock> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = preprocess(source);
  const config = blockTestConfig(pre, options.config, warn);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const limits = resolveLimits(config);
  const parse = block.parse(source, { config, preprocessed: pre, limits });
  const theme = await blockTestTheme(config, { idPrefix, warn });
  const ctx = {
    config,
    measurer: options.measurer ?? tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: 'default' as const,
    idPrefix,
    version: TEST_VERSION,
    layout: () => {
      throw new Error('block lays itself out (layoutKind: custom)');
    },
    limits,
    warn,
  };
  const layout = block.layout(parse.model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  block.render(parse.model, layout, ctx, w);
  return {
    svg: w.finish(),
    model: parse.model,
    ast: parse.ast,
    layout,
    config,
    warnings,
    rejected: parse.diagnostics.some((d) => d.severity === 'error'),
    gradient: gradient?.id ?? false,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
