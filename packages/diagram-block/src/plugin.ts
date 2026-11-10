import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { blockConfigDefaults } from './generated/config-defaults.ts';
import { layoutBlock, type BlockLayout } from './layout/index.ts';
import type { Block, BlockModel } from './model.ts';
import { parseBlock, type BlockParseResult } from './parser/index.ts';
import { renderBlock } from './render/index.ts';

/** v12's detector (`blockDetector.ts`), on the text v12 gave it: case-sensitive, no boundary. */
const DETECTOR = /^\s*block(-beta)?/;

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

/**
 * The block plugin (DESIGN §12.1, spec #521): `layoutKind: 'custom'` with its own `BlockLayout`.
 * `parse` takes the whole source and the limits; `layout` measures every label and lays the grid
 * out; `render` writes the whole `<svg>` document (#556). Block has no theme table (spec #521):
 * it reads core's shared rows. The registry loads it from the package's `mermaid` manifest
 * (#558); `configDefaults` are the `block` section's generated defaults. SVG only until #559.
 */
export const block = {
  id: 'block',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: blockConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => DETECTOR.test(text),
  parse: (text: string, ctx: DiagramParseContext): BlockParseResult =>
    parseBlock(text, {
      preprocessed: ctx.preprocessed,
      ...(ctx.limits
        ? {
            maxNodes: ctx.limits.maxNodes,
            maxEdges: ctx.limits.maxEdges,
            maxDepth: ctx.limits.maxDepth,
          }
        : {}),
    }),
  labels: blockLabels,
  layout: (model: BlockModel, ctx: RenderContext): BlockLayout => layoutBlock(model, ctx),
  render: (model: BlockModel, layout: BlockLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderBlock(model, layout, ctx, w),
} satisfies DiagramPlugin<BlockModel, BlockLayout>;
