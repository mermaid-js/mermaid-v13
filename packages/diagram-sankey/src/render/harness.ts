/**
 * Test harness (`@mermaid-js/diagram-sankey/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the sankey plugin. Sankey has no theme
 * table; its renderer asks for user-space gradients, which the render's id prefix scopes (D391).
 */
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { SankeyLayout } from '../layout/index.ts';
import type { SankeyModel } from '../model.ts';
import type { SankeyDocument } from '../parser/index.ts';
import { sankey } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderSankeyOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'measurer' | 'tree'
>;

export type RenderedSankey = TestRender<SankeyModel, SankeyLayout, SankeyDocument>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderSankeyForTest: (
  input: string | SankeyModel,
  options?: RenderSankeyOptions
) => Promise<RenderedSankey> = createRenderHarness(sankey);
