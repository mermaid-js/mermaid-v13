/** The priority warning (D375): what the renderer checks over the cards it drew. */
import type { Warning } from '@mermaid-js/core';
import type { KanbanItem } from '../model.ts';

export const KANBAN_PRIORITY = 'KANBAN_PRIORITY';

/** The characters of a value the warning shows (a non-string priority can be a long list). */
const SHOWN = 60;

/** The values v12 accepts without a bar (`Medium`) or with one (D375). Case-sensitive. */
const KNOWN: ReadonlySet<string> = new Set(['Very High', 'High', 'Medium', 'Low', 'Very Low']);

/**
 * One `KANBAN_PRIORITY` per render (D375, as D226) naming each card priority that is none of
 * `Very High`, `High`, `Medium`, `Low` and `Very Low`, once, in board order. A value that is not
 * a YAML string (`priorityKind: 'other'`) is never one of them and is named as written.
 * A column's priority is not drawn and not checked (D376).
 */
export function priorityWarning(cards: readonly KanbanItem[]): Warning | undefined {
  const values = new Map<string, string[]>();
  for (const card of cards) {
    const p = card.priority;
    if (p === undefined || (card.priorityKind !== 'other' && KNOWN.has(p))) continue;
    let ids = values.get(p);
    if (!ids) values.set(p, (ids = []));
    ids.push(card.ast);
  }
  if (values.size === 0) return undefined;
  const names = [...values.keys()].map((v) => JSON.stringify(v.slice(0, SHOWN))).join(', ');
  return {
    code: KANBAN_PRIORITY,
    message: `Kanban priority ${names} is not drawn: use Very High, High, Medium, Low or Very Low (case-sensitive).`,
    astIds: [...values.values()].flat(),
  };
}
