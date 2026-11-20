/** The integrator's limits on an architecture diagram (R-SEC-5, #721). */
import { checkDepth, checkLimit } from '@mermaid-js/core/limits';
import type { AstId, Diagnostics, Range } from '@mermaid-js/core/parser-kit';
import type { ArchitectureModel } from '../model.ts';
import type { ArchitectureStatementNode } from './ast.ts';

/** The limits a parse takes; each defaults to core's limit of that name (a parse outside a render). */
export interface ArchitectureLimitOptions {
  /** The integrator's cap on groups, services and junctions together (`maxNodes`). */
  maxNodes?: number;
  /** The integrator's cap on edges (`maxEdges`). */
  maxEdges?: number;
  /** The integrator's cap on how deep one may sit under a top-level group (`maxDepth`). */
  maxDepth?: number;
}

/**
 * Reports each cap once, at the first statement over it. Read from the statements in source
 * order once the model is built (the caller keeps the diagnostics in source order), and only
 * those the model kept: a declaration v12's checks refused counts for nothing. Depth 0 is a
 * top-level group, service or junction; one `in` a group sits one deeper than the group.
 */
export function checkLimits(
  statements: readonly ArchitectureStatementNode[],
  model: Pick<ArchitectureModel, 'groups' | 'services' | 'junctions' | 'edges'>,
  limits: ArchitectureLimitOptions,
  diagnostics: Diagnostics
): void {
  // A parent group is declared before its child (v12's check), so one pass finds every depth.
  const groupDepth = new Map<string, number>();
  const depths = new Map<AstId, number>();
  const place = (n: { readonly in?: string; readonly astId: AstId }): number => {
    const depth = n.in === undefined ? 0 : (groupDepth.get(n.in) ?? 0) + 1;
    depths.set(n.astId, depth);
    return depth;
  };
  for (const g of model.groups) groupDepth.set(g.id, place(g));
  for (const n of [...model.services, ...model.junctions]) place(n);
  const edges = new Set(model.edges.map((e) => e.astId));

  const rows: { depth: number; range: Range }[] = [];
  let nodes = 0;
  let links = 0;
  for (const s of statements) {
    const depth = depths.get(s.id);
    if (depth !== undefined) {
      rows.push({ depth, range: s.range });
      const what = 'groups, services and junctions';
      checkLimit(diagnostics, 'maxNodes', ++nodes, limits.maxNodes, what, s.range);
    } else if (edges.has(s.id)) {
      checkLimit(diagnostics, 'maxEdges', ++links, limits.maxEdges, 'edges', s.range);
    }
  }
  checkDepth(diagnostics, rows, limits.maxDepth);
}
