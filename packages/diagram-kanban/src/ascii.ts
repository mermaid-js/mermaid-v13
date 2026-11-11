/**
 * The kanban board's text output (#466, D320, DESIGN §6.3), a separate lazily loaded entry
 * (`@mermaid-js/diagram-kanban/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws the same `KanbanLayout` the SVG renderer draws, computed with the cell measurer and
 * the cell profile (the layout's cell metrics, `KANBAN_CELL_METRICS`), with core's text-grid
 * kit: columns side by side, `sectionWidth` in cells wide, each with its cards stacked inside.
 * A board wider than `ascii.maxWidth` is not folded; the API adds `ASCII_TOO_WIDE` (D84).
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, cellMeasurer, unicode } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import { kanbanLayoutInput, layoutKanban, type KanbanLayout } from './layout/index.ts';
import type { KanbanModel } from './model.ts';
import { priorityWarning } from './render/priority.ts';
import { drawKanban } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';
import { glyphSetOf } from '@mermaid-js/shared/ascii';

export type { AsciiDroppedFeature, AsciiDroppedWarning, AsciiWarning } from './ascii/warnings.ts';

/**
 * Lays a board out in cells: the cell measurer and the cell profile (`ascii.padding`), whatever
 * `ctx` carries.
 */
function layoutAscii(model: KanbanModel, ctx: TextRenderContext): KanbanLayout {
  const { padding } = asciiOptions(ctx.config);
  return layoutKanban(kanbanLayoutInput(model), {
    ...ctx,
    measurer: cellMeasurer,
    units: cellProfile(padding),
  });
}

/**
 * The kanban `ascii` hook (DESIGN §12.1): the board as text, `\n` line ends, no trailing spaces.
 * Warns as the SVG renderer does for a priority it does not draw (`KANBAN_PRIORITY`, D375), and
 * once per feature kind it drops (D82). A layout not in cells is redone with `layoutAscii`.
 */
export function ascii(model: KanbanModel, layout: KanbanLayout, ctx: TextRenderContext): string {
  const laid = layout.units === 'cell' ? layout : layoutAscii(model, ctx);
  const glyphs = glyphSetOf(ctx.config);
  // The cards the layout placed, in its order, as the SVG renderer checks them.
  const items = new Map(model.items.map((item) => [item.ast, item]));
  const priority = priorityWarning(laid.cards.flatMap((c) => items.get(c.ast) ?? []));
  if (priority) ctx.warn(priority);
  for (const w of asciiWarnings(model, laid, ctx)) ctx.warn(w);
  return drawKanban(laid, glyphs);
}
