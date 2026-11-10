/**
 * The block diagram's text output (spec #521 T7, #559, D449, D320), a separate lazily loaded
 * entry (`@mermaid-js/diagram-block/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws from `BlockModel`, not from the px layout: text has its own grid (`ascii/grid.ts`),
 * one cell width per column at the widest label, so `block.padding` (px) is ignored with no
 * warning (D449). Composites are frames, spaces blank, labels cut with `…`, block arrows boxes
 * with an arrowhead per pointing side, edges stepped lines with arrowheads (`ascii/route.ts`).
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, unicode } from '@mermaid-js/core/ascii';
import type { BlockModel } from './model.ts';
import { drawBlock, type Drawn } from './ascii/draw.ts';
import { BLOCK_TEXT_METRICS } from './ascii/metrics.ts';
import { asciiWarnings, type AsciiWarning } from './ascii/warnings.ts';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiRouteWarning,
  AsciiShapeWarning,
  AsciiWarning,
} from './ascii/warnings.ts';
export type { BlockText, TextBox } from './ascii/grid.ts';
export type { Drawn } from './ascii/draw.ts';
export type { Point, Route } from './ascii/route.ts';
export { BLOCK_TEXT_METRICS } from './ascii/metrics.ts';

/** What the hook reads of core's `TextRenderContext`. */
export type BlockAsciiContext = Pick<TextRenderContext, 'config' | 'warn'> &
  Partial<Pick<TextRenderContext, 'ast' | 'inline'>>;

/** The drawing and the grid it was drawn from (the conformance specs read the grid). */
export function drawBlockText(
  model: BlockModel,
  ctx: BlockAsciiContext
): Drawn & { readonly warnings: readonly AsciiWarning[] } {
  const { charset, padding, maxWidth } = asciiOptions(ctx.config);
  const drawn = drawBlock(model, {
    glyphs: charset === 'ascii' ? asciiGlyphs : unicode,
    spacing: BLOCK_TEXT_METRICS.spacing[padding],
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(ctx.inline ? { inline: ctx.inline } : {}),
  });
  const warnings = asciiWarnings(model, drawn.grid, drawn.forced, ctx.ast, ctx.inline);
  return { ...drawn, warnings };
}

/**
 * The block `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no trailing
 * spaces, never cropped (an `ASCII_TOO_WIDE` warning is the API's, R-ASCII-8). The px layout is
 * not read. Warns once per feature kind it drops (D82).
 */
export function ascii(model: BlockModel, _layout: unknown, ctx: BlockAsciiContext): string {
  const { text, warnings } = drawBlockText(model, ctx);
  for (const w of warnings) ctx.warn(w);
  return text;
}
