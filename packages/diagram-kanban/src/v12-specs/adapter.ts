/**
 * Test-only adapter for the ported v12 kanban spec (R-TEST-3): v12's `kanban.jison` parser and
 * its kanban DB, backed by the v13 parse. The spec's expectations are kept as v12 wrote them;
 * this file only translates names and shapes:
 *
 * - `kanban.parse(text)` throws on an error diagnostic, as v12 threw on a syntax error and its
 *   DB on a misplaced indent, else hands the model to `kanban.yy`;
 * - `kanbanDB.getSections()` returns the columns as v12's nodes (`id`, `label`, `level`,
 *   `cssClasses` as one string, `icon`, `ticket`, `assigned`, `priority` as v12's YAML value);
 * - `kanbanDB.getData()` returns each column, then its cards (by position, D373), with
 *   `parentId` and the fields v12's `getData` kept.
 */
import { parseKanban } from '../parser/index.ts';
import type { KanbanItem, KanbanModel } from '../model.ts';

/** A node of v12's `getSections()` and `getData()`, the fields the spec reads. */
export interface KanbanNode {
  id: string;
  parentId?: string;
  label: string;
  level: number;
  isGroup: boolean;
  cssClasses?: string;
  icon?: string;
  ticket?: string;
  assigned?: string;
  priority?: unknown;
}

/** v12's raw `priority`: v13 keeps a non-string as its JSON text. */
const priorityOf = (n: KanbanItem): unknown =>
  n.priorityKind === 'other' && n.priority !== undefined ? JSON.parse(n.priority) : n.priority;

function v12Node(n: KanbanItem): KanbanNode {
  const node: KanbanNode = { id: n.id, label: n.label, level: n.level, isGroup: n.isColumn };
  if (n.parentId !== undefined) node.parentId = n.parentId;
  if (n.classes.length > 0) node.cssClasses = n.classes.join(' ');
  if (n.icon !== undefined) node.icon = n.icon;
  if (n.ticket !== undefined) node.ticket = n.ticket;
  if (n.assigned !== undefined) node.assigned = n.assigned;
  if (n.priority !== undefined) node.priority = priorityOf(n);
  return node;
}

class KanbanDB {
  model: KanbanModel | undefined;

  clear(): void {
    this.model = undefined;
  }

  getSections(): KanbanNode[] {
    const m = this.model;
    if (!m) return [];
    return m.columns.flatMap((c) => {
      const item = m.items[c.item];
      return item ? [v12Node(item)] : [];
    });
  }

  getData(): { nodes: KanbanNode[]; edges: [] } {
    const m = this.model;
    const nodes: KanbanNode[] = [];
    for (const c of m?.columns ?? []) {
      for (const k of [c.item, ...c.cards]) {
        const item = m?.items[k];
        if (item) nodes.push(v12Node(item));
      }
    }
    return { nodes, edges: [] };
  }
}

export const kanbanDB = new KanbanDB();

export const kanban = {
  yy: undefined as KanbanDB | undefined,
  parse(text: string): void {
    const result = parseKanban(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    if (this.yy) this.yy.model = result.model;
  },
};

/** v12's logger switch: v13 parses without a logger. */
export function setLogLevel(): void {
  // Nothing to set.
}
