/**
 * `@mermaid-js/diagram-xychart/testing`: what the conformance gates read and a render never does
 * (as radar's): the layout invariants, the test context, and the d3 re-implementations for the d3
 * parity spec. They live outside the runtime entry, so the chunk mermaid loads for an XY chart
 * render stays small (D217).
 */
export { xyChartLayoutViolations } from './layout/invariants.ts';
export { bandScale, linePath, linearScale, ticks } from './layout/scale.ts';
export { xyChartTestContext, xyChartTestTheme } from './test-context.ts';
