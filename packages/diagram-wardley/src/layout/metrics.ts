/**
 * The wardley layout's px constants (spec #430 "Package and contract", pitfall 13): v12
 * `wardleyRenderer.ts`'s fixed lengths, factors and dash patterns, with its line numbers. No
 * other file in `layout/` writes a length literal
 * (`packages/conformance/src/wardley-layout-literals.spec.ts`); every other length comes from
 * the `wardley-beta` config or a `size` statement. Wardley draws SVG only (D320), so there is no
 * cell set. The renderer (T4) reads the strokes and dashes from here.
 */

/** The CSS weights wardley text is measured and drawn at. */
export const NORMAL_WEIGHT = 400;
export const BOLD_WEIGHT = 700;

/** v12's default stages (`:12`), drawn when the map has no `evolution`. */
export const DEFAULT_STAGES: readonly string[] = [
  'Genesis',
  'Custom Built',
  'Product',
  'Commodity',
];

/** v12's axis labels (`:186-187`): the grammar has no way to change them. */
export const AXIS_LABELS = { x: 'Evolution', y: 'Visibility' } as const;

export const WARDLEY_METRICS = {
  /** The title at `(W / 2, padding / 2)`, bold, `axisFontSize · 1.05` (`:151-163`). */
  title: { yFactor: 1 / 2, fontScale: 1.05 },
  /**
   * The axes (`:168-212`): stroke 1; the x label `padding / 4` above the bottom edge, the y
   * label `padding / 3` from the left edge, rotated −90° about its anchor; both bold.
   */
  axis: { stroke: 1, xLabelFactor: 1 / 4, yLabelFactor: 1 / 3, yLabelRotate: -90 },
  /** Stages (`:240-270`): labels `axisFontSize − 2` at `H − padding / 1.5`; dividers `5 5`, 0.8. */
  stage: { fontDelta: 2, labelDivisor: 1.5, stroke: 1, dash: '5 5', opacity: 0.8 },
  /** Grid quarters (`:273-295`), drawn under `showGrid`. */
  grid: { divisions: 4, stroke: 1, dash: '2 6' },
  /**
   * Pipelines (`:306-380`): the box `pad` either side of its children,
   * `heightFactor · nodeRadius` high about their line, rx 4, stroke 1.5; the parent a square of
   * `squareFactor · nodeRadius`, its centre `lift · square` above the box top (`:359-364`);
   * joins dashed `4 4`.
   */
  pipeline: {
    pad: 15,
    heightFactor: 4,
    radius: 4,
    stroke: 1.5,
    squareFactor: 1.6,
    lift: 1 / 6,
    joinStroke: 1,
    joinDash: '4 4',
  },
  /** Links (`:404-530`): dashed `6 6`; the label `labelOffset` off the line, flipped past ±90°. */
  link: { stroke: 1, dash: '6 6', labelOffset: 8, flipAngle: 90 },
  /** Trends (`:540-582`): dashed `4 4`, shortened by `nodeRadius + gap` when longer. */
  trend: { stroke: 1, dash: '4 4', gap: 2 },
  /**
   * Arrowheads (`:93-138`): v12's markers (`M 0 0 L 10 5 L 0 10 z`, `refX` 9 of 10) drawn as
   * triangles at the line ends (R-ARCH-6): the tip `tip · size` past the end, the base
   * `base · size` before it, `size` wide. Links 5 × 5, trends 6 × 6.
   */
  head: { link: 5, trend: 6, tip: 0.1, base: 0.9 },
  /**
   * Nodes (`:584-823`): stroke 1; a strategy overlay of `overlayFactor · nodeRadius`; market
   * dots of `dotFactor · nodeRadius` at `spreadFactor · nodeRadius` from the centre, the lower
   * two `spreadAngle` below the horizontal, stroke 2; the inertia bar 6 wide, `inertiaGap` past
   * the glyph (`nodeRadius + inertiaStrategyGap` more with a strategy); labels `strategyShift`
   * further out with a strategy; an anchor's label `anchorLift` up.
   */
  node: {
    stroke: 1,
    overlayFactor: 2,
    dotFactor: 0.7,
    spreadFactor: 1.2,
    spreadAngle: Math.PI / 6,
    dotStroke: 2,
    inertiaWidth: 6,
    inertiaGap: 15,
    inertiaStrategyGap: 10,
    strategyShift: 10,
    anchorLift: 3,
  },
  /**
   * Annotations (`:825-956`): markers of radius 10, stroke 1.5, the number 10 px bold; the
   * box's lines 11 px, 16 apart, padded 10; the box `max width + 2 · padding + extraWidth` wide
   * and `n · lineHeight + 2 · padding + max height / 2` high, rx 4, stroke 1.5.
   */
  annotation: {
    radius: 10,
    stroke: 1.5,
    numberFontSize: 10,
    fontSize: 11,
    lineHeight: 16,
    padding: 10,
    extraWidth: 105,
    boxRadius: 4,
    boxStroke: 1.5,
  },
  /** Notes (`:958-976`): 11 px bold at the point. */
  note: { fontSize: 11 },
  /**
   * (De)accelerators (`:978-1066`): an arrow 60 × 30 with a 20 px head flaring 8 px past the
   * shaft, stroke 1; the label 10 px bold, `labelGap` below the shaft, at its middle.
   */
  accelerator: { width: 60, height: 30, head: 20, flare: 8, stroke: 1, labelGap: 15, fontSize: 10 },
} as const;
