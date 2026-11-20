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
 *
 * c4-beta (spec #730 T7) is drawn the same way: `beta/layout.ts` lays it out on the engine's grid
 * and hands this hook the scene, in the same px-over-cells form. What it cannot show is dropped
 * with `ASCII_DROPPED`, as for legacy C4: the `style` colours and line, `accTitle` and
 * `accDescr`, and the legend, whose swatches key colours. Colours and fonts from the config and
 * the theme are ignored without a warning (D459), a cylinder is drawn as caps and a person as
 * a rounded box.
 */
import type { TextRenderContext } from '@mermaid-js/core';
import type { C4Layout } from './layout/index.ts';
import type { C4Model } from './model.ts';
import { isC4Beta, type C4BetaModel } from './beta/model.ts';
import { drawC4, ROUTE_BUDGET } from './ascii/draw.ts';
import { asciiWarnings, asciiWarningsBeta } from './ascii/warnings.ts';
import { glyphSetOf } from '@mermaid-js/shared/ascii';

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
export function ascii(model: C4Model | C4BetaModel, layout: C4Layout, ctx: C4AsciiContext): string {
  const glyphs = glyphSetOf(ctx.config);
  const warnings = isC4Beta(model)
    ? asciiWarningsBeta(model, layout)
    : asciiWarnings(model, layout);
  for (const w of warnings) ctx.warn(w);
  // R-SEC-5, D542: capped by the integrator's limit, as the SVG layout's budget is.
  const budget = Math.min(ROUTE_BUDGET, ctx.limits?.maxLayoutWork ?? Infinity);
  return drawC4(layout, glyphs, budget).text;
}
