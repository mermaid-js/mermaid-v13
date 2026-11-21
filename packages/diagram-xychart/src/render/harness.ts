/**
 * Test harness (`@mermaid-js/diagram-xychart/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the XY chart plugin, its theme table and
 * its `xyChart` config section. `mermaid` renders the XY chart through the registry.
 */
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import { XYCHART_SECTION } from '../config.ts';
import type { XyChartLayout } from '../layout/index.ts';
import type { XyChartModel } from '../model.ts';
import type { XyChartDocument } from '../parser/index.ts';
import { xychart } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderXyChartOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'measurer' | 'cssVariables'
>;

export type RenderedXyChart = TestRender<XyChartModel, XyChartLayout, XyChartDocument>;

/** The message a source's first parse error throws with. */
export const XYCHART_PARSE_ERROR = `${xychart.id} parse error`;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderXyChartForTest: (
  input: string | XyChartModel,
  options?: RenderXyChartOptions
) => Promise<RenderedXyChart> = createRenderHarness(xychart, { section: XYCHART_SECTION });
