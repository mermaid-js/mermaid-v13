// Embedded diagram blocks (ADR-15): a node that holds another diagram, rendered before the
// draw and looked up by id. Its frame is core's (`@mermaid-js/core/svg/framed`): a border, a
// transparent background, an optional title strip, and the inner diagram's own <svg>.
import type { EmbeddedDiagram, EmbeddedText } from '@mermaid-js/core';
import { framedSize, titleStrip } from '@mermaid-js/core/svg/framed';
import type { FlowRenderContext } from './context.ts';
import type { ShapeSize } from './shapes.ts';

/** What a block node holds: the rendered inner diagram, or nothing (a stand-in box). */
export type EmbedSlot = EmbeddedDiagram | null;

/** What a block node holds in text output: the inner diagram's text, or nothing. */
export type EmbedText = EmbeddedText;

/**
 * A block's box in cells (text output): a border, the title rows and a divider under them when
 * there is a title, and the inner text with `pad` cells round it. A titled box is tall enough
 * that its middle row, where a sideways edge meets it, is below the divider.
 */
export function embedTextSize(
  inner: EmbedText,
  title: { width: number; rows: number },
  pad: { x: number; y: number }
): { w: number; h: number } {
  const strip = title.width > 0 ? title.rows + 1 : 0;
  const h = strip + inner.rows + 2 * (pad.y + 1);
  return {
    w: Math.max(inner.columns, title.width) + 2 * (pad.x + 1),
    h: strip > 0 ? Math.max(h, 2 * strip + 3) : h,
  };
}

/** The rendered block for `id`, or `null` when there is none. */
export function embedSlot(ctx: FlowRenderContext, id: string): EmbedSlot {
  return ctx.embed?.(id) ?? null;
}

/** The box of a block: the inner diagram (none: a stand-in), the padding and the title strip. */
export function embedSize(slot: EmbedSlot | undefined, tw: number, th: number): ShapeSize {
  const { width: w, height: h } = framedSize(slot ?? null, { width: tw, height: th });
  // The title is centred in its strip.
  return { w, h, dy: th > 0 ? -h / 2 + titleStrip(th) / 2 : 0 };
}
