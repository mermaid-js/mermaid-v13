/**
 * The packet diagram's text output (spec #421 T7, D347, D320), a separate lazily loaded entry
 * (`@mermaid-js/diagram-packet/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * It draws from `PacketModel`, not from the px layout: the bit grid is already in the model, and
 * text has its own geometry (2 columns a bit). `rowHeight`, `bitWidth` and the paddings are px
 * geometry and are ignored, with no warning (D347). Labels and the title go through core's label
 * layout in cells, so entities decode and `<br>` breaks as in SVG (D343).
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { ascii as asciiGlyphs, asciiOptions, unicode } from '@mermaid-js/core/ascii';
import { packetConfig } from './config.ts';
import type { PacketModel } from './model.ts';
import { drawPacket } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';

export type { AsciiDroppedFeature, AsciiDroppedWarning } from './ascii/warnings.ts';

/** What the hook reads of core's `TextRenderContext`. */
export type PacketAsciiContext = Pick<TextRenderContext, 'config' | 'warn'> &
  Partial<Pick<TextRenderContext, 'ast' | 'inline'>>;

/**
 * The packet `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no trailing
 * spaces, never cropped (an `ASCII_TOO_WIDE` warning is the API's, R-ASCII-8). The layout is not
 * read. Warns once per feature kind it drops (D82).
 */
export function ascii(model: PacketModel, _layout: unknown, ctx: PacketAsciiContext): string {
  // The parse already warned about each option it could not use (`PACKET_CONFIG_INVALID`).
  const { showBits, bitOrder } = packetConfig(ctx.config.packet ?? {}).config;
  const { charset, padding, maxWidth } = asciiOptions(ctx.config);
  const drawn = drawPacket(model, {
    glyphs: charset === 'ascii' ? asciiGlyphs : unicode,
    showBits,
    padding,
    descending: bitOrder === 'descending',
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(ctx.inline ? { inline: ctx.inline } : {}),
    config: ctx.config,
  });
  for (const w of asciiWarnings(model, drawn.emphasis, ctx.ast)) ctx.warn(w);
  return drawn.text;
}
