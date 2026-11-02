/**
 * A minimal parse → layout → render pipeline for tests, until the public `render()` (#15)
 * replaces it: preprocess, resolveConfig, parse, theme, deterministic table measurer,
 * `layered`, and the tree-backed writer (byte-identical to the stream writer) so tests can
 * query the result.
 */
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import {
  asLimitError,
  checkOutput,
  checkSource,
  isLimitCode,
  LIMIT_CODES,
  LimitError,
  resolveLimits,
  type LimitName,
  type Limits,
} from '@mermaid-js/core/limits';
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
  /** Integrator limits (R-SEC-5), over v12's `maxTextSize`/`maxEdges` in `config`. */
  readonly limits?: Partial<Limits>;
}

export interface RenderedForTest {
  svg: string;
  /** The tree the writer built (empty when `stream` is set). */
  tree: SvgTree;
  warnings: FlowWarning[];
  parse: FlowParseResult;
  layout: FlowLayout;
  config: ResolvedConfig;
  limits: Readonly<Limits>;
}

const LIMIT_NAMES = new Map(
  (Object.entries(LIMIT_CODES) as [LimitName, string][]).map(([name, code]) => [code, name])
);

export const TEST_VERSION = '13.0.0-alpha.0';

export async function renderForTest(
  text: string,
  options: RenderForTestOptions = {}
): Promise<RenderedForTest> {
  const warnings: FlowWarning[] = [];
  const warn = (w: FlowWarning): void => void warnings.push({ code: w.code, message: w.message });
  // Limits come from the integrator alone, and the source check runs before any reading.
  const limits = resolveLimits(
    options.config as { maxTextSize?: number; maxEdges?: number } | undefined,
    options.limits
  );
  checkSource(text, limits);
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
    maxEdges: limits.maxEdges,
    maxNodes: limits.maxNodes,
    maxDepth: limits.maxDepth,
    inheritDir: config.flowchart?.inheritDir,
  });
  const errors = parse.diagnostics.filter((d) => d.severity === 'error');
  // A breached limit is reported as such even when other errors come first (#15: same rule).
  const breach = errors.find((d) => isLimitCode(d.code));
  if (breach) {
    const name = LIMIT_NAMES.get(breach.code)!;
    throw new LimitError(name, limits[name], undefined, breach.message);
  }
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
    limits,
    idPrefix: options.idPrefix ?? 'mermaid-0',
    version: TEST_VERSION,
  };
  // A stack overflow in a recursive stage is a depth limit, not a crash (#15: same rule).
  try {
    const layout = layoutFlowchart(parse.model, ctx);
    const tw = options.stream ? undefined : treeWriter();
    const w = tw ?? streamWriter();
    renderFlowchart(parse.model, layout, ctx, w);
    const svg = w.finish();
    checkOutput(svg, limits);
    const tree = (tw ?? treeWriter()).tree;
    return { svg, tree, warnings, parse, layout, config, limits };
  } catch (error) {
    throw asLimitError(error) ?? error;
  }
}
