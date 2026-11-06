/**
 * The gitGraph layout's metrics table (D108, pitfall 13): every length the layout uses. It is
 * the only file in `layout/` that holds a length literal. gitGraph has no text output (D216), so
 * there is one px set: the constants written into v12's `gitGraphRenderer.ts` and the schema
 * defaults of the config keys the layout reads.
 *
 * Lengths that differ between the theme families are geometry theme variables (D152): v12's
 * redux geometry in the redux themes, v12 classic in the classic themes and in `neo` and
 * `neo-dark` (D266). They are listed in {@link GIT_GEOMETRY}. Until T5 (#374) adds them to core,
 * a theme that does not know one gives its classic value.
 */

/** v12's spacing along the commit axis and across the lanes. */
export interface AxisMetrics {
  /** `COMMIT_STEP`: one commit to the next, before the offset. */
  readonly step: number;
  /** `LAYOUT_OFFSET`: added to each commit's position (not in BT with `parallelCommits`). */
  readonly offset: number;
  /** `defaultPos`: where TB and BT start, and how far below the rest BT parallel roots go. */
  readonly start: number;
  /** One lane to the next (`setBranchPosition`'s `50`). */
  readonly lanePitch: number;
  /** Added to the lane pitch with `rotateCommitLabel` (`40`). */
  readonly rotatedLanePitch: number;
}

/** `drawCommitLabel`: the commit id under (LR) or left of (TB, BT) its bullet. */
export interface CommitLabelMetrics {
  /** LR: the text's baseline below the commit centre (`y + 25`). */
  readonly baseline: number;
  /** LR: the box's top below the commit centre (`y + 13.5`). */
  readonly boxTop: number;
  /** `PY`: room around the text in its box. */
  readonly pad: number;
  /** TB/BT: the text ends this far left of the commit centre (`4 * PX`). */
  readonly sideText: number;
  /** TB/BT: and the box this much further (`+ 5`). */
  readonly sideBox: number;
  /** TB/BT: the box's top above the commit centre, and the baseline's lift (`- 12`). */
  readonly sideTop: number;
  /** `rotate(-45, …)`, degrees. */
  readonly angle: number;
  /**
   * LR rotation shift (`r_x = -7.5 - ((w + 10) / 25) * 9.5`, `r_y = 10 + (w / 25) * 8.5`): the
   * constant, the width pad, the width unit and the rate of each.
   */
  readonly shiftX: number;
  readonly shiftXPad: number;
  readonly shiftUnit: number;
  readonly shiftXRate: number;
  readonly shiftY: number;
  readonly shiftYRate: number;
}

/** `drawCommitTags`: tags stacked above (LR) or beside (TB, BT, rotated) the bullet. */
export interface TagMetrics {
  /** LR: the nearest tag's baseline above the commit centre (`y - 16`). */
  readonly baseline: number;
  /** LR: the nearest tag's middle above the commit centre (`y - 19.2`). */
  readonly middle: number;
  /** One tag to the next (`yOffset += 20`). */
  readonly step: number;
  /** `PX`, `PY`: room around the text in its flag. */
  readonly padX: number;
  readonly padY: number;
  /** The hole's radius (`r 1.5`). */
  readonly hole: number;
  /** TB/BT: `rotate(45, …)` degrees, the flag's shift (`translate(12,12)`) and the text's. */
  readonly angle: number;
  readonly sideShift: number;
  readonly sideTextShift: number;
  /** TB/BT: the flag's body starts this far right of the commit (`LAYOUT_OFFSET`). */
  readonly sideBody: number;
  /** TB/BT: the text's left edge (`x + 5`) and baseline (`yOrigin + 3`). */
  readonly sideTextX: number;
  readonly sideTextBaseline: number;
}

/** `drawBranches`: the branch name's box at the start of its lane. */
export interface BranchLabelMetrics {
  /** LR: the box's left edge is the text width plus this left of 0 (`-bbox.width - 4`) … */
  readonly boxLeft: number;
  /** … then moved by `translate(-19, …)`. */
  readonly shiftX: number;
  /** The box is the text plus these (`width + 18`, `height + 4`), before the padding. */
  readonly boxExtraX: number;
  readonly boxExtraY: number;
  /** LR: everything moves left this much more with `rotateCommitLabel` (`30`). */
  readonly rotatedShift: number;
  /** The text's top is this far above where it would be centred in its box (`- 2`). */
  readonly textRise: number;
  /** TB/BT: the box's left edge is half the text plus this left of the lane (`- 10`) … */
  readonly sideBox: number;
  /** … and the text's left edge half the text plus this (`- 5`). */
  readonly sideText: number;
  /**
   * Not v12: where v12 drew a lane's label over the previous lane's (a long name after a short
   * one in TB, several lines in LR), the lane moves out until the boxes are this far apart.
   */
  readonly labelGap: number;
}

/** `drawArrow` and `findLane`. */
export interface ArrowMetrics {
  /** The corner radius of a rerouted arrow (`A 10 10`) and of any other (`A 20 20`). */
  readonly reroutedRadius: number;
  readonly radius: number;
  /** A free lane is at least this far from every lane taken (`>= 10`). */
  readonly laneGap: number;
  /** `findLane` gives up past this depth (`depth > 5`): six tries. */
  readonly laneTries: number;
  /** Each try moves the far end in by the span over this (`diff / 5`). */
  readonly laneShrink: number;
}

