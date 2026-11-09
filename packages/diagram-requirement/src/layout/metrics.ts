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
  /**
   * How far the divider's right end is lifted under the gradient, so its box has a height and
   * an objectBoundingBox gradient paints it (D185; v12 neo drew a 0.001-tall polygon, the
   * writer rounds to 0.01, as class's).
   */
  dividerLift: 0.01,
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
  /**
   * The most a theme's marker stroke (`relationStrokeWidth`) and chevron scale
   * (`relationArrowScale`) are taken at, so the room they give stays bounded.
   */
  maxMarkerStroke: 8,
  maxArrowScale: 2,
  /** Between boxes in a rank, and between ranks (requirement has no spacing keys). */
  spacing: Object.freeze({ node: 50, rank: 50 }),
  /** Above the front-matter title (`state.titleTopMargin ?? 25`). */
  titleMargin: 25,
  /** Around the drawing (`setupViewPortForSVG(svg, 8, …)`). */
  viewBoxPadding: 8,
  /** Room left and right of a relation label on its chip (ER's and the flowchart's). */
  labelPad: 4,
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
 * How one render draws the markers (spec #520 T4, D152): the strokes' width, and the scale of
 * the chevron and its stroke. v12 classic drew both markers at 1 and its 1px line, v12 neo with
 * `strokeWidth` strokes in user space and the chevron at 0.8 (`viewBox 0 0 25 20` in a 20 × 20
 * marker); the families' tokens carry each (`relationStrokeWidth`, `relationArrowScale`).
 */
export interface MarkerGeometry {
  readonly stroke: number;
  readonly arrowScale: number;
}

/** v12 classic's markers. */
export const CLASSIC_MARKERS: MarkerGeometry = Object.freeze({
  stroke: M.markerStroke,
  arrowScale: 1,
});

const within = (v: number, max: number, fallback: number): number =>
  Number.isFinite(v) && v >= 0 ? Math.min(v, max) : fallback;

/**
 * The marker geometry a theme gives (`relationStrokeWidth`, `relationArrowScale`), each
 * taken at no more than its cap; a chevron scale of 0 draws v12's.
 */
export function markerGeometry(theme: { number(name: string): number }): MarkerGeometry {
  const scale = theme.number('relationArrowScale');
  return {
    stroke: within(theme.number('relationStrokeWidth'), M.maxMarkerStroke, M.markerStroke),
    arrowScale: scale > 0 ? within(scale, M.maxArrowScale, 1) : 1,
  };
}

/**
 * The drawn extent of a marker, stroke included. The chevron is two butt-capped strokes from
 * the tip on the outline to `(length, ±width/2)`, all scaled by `arrowScale` (its stroke too),
 * each `leg` long: each cap sticks out half the stroke square to its leg, so the chevron reaches
 * `stroke/2 · (width/2) / leg` past its back and is `stroke · length / leg` wider across
 * (20.22 × 20.89 at v12 classic's 1px; its tip pokes the same 0.22 into the box). The `contains`
 * circle reaches its centre plus its radius and half the stroke; its plus lies inside it, and it
 * is never scaled (v12 neo drew it at r 9).
 */
export function markerExtent(
  marker: 'contains' | 'arrow',
  g: MarkerGeometry = CLASSIC_MARKERS
): MarkerExtent {
  if (marker === 'contains') {
    const r = M.circle.r + g.stroke / 2;
    return { length: M.circle.cx + r, width: 2 * r };
  }
  const k = g.arrowScale;
  const length = M.chevron.length * k;
  const width = M.chevron.width * k;
  const stroke = g.stroke * k;
  const leg = Math.hypot(length, width / 2);
  return {
    length: length + ((stroke / 2) * (width / 2)) / leg,
    width: width + (stroke * length) / leg,
  };
}

/**
 * The room a marker takes out from its box along the line, and across it: the larger drawn
 * extent of the two markers under the render's geometry, rounded up (spec #520: "marker room
 * comes from the family tokens"). Classic themes give 21 × 21, redux and neo 20 × 20 (the r 9
 * circle with its 2px stroke); a wider `strokeWidth` widens the room with the strokes, up to
 * the cap.
 */
export function markerRoom(g: MarkerGeometry = CLASSIC_MARKERS): MarkerExtent {
  const a = markerExtent('arrow', g);
  const c = markerExtent('contains', g);
  // Rounded to 1e-9 first, so 20 computed as 20.000000000000004 stays 20.
  const up = (v: number): number => Math.ceil(Math.round(v * 1e9) / 1e9);
  return { length: up(Math.max(a.length, c.length)), width: up(Math.max(a.width, c.width)) };
}
