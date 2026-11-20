// The checks the agentflow ASCII suites share (#551): the text's own shape (`rows`, `columns`,
// no trailing space), boxes apart on the layout, and lines kept out of boxes, labels and titles
// by the repair router (D78).
import { cellWidth, repairRoutes, routeCollisions } from '@mermaid-js/core/ascii';
import type { LayoutModel } from '@mermaid-js/core/layout';
import { sizeFaults } from '../../ascii/flow-checks.ts';
import type { AgentflowAsciiResult } from './render.ts';
import { rectOf, type Rect } from './structure.ts';

/** Faults in the text itself: line count, widths (the kit's `cellWidth`), trailing spaces, `\r`. */
export const textFaults = (result: AgentflowAsciiResult): string[] => sizeFaults(result, cellWidth);

/** Boxes that overlap: nodes apart, a node or frame inside a frame or apart. */
export function overlaps(model: LayoutModel): string[] {
  const rects: (Rect & { id: string; group: boolean })[] = [
    ...[...model.nodes].map(([id, n]) => ({ id, group: false, ...rectOf(n) })),
    ...[...model.groups].map(([id, g]) => ({ id, group: true, ...rectOf(g) })),
  ];
  const apart = (a: Rect, b: Rect) => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
  const within = (a: Rect, b: Rect & { group: boolean }) =>
    b.group && a.x0 > b.x0 && a.x1 < b.x1 && a.y0 > b.y0 && a.y1 < b.y1;
  const found: string[] = [];
  rects.forEach((a, i) => {
    for (const b of rects.slice(i + 1))
      if (!apart(a, b) && !within(a, b) && !within(b, a)) found.push(`${a.id} × ${b.id}`);
  });
  return found;
}

/**
 * Lines the repair router left through a node box, an edge label or a flow title. With
 * `unwarned`, only those of edges the render did not warn `ASCII_ROUTE` for (D78: a line it
 * found no lane for may touch another line or text, and says so).
 */
export function collisions({ layout, warnings }: AgentflowAsciiResult, unwarned = false): string[] {
  const graph = layout.agentflow.graph;
  const repaired = repairRoutes(graph, layout);
  const warned = new Set(unwarned ? repaired.unresolved.map((c) => c.edge) : []);
  if (warned.size > 0 && !warnings.some((w) => w.code === 'ASCII_ROUTE'))
    return ['ASCII_ROUTE not warned'];
  return routeCollisions(graph, layout, repaired.routes)
    .filter((l) => (l.kind === 'box' || l.kind === 'label') && !warned.has(l.edge))
    .map((l) => `${l.edge} ${l.kind} ${l.with}`);
}

/** `ASCII_DROPPED` kinds warned more than once. */
export function droppedTwice({ warnings }: AgentflowAsciiResult): string[] {
  const kinds = warnings.flatMap((w) =>
    w.code === 'ASCII_DROPPED' ? [(w as { feature?: string }).feature] : []
  );
  return kinds.filter((k, i) => kinds.indexOf(k) !== i).map((k) => `twice: ${k}`);
}