export interface CommonMetrics {
  /** `.gitTitleText` font size (18px) and weight (normal). */
  readonly titleFontSize: number;
  readonly titleFontWeight: number;
  /** Tags draw at the normal weight (v12 sets none). */
  readonly tagFontWeight: number;
  /** Config defaults: `gitGraph.titleTopMargin` (25) and `gitGraph.diagramPadding` (8). */
  readonly titleTopMargin: number;
  readonly diagramPadding: number;
}

export interface GitMetrics {
  readonly axis: AxisMetrics;
  readonly commitLabel: CommitLabelMetrics;
  readonly tag: TagMetrics;
  readonly branchLabel: BranchLabelMetrics;
  readonly arrow: ArrowMetrics;
  readonly common: CommonMetrics;
}

export const GIT_METRICS: GitMetrics = {
  axis: { step: 40, offset: 10, start: 30, lanePitch: 50, rotatedLanePitch: 40 },
  commitLabel: {
    baseline: 25,
    boxTop: 13.5,
    pad: 2,
    sideText: 16,
    sideBox: 5,
    sideTop: 12,
    angle: -45,
    shiftX: -7.5,
    shiftXPad: 10,
    shiftUnit: 25,
    shiftXRate: 9.5,
    shiftY: 10,
    shiftYRate: 8.5,
  },
  tag: {
    baseline: 16,
    middle: 19.2,
    step: 20,
    padX: 4,
    padY: 2,
    hole: 1.5,
    angle: 45,
    sideShift: 12,
    sideTextShift: 14,
    sideBody: 10,
    sideTextX: 5,
    sideTextBaseline: 3,
  },
  branchLabel: {
    boxLeft: 4,
    shiftX: -19,
    boxExtraX: 18,
    boxExtraY: 4,
    rotatedShift: 30,
    textRise: 2,
    sideBox: 10,
    sideText: 5,
    labelGap: 10,
  },
  arrow: { reroutedRadius: 10, radius: 20, laneGap: 10, laneTries: 5, laneShrink: 5 },
  common: {
    titleFontSize: 18,
    titleFontWeight: 400,
    tagFontWeight: 400,
    titleTopMargin: 25,
    diagramPadding: 8,
  },
};

/** The lengths that differ between the theme families (D152). */
export interface GitGeometry {
  /** The bullet's radius, and half a highlight square's side: 10 classic, 7 redux. */
  readonly commitRadius: number;
  /**
   * LR: how far below its lane position a branch's line and commits sit: −2 classic, 7 redux
   * (`REDUX_BRANCH_LABEL_PADDING_Y / 2 + 1`). Signed.
   */
  readonly laneOffset: number;
  /** Room the branch label's box adds across and down: 0 classic, 16 and 12 redux. */
  readonly branchLabelPaddingX: number;
  readonly branchLabelPaddingY: number;
  /** The branch label box's corner radius: 4 classic, 0 redux. */
  readonly branchLabelRadius: number;
  /**
   * TB/BT: the branch label box's shift across (−11 redux, `-labelPaddingX / 2 - 3`) and away
   * from the commits (22 redux, `labelPaddingY + 10`); 0 classic. Signed.
   */
  readonly branchLabelOffsetX: number;
  readonly branchLabelOffsetY: number;
  /** The arrows' stroke width: 8 classic and neo, the theme's `strokeWidth` (2) redux. */
  readonly arrowWidth: number;
}

export interface GeometryVariable {
  /** The theme variable's name. */
  readonly name: string;
  /** v12 classic, also `neo` and `neo-dark` (D266). */
  readonly classic: number;
  /** v12 redux geometry (`redux`, `redux-dark`, `redux-color`, `redux-dark-color`). */
  readonly redux: number;
}

/**
 * The geometry theme variable behind each {@link GitGeometry} length, with its v12 classic and
 * redux values: what T5 adds to core's vocabulary and theme specs. The redux values are used
 * here only by the layout specs, which stand in for a redux theme until then.
 */
export const GIT_GEOMETRY: Readonly<Record<keyof GitGeometry, GeometryVariable>> = {
  commitRadius: { name: 'gitCommitRadius', classic: 10, redux: 7 },
  laneOffset: { name: 'gitLaneOffset', classic: -2, redux: 7 },
  branchLabelPaddingX: { name: 'gitBranchLabelPaddingX', classic: 0, redux: 16 },
  branchLabelPaddingY: { name: 'gitBranchLabelPaddingY', classic: 0, redux: 12 },
  branchLabelRadius: { name: 'gitBranchLabelRadius', classic: 4, redux: 0 },
  branchLabelOffsetX: { name: 'gitBranchLabelOffsetX', classic: 0, redux: -11 },
  branchLabelOffsetY: { name: 'gitBranchLabelOffsetY', classic: 0, redux: 22 },
  arrowWidth: { name: 'gitArrowWidth', classic: 8, redux: 2 },
};
