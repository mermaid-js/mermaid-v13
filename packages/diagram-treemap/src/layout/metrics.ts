// cspell:words squarify squarified
/**
 * The treemap layout's px constants (spec #428 "Package and contract", pitfall 13): v12
 * `renderer.ts`'s fixed lengths, font sizes and fitting thresholds. No other file in `layout/`
 * writes a length literal (`packages/conformance/src/treemap-layout-literals.spec.ts`); every
 * other length comes from the `treemap` config. Treemap draws SVG only (D320).
 */

/** v12's leaf label fitting constants (`:316-322`), one set per treemap size. */
export interface LeafFit {
  /** The label's starting size (before a class `font-size`). */
  readonly labelSize: number;
  /** The value's largest size. */
  readonly valueSize: number;
  readonly minLabelSize: number;
  readonly minValueSize: number;
  /** The label's padding on each side of the box. */
  readonly padding: number;
  /** The box's smallest width and height, less the padding, that shows a label. */
  readonly minBox: number;
  /** The gap between the label and the value below it. */
  readonly gap: number;
}

export interface TreemapMetrics {
  /** The canvas is `nodeWidth × canvasScale` by `nodeHeight × canvasScale` (`:40-41`). */
  readonly canvasScale: number;
  /** The canvas width and height when `nodeWidth` or `nodeHeight` is 0 (`:40-41`). */
  readonly fallbackWidth: number;
  readonly fallbackHeight: number;
  /** The band above the treemap that holds the title, when there is one (`:36`). */
  readonly titleBand: number;
  /** The title's size (`.treemapTitle`, `styles.ts`'s `titleFontSize` default). */
  readonly titleSize: number;
  /** A section's header band (`SECTION_HEADER_HEIGHT`). */
  readonly sectionHeader: number;
  /** A section's padding left, right and bottom; on top it is the header plus this (`:151-159`). */
  readonly sectionPadding: number;
  /** The section label's left edge (`:222`). */
  readonly sectionLabelX: number;
  readonly sectionLabelSize: number;
  /** The section value's right edge is this far inside the section (`:291`). */
  readonly sectionValueInset: number;
  readonly sectionValueSize: number;
  /** v12's estimate of the section value's width, which the label leaves room for (`:253`). */
  readonly sectionValueEstimate: number;
  /** The gap v12 leaves between the label and that estimate (`:254`). */
  readonly sectionLabelGap: number;
  /** The label's own right padding without a value (`:259`). */
  readonly sectionLabelRightPad: number;
  /** The narrowest space a section label is truncated to (`:262`). */
  readonly sectionLabelMinWidth: number;
  /** A leaf value's bottom stays this far above the box's bottom (`:510`). */
  readonly leafValueBottomPad: number;
  /** A leaf value's size is the label's times this, clamped (`:398`). */
  readonly valueScale: number;
  /** More leaves than this make a "complex" treemap with smaller fonts (`:314`). */
  readonly complexLeaves: number;
  readonly simple: LeafFit;
  readonly complex: LeafFit;
  /** Stroke widths the bounds allow for: section rect (`:208`), leaf rect (`:355`). */
  readonly sectionStroke: number;
  readonly leafStroke: number;
}

export const TREEMAP_METRICS: TreemapMetrics = {
  canvasScale: 10,
  fallbackWidth: 960,
  fallbackHeight: 500,
  titleBand: 30,
  titleSize: 14,
  sectionHeader: 25,
  sectionPadding: 10,
  sectionLabelX: 6,
  sectionLabelSize: 12,
  sectionValueInset: 10,
  sectionValueSize: 10,
  sectionValueEstimate: 30,
  sectionLabelGap: 10,
  sectionLabelRightPad: 6,
  sectionLabelMinWidth: 15,
  leafValueBottomPad: 4,
  valueScale: 0.6,
  complexLeaves: 20,
  simple: {
    labelSize: 38,
    valueSize: 28,
    minLabelSize: 8,
    minValueSize: 6,
    padding: 4,
    minBox: 10,
    gap: 2,
  },
  complex: {
    labelSize: 16,
    valueSize: 14,
    minLabelSize: 4,
    minValueSize: 4,
    padding: 2,
    minBox: 8,
    gap: 1,
  },
  sectionStroke: 2,
  leafStroke: 3,
};

/** d3's squarify ratio, the golden ratio (`treemapSquarify`'s default). */
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/** CSS weights: v12 draws section labels bold, everything else normal; a weight is 1 to 1000. */
export const BOLD_WEIGHT = 700;
export const NORMAL_WEIGHT = 400;
export const MAX_WEIGHT = 1000;

/**
 * The largest total weight tiled as it is: past it d3's arithmetic overflows (`dx * sumValue`
 * and `sumValue²` reach Infinity near 1e305 and 1e154), so `tiles.ts` scales the weights down.
 */
export const MAX_TILE_WEIGHT = 2 ** 500;

/** v12 colours fills from `['transparent', cScale0…11]` and labels from `cScaleLabel0…11`. */
export const FILL_SLOTS = 13;
export const LABEL_SLOTS = 12;
