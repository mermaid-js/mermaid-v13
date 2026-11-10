/**
 * Lays out an agentflow: the builder's graph through `ctx.layout` (core's `layered` by default,
 * D127/R-LAYOUT-7; ELK and `compass` by name, D171/D327), then each edge end moved onto what it
 * meets: a node's end from the side of its layout box onto the shape's outline, a flow's end
 * onto the frame's border (`ends.ts`). An edge between a member and the flow that holds it runs
 * straight out of the member to the nearest stretch of the frame.
 */
import type { LayoutModel, LayoutModelEdge, Point, RoutePoint } from '@mermaid-js/core/layout';
import { layered } from '@mermaid-js/core/layout';
import type { AgentflowModel } from '../parser/index.ts';
import type { AgentflowLayoutContext } from './context.ts';
import { endOnOutline, frameOutline, memberToFrame, within, type EndBox } from './ends.ts';
import { prepareAgentflow, type AgentflowPrepared } from './prepare.ts';
import { shapeOutline } from './shapes.ts';

/** The engine's layout with the measured views it was built from. */
export interface AgentflowLayout extends LayoutModel {
  readonly agentflow: AgentflowPrepared;
}

/** Measures the model and lays it out with `ctx.layout` (default `layered`). */
export function layoutAgentflow(
  model: AgentflowModel,
  ctx: AgentflowLayoutContext
): AgentflowLayout {
  const prepared = prepareAgentflow(model, ctx);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  // In cells (text output, #551) the routes stay on the grid, ending on the boxes' sides: the
  // `./ascii` entry repairs and draws them.
  if (prepared.graph.grid !== undefined) return { ...laid, agentflow: prepared };
  return { ...laid, edges: endsOnOutlines(prepared, laid), agentflow: prepared };
}

/** The route's first point other than the one at `from`, walking by `step`, if any. */
function nextDistinctPoint(
  points: readonly RoutePoint[],
  from: number,
  step: number
): Point | undefined {
  const p = points[from]!;
  for (let i = from + step; i >= 0 && i < points.length; i += step) {
    const q = points[i]!;
    if (q.x !== p.x || q.y !== p.y) return q;
  }
  return undefined;
}

interface End extends EndBox {
  readonly frame: boolean;
}

/** The engine's routes with each end on the outline of the node or frame it meets. */
function endsOnOutlines(
  prepared: AgentflowPrepared,
  laid: LayoutModel
): Map<string, LayoutModelEdge> {
  const ends = new Map<string, End | undefined>();
  const endOf = (id: string): End | undefined => {
    if (ends.has(id)) return ends.get(id);
    const view = prepared.views.get(id);
    const node = laid.nodes.get(id);
    const group = laid.groups.get(id);
    let end: End | undefined;
    if (view && node) {
      end = {
        box: node,
        outline: shapeOutline(view.shape, view.w, view.h, prepared.geometry),
        frame: false,
      };
    } else if (group) {
      end = { box: group, outline: frameOutline(group.width, group.height), frame: true };
    }
    ends.set(id, end);
    return end;
  };
  const onSide = prepared.geometry.metrics.onSide;
  const edges = new Map<string, LayoutModelEdge>();
  for (const e of prepared.edges) {
    const route = laid.edges.get(e.id);
    if (!route) continue;
    const source = endOf(e.source);
    const target = endOf(e.target);
    if (route.points.length < 2 || !source || !target) {
      edges.set(e.id, route);
      continue;
    }
    let points: RoutePoint[];
    if (e.source !== e.target && target.frame && within(source.box, target.box)) {
      points = memberToFrame(source, target.box, onSide);
    } else if (e.source !== e.target && source.frame && within(target.box, source.box)) {
      points = memberToFrame(target, source.box, onSide).reverse();
    } else {
      points = [...route.points];
      const last = points.length - 1;
      points[0] = endOnOutline(points[0]!, nextDistinctPoint(points, 0, 1), source, onSide);
      points[last] = endOnOutline(
        points[last]!,
        nextDistinctPoint(points, last, -1),
        target,
        onSide
      );
    }
    edges.set(e.id, { ...route, points });
  }
  // Anything the engine routed that the builder did not (none today) keeps its route.
  for (const [id, route] of laid.edges) if (!edges.has(id)) edges.set(id, route);
  return edges;
}
