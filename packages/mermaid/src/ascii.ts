/**
 * The text backend's share of `core/ascii` (DESIGN §6.3): the `ascii` section resolver, the cell
 * measurer the layout runs with and the cell width that sizes `TextRenderResult.columns`. `api.ts` imports this module
 * lazily, only for `format: 'ascii'`, so an SVG render never loads the kit (R-ASCII-9, D87).
 */
export { asciiOptions, cellMeasurer, cellWidth } from '@mermaid-js/core/ascii';
