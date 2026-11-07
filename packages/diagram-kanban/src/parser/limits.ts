/** The integrator's limits on a kanban board (R-SEC-5). */
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';

/**
 * The item cap, columns and cards together: called after each item is added, it reports the
 * cap once, at the first item over it (`count` the items so far; `cap` defaults to core's `maxNodes`).
 */
export function checkNodeLimit(
  st: ParseState,
  count: number,
  cap: number | undefined,
  range: Range
): void {
  const max = cap ?? DEFAULT_LIMITS.maxNodes;
  if (count <= max || count - 1 > max) return;
  st.diagnostics.error(
    LIMIT_CODES.maxNodes,
    `The board has more than ${max} items (columns and cards), the limit. The limit is set by the page or app that renders the diagram.`,
    range
  );
}
