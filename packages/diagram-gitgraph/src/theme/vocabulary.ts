import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of the rows gitGraph reads. */
const GIT: readonly string[] = ['gitgraph'];

/**
 * gitGraph's theme variables (D266, D267, #374; spec #414 T1b, D331), moved out of core with
 * their aliases: the commit and tag labels (v12 names), the branch line and cherry-pick inks,
 * and the geometry and paint flags (`GIT_GEOMETRY`, `GIT_PAINT`). The `git`, `gitInv` and
 * `gitBranchLabel` palettes stay in core: mindmap's root reads them too. `pnpm gen:theme` writes
 * `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  commitLabelColor: { alias: 'gcc', kind: 'color', usedBy: GIT },
  commitLabelBackground: { alias: 'glb', kind: 'color', usedBy: GIT },
  commitLabelFontSize: { alias: 'gcs', kind: 'length', usedBy: GIT },
  tagLabelColor: { alias: 'gtc', kind: 'color', usedBy: GIT },
  tagLabelBackground: { alias: 'gtk', kind: 'color', usedBy: GIT },
  tagLabelBorder: { alias: 'gtr', kind: 'color', usedBy: GIT },
  // v12's other name for `tagLabelBorder`, which an author's `tagLabelBorder` overrides; no
  // theme sets it, and only the table's `tagLabelBorder` rule reads it.
  tagBorder: { alias: 'gtg', kind: 'color', usedBy: [] },
  tagLabelFontSize: { alias: 'gts', kind: 'length', usedBy: GIT },
  // v12's branch line colour (`lineColor` where a theme sets none), and the cherry-pick mark
  // (#374): white on light themes, black on dark ones.
  commitLineColor: { alias: 'gcl', kind: 'color', usedBy: GIT },
  gitCherryPickInk: { alias: 'gci', kind: 'color', usedBy: GIT },
  // The bullet radius, how far the LR lanes sit below v12 classic's spot, the branch label box
  // (padding, corner, the TB/BT shift left and away from the commits), the arrow width, the
  // bullet insides, and whether the node colours and the git palettes paint the branches.
  // Unsigned: a shift has its direction in its name.
  gitCommitRadius: { alias: 'gcr', kind: 'length', usedBy: GIT },
  gitLaneShift: { alias: 'gls', kind: 'length', usedBy: GIT },
  gitBranchLabelPaddingX: { alias: 'gpx', kind: 'length', usedBy: GIT },
  gitBranchLabelPaddingY: { alias: 'gpy', kind: 'length', usedBy: GIT },
  gitBranchLabelRadius: { alias: 'gbr', kind: 'length', usedBy: GIT },
  gitBranchLabelShiftX: { alias: 'gbx', kind: 'length', usedBy: GIT },
  gitBranchLabelOffsetY: { alias: 'gby', kind: 'length', usedBy: GIT },
  gitArrowWidth: { alias: 'gaw', kind: 'length', usedBy: GIT },
  gitHighlightInnerSize: { alias: 'ghi', kind: 'length', usedBy: GIT },
  gitMergeRadius: { alias: 'gmr', kind: 'length', usedBy: GIT },
  gitReverseCrossSize: { alias: 'grc', kind: 'length', usedBy: GIT },
  gitCherryPickDotRadius: { alias: 'gcd', kind: 'length', usedBy: GIT },
  gitNodeColors: { alias: 'gnc', kind: 'flag', usedBy: GIT },
  gitPaletteColors: { alias: 'gpc', kind: 'flag', usedBy: GIT },
};

/**
 * Rows set only in the themes v12 sets them in (#374, D331): the gitGraph renderer draws v12's
 * fallback where a theme gives none (`lineColor`, white), so `currentColor` resolves too.
 */
export const SOME_THEMES: readonly string[] = ['commitLineColor', 'gitCherryPickInk'];

/**
 * Rows no theme sets, only an author: `tagBorder` (D267), v12's other name for
 * `tagLabelBorder`. Unset, it resolves to `currentColor` in every theme.
 */
export const AUTHOR_ONLY: readonly string[] = ['tagBorder'];
