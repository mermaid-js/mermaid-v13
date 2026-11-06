/**
 * The `::icon()` slot (D286, D291, D297, #328). With an extension that has glyphs (D293,
 * `RenderContext.icon`), the glyph named as `mindmapIconName` names the reference, 40 px square,
 * painted the label's slot colour (`cScaleLabel<section>`), centred on the slot. An icon the
 * extension reports unresolved (`null`) shows as written, and the extension warns; a placeholder
 * (`undefined`: its pack is still loading, D299) leaves the slot empty. With no such extension
 * every reference shows as written, with one `ICON_NOT_RENDERED` per render.
 */
import { translate, writeFragment, type Paint, type SvgWriter } from '@mermaid-js/core/svg';
import { mindmapIconName } from '../icons.ts';
import type { Point } from '@mermaid-js/core/layout';
import type { MindmapIconSlot } from '../layout/prepare.ts';
import type { MindmapRenderContext } from './context.ts';

export const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

/** Draws the icon `reference` in its slot centred at `at`: the glyph, or it as written. */
export function drawIcon(
  w: SvgWriter,
  ctx: MindmapRenderContext,
  reference: string,
  icon: MindmapIconSlot,
  at: Point,
  paint: Paint
): void {
  const { x, y } = at;
  const glyph = ctx.icon?.(mindmapIconName(reference), icon.glyph, { paint });
  if (glyph) {
    const half = icon.glyph / 2;
    w.open('g', { class: 'mindmap-icon', transform: translate(x - half, y - half) });
    writeFragment(w, glyph);
    w.close();
  } else if (glyph !== undefined || !ctx.icon) {
    w.label(icon.text, x, y, { class: 'mindmap-icon', fill: paint, 'font-size': icon.size });
  }
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
