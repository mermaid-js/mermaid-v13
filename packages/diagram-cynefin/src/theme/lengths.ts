/**
 * The cynefin length variables (spec #423 "Theme variables"), read from the theme: the plugin's
 * `DiagramPlugin.theme` table declares them (`plugin.ts`, D331), with v12's defaults in every
 * theme family and an author's `themeVariables.cynefin.*` or flat `cynefin…` override on top.
 * Each name is written as a literal, so the `usedBy` and direction scans see it.
 */
import type { Theme } from '@mermaid-js/core/theme';

/** The five cynefin length variables, in px. */
export interface CynefinThemeLengths {
  /** `cynefinDomainFontSize`: domain labels; the title is 2 px larger. */
  readonly domainFontSize: number;
  /** `cynefinItemFontSize`: item badges; subtitles and transition labels are 1 px smaller. */
  readonly itemFontSize: number;
  /** `cynefinBoundaryWidth`: the fold's and the horizon's stroke. */
  readonly boundaryWidth: number;
  /** `cynefinCliffWidth`: the cliff's stroke. */
  readonly cliffWidth: number;
  /** `cynefinArrowWidth`: a transition's stroke, which also scales its arrowhead. */
  readonly arrowWidth: number;
}

/** The cynefin lengths of `theme`. */
export function cynefinThemeLengths(theme: Pick<Theme, 'number'>): CynefinThemeLengths {
  return {
    domainFontSize: theme.number('cynefinDomainFontSize'),
    itemFontSize: theme.number('cynefinItemFontSize'),
    boundaryWidth: theme.number('cynefinBoundaryWidth'),
    cliffWidth: theme.number('cynefinCliffWidth'),
    arrowWidth: theme.number('cynefinArrowWidth'),
  };
}
