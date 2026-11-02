/**
 * A minimal parse → layout → render pipeline for tests, until the public `render()` (#15)
 * replaces it: preprocess, resolveConfig, parse, theme, deterministic table measurer,
 * `layered`, and the tree-backed writer (byte-identical to the stream writer) so tests can
 * query the result.
 */
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, treeWriter, type SvgTree } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import { flowchartConfigDefaults } from './generated/config-defaults.ts';
import { parseFlowchart, type FlowParseResult } from './parser/index.ts';
import type { FlowRenderContext, FlowWarning } from './render/context.ts';
import { layoutFlowchart, renderFlowchart, type FlowLayout } from './render/render.ts';

export interface RenderForTestOptions {
  /** Integrator config, as `initialize()` would get it. */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** Write through the streaming writer instead of the tree (for backing checks). */
  readonly stream?: boolean;
}

export interface RenderedForTest {
  svg: string;
  /** The tree the writer built (empty when `stream` is set). */
  tree: SvgTree;
  warnings: FlowWarning[];
  parse: FlowParseResult;
  layout: FlowLayout;
  config: ResolvedConfig;
}

export const TEST_VERSION = '13.0.0-alpha.0';

export async function renderForTest(
  text: string,
  options: RenderForTestOptions = {}
): Promise<RenderedForTest> {
  const warnings: FlowWarning[] = [];
  const warn = (w: FlowWarning): void => void warnings.push({ code: w.code, message: w.message });
  const pre = preprocess(text);
  const directives = pre.directives
    .filter((d) => d.kind === 'init' && d.args !== null && typeof d.args === 'object')
    .map((d) => d.args as Record<string, unknown>);
  const config = resolveConfig(
    CORE_DEFAULTS,
    options.config,
    pre.frontMatter?.config,
    directives,
    { flowchart: flowchartConfigDefaults },
    { warn, section: 'flowchart' }
  );
  const parse = parseFlowchart(text, {
    preprocessed: pre,
    maxEdges: config.maxEdges,
    inheritDir: config.flowchart?.inheritDir,
  });
  const errors = parse.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`parse failed: ${errors[0]!.message}`);
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    warn,
  });
  const ctx: FlowRenderContext = {
    config,
    measurer: tableMeasurer,
    theme,
    warn,
    idPrefix: options.idPrefix ?? 'mermaid-0',
    version: TEST_VERSION,
  };
  const layout = layoutFlowchart(parse.model, ctx);
  if (options.stream) {
    const w = streamWriter();
    renderFlowchart(parse.model, layout, ctx, w);
    return { svg: w.finish(), tree: treeWriter().tree, warnings, parse, layout, config };
  }
  const w = treeWriter();
  renderFlowchart(parse.model, layout, ctx, w);
  return { svg: w.finish(), tree: w.tree, warnings, parse, layout, config };
}
