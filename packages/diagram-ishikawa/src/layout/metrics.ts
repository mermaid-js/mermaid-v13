/**
 * The ishikawa layout's px constants (spec #519 §Package and contract, pitfall 13): v12
 * `ishikawaRenderer.ts`'s lengths (`:19-26` and its inline literals) and its style sheet's stroke
 * widths. No other file in `layout/` writes a length literal
 * (`packages/conformance/src/ishikawa-layout-literals.spec.ts`); font sizes come from the theme
 * (D493) and the padding from the `ishikawa` config.
 */

/** The ishikawa layout's fixed lengths (px), angles and factors. */
export interface IshikawaMetrics {
  /** v12 `SPINE_BASE_LENGTH`: each side's length when every cause is a leaf, and the least `spineY`. */
  readonly spineBase: number;
  /** The two sides share this length by descendant count (v12 `SPINE_BASE_LENGTH * 2`). */
  readonly sidePool: number;
  /** A side is at least this long when any cause has descendants (v12 `SPINE_BASE_LENGTH * 0.3`). */
  readonly sideMin: number;
  /** A side is at least `maxDescendants × slotFactor × fontSize` long (v12 `minSpacing`). */
  readonly slotFactor: number;
  /** A leaf cause's bone is this share of its side's length. */
  readonly leafFactor: number;
  /** The cause bones' angle to the spine, in radians: v12 `ANGLE`, 82°. */
  readonly angle: number;
  /** v12 `BONE_STUB`: a leaf sub-cause's horizontal bone. */
  readonly boneStub: number;
  /** v12 `BONE_BASE` and `BONE_PER_CHILD`: a horizontal bone with children, `60 + 5 × children`. */
  readonly boneBase: number;
  readonly bonePerChild: number;
  /** The first pair's start on the spine. */
  readonly firstPairX: number;
  /** A cause label's centre lies this far past its bone's end, away from the spine. */
  readonly labelOffset: number;
  /** A cause label's box is its text ± these. */
  readonly boxPadX: number;
  readonly boxPadY: number;
  /** The head is at least `headMinWidth × headMinHeight`. */
  readonly headMinWidth: number;
  readonly headMinHeight: number;
  /** The head is `text width + headPadX` wide and `headLines × text height + headPadY` high. */
  readonly headPadX: number;
  readonly headPadY: number;
  readonly headLines: number;
  /** The head's quadratic control point is `headControl × w` right of the spine's end. */
  readonly headControl: number;
  /** The head label's centre is this far right of the middle of `w`. */
  readonly headTextNudge: number;
  /** The head label's size and weight in every theme (D493). */
  readonly headFontSize: number;
  readonly headWeight: number;
  /** Cause and sub-cause labels' weight (v12 sets none). */
  readonly labelWeight: number;
  /**
   * The wrap widths at `wrapReferenceSize` (D495): what v12's character counts gave at 16 px
   * (`floor(110 / (0.6 × 16))` = 11 for the effect, 15 for sub-causes), scaled by
   * `fontSize / wrapReferenceSize`. Cause labels break only at `<br>`.
   */
  readonly effectWrap: number;
  readonly subCauseWrap: number;
  readonly wrapReferenceSize: number;
  /**
   * v12's arrow marker (`markerWidth` and `markerHeight` 6 on a `0 0 10 10` box, no
   * `markerUnits`) scales with the stroke: a triangle `arrowSize × stroke` long and as wide,
   * its tip at the bone's start.
   */
  readonly arrowSize: number;
  /** v12's style sheet: spine and cause bones 2, sub-cause bones 1, head and label boxes 2. */
  readonly boneStroke: number;
  readonly subBoneStroke: number;
  readonly outlineStroke: number;
}

export const ISHIKAWA_METRICS: IshikawaMetrics = {
  spineBase: 250,
  sidePool: 500,
  sideMin: 75,
  slotFactor: 2,
  leafFactor: 0.2,
  angle: (82 * Math.PI) / 180,
  boneStub: 30,
  boneBase: 60,
  bonePerChild: 5,
  firstPairX: -20,
  labelOffset: 11,
  boxPadX: 20,
  boxPadY: 2,
  headMinWidth: 60,
  headMinHeight: 40,
  headPadX: 6,
  headPadY: 40,
  headLines: 2,
  headControl: 2.4,
  headTextNudge: 3,
  headFontSize: 14,
  headWeight: 600,
  labelWeight: 400,
  effectWrap: 110,
  subCauseWrap: 144,
  wrapReferenceSize: 16,
  arrowSize: 6,
  boneStroke: 2,
  subBoneStroke: 1,
  outlineStroke: 2,
};
