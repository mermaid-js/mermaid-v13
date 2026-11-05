/**
 * The two pre-passes v12 develop's ELK adapter runs on the graph before layout (D174):
 * `orientFeedbackEdges` (`subgraphFeedbackEdges.ts`) and `keepEntryNodeOnTop`
 * (`render.ts` `findCyclicEntryNodes`). Both only pick ids; the builder applies them.
 */
import { ROOT, findCommonAncestor, type EdgeEnds, type Tree } from './tree.ts';

/** The ancestor of `id` that is a direct child of `ancestor` (or `id` itself). */
function childOnPath(id: string, ancestor: string, tree: Tree): string {
  let current = id;
  while ((tree.get(current) ?? ROOT) !== ancestor) current = tree.get(current)!;
  return current;
}

/**
 * The edges that close a cycle only because a group is laid out as one node (`orientFeedbackEdges`).
 *
 * With `INCLUDE_CHILDREN`, ELK lays out each group as one node of its parent graph. A node
 * outside a group that both receives an edge from it and sends one into it therefore forms a
 * cycle there, even when the nodes inside do not (`A -> B` inside `G`, then `B -> X -> C` with
 * `C` inside `G`). ELK breaks that cycle by reversing one of the edges and routes it into the
 * group's input side, around the outside of the group.
 *
 * Each edge is looked at on the graph of its lowest common group, with every group below that
 * collapsed. A depth-first search from the sources, in declaration order, marks an edge that
 * points at a node still on the stack as a feedback edge. Only feedback edges with at least one
 * end inside a collapsed group are returned; ELK lays each out downstream of its real target. A
 * feedback edge between plain nodes is left to ELK's own cycle breaking.
 *
 * @returns one flag per edge, true where the edge goes to ELK reversed
 */
export function findSubgraphFeedbackEdges(edges: readonly EdgeEnds[], tree: Tree): boolean[] {
  const flags = edges.map(() => false);
  // lowest common group -> edges between its direct children
  const levels = new Map<
    string,
    { index: number; from: string; to: string; collapsed: boolean }[]
  >();
  edges.forEach(({ source, target }, index) => {
    if (source === target) return;
    const ancestor = findCommonAncestor(source, target, tree);
    // An edge between a group and its own member crosses no border of the parent graph.
    if (ancestor === source || ancestor === target) return;
    const from = childOnPath(source, ancestor, tree);
    const to = childOnPath(target, ancestor, tree);
    const level = levels.get(ancestor) ?? [];
    level.push({ index, from, to, collapsed: from !== source || to !== target });
    levels.set(ancestor, level);
  });

  for (const level of levels.values()) {
    const successors = new Map<string, typeof level>();
    const nodes: string[] = [];
    const inDegree = new Map<string, number>();
    for (const edge of level) {
      for (const node of [edge.from, edge.to]) {
        if (successors.has(node)) continue;
        successors.set(node, []);
        nodes.push(node);
        inDegree.set(node, 0);
      }
      successors.get(edge.from)!.push(edge);
      inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
    }
    const ON_STACK = 1;
    const DONE = 2;
    const state = new Map<string, number>();
    for (const root of [...nodes.filter((node) => inDegree.get(node) === 0), ...nodes]) {
      if (state.has(root)) continue;
      state.set(root, ON_STACK);
      const stack = [{ node: root, next: 0 }];
      while (stack.length > 0) {
        const frame = stack[stack.length - 1]!;
        const out = successors.get(frame.node)!;
        if (frame.next >= out.length) {
          state.set(frame.node, DONE);
          stack.pop();
          continue;
        }
        const edge = out[frame.next++]!;
        const seen = state.get(edge.to);
        if (seen === ON_STACK) flags[edge.index] = edge.collapsed;
        else if (seen === undefined) {
          state.set(edge.to, ON_STACK);
          stack.push({ node: edge.to, next: 0 });
        }
      }
    }
  }
  return flags;
}

/** The weakly connected component of each id, numbered from 0 in declaration order. */
function components(
  ids: readonly string[],
  neighbours: ReadonlyMap<string, readonly string[]>
): { component: Map<string, number>; count: number } {
  const component = new Map<string, number>();
  let count = 0;
  const visit = (id: string): void => {
    const stack = [id];
    component.set(id, count);
    while (stack.length > 0)
      for (const next of neighbours.get(stack.pop()!)!) {
        if (component.has(next)) continue;
        component.set(next, count);
        stack.push(next);
      }
  };
  for (const id of ids) {
    if (component.has(id)) continue;
    visit(id);
    count++;
  }
  return { component, count };
}

/**
 * The entry node of each recursive flow (`keepEntryNodeOnTop`), to pin to the first layer.
 *
 * ELK layered breaks cycles before it ranks, by degree, with no notion of an entry: once a flow
 * loops back on itself the first-declared node can land mid-layout. Per container (grouped by
 * `parent`), on the edges inside it: a weakly connected component with no node of in-degree 0
 * (self loops aside) must hold a cycle. Its cycles are broken greedily in edge declaration
 * order (an edge that would close a directed cycle is skipped), and the entry is the first node
 * in declaration order with no remaining incoming edge. Acyclic components nominate nothing.
 *
 * @param nodes - nodes (and groups) in declaration order
 * @param edges - edges in declaration order
 */
export function findCyclicEntryNodes(
  nodes: readonly { id: string; parent?: string | undefined }[],
  edges: readonly EdgeEnds[]
): Set<string> {
  const entries = new Set<string>();
  const containers = new Map<string | undefined, string[]>();
  for (const { id, parent } of nodes) {
    const ids = containers.get(parent);
    if (ids) ids.push(id);
    else containers.set(parent, [id]);
  }

  for (const ids of containers.values()) {
    const idSet = new Set(ids);
    const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));
    const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
    const internal: [string, string][] = [];
    for (const { source, target } of edges) {
      if (source === target || !idSet.has(source) || !idSet.has(target)) continue;
      inDegree.set(target, inDegree.get(target)! + 1);
      neighbours.get(source)!.push(target);
      neighbours.get(target)!.push(source);
      internal.push([source, target]);
    }

    const { component, count } = components(ids, neighbours);
    const hasSource = new Array<boolean>(count).fill(false);
    for (const id of ids) if (inDegree.get(id) === 0) hasSource[component.get(id)!] = true;
    if (!hasSource.includes(false)) continue;

    // Break cycles greedily in edge order; the forward edges left are acyclic.
    const forward = new Map<string, string[]>(ids.map((id) => [id, []]));
    const residual = new Map<string, number>(ids.map((id) => [id, 0]));
    const reaches = (from: string, to: string): boolean => {
      const seen = new Set([from]);
      const stack = [from];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === to) return true;
        for (const next of forward.get(current)!) {
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(next);
        }
      }
      return false;
    };
    for (const [source, target] of internal) {
      if (reaches(target, source)) continue;
      forward.get(source)!.push(target);
      residual.set(target, residual.get(target)! + 1);
    }
    const nominated = new Array<boolean>(count).fill(false);
    for (const id of ids) {
      const c = component.get(id)!;
      if (!hasSource[c] && !nominated[c] && residual.get(id) === 0) {
        entries.add(id);
        nominated[c] = true;
      }
    }
  }
  return entries;
}
