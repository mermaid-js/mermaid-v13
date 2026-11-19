/**
 * The event modeling layout's px metrics (spec #527 "Package and contract", pitfall 13): v12's
 * constants (`db.ts:153-175` `diagramProps`, `renderer.ts`), and the few lengths v13 adds for
 * what v12 did not draw (the self relation's loop, the routes under a row). No other file in `layout/` writes a length
 * literal (`packages/conformance/src/eventmodeling-layout-literals.spec.ts`). Event modeling
 * draws SVG only (D320), so there is no cell table.
 */
export interface EventModelMetrics {
  /** A lane is at least this high before its padding (`swimlaneMinHeight`). */
  readonly laneMinHeight: number;
  /** Above and below the boxes of a lane (`swimlanePadding`); also the lane's width past `maxR`. */
  readonly lanePadding: number;
  /** Between two lanes (`swimlaneGap`). */
  readonly laneGap: number;
  /**
   * Around a box's text area (`boxPadding`): added to each side of the clamped size, between two
   * boxes of a lane, and past a box's right edge for `maxR`.
   */
  readonly boxPadding: number;
  /** A box in a new lane starts this much before the previous box's `r` ends (`boxOverlap`). */
  readonly boxOverlap: number;
  /** The clamp of a box's size before `boxPadding` (`boxMin/MaxWidth`, `boxMin/MaxHeight`). */
  readonly boxMinWidth: number;
  readonly boxMaxWidth: number;
  readonly boxMinHeight: number;
  readonly boxMaxHeight: number;
  /** The first box's left edge (`contentStartX`). */
  readonly contentStartX: number;
  /** Names and data wrap at this width (`textMaxWidth`, `450 − 2 × 10`). */
  readonly textWrap: number;
  /** Around the text inside the clamped size (`boxTextPadding`). */
  readonly boxTextPadding: number;
  /** The lane label's start and baseline (`renderer.ts`: `x 30`, `y lane.y + 30`). */
  readonly laneLabelX: number;
  readonly laneLabelY: number;
  /** Corner radius of lanes and boxes (`rx 3`). */
  readonly radius: number;
  /** The arrowhead (v12's marker `0 0, 10 3.5, 0 7`): length along the line, width across. */
  readonly headLength: number;
  readonly headWidth: number;
  /**
   * v13 (D659): a self relation's loop under its box's bottom right corner: it drops this far
   * below the bottom, is this wide, and comes back up this far in from the right edge, clear of
   * the ⅓ and ⅔ anchors of the relations between lanes. Each leg is at least twice the head.
   */
  readonly selfLoopDepth: number;
  readonly selfLoopWidth: number;
  readonly selfLoopInset: number;
  /**
   * v13 (D659): a same-lane relation that skips a box runs this far below the lowest box bottom
   * it spans, and relations whose spans overlap run this far apart.
   */
  readonly underDrop: number;
  readonly underStep: number;
}

export const EVENTMODELING_METRICS: EventModelMetrics = {
  laneMinHeight: 70,
  lanePadding: 15,
  laneGap: 10,
  boxPadding: 10,
  boxOverlap: 90,
  boxMinWidth: 80,
  boxMaxWidth: 450,
  boxMinHeight: 80,
  boxMaxHeight: 750,
  contentStartX: 250,
  textWrap: 430,
  boxTextPadding: 10,
  laneLabelX: 30,
  laneLabelY: 30,
  radius: 3,
  headLength: 10,
  headWidth: 7,
  selfLoopDepth: 25,
  selfLoopWidth: 20,
  selfLoopInset: 10,
  underDrop: 25,
  underStep: 10,
};

/**
 * Where a cross-lane relation leaves its source and meets its target, as fractions of each box's
 * width (v12 `renderer.ts`: `(width * 2) / 3` of the source's, `width / 3` of the target's),
 * numerator and denominator, so the arithmetic is v12's. Shares, not lengths.
 */
export const SOURCE_ANCHOR: readonly [number, number] = [2, 3];
export const TARGET_ANCHOR: readonly [number, number] = [1, 3];

/** `width` times a fraction, multiplied first as v12 did. */
export const share = (width: number, [n, d]: readonly [number, number]): number => (width * n) / d;

/**
 * `eventmodeling.padding` must stay finite times this (D366's headroom test): the bounds add it
 * on both sides of the content, so no sum overflows to Infinity. A factor, not a length.
 */
export const PADDING_HEADROOM = 4;

/** Text is measured at the theme font's normal weight; names add `Style.Bold`, data `Style.Mono`. */
export const FONT_WEIGHT = 400;
