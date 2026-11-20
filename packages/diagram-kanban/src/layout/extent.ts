/**
 * What a kanban layout draws, as rectangles: the one list the layout's bounds and the
 * invariants' containment check both read.
 */
import type { KanbanLayout, Rect } from './types.ts';
import { growRect, unionRects } from '@mermaid-js/shared/layout';

/** Every drawn part's box, outlines included. */
export function drawnRects(layout: Pick<KanbanLayout, 'columns' | 'cards' | 'stroke'>): Rect[] {
  const halfStroke = layout.stroke / 2;
  const out: Rect[] = [];
  for (const column of layout.columns) {
    out.push(growRect(column, halfStroke));
    if (column.title) out.push(column.title);
  }
  for (const card of layout.cards) {
    out.push(growRect(card, halfStroke));
    for (const label of [card.title, card.ticket, card.assignee]) if (label) out.push(label);
    if (card.bar)
      out.push({
        x: card.bar.x - card.bar.width / 2,
        y: card.bar.y1,
        width: card.bar.width,
        height: card.bar.y2 - card.bar.y1,
      });
  }
  return out;
}

export { unionRects as union };
