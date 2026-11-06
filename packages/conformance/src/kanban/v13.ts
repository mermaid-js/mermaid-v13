/**
 * The v13 side of kanban parity: the kanban parser and the normaliser from its `KanbanModel` to
 * the {@link KanbanSnapshot} that `v12.ts` takes from mermaid\@12's DB: each column, then its
 * cards by position (D373).
 */
import { detectKanban, parseKanban } from '@mermaid-js/diagram-kanban';
import type { KanbanItem, KanbanModel } from '@mermaid-js/diagram-kanban';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { KANBAN_V12_TYPES, kanbanV12Snapshot } from './v12.ts';
import type { KanbanItemSnapshot, KanbanSnapshot } from './v12.ts';

const snapshot = (n: KanbanItem): KanbanItemSnapshot => ({
  column: n.isColumn,
  id: n.id,
  label: n.label,
  level: n.level,
  parentId: n.parentId ?? null,
  ticket: n.ticket ?? null,
  assigned: n.assigned ?? null,
  priority: n.priority ?? null,
  icon: n.icon ?? null,
  classes: n.isColumn ? [...n.classes] : null,
});

export function kanbanV13Snapshot(model: KanbanModel): KanbanSnapshot {
  const nodes: KanbanItemSnapshot[] = [];
  for (const column of model.columns) {
    for (const k of [column.item, ...column.cards]) {
      const item = model.items[k];
      if (item) nodes.push(snapshot(item));
    }
  }
  return { nodes };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseKanbanForParity(text: string): KanbanModel {
  const pre = preprocess(text);
  const result = parseKanban(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const kanbanAdapter: DiagramAdapter<KanbanModel> = {
  id: 'kanban',
  v12Types: KANBAN_V12_TYPES,
  detect: (text) => detectKanban(text),
  parse: parseKanbanForParity,
  normaliseV13: kanbanV13Snapshot,
  normaliseV12: kanbanV12Snapshot,
};
