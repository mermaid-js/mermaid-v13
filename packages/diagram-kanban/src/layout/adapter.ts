/**
 * `KanbanModel` → `KanbanLayoutInput` (spec #424 T3): the drawn part of T2's model. Columns in
 * source order with their cards by position (D373); labels as the parser gives them (raw, every
 * one markdown: core's label layout decodes the entities); `ticket` and `assigned` as the strings
 * the model keeps; `priority` only when it was a YAML string (`priorityKind: 'other'` draws no
 * bar, D375). Icons, classes and a column's metadata are not drawn (D376).
 */
import type { KanbanItem, KanbanModel } from '../model.ts';
import type { KanbanLayoutCard, KanbanLayoutInput } from './input.ts';

function cardOf(item: KanbanItem): KanbanLayoutCard {
  return {
    ast: item.ast,
    title: item.label,
    ...(item.ticket === undefined ? {} : { ticket: item.ticket }),
    ...(item.assigned === undefined ? {} : { assigned: item.assigned }),
    ...(item.priority !== undefined && item.priorityKind !== 'other'
      ? { priority: item.priority }
      : {}),
  };
}

export function kanbanLayoutInput(model: KanbanModel): KanbanLayoutInput {
  const columns: KanbanLayoutInput['columns'][number][] = [];
  for (const column of model.columns) {
    const item = model.items[column.item];
    if (!item) continue;
    const cards: KanbanLayoutCard[] = [];
    for (const k of column.cards) {
      const card = model.items[k];
      if (card) cards.push(cardOf(card));
    }
    columns.push({ ast: item.ast, title: item.label, cards });
  }
  return { columns };
}
