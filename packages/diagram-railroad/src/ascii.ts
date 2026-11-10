// cspell:words nonterminals
/**
 * The railroad diagram's text output (spec #526 T7, #617, D518, D320), a separate lazily loaded
 * entry (`@mermaid-js/diagram-railroad/ascii`, manifest key `ascii`) so SVG renders never load
 * it.
 *
 * It draws the same `RailroadLayout` the SVG renderer draws, laid out by the plugin with the cell
 * measurer and the cell profile (the layout's cell tables, `RAILROAD_CELL_METRICS` and
 * `RAILROAD_CELL_LENGTHS`), so the text follows the SVG geometry at cell scale: `─` track, `╭╮╰╯`
 * corners, `┬┴├┤` where branches leave and join, choices centred, the bypass above and the loop
 * below, rounded terminals, square nonterminals, dotted specials and `●` markers. Repeats show no
 * count, as SVG shows none, and the title is not drawn (D218). A diagram wider than
 * `ascii.maxWidth` is drawn whole; the API adds `ASCII_TOO_WIDE` (R-ASCII-8).
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, cellMeasurer, unicode } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import { railroadSection } from './config.ts';
import { layoutRailroad, type RailroadLayout } from './layout/index.ts';
import type { RailroadModel } from './model.ts';
import { drawRailroad } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';

export type { AsciiDroppedFeature, AsciiDroppedWarning } from './ascii/warnings.ts';

/**
 * The railroad `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no trailing
 * spaces, never cropped. A layout not in cells (a caller outside the pipeline) is redone with
 * the cell measurer and profile. Warns once per feature kind it drops (D82).
 */
export function ascii(
  model: RailroadModel,
  layout: RailroadLayout | undefined,
  ctx: TextRenderContext
): string {
  const { charset, padding } = asciiOptions(ctx.config);
  const laid =
    layout?.units === 'cell'
      ? layout
      : layoutRailroad(model, { ...ctx, measurer: cellMeasurer, units: cellProfile(padding) });
  for (const w of asciiWarnings(model, railroadSection(ctx), ctx.ast)) ctx.warn(w);
  return drawRailroad(laid, charset === 'ascii' ? asciiGlyphs : unicode);
}
