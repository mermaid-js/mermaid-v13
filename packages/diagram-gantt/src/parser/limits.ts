/** The integrator's limits on a gantt chart's parse (R-SEC-5, #721). */
import { checkLimit } from '@mermaid-js/core/limits';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';

/**
 * The cap on sections and tasks together: called after each is added, with `count` those so
 * far (core's `checkLimit` reports it once, at the first over the cap).
 */
export function checkNodes(
  st: ParseState,
  count: number,
  cap: number | undefined,
  range: Range
): void {
  checkLimit(st.diagnostics, 'maxNodes', count, cap, 'sections and tasks', range);
}
