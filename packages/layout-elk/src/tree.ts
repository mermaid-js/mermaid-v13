/**
 * The group tree of a `LayoutGraph`, as v12 develop's ELK adapter reads it
 * (`find-common-ancestor.ts`, `nestedEdgeOrder.ts`): who sits in which group, the innermost group
 * two ends share, and the order edges reach ELK in.
 */

/** The ELK root's id. Not a valid node or group id, so it never collides with one. */
export const ROOT = '';

/** Parent group of each node and group id; an id at the top level has no entry. */
export type Tree = ReadonlyMap<string, string>;

/** The ends of an edge, as ELK is given them. */
export interface EdgeEnds {
  source: string;
  target: string;
}

/**
 * The innermost group holding both `a` and `b`, or `ROOT`. A self edge gives its parent, and an
 * edge between a group and something inside it gives the group itself, where ELK wants such an
 * edge to live (v12 `findCommonAncestor`).
 */
export function findCommonAncestor(a: string, b: string, tree: Tree): string {
  if (a === b) return tree.get(a) ?? ROOT;
  const seen = new Set<string>();
  for (let id: string | undefined = a; id !== undefined; id = tree.get(id)) {
    if (id === b) return id;
    seen.add(id);
  }
  for (let id: string | undefined = b; id !== undefined; id = tree.get(id))
    if (seen.has(id)) return id;
  return ROOT;
}

/** Whether `id` sits inside the group `ancestor`, at any depth. */
export function isInside(id: string, ancestor: string, tree: Tree): boolean {
  for (let p = tree.get(id); p !== undefined; p = tree.get(p)) if (p === ancestor) return true;
  return false;
}

/**
 * The order to hand ELK the edges in, so that an edge from inside a group does not cross the
 * edge from that group's border (v12 `orderNestedEdgeEnds`).
 *
 * With `considerModelOrder` set, ELK 0.10 and later line up the edges that share an end in
 * declaration order, even where that adds a crossing: `outer --> a`, then `da --> a` with `da`
 * inside `outer`, cross on the way to `a`. Each such edge therefore moves in front of the first
 * edge declared before it that leaves the group around its source for the same target, or that
 * enters the group around its target from the same source. All other edges keep their order.
 *
 * Returns the edge indexes in the order to hand them to ELK.
 */
export function orderNestedEdgeEnds(edges: readonly EdgeEnds[], tree: Tree): number[] {
  const order = edges.map((_, index) => index);
  edges.forEach(({ source, target }, index) => {
    const from = order.indexOf(index);
    const to = order.findIndex((other, position) => {
      const earlier = edges[other]!;
      return (
        position < from &&
        ((earlier.target === target && isInside(source, earlier.source, tree)) ||
          (earlier.source === source && isInside(target, earlier.target, tree)))
      );
    });
    if (to !== -1) {
      order.splice(from, 1);
      order.splice(to, 0, index);
    }
  });
  return order;
}
