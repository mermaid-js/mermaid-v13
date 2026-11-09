// cspell:words Tarjan
/**
 * Cycles among a sankey's links (D393), which d3-sankey cannot lay out: the groups of nodes
 * that reach each other (Tarjan's strongly connected components, iterative so a long chain
 * cannot overflow the stack), each with the first link, in row order, that lies on a cycle
 * inside it. Linear in nodes plus links.
 */

interface Edge {
  from: number;
  to: number;
}

/** Out-links per node in row order: `out[head[v]…head[v + 1])` are node `v`'s link indexes. */
function adjacency(nodeCount: number, links: readonly Edge[]) {
  const head = new Int32Array(nodeCount + 1);
  for (const l of links) head[l.from + 1] = (head[l.from + 1] ?? 0) + 1;
  for (let v = 0; v < nodeCount; v++) head[v + 1] = (head[v + 1] ?? 0) + (head[v] ?? 0);
  const out = new Int32Array(links.length);
  const fill = head.slice(0, nodeCount);
  links.forEach((l, k) => {
    const at = fill[l.from] ?? 0;
    out[at] = k;
    fill[l.from] = at + 1;
  });
  return { head, out };
}

/** The strongly connected component of each node, numbered from 0, and their count. */
function components(nodeCount: number, links: readonly Edge[]) {
  const { head, out } = adjacency(nodeCount, links);
  const index = new Int32Array(nodeCount).fill(-1);
  const low = new Int32Array(nodeCount);
  const component = new Int32Array(nodeCount).fill(-1);
  const onStack = new Uint8Array(nodeCount);
  const stack: number[] = [];
  // The DFS path: a node, and the next of its out-links to follow.
  const path: number[] = [];
  const edge: number[] = [];
  let counter = 0;
  let count = 0;
  const visit = (v: number) => {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = 1;
    path.push(v);
    edge.push(head[v] ?? 0);
  };
  /** `v` is done: fold its low link into its parent's; close its component if it roots one. */
  const finish = (v: number) => {
    const parent = path[path.length - 1];
    if (parent !== undefined) low[parent] = Math.min(low[parent] ?? 0, low[v] ?? 0);
    if (low[v] !== index[v]) return;
    let w: number;
    do {
      w = stack.pop() ?? v;
      onStack[w] = 0;
      component[w] = count;
    } while (w !== v);
    count++;
  };
  for (let root = 0; root < nodeCount; root++) {
    if (index[root] !== -1) continue;
    visit(root);
    while (path.length > 0) {
      const v = path[path.length - 1] ?? 0;
      const e = edge[edge.length - 1] ?? 0;
      if (e < (head[v + 1] ?? 0)) {
        edge[edge.length - 1] = e + 1;
        const w = links[out[e] ?? 0]?.to ?? 0;
        if (index[w] === -1) visit(w);
        else if (onStack[w]) low[v] = Math.min(low[v] ?? 0, index[w] ?? 0);
        continue;
      }
      path.pop();
      edge.pop();
      finish(v);
    }
  }
  return { component, count };
}

/** Each cycle's first link in row order, as indexes into `links`, in row order. */
export function cycleLinks(nodeCount: number, links: readonly Edge[]): number[] {
  const { component, count } = components(nodeCount, links);
  // A link inside one component lies on a cycle (its target reaches its source).
  const first = new Int32Array(count).fill(-1);
  links.forEach((l, k) => {
    const c = component[l.from] ?? -1;
    if (c >= 0 && c === component[l.to] && first[c] === -1) first[c] = k;
  });
  return [...first].filter((k) => k >= 0).sort((a, b) => a - b);
}
