/**
 * The extents of what a treeView layout draws, which its bounds cover (D224). The invariants
 * work them out on their own (`invariants.ts`), so a missed extent here fails them.
 */
import { TREEVIEW_METRICS as M } from './metrics.ts';
import type { Rect, TreeViewLine, TreeViewRow, TreeViewText } from './types.ts';

/** The extent of `r` grown by `by` on every side (a stroke's outer half). */
function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

/** A text's extent: `width` from its `x`, `height` around its `y`. */
function textBox(t: TreeViewText): Rect {
  return { x: t.x, y: t.y - t.height / 2, width: t.width, height: t.height };
}

/** A line's extent with its stroke (butt caps: `thickness` across it, none past its ends). */
export function lineBox(l: TreeViewLine, thickness: number): Rect {
  const half = thickness / 2;
  const x = Math.min(l.x1, l.x2);
  const y = Math.min(l.y1, l.y2);
  return l.y1 === l.y2
    ? { x, y: y - half, width: Math.abs(l.x2 - l.x1), height: thickness }
    : { x: x - half, y, width: thickness, height: Math.abs(l.y2 - l.y1) };
}

/** What a row draws: its label, icon, description and highlight box (with its stroke). */
export function rowExtents(r: TreeViewRow): Rect[] {
  const out = [textBox(r.label)];
  if (r.icon) out.push(r.icon.box);
  if (r.description) out.push(textBox(r.description));
  if (r.highlight) out.push(grow(r.highlight.box, M.highlightStroke / 2));
  return out;
}
