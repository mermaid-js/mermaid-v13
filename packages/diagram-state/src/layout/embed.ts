// Embedded diagram blocks (ADR-15): a state that holds another diagram, rendered before the
// draw and looked up by id. Its box is the inner diagram at its natural size, the padding
// around it and an optional title strip on top.
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { StateRenderContext } from './context.ts';

/** Space between the border (or the title strip) and the inner diagram. */
export const EMBED_PAD = 8;
/** Space above and below the title in its strip. */
const TITLE_PAD = 6;
/** The stand-in's inner size when no block was rendered (the plugin called without `mermaid`). */
const STAND_IN = { width: 120, height: 60 };

/** What a block holds: the rendered inner diagram, or nothing (a stand-in frame). */
export type EmbedSlot = NonNullable<ReturnType<NonNullable<StateRenderContext['embed']>>> | null;

/** The height of the title strip for a title `th` high; none for an untitled block. */
export const titleStrip = (th: number): number => (th > 0 ? th + 2 * TITLE_PAD : 0);

/** The box of a block: the inner diagram, the padding and the title strip. */
export function embedSize(slot: EmbedSlot, title: MeasuredLabel): { w: number; h: number } {
  const inner = slot ?? STAND_IN;
  return {
    w: Math.max(inner.width, title.width) + 2 * EMBED_PAD,
    h: titleStrip(title.height) + inner.height + 2 * EMBED_PAD,
  };
}
