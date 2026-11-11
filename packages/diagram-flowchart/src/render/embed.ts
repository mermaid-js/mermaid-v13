// Embedded diagram blocks (ADR-15): a node that holds another diagram, rendered before the
// draw and looked up by id. A border, a transparent background, an optional title strip, and
// the inner diagram's own <svg> at its natural size.
import { translate, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import type { FlowRenderContext } from './context.ts';
import type { NodeView } from './prepare.ts';
import type { ShapeSize } from './shapes.ts';

/** Space between the border (or the title strip) and the inner diagram. */
const PAD = 8;
/** Space above and below the title in its strip. */
const TITLE_PAD = 6;
/** The stand-in's inner size when no block was rendered (the plugin called without `mermaid`). */
const STAND_IN = { width: 120, height: 60 };

/** What a block node holds: the rendered inner diagram, or nothing (a stand-in box). */
export type EmbedSlot = NonNullable<ReturnType<NonNullable<FlowRenderContext['embed']>>> | null;

/** The rendered block for `id`, or `null` when there is none. */
export function embedSlot(ctx: FlowRenderContext, id: string): EmbedSlot {
  return ctx.embed?.(id) ?? null;
}

const strip = (th: number): number => (th > 0 ? th + 2 * TITLE_PAD : 0);

/** The box of a block: the inner diagram, the padding and the title strip. */
export function embedSize(slot: EmbedSlot, tw: number, th: number): ShapeSize {
  const inner = slot ?? STAND_IN;
  const h = strip(th) + inner.height + 2 * PAD;
  return {
    w: Math.max(inner.width, tw) + 2 * PAD,
    h,
    // The title is centred in its strip.
    dy: th > 0 ? -h / 2 + strip(th) / 2 : 0,
  };
}

/** The frame, the line under the title strip, and the inner diagram's root spliced in. */
export function drawEmbed(w: SvgWriter, view: NodeView, slot: EmbedSlot, frame: Attrs): void {
  const { w: width, h: height } = view;
  const top = -height / 2;
  const a = frame;
  w.outline('node', 'rect', { x: -width / 2, y: top, width, height, ...a });
  const s = strip(view.label.height);
  if (s > 0) {
    w.outline('divider', 'line', {
      x1: -width / 2,
      y1: top + s,
      x2: width / 2,
      y2: top + s,
      stroke: a.stroke,
      'stroke-width': a['stroke-width'],
    });
  }
  if (!slot) return;
  w.open('g', { class: 'embedded', transform: translate(-slot.width / 2, top + s + PAD) });
  w.embed(slot.svg);
  w.close();
}
