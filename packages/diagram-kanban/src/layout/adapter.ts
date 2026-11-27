/**
 * `KanbanModel` → `KanbanLayoutInput` (spec #424 T3): the drawn part of T2's model. Columns in
 * source order with their cards by position (D373); labels, tickets and assignees as the model
 * holds them (entities as written, core's label layout decodes them), a label the model marks
 * as a markdown string with its `markdown` mark, so the layout reads it as one (D712, #1368);
 * `priority` only when it was a YAML string (`priorityKind: 'other'` draws no bar,
 * D375). Icons, classes and a column's metadata are not drawn (D376).
 */
import type { KanbanItem, KanbanModel } from '../model.ts';
import type { KanbanLayoutCard, KanbanLayoutInput } from './input.ts';

/** The item's label, and its mark when it was written as a markdown string (D712). */
const labelOf = (item: KanbanItem): { title: string; markdown?: true } =>
  item.markdown ? { title: item.label, markdown: true } : { title: item.label };

function cardOf(item: KanbanItem): KanbanLayoutCard {
  return {
    ast: item.ast,
    ...labelOf(item),
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
    columns.push({ ast: item.ast, ...labelOf(item), cards });
  }
  return { columns };
}
