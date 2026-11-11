/**
 * The sequence diagram's text output (D100, D108, DESIGN §6.3), a separate lazily loaded entry
 * (`@mermaid-js/diagram-sequence/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws the same `SequenceLayout` the SVG renderer draws, computed with the cell metrics
 * (the cell measurer and the cell profile, D108), with core's text-grid kit.
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { asciiOptions, cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import type { SequenceModel } from './model.ts';
import { layoutSequence, type SequenceLayout } from './layout/index.ts';
import { drawSequence, type Align } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';
import { glyphSetOf } from '@mermaid-js/shared/ascii';

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
  const glyphs = glyphSetOf(ctx.config);
  const config = (ctx.config.sequence ?? {}) as Readonly<Record<string, unknown>>;
  const warnings = asciiWarnings(model, laid, { ast: ctx.ast, charset: glyphs.name, config });
  for (const w of warnings) ctx.warn(w);
  // The diagram's own `title` statement is laid out; else the front-matter title goes on top.
  const seq = ctx.config.sequence ?? {};
  const align = (v: unknown): Align | undefined =>
    v === 'left' || v === 'center' || v === 'right' ? v : undefined;
  return drawSequence(laid, glyphs, {
    ...(laid.title || ctx.title === undefined ? {} : { title: ctx.title }),
    ...(align(seq.messageAlign) ? { messageAlign: align(seq.messageAlign) } : {}),
    ...(align(seq.noteAlign) ? { noteAlign: align(seq.noteAlign) } : {}),
  });
}
