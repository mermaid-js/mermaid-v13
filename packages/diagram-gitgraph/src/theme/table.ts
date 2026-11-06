/**
 * gitGraph's theme table (`DiagramPlugin.theme`, D331, spec #414 T1b): keyed by family and the
 * dark trait, never by theme name. Where themes of one family write a label colour differently,
 * it reads a shared input as each theme wrote it (`inline()`, D332), byte for byte: the badge
 * (commit labels) and the callout (tags). The branch palettes are core's `git`, `gitInv` and
 * `gitBranchLabel`, which mindmap reads too.
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/** Commit and tag label sizes: 10px in every v12 theme (D267). */
const SIZES = { commitLabelFontSize: 10, tagLabelFontSize: 10 };

/**
 * v12 classic (`gitGraphRenderer.ts` and `styles.js` at fa796a943): bullets of radius 10, the LR
 * lanes 2 above their place, unpadded branch label boxes with corner 4, 8 px arrows, highlight
 * inner 12, merge inner 6, reverse cross 5, cherry-pick dots 2.75, and the `git` palettes on the
 * branches.
 */
const CLASSIC = {
  ...SIZES,
  gitCommitRadius: 10,
  gitLaneShift: 0,
  gitBranchLabelPaddingX: 0,
  gitBranchLabelPaddingY: 0,
  gitBranchLabelRadius: 4,
  gitBranchLabelShiftX: 0,
  gitBranchLabelOffsetY: 0,
  gitArrowWidth: 8,
  gitHighlightInnerSize: 12,
  gitMergeRadius: 6,
  gitReverseCrossSize: 5,
  gitCherryPickDotRadius: 2.75,
  gitNodeColors: false,
  gitPaletteColors: true,
};

/**
 * v12's redux gitGraph (`REDUX_GEOMETRY_THEMES`): bullets of radius 7, the LR lanes 7 below
 * their place (9 below classic's), branch label boxes padded 16 × 12 with square corners and, in
 * TB/BT, 11 left and 22 away from the commits, arrows at the theme's stroke width (2), smaller
 * bullet insides, and every branch in the node colours.
 */
const REDUX = {
  ...SIZES,
  gitCommitRadius: 7,
  gitLaneShift: 9,
  gitBranchLabelPaddingX: 16,
  gitBranchLabelPaddingY: 12,
  gitBranchLabelRadius: 0,
  gitBranchLabelShiftX: 11,
  gitBranchLabelOffsetY: 22,
  gitArrowWidth: 2,
  gitHighlightInnerSize: 8,
  gitMergeRadius: 5,
  gitReverseCrossSize: 4,
  gitCherryPickDotRadius: 2.5,
  gitNodeColors: true,
  gitPaletteColors: false,
};

/** The cherry-pick ink of v12's `DARK_THEMES` (#374). */
const DARK_INK = { values: { gitCherryPickInk: '#000000' } };

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      commitLabelColor: 'inline(badgeTextColor)',
      commitLabelBackground: 'inline(badgeBkg)',
      tagLabelColor: 'inline(calloutTextColor)',
      tagLabelBackground: 'inline(calloutBkg)',
      // An author's `tagBorder` fills `tagLabelBorder` unless the author sets that too (D267).
      tagLabelBorder: 'ifSet(tagBorder, inline(calloutBorder))',
    },
  },
  families: {
    classic: {
      tokens: CLASSIC,
      // v12's `commitLineColor ?? lineColor`: `theme: 'auto'` pairs a redux light theme (which
      // sets it) with a classic dark one, so the dark side needs a value (#374).
      dark: { rules: { commitLineColor: 'lineColor' }, ...DARK_INK },
    },
    // v12's redux themes: the branch lines; the cherry-pick ink white on the light themes, so
    // `theme: 'auto'` (its light half) has a light value to switch from (#374).
    redux: {
      tokens: REDUX,
      values: { commitLineColor: '#BDBCCC', gitCherryPickInk: '#ffffff' },
      dark: DARK_INK,
    },
    // v12 `theme: neo` (D266): classic geometry with the node colours on the first branch, the
    // labels and the bullet insides (v12 `NEO_COLOR_GEN_THEMES`).
    neo: { tokens: { ...CLASSIC, gitNodeColors: true }, dark: DARK_INK },
  },
};
