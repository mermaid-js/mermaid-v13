/** The integrator's limits on a Wardley map (R-SEC-5, #698). */
import { checkLimit } from '@mermaid-js/core/limits';
import type { Limits } from '@mermaid-js/core/limits';
import type { Diagnostics, Range } from '@mermaid-js/core/parser-kit';
import type { WardleyStatementNode } from './ast.ts';

/**
 * The limits a parse takes; each defaults to core's limit of that name (a parse outside a render).
 * `maxNodes` caps anchors and components, a pipeline's included; `maxEdges` caps links.
 */
export type WardleyLimitOptions = Partial<Pick<Limits, 'maxNodes' | 'maxEdges'>>;

/** What each limit counts, as its message names it. */
const WHAT = { maxNodes: 'anchors and components', maxEdges: 'links' } as const;

/**
 * Reports each cap once, at the first statement over it. Read from the parsed statements, in
 * source order, once the parse is done (the caller keeps the diagnostics in source order).
 */
export function checkLimits(
  statements: readonly WardleyStatementNode[],
  limits: WardleyLimitOptions,
  diagnostics: Diagnostics
): void {
  const count = { maxNodes: 0, maxEdges: 0 };
  const add = (limit: keyof typeof WHAT, range: Range): void => {
    checkLimit(diagnostics, limit, ++count[limit], limits[limit], WHAT[limit], range);
  };
  for (const s of statements) {
    if (s.type === 'Anchor' || s.type === 'Component') add('maxNodes', s.range);
    else if (s.type === 'Pipeline') for (const c of s.children) add('maxNodes', c.range);
    else if (s.type === 'Link') add('maxEdges', s.range);
  }
}
