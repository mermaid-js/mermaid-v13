/**
 * How gantt resolves task ids, as v12's DB did (one rule for the schedule, the layout, its
 * warnings and the language facet). v12 kept ids on a plain object (`taskDb`), filled as the
 * parser read each task, so:
 *
 * - `after <ids>` and `until <ids>`, read when `getTasks()` runs after the parse, name the last
 *   task written with each id ({@link lastById});
 * - a `click`, bound by `setClass`/`setLink` while the parser read its line, names the latest
 *   task with each id written before it, and none when the task comes later
 *   ({@link clickTargets});
 * - `__proto__` is never stored ({@link NEVER_STORED}).
 *
 * Imports only types: the facet reaches it without the schedule or the layout.
 */
import type { Range } from '@mermaid-js/core/parser-kit';

/** The id v12's plain-object `taskDb` never stores (assigning it sets the prototype). */
export const NEVER_STORED = '__proto__';

/** v12 `getStartDate`/`getEndDate`: `after <ids>` (a start) or `until <ids>` (an end). */
export const RE_AFTER = /^after\s+([\d\w- ]+)/;
export const RE_UNTIL = /^until\s+([\d\w- ]+)/;

interface Located {
  readonly id: string;
  readonly range: Range;
}

/** Each id's last task (index), as `after`/`until` read them; {@link NEVER_STORED} left out. */
export function lastById(tasks: readonly { readonly id: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  tasks.forEach((t, i) => out.set(t.id, i));
  out.delete(NEVER_STORED);
  return out;
}

/**
 * For each click (in order), the task (index) each of its ids names: the latest task with the
 * id written before the click, `undefined` when there is none. One pass over both lists, which
 * are in source order.
 */
export function clickTargets(
  tasks: readonly Located[],
  clicks: readonly { readonly ids: readonly string[]; readonly range: Range }[]
): (number | undefined)[][] {
  const latest = new Map<string, number>();
  let t = 0;
  return clicks.map((click) => {
    for (; t < tasks.length && tasks[t]!.range.start < click.range.start; t++)
      if (tasks[t]!.id !== NEVER_STORED) latest.set(tasks[t]!.id, t);
    return click.ids.map((id) => latest.get(id));
  });
}
