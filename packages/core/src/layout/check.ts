// The input check the `compass`, `swimlane` and `tree` engines share, with one set of messages:
// ids used once, edges between ids that exist, sizes and spacing that are finite numbers of at
// least 0. Each engine passes what it checks on top, in `Extra`. `layered` keeps its own check:
// core loads it, and a shared module that core imports is bundled into core whole.
import type { LayoutEdge, LayoutGraph, LayoutGroup, LayoutNode } from './types.ts';

/** Throws a RangeError unless `v` is a finite number of at least 0. */
export function finite(v: number, what: string): void {
  if (!Number.isFinite(v) || v < 0)
    throw new RangeError(`layout: ${what} must be a finite number >= 0, got ${v}`);
}

/** A node's optional `span` and `anchorY`, when given, are finite and at least 0. */
export function checkNodeSpan(n: LayoutNode): void {
  if (n.span !== undefined) finite(n.span, `span of node '${n.id}'`);
  if (n.anchorY !== undefined) finite(n.anchorY, `anchorY of node '${n.id}'`);
}

/** A group's title, when it has one, is finite and at least 0 in each direction. */
export function checkGroupTitle(g: LayoutGroup): void {
  if (!g.title) return;
  finite(g.title.width, `title width of group '${g.id}'`);
  finite(g.title.height, `title height of group '${g.id}'`);
}

/** The width and height of an edge's label and of its start and end labels. */
export function checkLabelSizes(e: LayoutEdge): void {
  for (const s of [e.label, e.startLabel, e.endLabel]) {
    if (!s) continue;
    finite(s.width, `label width of edge '${e.id}'`);
    finite(s.height, `label height of edge '${e.id}'`);
  }
}

/** What an engine checks beyond the shared fields; each runs after the shared check of its item. */
export interface Extra {
  node?: (n: LayoutNode) => void;
  group?: (g: LayoutGroup) => void;
  edge?: (e: LayoutEdge) => void;
  /** Also check `spacing.edge` and `headRoom`, which the engines that route edges read. */
  routed?: boolean;
}

type Claim = (id: string, what: string) => void;

function checkNodes(graph: LayoutGraph, claim: Claim, each: Extra['node']): void {
  for (const n of graph.nodes) {
    claim(n.id, 'node');
    finite(n.width, `width of node '${n.id}'`);
    finite(n.height, `height of node '${n.id}'`);
    each?.(n);
  }
}

function checkGroups(graph: LayoutGraph, claim: Claim, each: Extra['group']): void {
  for (const g of graph.groups) {
    claim(g.id, 'group');
    for (const v of [g.padding.top, g.padding.right, g.padding.bottom, g.padding.left])
      finite(v, `padding of group '${g.id}'`);
    each?.(g);
  }
}

function checkEdges(graph: LayoutGraph, ids: Set<string>, each: Extra['edge']): void {
  const seen = new Set<string>();
  for (const e of graph.edges) {
    if (seen.has(e.id)) throw new Error(`layout: duplicate edge id '${e.id}'`);
    seen.add(e.id);
    if (!ids.has(e.source))
      throw new Error(`layout: edge '${e.id}' has unknown source '${e.source}'`);
    if (!ids.has(e.target))
      throw new Error(`layout: edge '${e.id}' has unknown target '${e.target}'`);
    each?.(e);
  }
}

function checkSpacing(graph: LayoutGraph, routed: boolean): void {
  finite(graph.spacing.node, 'spacing.node');
  finite(graph.spacing.rank, 'spacing.rank');
  if (routed) finite(graph.spacing.edge, 'spacing.edge');
  finite(graph.diagramPadding ?? 0, 'diagramPadding');
  if (routed && graph.headRoom !== undefined) finite(graph.headRoom, 'headRoom');
}

/**
 * Throws on the first fault, in this order: each node (id, box), each group (id, padding), each
 * edge (id, ends), then `spacing` and `diagramPadding`. `grid` and anything else an engine
 * restricts is its own check, after this one.
 */
export function checkGraph(graph: LayoutGraph, extra: Extra = {}): void {
  const ids = new Set<string>();
  const claim: Claim = (id, what) => {
    if (ids.has(id)) throw new Error(`layout: duplicate ${what} id '${id}'`);
    ids.add(id);
  };
  checkNodes(graph, claim, extra.node);
  checkGroups(graph, claim, extra.group);
  checkEdges(graph, ids, extra.edge);
  checkSpacing(graph, extra.routed ?? false);
}
