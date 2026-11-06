/**
 * Geometry the two theme families share (D151, D152). The redux themes carry v12 `look: neo`
 * geometry, the classic themes v12 classic geometry.
 *
 * Arrowheads come from v12 12.2.0 `markers.js` and `lineWithOffset.ts`. Sizes are in px; a gap
 * is the space between the node outline and the nearest point of the arrowhead.
 *
 * Node padding in the classic themes follows the diagram's `padding` config
 * (`flowchart.padding`). Circles keep v13's earlier redux values, and hexagon padding is
 * applied X to width and Y to height (v12 swaps them); the rounded rectangle takes `padding`
 * per side in every theme, so it has no variable. Only what flowchart shares with state
 * (the point arrowhead) and mindmap (rectangle, hexagon and circle padding) is here; flowchart's
 * other arrowheads and shapes are in its own theme table (spec #414 T4).
 */
import type { ArrowheadVariable, TokenVariable } from '../vocabulary.ts';

/**
 * v12 neo (`*-margin` markers). Point: viewBox 11.5×14 met into 10.5×14, so 10.5 long and
 * 14×10.5/11.5 ≈ 12.78 wide, tip at the line end, which `markerOffsets.arrow_point` puts 4
 * before the outline.
 */
export const NEO_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 4,
  arrowheadLength: 10.5,
  arrowheadWidth: 12.78,
};

/**
 * v12 classic. Point: viewBox 10 into 8×8, refX 5, so the tip lands on the outline after the
 * line's 4px shortening.
 */
export const CLASSIC_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 0,
  arrowheadLength: 8,
  arrowheadWidth: 8,
};

type PaddingToken = Extract<
  TokenVariable,
  | 'nodePaddingX'
  | 'nodePaddingY'
  | 'hexagonPaddingX'
  | 'hexagonPaddingY'
  | 'hexagonSlant'
  | 'circlePadding'
>;

export const REDUX_PADDING: Readonly<Record<PaddingToken, number | string>> = {
  nodePaddingX: 16,
  nodePaddingY: 12,
  hexagonPaddingX: 70,
  hexagonPaddingY: 32,
  hexagonSlant: 3.5,
  circlePadding: 16,
};

export const CLASSIC_PADDING: Readonly<Record<PaddingToken, number | string>> = {
  nodePaddingX: '2 * padding',
  nodePaddingY: 'padding',
  hexagonPaddingX: 'padding',
  hexagonPaddingY: 'padding',
  hexagonSlant: 4,
  circlePadding: 'padding',
};

type MindmapGeometry = Extract<
  TokenVariable,
  'mindmapRoundedNodes' | 'mindmapOutlinedNodes' | 'mindmapBorderEdges'
>;

/**
 * Mindmap in the redux themes (v12 `mindmapDb.ts` and `styles.ts` for a theme name with `redux`,
 * D288): plain nodes rounded, v12 neo's outlined nodes, edges in `nodeBorder`.
 */
export const REDUX_MINDMAP: Readonly<Record<MindmapGeometry, boolean>> = {
  mindmapRoundedNodes: true,
  mindmapOutlinedNodes: true,
  mindmapBorderEdges: true,
};

/** v12 `theme: neo` (`look: neo`): outlined nodes, plain ones flat-bottomed, `cScale` edges. */
export const NEO_MINDMAP: Readonly<Record<MindmapGeometry, boolean>> = {
  mindmapRoundedNodes: false,
  mindmapOutlinedNodes: true,
  mindmapBorderEdges: false,
};

/** v12 classic: plain nodes with four rounded corners and a rule, no outline, `cScale` edges. */
export const CLASSIC_MINDMAP: Readonly<Record<MindmapGeometry, boolean>> = {
  mindmapRoundedNodes: false,
  mindmapOutlinedNodes: false,
  mindmapBorderEdges: false,
};

type GitGeometry = Extract<
  TokenVariable,
  | 'gitCommitRadius'
  | 'gitLaneShift'
  | 'gitBranchLabelPaddingX'
  | 'gitBranchLabelPaddingY'
  | 'gitBranchLabelRadius'
  | 'gitBranchLabelShiftX'
  | 'gitBranchLabelOffsetY'
  | 'gitArrowWidth'
  | 'gitHighlightInnerSize'
  | 'gitMergeRadius'
  | 'gitReverseCrossSize'
  | 'gitCherryPickDotRadius'
  | 'gitNodeColors'
  | 'gitPaletteColors'
>;

/**
 * gitGraph, v12 classic (`gitGraphRenderer.ts` and `styles.js` at fa796a943): bullets of
 * radius 10, the LR lanes 2 above their place, unpadded branch label boxes with corner 4,
 * 8 px arrows, highlight inner 12, merge inner 6, reverse cross 5, cherry-pick dots 2.75, and
 * the `git` palettes on the branches.
 */
export const CLASSIC_GITGRAPH: Readonly<Record<GitGeometry, number | boolean>> = {
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
 * v12 `theme: neo` (D266): classic gitGraph geometry with the node colours on the first branch,
 * the labels and the bullet insides (v12 `NEO_COLOR_GEN_THEMES`).
 */
export const NEO_GITGRAPH: Readonly<Record<GitGeometry, number | boolean>> = {
  ...CLASSIC_GITGRAPH,
  gitNodeColors: true,
};

/**
 * v12's redux gitGraph (`REDUX_GEOMETRY_THEMES`): bullets of radius 7, the LR lanes 7 below
 * their place (9 below classic's), branch label boxes padded 16 × 12 with square corners and,
 * in TB/BT, 11 left and 22 away from the commits, arrows at the theme's stroke width (2),
 * smaller bullet insides, and every branch in the node colours.
 */
export const REDUX_GITGRAPH: Readonly<Record<GitGeometry, number | boolean>> = {
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

/** gitGraph's commit and tag label sizes: 10px in every v12 theme (D267). */
export const TEXT_SIZES = {
  commitLabelFontSize: 10,
  tagLabelFontSize: 10,
} as const;
