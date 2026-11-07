/**
 * The cynefin layout's constants (spec #423 "Layout (T3)", pitfall 13): every number of v12's
 * `cynefinRenderer.ts`, `cynefinBoundaries.ts` and `styles.ts` that places something, in px
 * or as a fraction of the canvas. No other file in `layout/` writes a length literal
 * (`packages/conformance/src/cynefin-layout-literals.spec.ts`); `random.ts` holds only the
 * bit-mixing constants of v12's PRNG, and `config.ts` the config schema's bounds. Line numbers
 * are `mermaid@12.2.0`'s.
 */

/**
 * The canvas (renderer :40-50, :158): four quadrants of half the size, each centred on its
 * quarter point, and the confusion ellipse. Halves are written `/ 2`, as in v12.
 */
export const CANVAS = {
  /** The ellipse's radii, of the width and the height. */
  ellipseRadius: 0.15,
  /**
   * Not v12's. A canvas extent times this must be finite (D366): the largest numbers the layout
   * computes are sums of coordinates times Bézier coefficients (at most 8, `geometry.ts`) and
   * sums of two of those, so 16 × the canvas bounds them.
   */
  headroom: 16,
} as const;

/** Domain labels and subtitles, from the domain's centre (renderer :168-225). */
export const LABELS = {
  /** A quadrant label sits 30 above its centre with descriptions, on it without. */
  quadrantLabelDy: -30,
  /** `Confusion` sits 10 above the centre with descriptions. */
  confusionLabelDy: -10,
  /** The decision model and the practice, under the quadrant label. */
  modelDy: -10,
  practiceDy: 5,
  /** `Disorder`, under `Confusion`. */
  disorderDy: 8,
} as const;

/** Item badges (renderer :229-348, styles.ts :46-58). */
export const BADGES = {
  /** A badge's height: a minimum that grows with the label's lines (D363). */
  height: 26,
  /** Space each side of the label. */
  paddingX: 10,
  /** Space between two badges: they step by `height + gap`. */
  gap: 4,
  /** Corner radius. */
  radius: 4,
  /** The first badge's top, under a quadrant's centre, with descriptions and without. */
  quadrantTop: 25,
  quadrantTopBare: 15,
  /** The same in the confusion ellipse. */
  confusionTop: 22,
  confusionTopBare: 14,
  /** Confusion draws this many items, then a `+N more` badge. */
  maxConfusion: 3,
  /** The badge outline, `stroke-width: 1`. */
  strokeWidth: 1,
} as const;

/** Transitions (renderer :353-419). */
export const ARROWS = {
  /** The control point leaves the midpoint along the left normal by this share of the length. */
  bend: 0.15,
  /** The label's baseline is 6 above the control point. */
  labelDy: -6,
  /** v12's `<marker>`: viewBox `0 0 10 10`, `refX 9`, `refY 5`, `markerWidth 6` stroke widths. */
  markerBox: 10,
  markerRefX: 9,
  markerRefY: 5,
  markerWidth: 6,
} as const;

/** The title (renderer :424-433, styles.ts :88). */
export const TITLE = {
  /** Its centre is half the padding above the canvas. */
  paddingShare: -0.5,
  /** `domainFontSize + 2`. */
  sizeDelta: 2,
} as const;

/** Font sizes and weights relative to the theme lengths (styles.ts :37-88). */
export const FONTS = {
  /** Subtitles and transition labels are `itemFontSize - 1`. */
  smallerDelta: -1,
  /** CSS weights: domain labels and the title are bold, the rest normal. */
  bold: 700,
  normal: 400,
} as const;

/** The confusion ellipse's outline (styles.ts :71). */
export const ELLIPSE_STROKE_WIDTH = 1.5;

/** The fold and the horizon (`cynefinBoundaries.ts` :52-126; renderer :146). */
export const WAVES = {
  segments: 7,
  /** Each point's jitter and each control point's offset, as multiples of the amplitude. */
  jitterSpan: 2,
  controlShare: 1.5,
  /** Fold: point `i` draws `rand(seed + 17i)`, its control `rand(seed + 31i + 7)`. */
  foldJitterStep: 17,
  foldControlStep: 31,
  foldControlOffset: 7,
  /** Horizon: seeded `seed + 100`, then `23i` and `37i + 11`. */
  horizonSeedOffset: 100,
  horizonJitterStep: 23,
  horizonControlStep: 37,
  horizonControlOffset: 11,
} as const;

/** The cliff, an S from the centre down to the bottom edge (`cynefinBoundaries.ts` :135-151). */
export const CLIFF = {
  /** Its amplitude, of the width. */
  amplitude: 0.03,
  /** It starts half way down. */
  top: 0.5,
  /** The two cubic segments: control and end points as [x factor of the amplitude, y share]. */
  first: [
    [1, 0.2],
    [-1.5, 0.55],
    [0.5, 0.75],
  ],
  second: [
    [-1, 0.85],
    [0.3, 0.95],
    [0, 1],
  ],
} as const;
