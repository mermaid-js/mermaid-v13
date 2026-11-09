/**
 * The requirement diagram's px metrics table (spec #520, pitfall 13): every length the layout
 * and the renderer use. No other file in `layout/` holds a length literal
 * (`packages/conformance/src/requirement-layout-literals.spec.ts`).
 *
 * The values are v12's: the box from `requirementBox.ts` (padding 20, gap 20, body at
 * `x + padding / 2`), the stroke from `handDrawnShapeStyles.ts` (`userNodeOverrides` 1.3), the
 * dash from `requirementDb.ts` (`stroke-dasharray: 10,7`), the classic markers from
 * `markers.js:869-934` (a 20 × 20 open chevron, refX 20; a circle cx 10 r 9 with a plus,
 * refX 0), and the spacing, title margin and viewBox padding from `requirementRenderer.ts`
 * (`state.nodeSpacing ?? 50`, `state.rankSpacing ?? 50`, `state.titleTopMargin ?? 25`,
 * `setupViewPortForSVG(svg, 8, …)`).
 */
export const REQUIREMENT_METRICS = Object.freeze({
  /**
   * Added to the widest line for the box's width, half on each side, and to the text's height
   * for its height (v12 `bbox + padding`).
   */
  padding: 20,
  /** Between the name and the first body line; the divider sits in it. */
  gap: 20,
  /** Body lines start this far in from the box's left side (v12 `x + padding / 2`). */
  bodyInset: 10,
  /** The divider's stroke width (v12 `.divider { stroke-width: 1 }`). */
  divider: 1,
  /** The box outline's stroke width. */
  stroke: 1.3,
  /** The dash of every relation but `contains`. */
  dash: Object.freeze([10, 7] as const),
  /** The classic open chevron at the target: tip on the outline, `length` back, `width` across. */
  chevron: Object.freeze({ length: 20, width: 20 }),
  /** The classic `contains` circle at the source: its centre `cx` out from the outline. */
  circle: Object.freeze({ cx: 10, r: 9 }),
  /** The classic marker strokes' width. */
  markerStroke: 1,
  /** Between boxes in a rank, and between ranks (requirement has no spacing keys). */
  spacing: Object.freeze({ node: 50, rank: 50 }),
  /** Above the front-matter title (`state.titleTopMargin ?? 25`). */
  titleMargin: 25,
  /** Around the drawing (`setupViewPortForSVG(svg, 8, …)`). */
  viewBoxPadding: 8,
});

const M = REQUIREMENT_METRICS;

/**
 * The room a marker takes out from its box along the line, and across it, stroke included,
 * rounded up: the larger of the chevron and the circle. A constant, as flowchart's and class's
 * head room (D154), so a family's marker tokens never move the layout: v12's neo chevron is the
 * classic one scaled by 0.8, inside this room.
 */
export const MARKER_ROOM = Object.freeze({
  length: Math.ceil(Math.max(M.chevron.length, M.circle.cx + M.circle.r + M.markerStroke / 2)),
  width: Math.ceil(Math.max(M.chevron.width, 2 * M.circle.r + M.markerStroke)),
});
