/**
 * v12's `getData` containment rules (`fa796a943` `agentflowDb.ts`), run once over the parsed
 * flows (D461): which collapsed flow hides each id, and each id's parent flow with the
 * assignment that would close a containment cycle refused. v12 walked the parents of the flow
 * for every assignment, and the members of each collapsed flow again for each collapsed flow
 * around it; both are linear here (union-find roots, and redirects between collapses), with
 * v12's results.
 */
import type { AgentflowFlowModel } from './model.ts';

/**
 * v12's `collectDescendants`: each collapsed flow not hidden yet, in v12's order, hides what
 * it holds (itself excepted), and maps each to it. A collapse that reaches one made before
 * maps it, and so all it holds, through a redirect instead of walking it again (v12 walked
 * it again and mapped each). Returns the outermost collapsed flow of an id, if any.
 */
export function collapsedInto(
  flows: readonly AgentflowFlowModel[],
  flowById: ReadonlyMap<string, AgentflowFlowModel>
): (id: string) => string | undefined {
  const hidden = new Map<string, string>();
  const roots = new Set<string>();
  const redirect = new Map<string, string>();
  for (const flow of flows) {
    if (!flow.collapsed || hidden.has(flow.id)) continue;
    const root = flow.id;
    roots.add(root);
    const seen = new Set<string>();
    const stack = [root];
    while (stack.length > 0) {
      const at = stack.pop() as string;
      if (seen.has(at)) continue;
      seen.add(at);
      if (at !== root && roots.has(at)) {
        redirect.set(at, root);
        continue;
      }
      const f = flowById.get(at);
      if (!f) continue;
      for (let k = f.nodes.length - 1; k >= 0; k--) {
        const child = f.nodes[k] as string;
        if (child === root || seen.has(child)) continue;
        hidden.set(child, root);
        stack.push(child);
      }
    }
  }
  const final = (id: string): string => {
    let r = id;
    while (redirect.has(r)) r = redirect.get(r) as string;
    // Path compression: every collapse on the way now points at the last.
    for (let x = id; x !== r; ) {
      const next = redirect.get(x) as string;
      redirect.set(x, r);
      x = next;
    }
    return r;
  };
  return (id) => {
    const h = hidden.get(id);
    return h === undefined ? undefined : final(h);
  };
}

/**
 * v12's parent assignment: the flows last first, hidden ones left out, each member's parent
 * the flow that lists it, unless the member is already the flow's ancestor. A member has no
 * parent yet when it is assigned one (each id is in one flow's list), so it is an ancestor of
 * the flow exactly when it is the root of the flow's tree.
 */
export function containment(
  flows: readonly AgentflowFlowModel[],
  into: (id: string) => string | undefined,
  onCycle: (flow: string, id: string) => void
): Map<string, string> {
  const parent = new Map<string, string>();
  const up = new Map<string, string>();
  const root = (id: string): string => {
    let r = id;
    while (up.has(r)) r = up.get(r) as string;
    for (let x = id; x !== r; ) {
      const next = up.get(x) as string;
      up.set(x, r);
      x = next;
    }
    return r;
  };
  for (let i = flows.length - 1; i >= 0; i--) {
    const flow = flows[i] as AgentflowFlowModel;
    if (into(flow.id) !== undefined) continue;
    for (const id of flow.nodes) {
      const top = root(flow.id);
      if (top === id) {
        onCycle(flow.id, id);
        continue;
      }
      parent.set(id, flow.id);
      up.set(id, top);
    }
  }
  return parent;
}
