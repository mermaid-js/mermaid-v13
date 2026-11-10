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
import { ascii as asciiGlyphs, asciiOptions, unicode } from '@mermaid-js/core/ascii';
import type { C4Layout } from './layout/index.ts';
import type { C4Model } from './model.ts';
import { drawC4, ROUTE_BUDGET } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';
import { glyphSetOf } from '@mermaid-js/core/ascii';

export type { AsciiDroppedFeature, AsciiDroppedWarning, AsciiWarning } from './ascii/warnings.ts';

/** What the hook reads of core's `TextRenderContext`. */
export type C4AsciiContext = Pick<TextRenderContext, 'config' | 'warn'> &
  Partial<Pick<TextRenderContext, 'limits'>>;

/**
 * The C4 `ascii` hook (DESIGN §12.1): the diagram as text, `\n` line ends, no trailing spaces,
 * never cropped. Warns once per feature kind it drops (D82). The API hands it the layout it ran
 * on the cell profile; a layout laid out in px (no `cell`) is drawn as it is, read at the cell
 * profile's 8 × 16 px a cell, its text cut to its boxes. The entry does not import the layout,
 * so the SVG chunk is not split for it.
 */
export function ascii(model: C4Model, layout: C4Layout, ctx: C4AsciiContext): string {
  const glyphs = glyphSetOf(ctx.config);
  for (const w of asciiWarnings(model, layout)) ctx.warn(w);
  // R-SEC-5, D542: capped by the integrator's limit, as the SVG layout's budget is.
  const budget = Math.min(ROUTE_BUDGET, ctx.limits?.maxLayoutWork ?? Infinity);
  return drawC4(layout, glyphs, budget).text;
}
