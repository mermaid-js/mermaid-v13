import type { Block, BlockModel } from './model.ts';

/**
 * The label texts the diagram draws, as written (`DiagramPlugin.labels`): each block's but a
 * space's (a composite's only when it has one) and each labelled edge's, so an extension looks
 * for its markup (math's `$$`) in labels only, not in `style` or `classDef` text.
 */
export function blockLabels(model: BlockModel): readonly string[] {
  const out: string[] = [];
  const stack: Block[] = [...model.blocks].reverse();
  while (stack.length > 0) {
    const b = stack.pop()!;
    if (b.type !== 'space' && b.label !== '') out.push(b.label);
    for (let i = b.children.length - 1; i >= 0; i--) stack.push(b.children[i]!);
  }
  for (const e of model.edges) if (e.label !== '') out.push(e.label);
  return out;
}
