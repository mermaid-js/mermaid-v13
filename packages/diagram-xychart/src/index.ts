/**
 * `@mermaid-js/diagram-xychart`: the XY chart plugin (spec #426) with its theme table, the
 * `XyChartModel` contract, the lexer (#507), the parser (#508), the custom layout (#509) and the
 * SVG renderer (#510). The manifest lands with T5 (#513). The layout invariants, the test
 * context and the render harness, which only tests read, are at `./testing`.
 */
export { xychart } from './plugin.ts';
export { renderXyChart, type XyChartRenderContext } from './render/index.ts';
export type * from './model.ts';
export * from './parser/index.ts';
export * from './layout/index.ts';
export { xyChartOptions, type XyChartAxisOptions, type XyChartOptions } from './config.ts';
