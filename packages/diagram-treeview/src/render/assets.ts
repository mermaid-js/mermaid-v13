/**
 * A row's icon (spec #518 T4, D485, D293, D299): `g.treeView-node-icon` at the icon's box (v12's
 * `translate(x + paddingX, y + paddingY)`), its `color` the icon paint. The built-in `file` and
 * `folder` glyphs are the package's own (`glyphs.ts`); every other name (`resolveIcon` already
 * qualified it, `pack:name`) is asked of the extensions' glyphs (`ctx.icon`), in the icon's
 * square, painted with the icon colour.
 *
 * Not drawn, the slot stays empty (the layout keeps its width, as v12 kept it for its unknown
 * icon): no icons extension, or none has the name (`undefined`), and treeView names it in the
 * render's one `ICON_NOT_RENDERED`; an extension reported it unresolved (`null`) and warned
 * itself (D291); or its pack is still loading in a placeholder render (`'pending'`, D299),
 * quietly.
 */
import { translate, writeFragment, type Paint, type SvgWriter } from '@mermaid-js/core/svg';
import type { TreeViewIcon } from '../layout/index.ts';
import type { TreeViewRenderContext } from './context.ts';
import { builtinGlyph } from './glyphs.ts';

export const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

/** How many names the warning lists, and how long each may be (as mindmap's). */
const LISTED = 8;
const LONGEST = 60;

/**
 * Draws `icon` for the node `id` (none for the root row). False when it is not drawn and no
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
  if (!builtin && (glyph === undefined || glyph === null || glyph === 'pending'))
    return glyph !== undefined;
  w.open('g', {
    class: 'treeView-node-icon',
    'data-id': id,
    transform: translate(box.x, box.y),
    color: paint,
  });
  if (builtin) w.leaf('path', builtin);
  else if (glyph && glyph !== 'pending') writeFragment(w, glyph);
  w.close();
  return true;
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
      ? `Icons not rendered: ${quoted}${more}. No icons extension draws them; treeView draws only its own file and folder icons, and leaves the slot empty.`
      : `Icons are not rendered without an icons extension: ${quoted}${more}. TreeView draws only its own file and folder icons, and leaves the slot empty.`,
  };
  if (ctx.inline) ctx.inline.warn(warning);
  else ctx.warn(warning);
}
