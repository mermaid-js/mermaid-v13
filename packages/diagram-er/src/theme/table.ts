/**
 * ER's theme table (`DiagramPlugin.theme`, D331, spec #414 T3): keyed by family, never by theme
 * name, so a new theme that declares a family draws ER diagrams with no entry here.
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  // Where themes of one family write a colour differently (the classic row fills, the redux
  // colour themes' edge labels), it reads a shared input as each theme wrote it (`inline()`,
  // D332), byte for byte.
  rules: {
    light: {
      rowOdd: 'inline(rowBkg)',
      rowEven: 'inline(rowAltBkg)',
      erEdgeLabelBackground: 'inline(linkLabelBkg)',
      // v12 classic draws the zero circle white.
      erMarkerFill: '#ffffff',
    },
  },
  families: {
    // v12 `zero_or_more`: refX 39, cx 9.
    classic: { tokens: { erZeroOrMoreCircleOffset: 30 } },
    // v12 neo has no row fill of its own, so rows show the entity's, and its `zero_or_one_neo`
    // fills the zero circle with the node fill; `zero_or_more_neo` puts the circle's centre 28
    // out (refX 39, cx 11; the start copy has 27.5).
    redux: {
      rules: { rowOdd: 'mainBkg', rowEven: 'mainBkg', erMarkerFill: 'mainBkg' },
      tokens: { erZeroOrMoreCircleOffset: 28 },
    },
    neo: { fallback: 'redux' },
  },
};
