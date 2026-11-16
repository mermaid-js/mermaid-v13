/**
 * Test harness (`@mermaid-js/diagram-railroad/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the railroad plugin and its theme table,
 * with the parse's own warnings (`RAILROAD_DUPLICATE_RULE`) ahead of the render's.
 * `createMermaid()` renders railroad through the registry since #615.
 */
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { RailroadLayout } from '../layout/index.ts';
import type { RailroadModel } from '../model.ts';
import type { RailroadDocument } from '../parser/index.ts';
import { railroad } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderRailroadOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'measurer' | 'tree' | 'allowErrors'
>;

export type RenderedRailroad = TestRender<RailroadModel, RailroadLayout, RailroadDocument>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderRailroadForTest: (
  input: string | RailroadModel,
  options?: RenderRailroadOptions
) => Promise<RenderedRailroad> = createRenderHarness(railroad, {
  modelWarnings: (model) => model.warnings,
});
