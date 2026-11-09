/** The integrator's limits on a sankey diagram (R-SEC-5, #503). */
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';

/**
 * Reports a cap once, at the first node or link over it: called after each one is added, with
 * `count` the nodes or links so far. No cap (a parse outside a render) checks nothing.
 */
export function checkLimit(
  st: ParseState,
  limit: 'maxNodes' | 'maxEdges',
  count: number,
  cap: number | undefined,
  range: Range
): void {
  if (cap === undefined || count !== cap + 1) return;
  const what = limit === 'maxNodes' ? 'nodes' : 'links';
  st.diagnostics.error(
    LIMIT_CODES[limit],
    `The diagram has more than ${cap} ${what}, the limit. The limit is set by the page or app that renders the diagram.`,
    range
  );
}
