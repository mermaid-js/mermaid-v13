import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * ER's theme table (`DiagramPlugin.theme`, D331, spec #414 T3): its row, label and marker
 * colours and its crow's-foot geometry by family.
 */
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
      // Attribute text (#758): the node ink where it reads on the row, else the better of the
      // two inks nodeTextColor itself picks between, judged on the row.
      erRowOddTextColor: 'contrast(rowOdd, nodeTextColor, contrast(rowOdd, textColor, background))',
      erRowEvenTextColor:
        'contrast(rowEven, nodeTextColor, contrast(rowEven, textColor, background))',
    },
  },
  families: {
    classic: {
      // v12 classic `.labelBkg`: `tertiaryColor` at half opacity (#761). The colour themes write
      // `linkLabelBkg`; the classic family derives the fill (D152), with no name check.
      rules: { erEdgeLabelBackground: 'alpha(tertiaryColor, 50%)' },
      // v12 `zero_or_more`: refX 39, cx 9.
      tokens: { erZeroOrMoreCircleOffset: 30 },
    },
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
