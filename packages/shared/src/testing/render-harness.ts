/**
 * The render harness a diagram's tests use: a source or a model through the plugin's own seam,
 * `parse` → `layout` → `render`, with the config, theme and render context the pipeline would
 * build (`./test-context.ts`) and the stream writer (or the tree writer) with the theme's
 * gradient, the render's id prefix and an optional outline drawer (D302), as
 * `core/src/pipeline/draw.ts` sets them up. `mermaid` renders a diagram through the registry;
 * this renders the plugin alone, with what the public API does not take (a model, a measurer, an
 * engine, an outline drawer, the writer backing) and gives back what it does not return (the
 * model, the AST, the layout). Each diagram package's `render/harness.ts` is one call to
 * {@link createRenderHarness} (#817). Workspace-only, as `./test-context.ts`.
 */
import type { DiagramParseContext, RenderContext, Warning } from '@mermaid-js/core';
import type { ConfigInput, ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  streamWriter,
  treeWriter,
  type OutlineDraw,
  type SvgTree,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import {
  selfLaidOut,
  testConfig,
  testRenderContext,
  testTheme,
  TEST_ID_PREFIX,
} from './test-context.ts';

/** What a harness needs of a plugin: its id and table, its parse, layout and render. */
export interface HarnessPlugin<M, L, A> {
  readonly id: string;
  readonly theme?: DiagramThemeTable;
  parse(
    text: string,
    ctx: DiagramParseContext
  ): { readonly model: M; readonly ast: A; readonly diagnostics: readonly Diagnostic[] };
  layout?(model: M, ctx: RenderContext): L;
  render(model: M, layout: L, ctx: RenderContext, w: SvgWriter): void;
}

/** What a test render takes; each package's harness picks the options it supports. */
export interface TestRenderOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  readonly measurer?: Measurer;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  /** Draw with the tree writer, as the pipeline does when a hook runs, and return its tree. */
  readonly tree?: boolean;
  /** Draw a source the parser rejects instead of throwing. */
  readonly allowErrors?: boolean;
  /** The layout engine of a graph diagram; the harness's default when absent. */
  readonly engine?: LayoutEngine;
  /** The resolved security level; `default` when absent. */
  readonly securityLevel?: RenderContext['securityLevel'];
  /** The integrator's link schemes (`RenderContext.linkSchemes`). */
  readonly linkSchemes?: readonly string[];
  readonly icon?: RenderContext['icon'];
  readonly iconPacks?: RenderContext['iconPacks'];
  readonly inline?: RenderContext['inline'];
  /** `output.cssVariables`; core's default when absent. */
  readonly cssVariables?: boolean;
}

/** A test render's result. */
export interface TestRender<M, L, A> {
  readonly svg: string;
  readonly model: M;
  /** The parse's AST, when the input was a source. */
  readonly ast?: A;
  readonly layout: L;
  readonly config: ResolvedConfig;
  /** The warnings of the render (the parse's warnings stay in the model or its diagnostics). */
  readonly warnings: readonly Warning[];
  /** Whether the parser rejected the source (only with errors allowed). */
  readonly rejected: boolean;
  /** The render's D182 gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
  /** With `tree: true`, the drawing as a tree. */
  readonly tree?: SvgTree;
}

/** How a package's harness differs from the plugin's own seam; each is optional. */
export interface HarnessSpec<M, A> {
  /** The config section; the plugin's id by default. */
  readonly section?: string;
  /** The parse; the plugin's by default (a package may parse without the limits). */
  readonly parse?: (
    text: string,
    ctx: DiagramParseContext
  ) => { readonly model: M; readonly ast: A; readonly diagnostics: readonly Diagnostic[] };
  /** A graph diagram's default engine, called with the config; none for a custom layout. */
  readonly engine?: LayoutEngine;
  /** The config layer under the integrator's (the plugin's engine, D284). */
  readonly below?: ConfigInput;
  /** Draw a rejected source by default instead of throwing. */
  readonly allowErrors?: boolean;
  /** False when the diagram paints no gradient and its writer gets none (ishikawa, D227). */
  readonly gradient?: boolean;
  /** What each warning is kept as; the warning itself by default. */
  readonly warning?: (w: Warning) => Warning;
  /** The model's own warnings, added to the render's after the parse (railroad). */
  readonly modelWarnings?: (model: M) => readonly Warning[];
}

