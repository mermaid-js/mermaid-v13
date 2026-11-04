import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SequenceModel } from './model.ts';
import { layoutSequence, type SequenceLayout } from './layout/index.ts';
import { detectSequence, parseSequence, type SequenceParseResult } from './parser/index.ts';
import { renderSequence } from './render/index.ts';

/**
 * The sequence diagram plugin (DESIGN §12.1, spec #125): `layoutKind: 'custom'` with its own
 * `SequenceLayout`. `parse` takes the whole source; `layout` measures and places everything;
 * `render` writes the whole `<svg>` document into the writer. The registry loads it from the
 * package's `mermaid` manifest, with the text hook from `./ascii` (#145).
 */
export const sequence = {
  id: 'sequence',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectSequence(text),
  parse: (text: string, ctx: DiagramParseContext): SequenceParseResult =>
    parseSequence(text, {
      preprocessed: ctx.preprocessed,
      maxDepth: (ctx.limits ?? resolveLimits(ctx.config)).maxDepth,
    }),
  layout: (model: SequenceModel, ctx: RenderContext): SequenceLayout => layoutSequence(model, ctx),
  render: (model: SequenceModel, layout: SequenceLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderSequence(model, layout, ctx, w),
} satisfies DiagramPlugin<SequenceModel, SequenceLayout>;
