/**
 * The `::icon()` slot (D286, D291, D297, #328). A reference in a D297 form is asked for as a glyph
 * (D293, `RenderContext.icon`) by the name `mindmapIconName` gives it, 40 px square, painted as
 * the node's label, centred on the slot. Shown as written instead: a reference in no D297 form,
 * one an extension reports unresolved (`null`: that extension warns, D291), and one no extension
 * has a glyph for (`undefined`) unless its pack is still loading (D299: a placeholder, the slot
 * left empty). Each one shown as written that no extension warned about joins the render's one
 * `ICON_NOT_RENDERED`.
 */
import type { Point } from '@mermaid-js/core/layout';
import { translate, writeFragment, type Paint, type SvgWriter } from '@mermaid-js/core/svg';
import { mindmapIconName } from '../icons.ts';
import type { MindmapIconSlot } from '../layout/prepare.ts';
import type { MindmapRenderContext } from './context.ts';

export const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

/** How many references the warning names, and how long each may be (as flowchart's alias). */
const LISTED = 8;
const LONGEST = 60;

/**
 * Draws the icon `reference` in its slot centred at `at`: the glyph, nothing (its pack is
 * loading) or it as written. True when it is shown as written and no extension warned about it.
 */
export function drawIcon(
  w: SvgWriter,
  ctx: MindmapRenderContext,
  reference: string,
  icon: MindmapIconSlot,
  at: Point,
  paint: Paint
): boolean {
  const name = mindmapIconName(reference);
  const glyph = name === undefined ? undefined : ctx.icon?.(name, icon.glyph, { paint });
  if (glyph) {
    const half = icon.glyph / 2;
    w.open('g', { class: 'mindmap-icon', transform: translate(at.x - half, at.y - half) });
    writeFragment(w, glyph);
    w.close();
    return false;
  }
  // `undefined` is a placeholder only while the API knows the pack is loading (D294, D299).
  const pack = name?.slice(0, name.indexOf(':'));
  if (glyph === undefined && pack && ctx.icon && ctx.iconPacks?.state(pack) === 'pending')
    return false;
  w.label(icon.text, at.x, at.y, { class: 'mindmap-icon', fill: paint, 'font-size': icon.size });
  return glyph !== null;
}

/**
 * The render's one `ICON_NOT_RENDERED` for the references shown as written that no extension
 * warned about, through the inline providers' deduplicating `warn` (one per render, whoever
 * gives it).
 */
export function iconsNotRendered(ctx: MindmapRenderContext, references: readonly string[]): void {
  const quoted = references
    .slice(0, LISTED)
    .map((r) => JSON.stringify(r.trim().slice(0, LONGEST)))
    .join(', ');
  const more = references.length > LISTED ? ` and ${String(references.length - LISTED)} more` : '';
  const warning = {
    code: ICON_NOT_RENDERED,
    message: ctx.icon
      ? `Icons not rendered: ${quoted}${more}. Mindmap ::icon() references no icons extension draws, or not written as pack:name or "<pack> <pack>-<name>", are shown as written.`
      : 'Icons are not rendered without an icons extension: mindmap ::icon() references are shown as written.',
  };
  if (ctx.inline) ctx.inline.warn(warning);
  else ctx.warn(warning);
}
