/**
 * The v13 side of kanban parity: the kanban parser and the normaliser from its `KanbanModel` to
 * the {@link KanbanSnapshot} that `v12.ts` takes from mermaid\@12's DB: each column, then its
 * cards by position (D373), and a priority that is not a string by its value.
 */
import { detectKanban, parseKanban } from '@mermaid-js/diagram-kanban';
import { kanbanBoardOrder } from '@mermaid-js/diagram-kanban/testing';
import type { KanbanItem, KanbanModel } from '@mermaid-js/diagram-kanban';
import { parseYaml } from '@mermaid-js/core/preprocess';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { KANBAN_V12_TYPES, kanbanV12Snapshot } from './v12.ts';
import type { KanbanItemSnapshot, KanbanSnapshot } from './v12.ts';

/**
 * A priority by value, as `v12.ts` writes v12's: a string as it is, any other value's YAML text
 * read back and written as JSON (so the two sides compare values, not the same text).
 */
function priorityValue(n: KanbanItem): string | null {
  if (n.priority === undefined) return null;
  if (n.priorityKind !== 'other') return n.priority;
  const read = parseYaml(n.priority);
  return read.diagnostics.length > 0 ? `unreadable ${n.priority}` : JSON.stringify(read.value);
}

const snapshot = (n: KanbanItem): KanbanItemSnapshot => ({
  column: n.isColumn,
  id: n.id,
  label: n.label,
  level: n.level,
  parentId: n.parentId ?? null,
  ticket: n.ticket ?? null,
  assigned: n.assigned ?? null,
  priority: priorityValue(n),
  icon: n.icon ?? null,
  classes: n.isColumn ? [...n.classes] : null,
});

export function kanbanV13Snapshot(model: KanbanModel): KanbanSnapshot {
  return { nodes: kanbanBoardOrder(model).map(snapshot) };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export const parseKanbanForParity = (text: string): KanbanModel =>
  parseForParity(text, parseKanban);

export const kanbanAdapter: DiagramAdapter<KanbanModel> = {
  id: 'kanban',
  v12Types: KANBAN_V12_TYPES,
  detect: (text) => detectKanban(text),
  parse: parseKanbanForParity,
  normaliseV13: kanbanV13Snapshot,
  normaliseV12: kanbanV12Snapshot,
};
