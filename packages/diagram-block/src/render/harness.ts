/**
 * Test harness (`@mermaid-js/diagram-block/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the block plugin and its theme table. A
 * source the parser rejects is still drawn (the model of what parsed), with `rejected` set, as
 * the pipeline would not. The package's own renderer specs use it to read what the public API
 * does not return (the layout beside the SVG); the conformance gates render through
 * `createMermaid()`.
 */
import {
  createSourceHarness,
  type SourceRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { BlockLayout } from '../layout/types.ts';
import type { BlockModel } from '../model.ts';
import type { BlockDocument } from '../parser/index.ts';
import { block } from '../plugin.ts';

export type RenderBlockOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'outline' | 'measurer'
>;

export type RenderedBlock = SourceRender<BlockModel, BlockLayout, BlockDocument>;

/** Renders `source`, parsed with its front matter and directives. */
export const renderBlockForTest: (
  source: string,
  options?: RenderBlockOptions
) => Promise<RenderedBlock> = createSourceHarness(block, { allowErrors: true });
