/**
 * `KanbanModel` → `KanbanLayoutInput` (spec #424 T3's input, `layout/input.ts`): the part of the
 * model that is drawn. Columns in source order, each with its cards by position (D373); a card's
 * `priority` only when the model holds a string (`priorityKind: 'other'` passes none, D375).
 * Icons, classes and a column's metadata are not drawn (D376).
 *
 * Interim: T3's part 2 adds this adapter under `layout/`; the renderer switches to it then.
 */
import type { KanbanLayoutCard, KanbanLayoutInput } from '../layout/index.ts';
import type { KanbanItem, KanbanModel } from '../model.ts';

const cardOf = (item: KanbanItem): KanbanLayoutCard => ({
  ast: item.ast,
  title: item.label,
  ...(item.ticket === undefined ? {} : { ticket: item.ticket }),
  ...(item.assigned === undefined ? {} : { assigned: item.assigned }),
  ...(item.priority !== undefined && item.priorityKind !== 'other'
    ? { priority: item.priority }
    : {}),
});

export function kanbanLayoutInput(model: KanbanModel): KanbanLayoutInput {
  return {
    columns: model.columns.map((c) => {
      const item = model.items[c.item]!;
      return {
        ast: item.ast,
        title: item.label,
        cards: c.cards.map((k) => cardOf(model.items[k]!)),
      };
    }),
  };
}