/** A test render of a source, which always has its AST. */
export type SourceRender<M, L, A> = TestRender<M, L, A> & { readonly ast: A };

/** A package's `render<Type>ForTest`: a source (with its front matter and directives) or a model. */
export type RenderForTest<M, L, A> = (
  input: string | M,
  options?: TestRenderOptions
) => Promise<TestRender<M, L, A>>;

interface Parsed<M, A> {
  readonly model: M;
  readonly ast?: A;
  readonly rejected: boolean;
}

function parsed<M, L, A>(
  plugin: HarnessPlugin<M, L, A>,
  spec: HarnessSpec<M, A>,
  input: string | M,
  ctx: DiagramParseContext | undefined,
  allowErrors: boolean
): Parsed<M, A> {
  if (typeof input !== 'string' || !ctx) return { model: input as M, rejected: false };
  const parse = (spec.parse ?? plugin.parse.bind(plugin))(input, ctx);
  const error = parse.diagnostics.find((d) => d.severity === 'error');
  if (error && !allowErrors) throw new Error(`${plugin.id} parse error: ${error.message}`);
  return { model: parse.model, ast: parse.ast, rejected: error !== undefined };
}

/** The render harness of `plugin`, with what `spec` changes. */
export function createRenderHarness<M, L, A>(
  plugin: HarnessPlugin<M, L, A>,
  spec: HarnessSpec<M, A> = {}
): RenderForTest<M, L, A> {
  const section = spec.section ?? plugin.id;
  return async (input, options = {}) => {
    const warnings: Warning[] = [];
    const keep = spec.warning ?? ((w: Warning) => w);
    const warn = (w: Warning): void => void warnings.push(keep(w));
    const pre = typeof input === 'string' ? preprocess(input) : undefined;
    const config = testConfig(section, pre, options.config, warn, spec.below);
    const limits = resolveLimits(config);
    const { model, ast, rejected } = parsed(
      plugin,
      spec,
      input,
      pre && { config, preprocessed: pre, limits },
      options.allowErrors ?? spec.allowErrors ?? false
    );
    if (ast !== undefined && spec.modelWarnings) warnings.push(...spec.modelWarnings(model));
    const idPrefix = options.idPrefix ?? TEST_ID_PREFIX;
    const theme = await testTheme(config, {
      diagram: plugin.theme,
      idPrefix,
      warn,
      ...(options.cssVariables === undefined ? {} : { cssVariables: options.cssVariables }),
    });
    const engine = options.engine ?? spec.engine;
    const ctx = testRenderContext(config, theme, {
      ...options,
      idPrefix,
      warn,
      layout: engine ? (graph) => engine(graph, { config }) : selfLaidOut(plugin.id),
    });
    const layout = plugin.layout ? plugin.layout(model, ctx) : (undefined as L);
    const gradient = spec.gradient === false ? undefined : theme.gradient();
    const writer = { gradient, idPrefix: () => idPrefix, outline: options.outline };
    const tree = options.tree ? treeWriter(writer) : undefined;
    const w = tree ?? streamWriter(writer);
    plugin.render(model, layout, ctx, w);
    return {
      svg: w.finish(),
      model,
      ...(ast === undefined ? {} : { ast }),
      layout,
      config,
      warnings,
      rejected,
      gradient: gradient?.id ?? false,
      themeStyle: theme.autoDeclarations() !== undefined,
      ...(tree ? { tree: tree.tree } : {}),
    };
  };
}

/** {@link createRenderHarness} for a diagram whose tests render sources only: the AST is always there. */
export const createSourceHarness = <M, L, A>(
  plugin: HarnessPlugin<M, L, A>,
  spec: HarnessSpec<M, A> = {}
): ((source: string, options?: TestRenderOptions) => Promise<SourceRender<M, L, A>>) =>
  // A source is always parsed, so the result carries the parse's AST.
  createRenderHarness(plugin, spec) as (
    source: string,
    options?: TestRenderOptions
  ) => Promise<SourceRender<M, L, A>>;
