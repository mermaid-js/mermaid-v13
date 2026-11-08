/**
 * The paints the sankey renderer reads from the theme (spec #427 §Renderer, D215, D227). Sankey
 * adds no theme variables (D152): node and link colours are the layout's (`fill`,
 * `sourceFill`, `targetFill`: Tableau10 slots, a package constant, or checked `nodeColors`
 * entries), and text reads only the shared `textColor` and, for `outlined` labels, `mainBkg`
 * (v12 `styles.js`: `mainBkg || background || '#fff'`; every v13 theme sets `mainBkg`). There
 * is no theme-name or `look` branch, no D182 gradient and no shadow.
 */
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import type { SankeyLabelStyle } from '../layout/index.ts';

export interface Paints {
  /** The labels' fill, v12's root `fill` (`textColor`). */
  readonly text: Paint;
  /** The `outlined` halo's stroke (`mainBkg`); read only under `outlined`. */
  readonly halo?: Paint;
}

/** The theme paints, read before the root is written so that its style declares their aliases. */
export function paints(theme: RenderContext['theme'], labelStyle: SankeyLabelStyle): Paints {
  return {
    text: theme.color('textColor'),
    ...(labelStyle === 'outlined' ? { halo: theme.color('mainBkg') } : {}),
  };
}
