/**
 * Checks on an agentflow layout beyond core's `validateLayout` (DDLT), shared by the package's
 * specs and the parser-produced corpus spec in conformance (`@mermaid-js/diagram-agentflow/testing`):
 * what v12's `getData` drew (every visible vertex, connector and flow, nothing a collapsed flow
 * hides), the nesting the model resolved, each edge end on the outline of the node or on the
 * border of the frame it meets, and the graph carrying the views' sizes. Which edges are drawn
 * between which ends is checked against v12's own `getData()` in conformance.
 * `validateLayout` covers the rest: no NaN, no overlaps (sibling flows included), flows holding
 * their members and child flows, edges at their boxes, everything inside the drawing (D224).
 */
import type { AgentflowModel } from '../parser/index.ts';
import { frameOutline, outlineDistance } from './ends.ts';
import type { AgentflowLayout } from './layout.ts';
import { AGENTFLOW_METRICS } from './metrics.ts';
import { shapeOutline } from './shapes.ts';

/** One message per problem; an empty list means the layout draws the model as v12 did. */
export function agentflowLayoutProblems(model: AgentflowModel, layout: AgentflowLayout): string[] {
  const { graph } = layout.agentflow;
  const drawn: Drawn = {
    nodes: new Set(graph.nodes.map((n) => n.id)),
    groups: new Set(graph.groups.map((g) => g.id)),
  };
  return [...visibility(model, drawn), ...nesting(model, layout, drawn), ...sizesAndEnds(layout)];
}

interface Drawn {
  readonly nodes: ReadonlySet<string>;
  readonly groups: ReadonlySet<string>;
}

/** A collapsed flow is a card and hides what it holds; an open flow is a frame. */
function visibility(model: AgentflowModel, drawn: Drawn): string[] {
  const out: string[] = [];
  for (const f of model.flows) {
    const asNode = drawn.nodes.has(f.id);
    const asGroup = drawn.groups.has(f.id);
    if (f.collapsedInto !== undefined) {
      if (asNode || asGroup)
        out.push(`flow '${f.id}' is drawn inside collapsed '${f.collapsedInto}'`);
    } else if (f.collapsed ? !asNode : !asGroup) {
      out.push(`flow '${f.id}' is not drawn as a ${f.collapsed ? 'card' : 'frame'}`);
    }
  }
  for (const v of model.vertices) {
    const shown = drawn.nodes.has(v.id);
    if (v.collapsedInto !== undefined && shown) {
      out.push(`'${v.id}' is drawn inside collapsed '${v.collapsedInto}'`);
    } else if (v.collapsedInto === undefined && !shown && !drawn.groups.has(v.id)) {
      out.push(`'${v.id}' is not drawn`);
    }
  }
  return out;
}

/** Each drawn box sits in the flow the model put it in, and that flow is a frame. */
function nesting(model: AgentflowModel, layout: AgentflowLayout, drawn: Drawn): string[] {
  const out: string[] = [];
  const parentOf = new Map<string, string | undefined>();
  for (const v of model.vertices) parentOf.set(v.id, v.parent);
  for (const f of model.flows) parentOf.set(f.id, f.parent);
  const { graph } = layout.agentflow;
  for (const n of [...graph.nodes, ...graph.groups]) {
    const want = parentOf.get(n.id);
    if (n.parent !== want) out.push(`'${n.id}' sits in '${n.parent}', the model says '${want}'`);
    if (n.parent !== undefined && !drawn.groups.has(n.parent))
      out.push(`'${n.id}' sits in '${n.parent}', which is no frame`);
  }
  return out;
}

/**
 * The graph carries the views' sizes, every end on a node lies on the node's outline, and every
 * end on a flow on the frame's border.
 */
function sizesAndEnds(layout: AgentflowLayout): string[] {
  const out: string[] = [];
  const prepared = layout.agentflow;
  // How far an end may lie off its outline: as far as it may lie off a side.
  const slack = AGENTFLOW_METRICS.onSide;
  for (const n of prepared.graph.nodes) {
    const view = prepared.views.get(n.id);
    if (view?.w !== n.width || view.h !== n.height)
      out.push(`node '${n.id}' is not its view's size`);
  }
  for (const e of prepared.edges) {
    const points = layout.edges.get(e.id)?.points ?? [];
    if (points.length < 2) continue;
    const ends = [
      [e.source, points[0]!],
      [e.target, points[points.length - 1]!],
    ] as const;
    for (const [id, p] of ends) {
      const view = prepared.views.get(id);
      const node = layout.nodes.get(id);
      const frame = layout.groups.get(id);
      const box = view && node ? node : frame;
      if (!box) {
        out.push(`edge '${e.id}' ends at '${id}', which is not drawn`);
        continue;
      }
      const outline =
        view && node
          ? shapeOutline(view.shape, view.w, view.h, prepared.geometry)
          : frameOutline(box.width, box.height);
      const d = outlineDistance({ x: p.x - box.x, y: p.y - box.y }, outline);
      const what = view && node ? 'the outline' : 'the frame';
      if (!(d <= slack)) out.push(`edge '${e.id}' ends ${d.toFixed(2)} off ${what} of '${id}'`);
    }
  }
  return out;
}
