// A subpath of its own, which only the diagrams with such labels load (D557): core's index does
// not re-export it, so it stays outside the core closure (R-PERF-8).
import type { InlineSpans } from './inline.ts';

/**
 * `inline` for a label that draws no inline boxes, such as a title: it finds no span, and keeps
 * the render's whole-label provider (D695) and warnings.
 */
export const tagsOnly = (inline: InlineSpans | undefined): InlineSpans | undefined =>
  inline && { ...inline, extract: () => undefined };
