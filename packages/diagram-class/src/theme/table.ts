import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Relationship markers, v12 neo (`*-margin` markers in rendering-elements/markers.js at
 * fa796a943), each measured from the node outline after `markerOffsets` shortens the line
 * (17.25 for the diamonds and the triangle, 6 for dependency, 13.5 for the lollipop).
 * Extension: polygon 10→18 with refX 9, so 8 long and its tip 17.25 − 9 = 8.25 short of the
 * outline. Composition: the diamond with refX 3.5, tip 17.25 − 14.5 = 2.75 short. Dependency:
 * refX 16, tip 6 − 2 = 4 short. Hollow markers have a 2px outline, filled ones none. v12 drew
 * multiplicities at 11px in every theme (`.edgeTerminals`).
 */
const NEO = {
  classMarkerStrokeWidth: 2,
  classFilledMarkerStrokeWidth: 0,
  extensionMarkerLength: 8,
  extensionMarkerGap: 8.25,
  compositionMarkerGap: 2.75,
  dependencyMarkerGap: 4,
  classTerminalFontSize: 11,
};

/**
 * v12 classic: every class marker has refX 1 (dependency 13) and a 1px outline (`styles.js`
 * `.extension { stroke-width: 1 }` and so on). The diamonds and the triangle are 17 long with
 * their tip 17.25 − 17 = 0.25 short of the outline; dependency's tip is 6 − 5 = 1 short.
 */
const CLASSIC = {
  classMarkerStrokeWidth: 1,
  classFilledMarkerStrokeWidth: 1,
  extensionMarkerLength: 17,
  extensionMarkerGap: 0.25,
  compositionMarkerGap: 0.25,
  dependencyMarkerGap: 1,
  classTerminalFontSize: 11,
};

/**
 * Class's theme table (`DiagramPlugin.theme`, D331, spec #414 T2): its text colour and its marker
 * geometry by family.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  // v12's classic theme files set `classText` to `primaryTextColor`, its redux ones (and neo)
  // to `textColor`.
  rules: {
    light: {
      classText: 'primaryTextColor',
      // A relation label's tag: filled with the shared edgeLabelBackground (D628) unless class
      // sets its own (D715), and inked with textColor where it reads there, else black or white,
      // whichever reads better (D713, #1327, as `Theme.ink`). Multiplicities keep classText.
      classEdgeLabelBackground: 'edgeLabelBackground',
      classEdgeLabelColor:
        'contrast(classEdgeLabelBackground, textColor, contrast(classEdgeLabelBackground, #000000, #ffffff))',
    },
  },
  families: {
    classic: { tokens: CLASSIC },
    redux: { rules: { classText: 'textColor' }, tokens: NEO },
    neo: { fallback: 'redux' },
  },
};
