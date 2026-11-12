/** The integrator's limits on an event model (R-SEC-5, #698). */
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';

/** What each limit counts, as its message names it. */
const WHAT = { maxNodes: 'frames', maxEdges: 'relations' } as const;

const SET_BY = 'The limit is set by the page or app that renders the diagram.';

/**
 * Reports a cap once, at the first one over it: called after each is added, with `count` those
 * so far. `cap` defaults to core's limit of that name (a parse outside a render).
 */
export function checkLimit(
  st: ParseState,
  limit: keyof typeof WHAT,
  count: number,
  cap: number | undefined,
  range: Range
): void {
  const max = cap ?? DEFAULT_LIMITS[limit];
  // Called once per item, so the first over the cap is the one whose predecessor was not.
  if (count <= max || count - 1 > max) return;
  st.diagnostics.error(
    LIMIT_CODES[limit],
    `The diagram has more than ${max} ${WHAT[limit]}, the limit. ${SET_BY}`,
    range
  );
}
