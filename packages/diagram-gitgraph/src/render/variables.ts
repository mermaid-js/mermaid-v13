/**
 * The names of the theme variables the gitGraph renderer reads besides core's (D152, spec #292
 * T4): every difference between v12's theme families that is not a layout length (those are
 * `GIT_GEOMETRY`). No theme name is read (D152): the values are the package's theme table, by
 * family (`theme/table.ts`, spec #414 T1b, D331).
 */
export const GIT_PAINT = {
  /**
   * A flag, v12 `NEO_COLOR_GEN_THEMES`: the first branch, the commit and tag labels, and the
   * insides of merge, reverse and highlight bullets take the node colours (`nodeBorder`,
   * `mainBkg`), the branch label boxes `mainBkg` with an outline, tags the theme's shadow, branch
   * lines a `4 2` dash and reverse crosses `strokeWidth`. Off: the git label variables and
   * `primaryColor`, a `2` dash and 3 px crosses.
   */
  nodeColors: 'gitNodeColors',
  /**
   * A flag: whether the `git`, `gitInv` and `gitBranchLabel` palettes colour the branches. Off,
   * every branch is drawn in `nodeBorder` (v12 redux); a non-empty `borderColorArray` colours
   * them either way (theming.md).
   */
  paletteColors: 'gitPaletteColors',
  /** A length: a highlight bullet's inner square, its side. */
  highlightInner: 'gitHighlightInnerSize',
  /** A length: a merge bullet's inner circle, its radius. */
  mergeRadius: 'gitMergeRadius',
  /** A length: half the side of a reverse bullet's cross. */
  reverseCross: 'gitReverseCrossSize',
  /** A length: the radius of a cherry-pick bullet's two dots. */
  cherryPickDot: 'gitCherryPickDotRadius',
  /**
   * A colour, v12's own variable for the branch lines; where a theme sets none, the lines take
   * `lineColor` (v12 `commitLineColor ?? lineColor`).
   */
  commitLineColor: 'commitLineColor',
  /**
   * A colour: the cherry-pick mark (its dots and stems); white where a theme sets none (v12
   * `isDark ? '#000000' : '#fff'`). A colour variable, so `theme: 'auto'` switches it.
   */
  cherryPickInk: 'gitCherryPickInk',
} as const;

/** The renderer's own theme variable names, by what they do. */
export type GitPaintVariables = typeof GIT_PAINT;
