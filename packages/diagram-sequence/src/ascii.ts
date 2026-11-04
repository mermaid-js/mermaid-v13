/**
 * The sequence diagram's text output (D100, D108, DESIGN §6.3), a separate lazily loaded entry
 * (`@mermaid-js/diagram-sequence/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws the same `SequenceLayout` the SVG renderer draws, computed with the cell metrics
 * (the cell measurer and the cell profile, D108), with core's text-grid kit.
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, cellMeasurer, unicode } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import type { SequenceModel } from './model.ts';
import { layoutSequence, type SequenceLayout } from './layout/index.ts';
import { drawSequence } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiShapeWarning,
  AsciiWarning,
} from './ascii/warnings.ts';

/**
 * Lays a sequence diagram out in cells: the cell measurer and the cell profile
 * (`ascii.padding`), whatever `ctx` carries (D108).
 */
export function layoutAscii(model: SequenceModel, ctx: TextRenderContext): SequenceLayout {
  const { padding } = asciiOptions(ctx.config);
  return layoutSequence(model, { ...ctx, measurer: cellMeasurer, units: cellProfile(padding) });
}

/**
 * The sequence diagram's `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no
 * trailing spaces. Warns once per feature kind it drops and once for the participant symbols
 * drawn as plain boxes (D82). A layout not in cells is redone with `layoutAscii`.
 */
export function ascii(
  model: SequenceModel,
  layout: SequenceLayout,
  ctx: TextRenderContext
): string {
  const laid = layout.units === 'cell' ? layout : layoutAscii(model, ctx);
  const glyphs = asciiOptions(ctx.config).charset === 'ascii' ? asciiGlyphs : unicode;
  const shown = new Set(laid.participants.map((p) => p.id));
  for (const w of asciiWarnings(model, shown, ctx.ast)) ctx.warn(w);
  // The diagram's own `title` statement is laid out; else the front-matter title goes on top.
  return drawSequence(laid, glyphs, laid.title ? undefined : ctx.title);
}
