/**
 * Test-only (not built, not exported): the plugin's own parse → layout → render entries with the
 * config the public pipeline builds (core defaults under `state.configDefaults`, as
 * `mermaid/src/config-snapshot.ts` passes them), the deterministic table measurer, `layered`,
 * and the tree-backed writer, so the package's specs can query the views. Cross-package specs
 * render through `createMermaid()` instead (`packages/conformance/src/state/render.spec.ts`).
 */
import type { DiagramPlugin, RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { layered, pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, treeWriter, type SvgTree } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { CompleteStateLayout } from './layout/index.ts';
import type { StateParseResult } from './parser/index.ts';
import { state } from './plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = state;

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
  warnings: Warning[];
  parse: StateParseResult;
  layout: CompleteStateLayout;
  config: ResolvedConfig;
}

export const TEST_VERSION = '13.0.0-alpha.0';

export async function renderForTest(
  text: string,
  options: RenderForTestOptions = {}
): Promise<RenderedForTest> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push({ code: w.code, message: w.message });
  const pre = preprocess(text);
  const directives = pre.directives
    .filter((d) => d.kind === 'init' && d.args !== null && typeof d.args === 'object')
    .map((d) => d.args as Record<string, unknown>);
  const config = resolveConfig(
    CORE_DEFAULTS,
    options.config,
    pre.frontMatter?.config,
    directives,
    { state: state.configDefaults },
    { warn, section: 'state' }
  );
  const limits = resolveLimits(config);
  const parse = state.parse(text, { config, preprocessed: pre, limits });
  const errors = parse.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`parse failed: ${errors[0]!.message}`);
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    diagram: diagramTheme,
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    warn,
  });
  const ctx: RenderContext = {
    config,
    measurer: tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix: options.idPrefix ?? 'mermaid-0',
    version: TEST_VERSION,
    layout: (g) => layered(g),
    limits,
    warn,
  };
  const layout = state.layout(parse.model, ctx);
  if (options.stream) {
    const w = streamWriter();
    state.render(parse.model, layout, ctx, w);
    return { svg: w.finish(), tree: treeWriter().tree, warnings, parse, layout, config };
  }
  const w = treeWriter();
  state.render(parse.model, layout, ctx, w);
  return { svg: w.finish(), tree: w.tree, warnings, parse, layout, config };
}
