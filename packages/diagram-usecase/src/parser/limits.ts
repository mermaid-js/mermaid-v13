/** The integrator's limits on a use case diagram (R-SEC-5, #721). */
import { checkLimit } from '@mermaid-js/core/limits';
import type { Range } from '@mermaid-js/core/parser-kit';
import type { BuildReport } from './drafts.ts';

/** The limits a parse takes; each defaults to core's limit of that name (a parse outside a render). */
export interface UsecaseLimitOptions {
  /** The integrator's cap on actors, use cases, boundaries, JSON nodes and notes together. */
  maxNodes?: number;
  /** The integrator's cap on relationships (`maxEdges`). */
  maxEdges?: number;
}

interface Placed {
  readonly range: Range;
}

/**
 * Reports each cap once, at the first one over it in source order. Read from the resolved model
 * (an element is one node however often it is named, at the first place that makes it), so it
 * runs once the model is built; the caller keeps the diagnostics in source order.
 */
export function checkLimits(
  nodes: readonly Placed[],
  relationships: readonly Placed[],
  limits: UsecaseLimitOptions,
  report: BuildReport
): void {
  const what = 'actors, use cases, boundaries, JSON nodes and notes';
  const inOrder = [...nodes].sort((x, y) => x.range.start - y.range.start);
  inOrder.forEach((n, i) => checkLimit(report, 'maxNodes', i + 1, limits.maxNodes, what, n.range));
  relationships.forEach((r, i) =>
    checkLimit(report, 'maxEdges', i + 1, limits.maxEdges, 'relationships', r.range)
  );
}
