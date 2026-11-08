/**
 * The paints the sankey renderer draws with (spec #427 §Renderer, D215, D227). Sankey adds no
 * theme variables (D152): node colours are the layout's (Tableau10 slots, a package constant,
 * or `nodeColors` entries), and text reads only the shared `textColor` and, for `outlined`
 * labels, `mainBkg` (v12 `styles.js`: `mainBkg || background || '#fff'`; every v13 theme sets
 * `mainBkg`). There is no theme-name or `look` branch, no D182 gradient and no shadow.
 */
import type { RenderContext } from '@mermaid-js/core';
import { checkColor, type Paint, type SafeColor } from '@mermaid-js/core/svg';
import type { SankeyLayout } from '../layout/index.ts';

type Theme = RenderContext['theme'];

export interface Paints {
  /** Each node's fill, by model index: `undefined` when its colour fails the colour check. */
  readonly nodes: readonly (SafeColor | undefined)[];
  /** The labels' fill, v12's root `fill` (`textColor`). */
  readonly text: Paint;
  /** The `outlined` halo's stroke (`mainBkg`); read only under `outlined`. */
  readonly halo?: Paint;
}

/**
 * Every paint the diagram uses, read before the root is written so that its style declares
 * their aliases. A `nodeColors` entry is drawn as written when it passes core's colour check
 * (`#503` warns on one that does not and draws the default instead); a failing one is not
 * written, so the browser draws it as v12's invalid attribute was drawn: inherited.
 */
export function paints(theme: Theme, layout: SankeyLayout): Paints {
  return {
    nodes: layout.nodes.map((n) => checkColor(n.fill)),
    text: theme.color('textColor'),
    ...(layout.labelStyle === 'outlined' ? { halo: theme.color('mainBkg') } : {}),
  };
}
