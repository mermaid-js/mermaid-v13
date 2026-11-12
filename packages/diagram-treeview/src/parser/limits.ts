/** The integrator's limits on a tree view (R-SEC-5, #698). */
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';

/** What each limit counts, as its message names it. */
const WHAT = { maxNodes: 'nodes' } as const;

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

/**
 * The depth cap, once the tree is built: reports the first node that sits deeper under a top one
 * than `cap` (core's `maxDepth` when absent).
 */
export function checkDepth(
  st: ParseState,
  rows: readonly { readonly depth: number; readonly range: Range }[],
  cap: number | undefined
): void {
  const max = cap ?? DEFAULT_LIMITS.maxDepth;
  const deep = rows.find((row) => row.depth > max);
  if (!deep) return;
  st.diagnostics.error(
    LIMIT_CODES.maxDepth,
    `The diagram is nested ${deep.depth} deep here, over the limit of ${max}. ${SET_BY}`,
    deep.range
  );
}
