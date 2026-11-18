import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * ER's theme table (`DiagramPlugin.theme`, D331, spec #414 T3): its row, label and marker
 * colours and its crow's-foot geometry by family.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  // Where themes of one family write a colour differently (the classic row fills), it reads a
  // shared input as each theme wrote it (`inline()`, D332), byte for byte. The edge label's
  // fill is the shared label fill, the theme background by default in every family (D628).
  rules: {
    light: {
      rowOdd: 'inline(rowBkg)',
      rowEven: 'inline(rowAltBkg)',
      erEdgeLabelBackground: 'inline(linkLabelBkg)',
      // v12 classic draws the zero circle white.
      erMarkerFill: '#ffffff',
      // Attribute text (#758, D572): an author's nodeTextColor where it reads on the row, else
      // textColor, else background where that reads better. The outer contrast() picks between
      // two different inks, so in CSS it follows a host's row fill live; two equal ones (the
      // theme's text, twice) would collapse to a constant.
      erRowOddTextColor:
        'contrast(rowOdd, contrast(rowOdd, ifSet(nodeTextColor, textColor), textColor), background)',
      erRowEvenTextColor:
        'contrast(rowEven, contrast(rowEven, ifSet(nodeTextColor, textColor), textColor), background)',
    },
  },
  families: {
    classic: {
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
