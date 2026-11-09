import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { layoutBlock, type BlockLayout } from './layout/index.ts';
import type { BlockModel } from './model.ts';
import { parseBlock, type BlockParseResult } from './parser/index.ts';

/** v12's detector (`blockDetector.ts`), on the text v12 gave it: case-sensitive, no boundary. */
const DETECTOR = /^\s*block(-beta)?/;

/**
 * The block plugin so far (DESIGN §12.1, spec #521): `layoutKind: 'custom'` with its own
 * `BlockLayout`. `parse` takes the whole source and the limits; `layout` measures every label and
 * lays the grid out. The renderer is #556 and the manifest #558, so this is not yet a
 * `DiagramPlugin`: it has every member but `render`.
 */
export const block = {
  id: 'block',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
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
  layout: (model: BlockModel, ctx: RenderContext): BlockLayout => layoutBlock(model, ctx),
} satisfies Omit<DiagramPlugin<BlockModel, BlockLayout>, 'render'>;
