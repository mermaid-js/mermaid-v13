/**
 * `@mermaid-js/diagram-xychart/testing`: what the conformance gates read and a render never does
 * (as radar's): the layout invariants, the legend component (for the ported v12 legend spec), the
 * test context, the render harness, and the d3
 * re-implementations for the d3 parity spec. They live outside the runtime entry, so the chunk
 * mermaid loads for an XY chart render stays small (D217).
 */
export { configNumber } from './config.ts';
export { xyChartLayoutViolations } from './layout/invariants.ts';
export { Legend as XyChartLegend } from './layout/legend.ts';
export { bandScale, linePath, linearScale, ticks } from './layout/scale.ts';
export {
  renderXyChartForTest,
  TEST_VERSION,
  XYCHART_PARSE_ERROR,
  type RenderedXyChart,
  type RenderXyChartOptions,
} from './render/harness.ts';
export { xyChartTestContext, xyChartTestTheme } from './test-context.ts';
