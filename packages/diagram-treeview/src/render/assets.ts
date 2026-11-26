/**
 * A row's icon (spec #518 T4, D485, D293, D299): `g.treeView-node-icon` at the icon's box (v12's
 * `translate(x + paddingX, y + paddingY)`), its `color` the icon paint. The built-in `file` and
 * `folder` glyphs are the package's own (`glyphs.ts`); every other name (`resolveIcon` already
 * qualified it, `pack:name`) is asked of the extensions' glyphs (`ctx.icon`), in the icon's
 * square, painted with the icon colour.
 *
 * An icon that cannot be drawn gets v12's unknown-icon glyph in its slot, the blue `?` square
 * v12 drew (D702): no icons extension, or none has the name (`undefined`), and treeView names it
 * in the render's one `ICON_NOT_RENDERED`; or an extension reported it unresolved (`null`) and
 * warned itself (D291). While its pack is still loading in a placeholder render (`'pending'`,
 * D299) the slot stays empty, quietly, so the `?` never shows for an icon that will be drawn.
 */
import {
  scale,
  transforms,
  translate,
  writeFragment,
  type Paint,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { UNKNOWN_ICON_SIZE, unknownIcon } from '@mermaid-js/shared/svg/unknown-icon';
import type { TreeViewIcon } from '../layout/index.ts';
import type { TreeViewRenderContext } from './context.ts';
import { builtinGlyph } from './glyphs.ts';

export const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

/** How many names the warning lists, and how long each may be (as mindmap's). */
const LISTED = 8;
const LONGEST = 60;

/**
 * Draws `icon` for the node `id` (none for the root row). False when it could not be drawn and no
 * extension warned about it, for {@link iconsNotRendered}.
 */
export function drawIcon(
  w: SvgWriter,
  ctx: TreeViewRenderContext,
  icon: TreeViewIcon,
  id: string | undefined,
  paint: Paint
): boolean {
  const { box, name } = icon;
  const builtin = builtinGlyph(name, box.width);
  const glyph = builtin ? undefined : ctx.icon?.(name, box.width, { paint, pending: true });
  if (glyph === 'pending') return true;
  w.open('g', {
    class: 'treeView-node-icon',
    'data-id': id,
    transform: translate(box.x, box.y),
    color: paint,
  });
  if (builtin) w.leaf('path', builtin);
  else if (glyph) writeFragment(w, glyph);
  else writeFragment(w, unknown(box.width));
  w.close();
  return builtin !== undefined || glyph !== undefined;
}

/** v12's unknown-icon glyph, drawn in its own square and scaled to the slot's `size`. */
function unknown(size: number) {
  const glyph = unknownIcon();
  return {
    ...glyph,
    attrs: { ...glyph.attrs, transform: transforms(scale(size / UNKNOWN_ICON_SIZE)) },
  };
}

/**
 * The render's one `ICON_NOT_RENDERED` for the icons that are not drawn and that no extension
 * warned about, through the inline providers' deduplicating `warn` (one per render, whoever
 * gives it).
 */
export function iconsNotRendered(ctx: TreeViewRenderContext, names: readonly string[]): void {
  const quoted = names
    .slice(0, LISTED)
    .map((n) => JSON.stringify(n.slice(0, LONGEST)))
    .join(', ');
  const more = names.length > LISTED ? ` and ${String(names.length - LISTED)} more` : '';
  const warning = {
    code: ICON_NOT_RENDERED,
    message: ctx.icon
      ? `Icons not rendered: ${quoted}${more}. No icons extension draws them; treeView draws only its own file and folder icons, and a "?" square in their place.`
      : `Icons are not rendered without an icons extension: ${quoted}${more}. TreeView draws only its own file and folder icons, and a "?" square in their place.`,
  };
  if (ctx.inline) ctx.inline.warn(warning);
  else ctx.warn(warning);
}
