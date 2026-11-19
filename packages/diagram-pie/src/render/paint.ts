// The colours and the opacity the pie renderer draws with (spec #288 §Renderer, D215, D227):
// v12's pie theme variables (`pie1`…`pie12` by slot), each theme deriving them as its v12 theme did (#325). Each name is
// written as a literal, so the vocabulary `usedBy` scan (`theme-used-by.spec.ts`) sees it. Pie
// has no theme-name or `look` branch, no gradient and no shadow (D227).
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import { PIE_COLOURS } from '../layout/metrics.ts';

type Theme = RenderContext['theme'];

export interface Paints {
  /** `pie${slot + 1}`: a slice and its legend swatch. */
  readonly slot: (colour: number) => Paint;
  readonly stroke: Paint;
  readonly outerStroke: Paint;
  /** `pieOpacity`, a number in [0, 1] (kind `opacity`, D221). */
  readonly opacity: number;
  readonly title: Paint;
  readonly section: Paint;
  readonly legend: Paint;
}

/**
 * Every paint the chart uses, read before the root is written so that it declares their
 * aliases: the slots `slots` lists (each drawn slice and legend row), and the title's colour
 * only when there is a title.
 */
export function paints(theme: Theme, slots: Iterable<number>, title: boolean): Paints {
  const fills = new Map<number, Paint>();
  // `pie1`…`pie12` (a dynamic read, listed in `theme-used-by.spec.ts`).
  for (const s of slots)
    if (!fills.has(s)) fills.set(s, theme.color(`pie${(s % PIE_COLOURS) + 1}`));
  return {
    slot: (c) => fills.get(c)!,
    stroke: theme.color('pieStrokeColor'),
    outerStroke: theme.color('pieOuterStrokeColor'),
    opacity: theme.number('pieOpacity'),
    title: title ? theme.color('pieTitleTextColor') : 'currentColor',
    section: theme.color('pieSectionTextColor'),
    legend: theme.color('pieLegendTextColor'),
  };
}
