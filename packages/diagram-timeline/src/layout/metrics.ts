/**
 * The timeline layout's metrics table (D108, pitfall 13): every length the layout uses. It is
 * the only file in `layout/` that holds a length literal. Timeline has no text output (D216),
 * so there is one set, in px: the constants written into v12's `timelineRenderer.ts` (LR),
 * `timelineRendererVertical.ts` (TD) and `svgDraw.js`, and the schema defaults of the config
 * keys the layout reads.
 *
 * Box heights follow v12's `drawNode`: the label's height, plus `heightEm` font sizes (v12
 * `fontSize × 1.1 × 0.5`), plus the box's padding once. Wrap widths are v12's `node.width`; a box
 * is its wrap width plus the padding on both sides.
 */

/** Shared by both directions. */
export interface CommonMetrics {
  /** v12 `masterX = 50 + leftMargin`: the left edge of the content, after `leftMargin`. */
  readonly originX: number;
  /** v12 `masterY = 50`: the top of the content. */
  readonly originY: number;
  /** Added to a box's label height, in font sizes (v12 `fontSize × 1.1 × 0.5`). */
  readonly heightEm: number;
  /** The title: its baseline (v12 `y = 20`), size (v12 `font-size: 4ex`) and weight (bold). */
  readonly titleBaseline: number;
  readonly titleFontSize: string;
  readonly titleFontWeight: number;
  /**
   * The font size of v12's one-line title box (its default `fontSize`): the content moves down
   * by however far the title's bottom passes that box (a `<br>` title, a large `fontSize`).
   */
  readonly titleReferenceFontSize: number;
  /** The least width a label wraps to (core's `layoutLabel` takes a positive width). */
  readonly minWrap: number;
  /** Stroke widths of the axis and the dashed connectors (v12 attributes). */
  readonly axisWidth: number;
  readonly connectorWidth: number;
  /**
   * Box strokes (v12 `styles.js`): the rule under a box that takes `cScale` (`.section-N line`,
   * width 3), and the outline and rule under the neo gradient (v12 neo-look rules, width 2).
   */
  readonly ruleWidth: number;
  readonly gradientWidth: number;
  /**
   * The arrowhead, in stroke widths (v12 marker `M 0,0 V 4 L6,2 Z`, `refX 5`, `refY 2`, in
   * `strokeWidth` units): its base this far behind the line's end, its tip this far past it,
   * and half its base across.
   */
  readonly arrowBack: number;
  readonly arrowAhead: number;
  readonly arrowHalf: number;
  /** Config defaults: `timeline.leftMargin` (schema 150) and `timeline.padding` (v12 50). */
  readonly leftMargin: number;
  readonly padding: number;
}

/** `timelineRenderer.ts`. */
export interface LrMetrics {
  /** Wrap width of every box (v12 `width: 150`). */
  readonly wrap: number;
  /** Padding of every box (v12 `padding: 20`). */
  readonly padding: number;
  /** v12 adds this to each virtual height before taking the period and section maxima. */
  readonly floorExtra: number;
  /** One column per period (v12 `masterX += 200`). */
  readonly pitch: number;
  /** A section's wrap width is `pitch × columns` less this (v12 `200·n − 50`). */
  readonly sectionTrim: number;
  /** From the bottom of the section row to the top of the periods (v12 `+ 50`). */
  readonly sectionGap: number;
  /** From the bottom of the tallest period to the axis (v12 `depthY`). */
  readonly axisGap: number;
  /** From the top of a period to its first event (v12 `masterY + 100 + 100`). */
  readonly eventLead: number;
  /** Events start at least this far below the axis (D252). */
  readonly eventAxisGap: number;
  /** The least event height (v12 `maxHeight: 50`). */
  readonly eventMinHeight: number;
  /** Between two events of a period (v12 `+ 10`). */
  readonly eventGap: number;
  /** The axis ends at the content width plus this many `leftMargin`s (v12 `3 * LEFT_MARGIN`). */
  readonly axisEndMargins: number;
}

/** `timelineRendererVertical.ts`, constant names in its terms. */
export interface TdMetrics {
  /** `NODE_WIDTH`, `EVENT_WIDTH`, `NODE_PADDING`. */
  readonly periodWrap: number;
  readonly eventWrap: number;
  readonly padding: number;
  /** `TASK_AXIS_GAP`: from a period's right edge to the axis. */
  readonly taskAxisGap: number;
  /** `EVENT_AXIS_GAP`: from the axis to the events' left edge. */
  readonly eventAxisGap: number;
  /** `EVENT_SPACING`: between two events of a period. */
  readonly eventGap: number;
  /** `SECTION_TASK_GAP`: from a section's box to its first period. */
  readonly sectionTaskGap: number;
  /** `TASK_VERTICAL_GAP`: added to the row height for the row pitch. */
  readonly rowGap: number;
  /** v12's least section wrap width (`Math.max(50, …)`). */
  readonly sectionMinWrap: number;
  /** The axis starts this many font sizes above the content (v12 `fontSize * 2`) … */
  readonly axisTopEm: number;
  /** … and ends this many font sizes plus `axisBottomPad` below it (v12 `fontSize * 0.5 + 20`). */
  readonly axisBottomEm: number;
  readonly axisBottomPad: number;
}

export interface TimelineMetrics {
  readonly common: CommonMetrics;
  readonly lr: LrMetrics;
  readonly td: TdMetrics;
}

export const TIMELINE_METRICS: TimelineMetrics = {
  common: {
    originX: 50,
    originY: 50,
    heightEm: 1.1 * 0.5,
    titleBaseline: 20,
    titleFontSize: '4ex',
    titleFontWeight: 700,
    titleReferenceFontSize: 16,
    minWrap: 1,
    axisWidth: 4,
    connectorWidth: 2,
    ruleWidth: 3,
    gradientWidth: 2,
    arrowBack: 5,
    arrowAhead: 1,
    arrowHalf: 2,
    leftMargin: 150,
    padding: 50,
  },
  lr: {
    wrap: 150,
    padding: 20,
    floorExtra: 20,
    pitch: 200,
    sectionTrim: 50,
    sectionGap: 50,
    axisGap: 50,
    eventLead: 200,
    eventAxisGap: 50,
    eventMinHeight: 50,
    eventGap: 10,
    axisEndMargins: 3,
  },
  td: {
    periodWrap: 200,
    eventWrap: 300,
    padding: 5,
    taskAxisGap: 20,
    eventAxisGap: 50,
    eventGap: 10,
    sectionTaskGap: 20,
    rowGap: 30,
    sectionMinWrap: 50,
    axisTopEm: 2,
    axisBottomEm: 0.5,
    axisBottomPad: 20,
  },
};
