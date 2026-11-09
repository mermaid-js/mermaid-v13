/**
 * Lays out an agentflow: the builder's graph through `ctx.layout` (core's `layered` by default,
 * D127/R-LAYOUT-7; ELK and `compass` by name, D171/D327), then each edge end on a node moved
 * from the side of its layout box onto the shape's outline (`ends.ts`). Ends on a flow's frame
 * stay where the engine put them.
 */
import type { LayoutModel, LayoutModelEdge, Point, RoutePoint } from '@mermaid-js/core/layout';
import { layered } from '@mermaid-js/core/layout';
import type { AgentflowModel } from '../parser/index.ts';
import type { AgentflowLayoutContext } from './context.ts';
import { endOnOutline } from './ends.ts';
import { prepareAgentflow, type AgentflowNodeView, type AgentflowPrepared } from './prepare.ts';
import { shapeOutline } from './shapes.ts';

/** The engine's layout with the measured views it was built from. */
export interface AgentflowLayout extends LayoutModel {
  readonly agentflow: AgentflowPrepared;
}

/** A node view's outline, in its own frame. */
export const outlineOf = (prepared: AgentflowPrepared, view: AgentflowNodeView): Point[] =>
  shapeOutline(view.shape, view.w, view.h, prepared.pads, prepared.metrics);

/** Measures the model and lays it out with `ctx.layout` (default `layered`). */
export function layoutAgentflow(
  model: AgentflowModel,
  ctx: AgentflowLayoutContext
): AgentflowLayout {
  const prepared = prepareAgentflow(model, ctx);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  return { ...laid, edges: onOutlines(prepared, laid), agentflow: prepared };
}

/** The route's first point other than the one at `from`, walking by `step`, if any. */
function away(points: readonly RoutePoint[], from: number, step: number): Point | undefined {
  const p = points[from]!;
  for (let i = from + step; i >= 0 && i < points.length; i += step) {
    const q = points[i]!;
    if (q.x !== p.x || q.y !== p.y) return q;
  }
  return undefined;
}

/** The engine's routes with each end on a node moved onto that node's outline. */
function onOutlines(prepared: AgentflowPrepared, laid: LayoutModel): Map<string, LayoutModelEdge> {
  const outlines = new Map<string, Point[]>();
  const outline = (view: AgentflowNodeView): Point[] => {
    let o = outlines.get(view.id);
    if (!o) outlines.set(view.id, (o = outlineOf(prepared, view)));
    return o;
  };
  const onSide = prepared.metrics.onSide;
  const edges = new Map<string, LayoutModelEdge>();
  for (const e of prepared.edges) {
    const route = laid.edges.get(e.id);
    if (!route) continue;
    if (route.points.length < 2) {
      edges.set(e.id, route);
      continue;
    }
    const points = [...route.points];
    const last = points.length - 1;
    const from = prepared.views.get(e.source);
    const to = prepared.views.get(e.target);
    const fromBox = laid.nodes.get(e.source);
    const toBox = laid.nodes.get(e.target);
    if (from && fromBox)
      points[0] = endOnOutline(points[0]!, away(points, 0, 1), fromBox, outline(from), onSide);
    if (to && toBox)
      points[last] = endOnOutline(
        points[last]!,
        away(points, last, -1),
        toBox,
        outline(to),
        onSide
      );
    edges.set(e.id, { ...route, points });
  }
  // Anything the engine routed that the builder did not (none today) keeps its route.
  for (const [id, route] of laid.edges) if (!edges.has(id)) edges.set(id, route);
  return edges;
}
