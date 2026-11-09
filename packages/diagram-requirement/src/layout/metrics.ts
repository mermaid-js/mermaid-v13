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
  /** The classic marker strokes' width (butt caps, as v12's paths). */
  markerStroke: 1,
  /** Between boxes in a rank, and between ranks (requirement has no spacing keys). */
  spacing: Object.freeze({ node: 50, rank: 50 }),
  /** Above the front-matter title (`state.titleTopMargin ?? 25`). */
  titleMargin: 25,
  /** Around the drawing (`setupViewPortForSVG(svg, 8, …)`). */
  viewBoxPadding: 8,
  /** A font size a style sets is taken below this, in px (ER's cap). */
  maxFontSize: 1000,
});

const M = REQUIREMENT_METRICS;

/** How far a drawn marker reaches out from the outline along its line, and across it. */
export interface MarkerExtent {
  readonly length: number;
  readonly width: number;
}

/**
 * The drawn extent of each classic marker, stroke included. The chevron is two butt-capped
 * strokes from the tip on the outline to `(length, ±width/2)`, each `leg` long: each cap sticks
 * out half the stroke square to its leg, so the chevron reaches `stroke/2 · (width/2) / leg` past
 * its back and is `stroke · length / leg` wider across (20.22 × 20.89 at a 1 px stroke; its tip
 * pokes the same 0.22 into the box). The `contains` circle reaches its centre plus its radius
 * and half the stroke; its plus lies inside it.
 */
export function markerExtent(marker: 'contains' | 'arrow', stroke = M.markerStroke): MarkerExtent {
  if (marker === 'contains') {
    const r = M.circle.r + stroke / 2;
    return { length: M.circle.cx + r, width: 2 * r };
  }
  const { length, width } = M.chevron;
  const leg = Math.hypot(length, width / 2);
  return {
    length: length + ((stroke / 2) * (width / 2)) / leg,
    width: width + (stroke * length) / leg,
  };
}

/**
 * The room a marker takes out from its box along the line, and across it: the larger drawn
 * extent of the two classic markers (`markerExtent`), rounded up to 21 × 21. A constant, as
 * flowchart's and class's head room (D154), so the layout never moves with a theme; T4 moves it
 * to the family tokens (GAPS #574).
 */
export const MARKER_ROOM: MarkerExtent = Object.freeze({
  length: Math.ceil(Math.max(markerExtent('arrow').length, markerExtent('contains').length)),
  width: Math.ceil(Math.max(markerExtent('arrow').width, markerExtent('contains').width)),
});
