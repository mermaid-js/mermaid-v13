// The colours the treemap renderer draws with (spec #428 "Renderer (T4)", D215, D227, D404,
// D406): v12's three ordinal scales over the shared `cScale` and `cScaleLabel` palettes (D258)
// and treemap's own `cScalePeer<n>` (its theme table), and the title from `treemapTitleColor`
// (D407). The layout already chose each item's slot in v12's first-lookup order; this file maps
// slots to paints. Treemap has no theme-name or `look` branch (D227).
import type { RenderContext } from '@mermaid-js/core';
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import type { TreemapLayout } from '../layout/index.ts';

type Theme = RenderContext['theme'];

export interface Paints {
  /** Fill slot → paint: 0 is `transparent`, n is `cScale<n - 1>` (v12's fill range). */
  readonly fill: (slot: number) => Paint;
  /** Fill slot → a section's stroke: 0 is `transparent`, n is `cScalePeer<n - 1>`. */
  readonly peer: (slot: number) => Paint;
  /** Label slot → `cScaleLabel<slot>`. */
  readonly label: (slot: number) => Paint;
  readonly title: Paint;
}

/** v12's first fill and stroke colour, which the hidden root's `''` takes (D404). */
const TRANSPARENT = checkColor('transparent') as Paint;

/** `currentColor`, as core's DSL: past the end of a palette (an author's shorter list). */
const CURRENT_COLOR = 'currentColor' as Paint;

/**
 * Every paint the treemap uses, read before the root is written so that it declares their
 * aliases: only the ones something drawn uses. v12's leaf strokes take the fill scale, not the
 * peer scale (`renderer.ts:351-354`); only section strokes read `cScalePeer`.
 */
export function paints(theme: Theme, layout: TreemapLayout): Paints {
  const scale = theme.palette('cScale');
  const labels = theme.palette('cScaleLabel');
  const peers = new Map<number, Paint>();
  for (const s of layout.sections)
    if (s.fill > 0 && !peers.has(s.fill)) peers.set(s.fill, theme.color(`cScalePeer${s.fill - 1}`));
  return {
    fill: (slot) => (slot === 0 ? TRANSPARENT : (scale[slot - 1] ?? CURRENT_COLOR)),
    peer: (slot) => (slot === 0 ? TRANSPARENT : (peers.get(slot) ?? CURRENT_COLOR)),
    label: (slot) => labels[slot] ?? CURRENT_COLOR,
    title: layout.title ? theme.color('treemapTitleColor') : CURRENT_COLOR,
  };
}
