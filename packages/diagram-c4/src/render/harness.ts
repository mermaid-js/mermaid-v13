/**
 * Test harness (`@mermaid-js/diagram-c4/testing`): renders a C4 source through the plugin's own
 * seam, `parse` → `layout` → `render`, with a render context built as the pipeline builds one
 * (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): the config of the tests' one
 * builder (`c4TestConfig`: core's defaults, the integrator's config, the source's front matter
 * and directives), the theme with the plugin's table, its `themeVariables` and its dark half for
 * `theme: 'auto'`, the table measurer, and the stream writer with the theme's gradient and an
 * optional outline drawer. C4 has no registry row until its manifest (#542), so
 * `createMermaid()` cannot draw it yet; this renders the plugin alone and gives back what the
 * public API does not return (the model, the AST, the layout).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { Limits } from '@mermaid-js/core/limits';
import type { AstNode, ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { C4BetaDocument } from '../beta/ast.ts';
import type { C4BetaModel } from '../beta/model.ts';
import { parseC4Beta } from '../beta/parser.ts';
import type { C4Layout } from '../layout/types.ts';
import type { C4Model } from '../model.ts';
import { parseC4, type C4Document } from '../parser/index.ts';
import { c4, type C4AnyModel } from '../plugin.ts';
import { c4TestConfig } from '../test-context.ts';

export interface RenderC4Options {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, `c4`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
}

export interface RenderedC4 {
  readonly svg: string;
  readonly model: C4Model;
  readonly ast: C4Document;
  readonly layout: C4Layout;
  readonly config: ResolvedConfig;
  readonly warnings: readonly Warning[];
  /** Whether the parse had an error (what parsed is drawn, as the pipeline would not). */
  readonly rejected: boolean;
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

/**
 * The version the harness writes as `data-mermaid-version`. Not exported: no spec reads it, and the
 * built `./testing` entry cannot import `package.json` (its `rootDir` is `src`).
 */
const TEST_VERSION = '13.0.0-alpha.0';

/** The seam both kinds share: the drawn document and what the public API does not return. */
interface Drawn<M extends C4AnyModel, A extends AstNode> {
  readonly svg: string;
  readonly parse: ParseResult<M, A>;
  readonly layout: C4Layout;
  readonly config: ResolvedConfig;
  readonly warnings: readonly Warning[];
  readonly gradient: string | false;
  readonly themeStyle: boolean;
}

/** What a render gives back besides the model and AST. */
function summary<M extends C4AnyModel, A extends AstNode>(
  d: Drawn<M, A>
): Omit<RenderedC4, 'model' | 'ast'> {
  return {
    svg: d.svg,
    layout: d.layout,
    config: d.config,
    warnings: d.warnings,
    rejected: d.parse.diagnostics.some((x) => x.severity === 'error'),
    gradient: d.gradient,
    themeStyle: d.themeStyle,
  };
}

/** Renders `source`, parsed with its front matter and directives. */
export async function renderC4ForTest(
  source: string,
  options: RenderC4Options = {}
): Promise<RenderedC4> {
  const d = await drawParsed(source, options, (pre, limits) =>
    parseC4(source, { preprocessed: pre, ...limits })
  );
  return { ...summary(d), model: d.parse.model, ast: d.parse.ast };
}

/** What {@link renderC4BetaForTest} gives back: {@link RenderedC4}'s, for a c4-beta source. */
export interface RenderedC4Beta extends Omit<RenderedC4, 'model' | 'ast'> {
  readonly model: C4BetaModel;
  readonly ast: C4BetaDocument;
}

/** Renders a `c4-beta` `source` through the plugin's seam, as {@link renderC4ForTest}. */
export async function renderC4BetaForTest(
  source: string,
  options: RenderC4Options = {}
): Promise<RenderedC4Beta> {
  const d = await drawParsed(source, options, (pre, limits) =>
    parseC4Beta(source, { preprocessed: pre, ...limits })
  );
  return { ...summary(d), model: d.parse.model, ast: d.parse.ast };
}

/** The limits `parse` takes: the three caps. */
type ParseLimits = Pick<Limits, 'maxNodes' | 'maxEdges' | 'maxDepth'>;

async function drawParsed<M extends C4AnyModel, A extends AstNode>(
  source: string,
  options: RenderC4Options,
  parseWith: (pre: PreprocessResult, limits: ParseLimits) => ParseResult<M, A>
): Promise<Drawn<M, A>> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = preprocess(source);
  const config = c4TestConfig(pre, options.config);
  const limits = resolveLimits(config);
  const parse = parseWith(pre, limits);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: c4.theme,
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
      throw new Error('c4 lays itself out (layoutKind: custom)');
    },
    limits,
    warn,
  };
  const layout = c4.layout(parse.model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  c4.render(parse.model, layout, ctx, w);
  return {
    svg: w.finish(),
    parse,
    layout,
    config,
    warnings,
    gradient: gradient?.id ?? false,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
