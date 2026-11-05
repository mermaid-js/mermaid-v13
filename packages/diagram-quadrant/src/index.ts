/**
 * `@mermaid-js/diagram-quadrant`: the quadrant chart plugin (spec #289): the plugin export
 * (`quadrant`), the `QuadrantModel` contract, the lexer (#300), the parser (#301), the layout
 * (#332) and the renderer (#312). The `mermaid` manifest (#317) follows, so until then a caller
 * registers the plugin itself.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import type { QuadrantModel } from './model.ts';
import type { QuadrantLayout } from './layout/index.ts';

export type * from './model.ts';
export * from './parser/index.ts';
export { layoutQuadrant, quadrantLayoutViolations } from './layout/index.ts';
export type * from './layout/index.ts';
export { quadrantChartConfigDefaults } from './generated/config-defaults.ts';
export { quadrant } from './plugin.ts';
export { quadrantLabels } from './labels.ts';
export { renderQuadrant, type QuadrantRenderContext } from './render/index.ts';

/** The plugin's contract. */
export type QuadrantPlugin = DiagramPlugin<QuadrantModel, QuadrantLayout>;
