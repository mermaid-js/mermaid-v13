/** The integrator's limits on a kanban board (R-SEC-5). */
import { checkLimit } from '@mermaid-js/core/limits';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';

/**
 * The item cap, columns and cards together: called after each item is added, it reports the
 * cap once, at the first item over it (`count` the items so far; `cap` defaults to core's
 * `maxNodes`). Core's `checkLimit` (#721), with kanban's own subject: the message has always
 * said "The board", where core's says "The diagram".
 */
export function checkNodeLimit(
  st: ParseState,
  count: number,
  cap: number | undefined,
  range: Range
): void {
  const board = {
    error: (code: string, message: string, at: Range) =>
      st.diagnostics.error(code, message.replace('The diagram has', 'The board has'), at),
  };
  checkLimit(board, 'maxNodes', count, cap, 'items (columns and cards)', range);
}
