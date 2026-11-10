/**
 * v12's `getData` containment rules (`fa796a943` `agentflowDb.ts`), run once over the parsed
 * flows (D461): which collapsed flow hides each id, and each id's parent flow with the
 * assignment that would close a containment cycle refused. v12 walked the parents of the flow
 * for every assignment, and the members of each collapsed flow again for each collapsed flow
 * around it; both are linear here (union-find roots, and redirects between collapses), with
 * v12's results.
 */
import type { AstId, Range } from '@mermaid-js/core/parser-kit';
import type { AgentflowFlowModel } from './model.ts';

/** Where something is written, and the AST id of the statement that wrote it. */
export interface Mark {
  at: Range;
  ast: AstId;
}

/**
 * Where each flow is opened and lists its members, for `CONTAINMENT_VIOLATION` (D461: "the
 * inner `flow` opener"): a cycle is reported at the opening of the contained flow inside the
 * container that closes the loop, or at the contained flow's first opening when the container
 * lists it by name only, and names both openings.
 */
export class FlowOpenings {
  private readonly first = new Map<string, Mark>();
  private readonly latest = new Map<string, Mark>();
  /** For each id a flow lists: that flow's opening, and the id's own opening inside it. */
  private readonly listed = new Map<string, { container: AstId; nested?: Mark }>();

  /** At its `end`: the opening `opening` of flow `id` lists `members` (first listed there). */
  closed(id: string, opening: Mark, members: readonly string[]): void {
    for (const n of members) {
      // A flow opened after this opener (and so closed before its `end`) is opened inside it.
      const inner = this.latest.get(n);
      const nested = inner && inner.at.start > opening.at.start ? { nested: inner } : {};
      this.listed.set(n, { container: opening.ast, ...nested });
    }
    this.latest.set(id, opening);
    if (!this.first.has(id)) this.first.set(id, opening);
  }

  /** Where the refused nesting of `id` in `container` is reported, and what it names. */
  cycle(container: string, id: string): { range: Range; astIds: AstId[] } {
    const m = this.listed.get(id);
    const inner = m?.nested ?? this.first.get(id);
    const outer = m?.container ?? this.first.get(container)?.ast;
    return {
      range: inner?.at ?? { start: 0, end: 0 },
      astIds: [inner?.ast, outer].filter((a): a is AstId => a !== undefined),
    };
  }
}

/** The end of `id`'s chain of links, with path compression (every link on it now points there). */
function rootOf(links: Map<string, string>, id: string): string {
  let r = id;
  while (links.has(r)) r = links.get(r) as string;
  for (let x = id; x !== r; ) {
    const next = links.get(x) as string;
    links.set(x, r);
    x = next;
  }
  return r;
}

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
  return (id) => {
    const h = hidden.get(id);
    return h === undefined ? undefined : rootOf(redirect, h);
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
  for (let i = flows.length - 1; i >= 0; i--) {
    const flow = flows[i] as AgentflowFlowModel;
    if (into(flow.id) !== undefined) continue;
    for (const id of flow.nodes) {
      const top = rootOf(up, flow.id);
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
