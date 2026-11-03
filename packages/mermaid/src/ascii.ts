/**
 * The text backend's share of `core/ascii` (DESIGN §6.3): the cell measurer the layout runs
 * with and the cell width that sizes `TextRenderResult.columns`. `api.ts` imports this module
 * lazily, only for `format: 'ascii'`, so an SVG render never loads the kit (R-ASCII-9, D87).
 */
export { cellMeasurer, cellWidth } from '@mermaid-js/core/ascii';
