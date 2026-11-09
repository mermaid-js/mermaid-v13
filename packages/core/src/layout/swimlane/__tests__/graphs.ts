// Test inputs for the ported v12 specs: a `LayoutGraph` from lanes, nodes and edges, and the
// internal graph the phases see, built from it through the adapter as the engine builds it.
import type { Dir, LayoutGraph, LayoutGroup, Size } from '../../types.ts';
import { toLayoutData } from '../adapter.ts';
import { createEdgeLabelNodes } from '../edgeLabelNodes.ts';
import { type Graph, prepareLayoutForSwimlanes, toGraphView } from '../helpers.ts';
import type { LayoutData, SwimlaneTuning } from '../layoutData.ts';

export interface GraphSpec {
  /** Lane id → the nodes in it, in source order. */
  lanes?: Record<string, string[]>;
  /** Nodes outside every lane (they go to the default lane). */
  nodes?: string[];
  /** `[source, target]` or `[source, target, label size]`; ids `e0`, `e1`, … */
  edges?: (readonly [string, string] | readonly [string, string, Size])[];
  /** Groups nested in a lane: id → [parent, members]. */
  nested?: Record<string, [string, string[]]>;
  size?: Size | ((id: string) => Size);
  direction?: Dir;
  spacing?: { node: number; rank: number };
  padding?: number;
  titles?: boolean;
}

/** The `LayoutGraph` for `spec`; every node `size` (default 0 × 0), lanes in the order given. */
export function layoutGraph(spec: GraphSpec): LayoutGraph {
  const sizeOf = (id: string): Size => {
    const s = spec.size ?? { width: 0, height: 0 };
    return typeof s === 'function' ? s(id) : s;
  };
  const pad = spec.padding ?? 20;
  const group = (id: string, parent?: string): LayoutGroup => ({
    id,
    padding: { top: pad, right: pad, bottom: pad, left: pad },
    ...(parent === undefined ? {} : { parent }),
    ...(spec.titles ? { title: { width: 8 * id.length, height: 21 } } : {}),
  });
  const parentOf = new Map<string, string>();
  for (const [lane, ids] of Object.entries(spec.lanes ?? {}))
    for (const id of ids) parentOf.set(id, lane);
  for (const [id, [, ids]] of Object.entries(spec.nested ?? {}))
    for (const n of ids) parentOf.set(n, id);
  const ids = [
    ...Object.values(spec.lanes ?? {}).flat(),
    ...Object.values(spec.nested ?? {}).flatMap(([, n]) => n),
    ...(spec.nodes ?? []),
  ];
  return {
    direction: spec.direction ?? 'TB',
    nodes: [...new Set(ids)].map((id) => {
      const parent = parentOf.get(id);
      return { id, ...sizeOf(id), ...(parent === undefined ? {} : { parent }) };
    }),
    groups: [
      ...Object.keys(spec.lanes ?? {}).map((id) => group(id)),
      ...Object.entries(spec.nested ?? {}).map(([id, [parent]]) => group(id, parent)),
    ],
    edges: (spec.edges ?? []).map(([source, target, label], i) => ({
      id: `e${i}`,
      source,
      target,
      minLen: 1,
      ...(label ? { label } : {}),
    })),
    spacing: { node: 40, rank: 100, edge: 10, ...spec.spacing },
    routing: 'stepped',
  };
}

/** The internal data the engine builds for `graph`, prepared, with its edge-label nodes. */
export function prepared(graph: LayoutGraph, tuning?: SwimlaneTuning): LayoutData {
  const data = toLayoutData(graph, tuning);
  prepareLayoutForSwimlanes(data);
  const withLabels = createEdgeLabelNodes(data);
  data.nodes = withLabels.nodes;
  data.edges = withLabels.edges;
  return data;
}

/**
 * The graph the phases lay out for `spec`. With `groups: false` the groups stay in the layout
 * (so nodes still resolve to their lanes) but are not nodes of the graph, as v12's specs built it
 * for phases that read only nodes.
 */
export function viewOf(spec: GraphSpec, opts: { groups?: boolean } = {}): Graph {
  const g = toGraphView(prepared(layoutGraph(spec)));
  if (opts.groups === false) {
    g.nodes = g.nodes.filter((id) => !g.nodeById.get(id)?.isGroup);
    for (const [id, n] of [...g.nodeById]) if (n.isGroup) g.nodeById.delete(id);
  }
  return g;
}
