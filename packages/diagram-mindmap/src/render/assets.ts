/**
 * The `::icon()` reference (D286, D291, D297). The glyph is the icons extension's (#328); until
 * it draws one, the reference shows as written in the icon's slot, in the label's slot colour,
 * with one `ICON_NOT_RENDERED` per render.
 */
import type { Paint, SvgWriter } from '@mermaid-js/core/svg';
import type { MindmapIconSlot } from '../layout/prepare.ts';
import type { MindmapRenderContext } from './context.ts';

export const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

/** Draws the reference as written, centred on the slot at (`x`, `y`). */
export function drawIconReference(
  w: SvgWriter,
  icon: MindmapIconSlot,
  x: number,
  y: number,
  fill: Paint
): void {
  w.label(icon.text, x, y, { class: 'mindmap-icon', fill, 'font-size': icon.size });
}

/** The render's one `ICON_NOT_RENDERED`, through the inline providers' deduplicating `warn`. */
export function iconsNotRendered(ctx: MindmapRenderContext): void {
  const warning = {
    code: ICON_NOT_RENDERED,
    message:
      'Icons are not rendered without an icons extension: mindmap ::icon() references are shown as written.',
  };
  if (ctx.inline) ctx.inline.warn(warning);
  else ctx.warn(warning);
}
