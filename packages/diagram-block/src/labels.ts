import type { RenderContext } from '@mermaid-js/core';
import { labelSource, type LabelSource } from '@mermaid-js/core/text';
import { readLabel } from '@mermaid-js/core/text/markdown-warning';
import type { Block, BlockModel } from './model.ts';

/** A block's or an edge's label as the model holds it. */
export interface Labelled {
  readonly label: string;
  readonly markdown?: true;
}

/** What a label read takes of the render: the config, and where its warning goes. */
export type BlockLabelContext = Pick<RenderContext, 'config'> &
  Partial<Pick<RenderContext, 'warn' | 'inline'>>;

const ignore = (): undefined => undefined;

/**
 * A block's or an edge's label as the label handler reads it (#1368, #1401): a markdown string
 * the parser marked is markdown, any other label plain, unless `markdownAlwaysOn` makes every
 * label markdown. A plain label that holds emphasis marks gives the render its one
 * `MARKDOWN_NOT_READ` warning. Without a render context (a text grid drawn on its own) the label
 * is read in the default mode, with no warning.
 */
export function blockLabelSource(item: Labelled, ctx: BlockLabelContext | undefined): LabelSource {
  const options = { markdown: item.markdown === true };
  if (!ctx) return labelSource(item.label, options);
  const { config, warn = ignore, inline } = ctx;
  return readLabel(item.label, options, { config, warn, ...(inline ? { inline } : {}) });
}

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
