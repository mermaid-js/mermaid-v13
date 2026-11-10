/**
 * The block diagram's text output (spec #521 T7, #559, D449, D320), a separate lazily loaded
 * entry (`@mermaid-js/diagram-block/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws from `BlockModel`, not from the px layout: text has its own grid (`ascii/grid.ts`),
 * one cell width per column at the widest label, so `block.padding` (px) is ignored with no
 * warning (D449). Composites are frames, spaces blank, labels cut with `…`, block arrows boxes
 * with an arrowhead per pointing side, edges stepped lines with arrowheads (`ascii/route.ts`).
 */
import type { BlockModel } from './model.ts';
import { drawBlockText, type BlockAsciiContext } from './ascii/text.ts';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiRouteWarning,
  AsciiShapeWarning,
  AsciiWarning,
} from './ascii/warnings.ts';
export type { BlockAsciiContext } from './ascii/text.ts';

/**
 * The block `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no trailing
 * spaces, never cropped (an `ASCII_TOO_WIDE` warning is the API's, R-ASCII-8). The px layout is
 * not read. Warns once per feature kind it drops (D82).
 */
export function ascii(model: BlockModel, _layout: unknown, ctx: BlockAsciiContext): string {
  const { text, warnings } = drawBlockText(model, ctx);
  for (const w of warnings) ctx.warn(w);
  return text;
}
