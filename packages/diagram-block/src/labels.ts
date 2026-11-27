import { labelSource, type LabelConfig, type LabelSource } from '@mermaid-js/core/text';
import type { Block, BlockModel } from './model.ts';

/** A block's or an edge's label as the model holds it. */
export interface Labelled {
  readonly label: string;
  readonly markdown?: true;
}

/**
 * A block's or an edge's label as the label handler reads it (D734): a markdown string the
 * parser marked (D736) is markdown, any other label plain. v12 read markdown in no block label
 * (its grammar rejected markdown strings), so no label kind has `v12Markdown`.
 */
export const blockLabelSource = (item: Labelled, config: LabelConfig): LabelSource =>
  labelSource(item.label, { markdown: item.markdown === true, v12Markdown: false }, config);

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
