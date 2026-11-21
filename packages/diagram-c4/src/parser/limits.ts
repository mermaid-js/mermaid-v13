/** The integrator's limits on a C4 diagram (R-SEC-5, #721). */
import { checkDepth, checkLimit } from '@mermaid-js/core/limits';
import type { Limits } from '@mermaid-js/core/limits';
import type { AstId, Diagnostics, Range } from '@mermaid-js/core/parser-kit';
import type { C4Model } from '../model.ts';
import type { C4StatementNode } from './ast.ts';

/**
 * The limits a parse takes; each defaults to core's limit of that name (a parse outside a render).
 * `maxNodes` counts elements and boundaries together, deployment nodes included; `maxEdges`
 * counts relations; `maxDepth` is how many boundaries one may sit in.
 */
export type C4LimitOptions = Partial<Pick<Limits, 'maxNodes' | 'maxEdges' | 'maxDepth'>>;

/** A boundary's range runs to its `}`: its macro and arguments, where a cap is reported. */
function opening(s: C4StatementNode): Range {
  const { start } = s.range;
  return { start, end: s.args[s.args.length - 1]?.range.end ?? start + s.macro.length };
}

/**
 * Reports each cap once, at the first statement over it. Read from the statements in source
 * order once the parse is done (the caller keeps the diagnostics in source order), and only
 * those that made an element, a boundary or a relation: a statement that names an alias or a
 * pair again updates the one there is. Depth 0 is the top level; a statement between a
 * boundary's braces sits one deeper than the boundary. Walked with a stack of its own, so the
 * nesting it measures cannot overflow the call stack.
 */
export function checkLimits(
  statements: readonly C4StatementNode[],
  model: Pick<C4Model, 'elements' | 'boundaries' | 'relations'>,
  limits: C4LimitOptions,
  diagnostics: Diagnostics
): void {
  const made = new Set<AstId>([...model.elements, ...model.boundaries].map((n) => n.ast));
  const relations = new Set<AstId>(model.relations.map((r) => r.ast));
  const rows: { depth: number; range: Range }[] = [];
  let nodes = 0;
  let edges = 0;
  const open: { list: readonly C4StatementNode[]; next: number }[] = [
    { list: statements, next: 0 },
  ];
  for (let top = open[0]; top; top = open[open.length - 1]) {
    const s = top.list[top.next++];
    if (!s) {
      open.pop();
      continue;
    }
    const range = s.type === 'Boundary' ? opening(s) : s.range;
    if (made.has(s.id)) {
      rows.push({ depth: open.length - 1, range });
      checkLimit(
        diagnostics,
        'maxNodes',
        ++nodes,
        limits.maxNodes,
        'elements and boundaries',
        range
      );
    } else if (relations.has(s.id)) {
      checkLimit(diagnostics, 'maxEdges', ++edges, limits.maxEdges, 'relations', s.range);
    }
    if (s.type === 'Boundary') open.push({ list: s.children, next: 0 });
  }
  checkDepth(diagnostics, rows, limits.maxDepth);
}
