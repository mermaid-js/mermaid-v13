// The colours and opacities the radar renderer draws with (spec #422 §Renderer, D215, D227):
// the curve slots from the `cScale` palette (D258, slot = curve index mod 12, D353), radar's own
// variables from the plugin's theme table, and the shared `textColor` for every text (D352).
// Each name is written as a literal, so the vocabulary `usedBy` scan
// (`theme-used-by.spec.ts`) sees it. Radar has no theme-name or `look` branch (D227).
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import type { RadarLayout } from '../layout/index.ts';

type Theme = RenderContext['theme'];

export interface Paints {
  /** `cScale[slot]`: a curve and its legend swatch, fill and stroke. */
  readonly slot: (slot: number) => Paint;
  readonly axis: Paint;
  readonly graticule: Paint;
  /** `radarCurveOpacity` and `radarGraticuleOpacity`, numbers in [0, 1] (kind `opacity`, D221). */
  readonly curveOpacity: number;
  readonly graticuleOpacity: number;
  readonly text: Paint;
}

/**
 * `currentColor`, as core's DSL: past the end of a palette (an author's shorter list), and for
 * a paint nothing drawn uses, so that its alias is not declared.
 */
const CURRENT_COLOR: Paint = 'currentColor';

/**
 * Every paint the chart uses, read before the root is written so that it declares their
 * aliases: only the ones something drawn uses.
 */
export function paints(theme: Theme, layout: RadarLayout): Paints {
  const scale = theme.palette('cScale');
  const anyText =
    layout.title !== undefined || layout.spokes.length > 0 || layout.legend.length > 0;
  return {
    slot: (s) => scale[s] ?? CURRENT_COLOR,
    axis: layout.spokes.length > 0 ? theme.color('radarAxisColor') : CURRENT_COLOR,
    graticule: layout.rings.length > 0 ? theme.color('radarGraticuleColor') : CURRENT_COLOR,
    curveOpacity: theme.number('radarCurveOpacity'),
    graticuleOpacity: theme.number('radarGraticuleOpacity'),
    text: anyText ? theme.color('textColor') : CURRENT_COLOR,
  };
}
