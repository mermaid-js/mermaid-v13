// The block text drawing with its warnings, from core's `ascii` options: what the `ascii` hook
// writes out, and what the conformance specs read (`./testing`: the grid, the routes).
import type { TextRenderContext } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, unicode } from '@mermaid-js/core/ascii';
import type { BlockModel } from '../model.ts';
import { drawBlock, type BlockDrawing } from './draw.ts';
import { BLOCK_TEXT_METRICS } from './metrics.ts';
import { asciiWarnings, type AsciiWarning } from './warnings.ts';

/** What the hook reads of core's `TextRenderContext`. */
export type BlockAsciiContext = Pick<TextRenderContext, 'config' | 'warn'> &
  Partial<Pick<TextRenderContext, 'ast' | 'inline'>>;

/** The drawing and the grid it was drawn from (the conformance specs read the grid). */
export function drawBlockText(
  model: BlockModel,
  ctx: BlockAsciiContext
): BlockDrawing & { readonly warnings: readonly AsciiWarning[] } {
  const { charset, padding, maxWidth } = asciiOptions(ctx.config);
  const drawn = drawBlock(model, {
    glyphs: charset === 'ascii' ? asciiGlyphs : unicode,
    spacing: BLOCK_TEXT_METRICS.spacing[padding],
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(ctx.inline ? { inline: ctx.inline } : {}),
    config: ctx.config,
  });
  const labels = { config: ctx.config, ...(ctx.inline ? { inline: ctx.inline } : {}) };
  const warnings = asciiWarnings(model, drawn.grid, drawn.forced, ctx.ast, labels);
  return { ...drawn, warnings };
}
