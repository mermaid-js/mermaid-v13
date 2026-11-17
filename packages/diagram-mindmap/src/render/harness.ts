/**
 * Test harness (`@mermaid-js/diagram-mindmap/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the mindmap plugin, laid out with core's
 * `tree` or the engine given. It parses with `parseMindmap` and the config's `colorBy` alone,
 * without the plugin's node and depth limits, and keeps each warning's code and message only.
 */
import type { Warning } from '@mermaid-js/core';
import { tree } from '@mermaid-js/core/layout/tree';
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { MindmapLayout } from '../layout/layout.ts';
import type { MindmapModel } from '../model.ts';
import { parseMindmap, type MindmapDocument } from '../parser/index.ts';
import { mindmap } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderMindmapOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'engine' | 'outline' | 'measurer' | 'icon' | 'iconPacks'
>;

export type RenderedMindmap = TestRender<MindmapModel, MindmapLayout, MindmapDocument>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderMindmapForTest: (
  input: string | MindmapModel,
  options?: RenderMindmapOptions
) => Promise<RenderedMindmap> = createRenderHarness(mindmap, {
  engine: tree,
  parse: (text, { config, preprocessed }) =>
    parseMindmap(text, {
      preprocessed,
      colorBy: config.mindmap?.colorBy === 'depth' ? 'depth' : 'branch',
    }),
  warning: (w): Warning => ({ code: w.code, message: w.message }),
});
