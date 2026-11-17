/**
 * Test harness (`@mermaid-js/diagram-venn/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the venn plugin and its theme table.
 * `createMermaid()` renders venn through its registry row.
 */
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { VennLayout } from '../layout/index.ts';
import type { VennModel } from '../model.ts';
import type { VennDocument } from '../parser/index.ts';
import { venn } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderVennOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'outline' | 'measurer'
>;

export type RenderedVenn = TestRender<VennModel, VennLayout, VennDocument>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderVennForTest: (
  input: string | VennModel,
  options?: RenderVennOptions
) => Promise<RenderedVenn> = createRenderHarness(venn);
