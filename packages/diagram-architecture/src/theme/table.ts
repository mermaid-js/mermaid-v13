import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Architecture's theme table (`DiagramPlugin.theme`, D331, spec #525 "Integration"): one light
 * rule, which dark themes inherit, as v12 set the five variables in every theme file (D227: the
 * families differ through the shared vocabulary only).
 *
 * - The edge and its arrowheads: `lineColor`, as v12's `updateColors` set them.
 * - The group border: v12 copied `primaryBorderColor` in each theme's constructor, before the
 *   theme recomputed it, so it drew the constructor's border. `calloutBorder` is that colour
 *   (the D332 input gitGraph's tags read: the author's `primaryBorderColor`, else v12's resolved
 *   border), so `inline(calloutBorder, primaryBorderColor)` gives v12's border in ten themes,
 *   where `primaryBorderColor` gives it in five (GAPS T4).
 * - The widths: v12's `3` (no unit, so px) and `2px` in every theme.
 *
 * v12's `base` pinned `#777` and `#000` where every other theme derived them; no trait separates
 * `base` from `default`, so it takes the rule (D541, a family-rule approximation the oracle
 * theme spec lists in `DIFFERENCES`, with a MIGRATION.md row). It names no theme (D331).
 */
const WIDTHS = { tokens: { archEdgeWidth: 3, archGroupBorderWidth: 2 } } as const;

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      archEdgeColor: 'lineColor',
      archEdgeArrowColor: 'lineColor',
      archGroupBorderColor: 'inline(calloutBorder, primaryBorderColor)',
    },
  },
  families: { classic: WIDTHS, redux: WIDTHS, neo: { fallback: 'redux' } },
};
