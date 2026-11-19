/**
 * The usecase renderer's px constants (v12 at fa796a943), beside the layout's table
 * (`../layout/metrics.ts`), which sizes the boxes these are drawn in.
 *
 * v12 drew usecase with the global `look`, `classic` by default (`usecaseDb.ts` `getData` reads
 * `globalConfig.look`; `usecase.look` is never read), so its markers, widths and dashes are the
 * classic ones in every theme (D227: no family geometry where v12 drew none).
 */
export const DRAW = Object.freeze({
  /** Outline widths (`styles.ts`): actors and use cases 2px, boundaries 1px. */
  shapeStroke: 2,
  boundaryStroke: 1,
  /** v12's generic `note` shape: roughjs at roughness 0 and its 1.3 stroke (`note.ts`). */
  noteStroke: 1.3,
  /** JSON cells: no width in v12's CSS, so 1. */
  jsonStroke: 1,
  /** Include, extend and note lines: `stroke-dasharray: 3` (`styles.ts`). */
  dash: 3,
  /** The icon actor's frame and glyph (`usecaseActorIcon.ts`): square, glyph, centre, corner. */
  iconFrame: 52,
  iconSize: 42,
  iconCentreY: -2,
  iconRadius: 4,
  /** A business use case's mark sits this far inside its oval and off the label block. */
  businessInset: 2,
  /** A business use case's mark: no width in v12's CSS, so 1 (an actor's takes its glyph's). */
  businessStroke: 1,
});

/**
 * v12's classic markers (`markers.js`): the point (viewBox 10 into 8×8, tip on the outline),
 * the circle (11 across, 1.1 off the outline), the cross (arms 9, 2 off, stroke 2), and the
 * extension's hollow triangle (`M 1,1 V 13 L18,7 Z`: 17 long, 12 across, tip on the outline).
 */
export const MARKER = Object.freeze({
  pointLength: 8,
  pointWidth: 8,
  circleSize: 11,
  circleGap: 1.1,
  crossSize: 9,
  crossGap: 2,
  crossStroke: 2,
  extensionLength: 17,
  extensionWidth: 12,
  extensionStroke: 1,
});
