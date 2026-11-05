/**
 * `@mermaid-js/diagram-quadrant`: the quadrant chart plugin (spec #289). So far it holds the
 * `QuadrantModel` contract and the layout (#332); the parser (#301), renderer (#312) and the
 * plugin with its `mermaid` manifest (#317) follow, so the package registers nothing yet.
 */
export type * from './model.ts';
export { layoutQuadrant, quadrantLayoutViolations } from './layout/index.ts';
export type * from './layout/index.ts';
export { quadrantChartConfigDefaults } from './generated/config-defaults.ts';
