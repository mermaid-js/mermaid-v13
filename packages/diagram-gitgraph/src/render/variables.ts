/**
 * The theme variables the gitGraph renderer reads besides core's (D152, spec #292 T4): every
 * difference between v12's theme families that is not a layout length (those are
 * `GIT_GEOMETRY`). No theme name is read (D153): each difference is a variable with one value
 * per family: classic (v12's five classic themes), neo (v12's two neo themes, which keep
 * classic geometry but take the redux label colours, D266, v12 `NEO_COLOR_GEN_THEMES`) and
 * redux (the four redux themes). The cherry-pick ink is keyed by the dark trait instead.
 *
 * Core's vocabulary and theme specs carry them (#374, D330); the theme T0 moves them into
 * gitGraph's own table, keyed by family and the dark trait (D331).
 */

/** A flag: on or off, read literally at render time. */
export interface GitFlagVariable {
  readonly name: string;
  readonly kind: 'flag';
  readonly classic: boolean;
  readonly neo: boolean;
  readonly redux: boolean;
}

/** A length in px, read literally at render time (D152). */
export interface GitLengthVariable {
  readonly name: string;
  readonly kind: 'length';
  readonly classic: number;
  readonly neo: number;
  readonly redux: number;
}

/** A colour: another variable's name, or a literal colour. */
export interface GitColorVariable {
  readonly name: string;
  readonly kind: 'color';
  readonly classic: string;
  readonly neo: string;
  readonly redux: string;
}

/** A colour keyed by the dark trait: one literal on light themes, one on dark ones. */
export interface GitInkVariable {
  readonly name: string;
  readonly kind: 'color';
  readonly light: string;
  readonly dark: string;
}

export type GitPaintVariable =
  | GitFlagVariable
  | GitLengthVariable
  | GitColorVariable
  | GitInkVariable;

export interface GitPaintVariables {
  /**
   * v12 `NEO_COLOR_GEN_THEMES`: the first branch, the commit and tag labels, and the insides of
   * merge, reverse and highlight bullets take the node colours (`nodeBorder`, `mainBkg`), the
   * branch label boxes `mainBkg` with an outline, tags the theme's shadow, branch lines a
   * `4 2` dash and reverse crosses `strokeWidth`. Off: the git label variables and
   * `primaryColor`, a `2` dash and 3 px crosses.
   */
  readonly nodeColors: GitFlagVariable;
  /**
   * Whether the `git`, `gitInv` and `gitBranchLabel` palettes colour the branches: v12 classic
   * and neo do, redux draws every branch in `nodeBorder` (a non-empty `borderColorArray` colours
   * them in every theme, theming.md).
   */
  readonly paletteColors: GitFlagVariable;
  /** A highlight bullet's inner square, its side: 12 classic, 8 redux. */
  readonly highlightInner: GitLengthVariable;
  /** A merge bullet's inner circle, its radius: 6 classic, 5 redux. */
  readonly mergeRadius: GitLengthVariable;
  /** Half the side of a reverse bullet's cross: 5 classic, 4 redux. */
  readonly reverseCross: GitLengthVariable;
  /** The two dots of a cherry-pick bullet, their radius: 2.75 classic, 2.5 redux. */
  readonly cherryPickDot: GitLengthVariable;
  /**
   * v12's own variable for the branch lines: redux `#BDBCCC`; where a theme sets none, the lines
   * take `lineColor` (v12 `commitLineColor ?? lineColor`).
   */
  readonly commitLineColor: GitColorVariable;
  /**
   * The cherry-pick mark (its dots and stems): black in the four dark themes of v12's
   * `DARK_THEMES`, which set it, and white where a theme sets none. A colour variable, so
   * `theme: 'auto'` switches it.
   */
  readonly cherryPickInk: GitInkVariable;
}

export const GIT_PAINT: GitPaintVariables = {
  nodeColors: { name: 'gitNodeColors', kind: 'flag', classic: false, neo: true, redux: true },
  paletteColors: {
    name: 'gitPaletteColors',
    kind: 'flag',
    classic: true,
    neo: true,
    redux: false,
  },
  highlightInner: {
    name: 'gitHighlightInnerSize',
    kind: 'length',
    classic: 12,
    neo: 12,
    redux: 8,
  },
  mergeRadius: { name: 'gitMergeRadius', kind: 'length', classic: 6, neo: 6, redux: 5 },
  reverseCross: { name: 'gitReverseCrossSize', kind: 'length', classic: 5, neo: 5, redux: 4 },
  cherryPickDot: {
    name: 'gitCherryPickDotRadius',
    kind: 'length',
    classic: 2.75,
    neo: 2.75,
    redux: 2.5,
  },
  commitLineColor: {
    name: 'commitLineColor',
    kind: 'color',
    classic: 'lineColor',
    neo: 'lineColor',
    redux: '#BDBCCC',
  },
  cherryPickInk: { name: 'gitCherryPickInk', kind: 'color', light: '#ffffff', dark: '#000000' },
};
