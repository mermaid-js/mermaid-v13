/**
 * Test harness (`@mermaid-js/diagram-c4/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the c4 plugin and its theme table, with the
 * plugin's `configDefaults` as the config layer under the integrator's. The one plugin parses
 * both kinds by the header; each harness here parses one kind (`parseC4` or `parseC4Beta`, with
 * the render's limits), so its result has that kind's model and AST, and c4-beta resolves the
 * `c4beta` section over `c4` (D534). A source the parser rejects is still drawn (the model of
 * what parsed), with `rejected` set, as the pipeline would not.
 */
import type { DiagramParseContext } from '@mermaid-js/core';
import type { AstNode, ParseResult } from '@mermaid-js/core/parser-kit';
import {
  createSourceHarness,
  type HarnessPlugin,
  type HarnessSpec,
  type SourceRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { C4BetaDocument } from '../beta/ast.ts';
import type { C4BetaModel } from '../beta/model.ts';
import { parseC4Beta } from '../beta/parser.ts';
import type { C4Layout } from '../layout/types.ts';
import type { C4Model } from '../model.ts';
import { parseC4, type C4Document } from '../parser/index.ts';
import { c4, type C4AnyModel } from '../plugin.ts';
import { C4_BETA_SECTION, C4_PLUGIN_DEFAULTS } from '../test-context.ts';

export type RenderC4Options = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'outline' | 'measurer'
>;

export type RenderedC4 = SourceRender<C4Model, C4Layout, C4Document>;

/** What {@link renderC4BetaForTest} gives back: {@link RenderedC4}'s, for a c4-beta source. */
export type RenderedC4Beta = SourceRender<C4BetaModel, C4Layout, C4BetaDocument>;

/** The c4 plugin parsing one kind of source with `parse`. */
function harnessOf<M extends C4AnyModel, A extends AstNode>(
  parse: (
    text: string,
    options: { preprocessed: DiagramParseContext['preprocessed'] }
  ) => ParseResult<M, A>,
  spec: HarnessSpec<M, A> = {}
): (source: string, options?: RenderC4Options) => Promise<SourceRender<M, C4Layout, A>> {
  const plugin: HarnessPlugin<M, C4Layout, A> = {
    ...c4,
    parse: (text, ctx) => parse(text, { preprocessed: ctx.preprocessed, ...ctx.limits }),
  };
  return createSourceHarness(plugin, { below: C4_PLUGIN_DEFAULTS, allowErrors: true, ...spec });
}

/** Renders `source`, parsed with its front matter and directives. */
export const renderC4ForTest: (source: string, options?: RenderC4Options) => Promise<RenderedC4> =
  harnessOf(parseC4);

/** Renders a `c4-beta` `source` through the plugin's seam, as {@link renderC4ForTest}. */
export const renderC4BetaForTest: (
  source: string,
  options?: RenderC4Options
) => Promise<RenderedC4Beta> = harnessOf(parseC4Beta, { section: C4_BETA_SECTION });
