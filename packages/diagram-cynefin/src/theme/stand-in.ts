/**
 * The cynefin theme variables, read through one module until they exist (spec #423, #414 T0a).
 *
 * v12 reads 15 variables from `themeVariables.cynefin` (`theme-default.js:298-315`). v13 has
 * none of them yet: T4 (#468) declares them in the plugin's `DiagramPlugin.theme` table (#414
 * T0a, D322, D331, D335), and `Theme.number('cynefin…')` throws for a name it does not know.
 * Until then every cynefin reader goes through here, so T4 swaps this one module for theme
 * reads and nothing else changes. An author's `themeVariables.cynefin.*` override is not honoured yet.
 *
 * The lengths are v12's defaults, identical in every v12 theme. T4 (#468) adds the colours.
 */
import type { Theme } from '@mermaid-js/core/theme';

/** The five cynefin length variables, in px. */
export interface CynefinThemeLengths {
  /** `cynefin.domainFontSize`: domain labels; the title is 2 px larger. */
  readonly domainFontSize: number;
  /** `cynefin.itemFontSize`: item badges; subtitles and transition labels are 1 px smaller. */
  readonly itemFontSize: number;
  /** `cynefin.boundaryWidth`: the fold's and the horizon's stroke. */
  readonly boundaryWidth: number;
  /** `cynefin.cliffWidth`: the cliff's stroke. */
  readonly cliffWidth: number;
  /** `cynefin.arrowWidth`: a transition's stroke, which also scales its arrowhead. */
  readonly arrowWidth: number;
}

const V12_LENGTHS: CynefinThemeLengths = {
  domainFontSize: 16,
  itemFontSize: 12,
  boundaryWidth: 2,
  cliffWidth: 4,
  arrowWidth: 2,
};

/** The cynefin lengths of `theme` (v12's defaults until T4 adds the variables). */
export function cynefinThemeLengths(theme: Theme): CynefinThemeLengths {
  void theme;
  return V12_LENGTHS;
}
