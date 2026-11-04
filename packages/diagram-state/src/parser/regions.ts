/** Concurrency regions in the AST: a composite state's statements split at `--`. */
import { nodeId } from '@mermaid-js/core/parser-kit';
import type { StateRegionNode, StateStatementNode } from './ast.ts';
import type { Item, StateItem } from './model.ts';

/**
 * The children of composite `name`: its statements, or its regions (`r:<name>#<k>`, k counted
 * per name in `counts`) when `--` splits it and the last region is not empty (v12 splits
 * nothing otherwise). Each `--` statement in `items` (one per node) takes the AST id of the
 * region it closes, for the model builder.
 */
export function splitRegions(
  name: string,
  nodes: StateStatementNode[],
  items: readonly Item[],
  counts: Map<string, number>
): StateStatementNode[] | StateRegionNode[] {
  let last = nodes.length - 1;
  while (last >= 0 && nodes[last]?.type !== 'Divider') last--;
  if (last < 0 || last === nodes.length - 1) return nodes;
  const key = nodeId(name).slice(2);
  const out: StateRegionNode[] = [];
  let part: StateStatementNode[] = [];
  let k = counts.get(name) ?? 0;
  const close = (children: StateStatementNode[]) => {
    k++;
    const first = children[0];
    const end = children[children.length - 1];
    out.push({
      id: `r:${key}#${k}`,
      type: 'Region',
      range: { start: first?.range.start ?? 0, end: end?.range.end ?? 0 },
      children,
    });
  };
  nodes.forEach((node, n) => {
    part.push(node);
    if (node.type !== 'Divider') return;
    close(part);
    (items[n] as StateItem).ast = `r:${key}#${k}`;
    part = [];
  });
  close(part);
  counts.set(name, k);
  return out;
}
