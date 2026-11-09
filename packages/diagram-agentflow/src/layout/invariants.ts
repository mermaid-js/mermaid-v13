/**
 * Checks on an agentflow layout beyond core's `validateLayout` (DDLT), shared by the package's
 * specs and the parser-produced corpus spec in conformance (`@mermaid-js/diagram-agentflow/testing`):
 * what v12's `getData` drew (every visible vertex, connector and flow, nothing a collapsed flow
 * hides), the nesting the model resolved, the edges kept, redirected and dropped by v12's rules,
 * each edge end on a node on that node's outline, and the graph carrying the views' sizes.
 * `validateLayout` covers the rest: no NaN, no overlaps (sibling flows included), flows holding
 * their members and child flows, edges at their boxes, everything inside the drawing (D224).
 */
import type { AgentflowModel } from '../parser/index.ts';
import { outlineDistance } from './ends.ts';
import { outlineOf, type AgentflowLayout } from './layout.ts';

/** One message per problem; an empty list means the layout draws the model as v12 did. */
export function agentflowLayoutProblems(model: AgentflowModel, layout: AgentflowLayout): string[] {
  const { graph } = layout.agentflow;
  const drawn: Drawn = {
    nodes: new Set(graph.nodes.map((n) => n.id)),
    groups: new Set(graph.groups.map((g) => g.id)),
  };
  return [
    ...visibility(model, drawn),
    ...nesting(model, layout, drawn),
    ...edgeFates(model, layout, drawn),
    ...sizesAndEnds(layout),
  ];
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
 * v12's edge rules: an end hidden in a collapsed flow goes to its card, an edge whose distinct
 * ends fold into one card goes, an authored loop stays, and an end drawn nowhere leaves it out.
 */
function edgeFates(model: AgentflowModel, layout: AgentflowLayout, drawn: Drawn): string[] {
  const out: string[] = [];
  const into = new Map<string, string>();
  for (const v of model.vertices)
    if (v.collapsedInto !== undefined) into.set(v.id, v.collapsedInto);
  for (const f of model.flows) if (f.collapsedInto !== undefined) into.set(f.id, f.collapsedInto);
  const shown = (id: string) => drawn.nodes.has(id) || drawn.groups.has(id);
  const views = layout.agentflow.edges;
  let k = 0;
  for (const e of model.edges) {
    const source = into.get(e.start) ?? e.start;
    const target = into.get(e.end) ?? e.end;
    const kept = shown(source) && shown(target) && !(source === target && e.start !== e.end);
    const view = views[k]?.edge === e ? views[k++] : undefined;
    if (kept !== (view !== undefined)) {
      out.push(`edge '${e.id}' (${e.start} → ${e.end}) is ${view ? 'drawn' : 'dropped'}`);
    } else if (view && (view.source !== source || view.target !== target)) {
      out.push(
        `edge '${e.id}' is drawn ${view.source} → ${view.target}, not ${source} → ${target}`
      );
    }
  }
  return out;
}

/** The graph carries the views' sizes, and every end on a node lies on the node's outline. */
function sizesAndEnds(layout: AgentflowLayout): string[] {
  const out: string[] = [];
  const prepared = layout.agentflow;
  // How far an end may lie off its outline: as far as it may lie off a side.
  const slack = prepared.metrics.onSide;
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
      const box = layout.nodes.get(id);
      if (!view || !box) continue;
      const d = outlineDistance({ x: p.x - box.x, y: p.y - box.y }, outlineOf(prepared, view));
      if (!(d <= slack)) out.push(`edge '${e.id}' ends ${d.toFixed(2)} off the outline of '${id}'`);
    }
  }
  return out;
}
