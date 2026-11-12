/** The integrator's limits on a tree view (R-SEC-5, #698). */
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';

const SET_BY = 'The limit is set by the page or app that renders the diagram.';

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
