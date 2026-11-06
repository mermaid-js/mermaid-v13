/**
 * What a kanban layout draws, as rectangles: the one list the layout's bounds and the
 * invariants' containment check both read.
 */
import type { KanbanLayout, Rect } from './types.ts';

/** Every drawn part's box, outlines included. */
export function drawnRects(layout: Pick<KanbanLayout, 'columns' | 'cards' | 'stroke'>): Rect[] {
  const half = layout.stroke / 2;
  const grown = (r: Rect): Rect => ({
    x: r.x - half,
    y: r.y - half,
    width: r.width + 2 * half,
    height: r.height + 2 * half,
  });
  const out: Rect[] = [];
  for (const c of layout.columns) {
    out.push(grown(c));
    if (c.title) out.push(c.title);
  }
  for (const k of layout.cards) {
    out.push(grown(k));
    for (const l of [k.title, k.ticket, k.assignee]) if (l) out.push(l);
    if (k.bar)
      out.push({
        x: k.bar.x - k.bar.width / 2,
        y: k.bar.y1,
        width: k.bar.width,
        height: k.bar.y2 - k.bar.y1,
      });
  }
  return out;
}

/** The smallest rectangle holding every one of `rects`; a zero box at the origin for none. */
export function union(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
