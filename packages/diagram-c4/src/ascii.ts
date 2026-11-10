/**
 * The C4 diagram's text output (#545, D459, D320), a separate lazily loaded entry
 * (`@mermaid-js/diagram-c4/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws the SVG's grid on a character grid: the layout the API ran with the cell profile
 * (`layout/cells.ts`: px, every text measured in cells of 8 × 16 px) divided by the cell size.
 * Elements are boxes with their name, `[Kind]` and description, boundaries dashed frames with
 * their label in the top border, relations stepped lines along the routed points with their
 * label at the middle and arrowheads. Config colours and fonts are ignored without a warning
 * (D459); a drawing wider than `ascii.maxWidth` is not folded: the API adds `ASCII_TOO_WIDE`.
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, cellMeasurer, unicode } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import { layoutC4, type C4Layout } from './layout/index.ts';
import type { C4Model } from './model.ts';
import { drawC4 } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';

export type { AsciiDroppedFeature, AsciiDroppedWarning, AsciiWarning } from './ascii/warnings.ts';

/** What the hook reads of core's `TextRenderContext`. */
export type C4AsciiContext = Pick<TextRenderContext, 'config' | 'measurer' | 'theme' | 'warn'> &
  Partial<Pick<TextRenderContext, 'inline' | 'limits'>>;

/** Lays a diagram out for the grid: the cell measurer and the cell profile (`ascii.padding`). */
function layoutAscii(model: C4Model, ctx: C4AsciiContext): C4Layout {
  const { padding } = asciiOptions(ctx.config);
  return layoutC4(model, { ...ctx, measurer: cellMeasurer, units: cellProfile(padding) });
}

/**
 * The C4 `ascii` hook (DESIGN §12.1): the diagram as text, `\n` line ends, no trailing spaces,
 * never cropped. Warns once per feature kind it drops (D82). A layout not laid out for the grid
 * (no `cell`) is redone with `layoutAscii`.
 */
export function ascii(model: C4Model, layout: C4Layout, ctx: C4AsciiContext): string {
  const laid = layout.cell ? layout : layoutAscii(model, ctx);
  const glyphs = asciiOptions(ctx.config).charset === 'ascii' ? asciiGlyphs : unicode;
  for (const w of asciiWarnings(model, laid)) ctx.warn(w);
  return drawC4(laid, glyphs).text;
}
