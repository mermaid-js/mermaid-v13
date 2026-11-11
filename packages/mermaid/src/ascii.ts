/**
 * The text backend's share of `core/ascii` (DESIGN §6.3): the `ascii` section resolver, the cell
 * measurer the layout runs with and the cell width that sizes `TextRenderResult.columns`. `api.ts` imports this module
 * lazily, only for `format: 'ascii'`, so an SVG render never loads the kit (R-ASCII-9, D87).
 */
import { cellWidth } from '@mermaid-js/core/ascii';
import type { BlockText } from './embeds.ts';

export { asciiOptions, cellMeasurer, cellWidth } from '@mermaid-js/core/ascii';

/**
 * Text output of block `id` whose type has none (ADR-15): its type in brackets, which the
 * host frames with the block's title, and one warning; the host's text output still succeeds.
 */
export function blockStandIn(type: string, id: string): BlockText {
  const text = `[${type}]`;
  return {
    text,
    columns: cellWidth(text),
    rows: 1,
    warnings: [
      {
        code: 'ASCII_DROPPED',
        feature: 'embed',
        message: `Block "${id}" is a ${type}, which has no text output; it is drawn as a frame with its type.`,
      },
    ],
  };
}
