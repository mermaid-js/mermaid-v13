/**
 * The gantt layout's metrics table (D108, pitfall 13): every length and factor the layout uses
 * that is not a `gantt.*` config value. It is the only file in `layout/` that holds a length
 * literal. Gantt has no text output (D216), so there is one set, in px: the constants written
 * into v12's `ganttRenderer.js` and `styles.js` (fa796a943), and the schema defaults of the
 * config keys the layout reads (`config.schema.yaml` `GanttDiagramConfig`).
 */

/** Schema defaults of the `gantt.*` lengths and counts (v12 `GanttDiagramConfig`). */
export interface GanttDefaults {
  readonly titleTopMargin: number;
  readonly barHeight: number;
  readonly barGap: number;
  readonly topPadding: number;
  readonly rightPadding: number;
  readonly leftPadding: number;
  readonly gridLineStartPadding: number;
  readonly fontSize: number;
  readonly sectionFontSize: number;
  readonly numberSectionStyles: number;
  readonly axisFormat: string;
  readonly weekday: string;
}

export interface GanttMetrics {
  readonly defaults: GanttDefaults;
  /** D272: the width without `gantt.useWidth` or `availableWidth` (v12's fallback). */
  readonly width: number;
  /** Bar corner radius (v12 `rx`/`ry` 3). */
  readonly barRadius: number;
  /** A row band starts this far above its bar (v12 `y = order·gap + topPadding − 2`). */
  readonly bandOffset: number;
  /** A band is `w` less this many `rightPadding`s wide (v12 `w − rightPadding / 2`). */
  readonly bandRightTrim: number;
  /** A milestone's centre is this far along its span, in spans (v12 `0.5·(end − start)`). */
  readonly milestoneCentre: number;
  /** v12 styles.js `.milestone { transform: rotate(45deg) scale(0.8, 0.8) }`. */
  readonly milestoneScale: number;
  /** A `vert` marker is this many bar heights wide (v12 `0.08 · barHeight`) … */
  readonly vertWidth: number;
  /** … and reaches this many bar heights past the rows (v12 `rows·(barHeight + barGap) + 2·barHeight`). */
  readonly vertOverhang: number;
  /** A `vert` label's baseline is this far below the rows (v12 `+ 60`). */
  readonly vertLabelGap: number;
  /** v12 styles.js `.vertText { font-size: 15px }`. */
  readonly vertFontSize: number;
  /** A label's baseline is half the font size less this below the bar's middle (v12 `fontSize / 2 − 2`). */
  readonly labelBaselineLift: number;
  /** An outside label is this far from its bar (v12 `± 5`). */
  readonly labelGap: number;
  /** An outside label goes left when it would pass `w` less this many `leftPadding`s (v12 `1.5`). */
  readonly labelRightRoom: number;
  /** Section titles: x (v12 `10`) and the line pitch of a `<br>` title (v12 `dy 1em`). */
  readonly sectionX: number;
  readonly sectionLineEm: number;
  /** The bottom axis is this far above the chart's bottom (v12 `translate(leftPadding, h − 50)`). */
  readonly axisBottomGap: number;
  /** Tick labels: size (v12 `font-size 10`), gap from the axis (d3 `tickPadding` 3), bottom `dy 1em`. */
  readonly tickFontSize: number;
  readonly tickPadding: number;
  readonly tickLabelEm: number;
  /** d3's default tick count (`axis.ticks()` with no argument). */
  readonly tickCount: number;
  /** v12 `getEstimatedTickCount`'s `dayjs.duration` units, in ms (a month is 30 days). */
  readonly tickUnitMs: Readonly<Record<string, number>>;
  /** v12 `MAX_TICK_COUNT`: more interval ticks than this fall back to automatic ones. */
  readonly maxTicks: number;
  /** v12 skips exclude ranges over a span of more than this many years, in months. */
  readonly excludeSpanMonths: number;
  /** v12 styles.js `.titleText { font-size: 18px }`. */
  readonly titleFontSize: number;
  /** CSS font weights: normal, and bold for clickable labels (v12 `.taskText.clickable`). */
  readonly weightNormal: number;
  readonly weightBold: number;
}

export const GANTT_METRICS: GanttMetrics = {
  defaults: {
    titleTopMargin: 25,
    barHeight: 20,
    barGap: 4,
    topPadding: 50,
    rightPadding: 75,
    leftPadding: 75,
    gridLineStartPadding: 35,
    fontSize: 11,
    sectionFontSize: 11,
    numberSectionStyles: 4,
    axisFormat: '%Y-%m-%d',
    weekday: 'sunday',
  },
  width: 1200,
  barRadius: 3,
  bandOffset: 2,
  bandRightTrim: 0.5,
  milestoneCentre: 0.5,
  milestoneScale: 0.8,
  vertWidth: 0.08,
  vertOverhang: 2,
  vertLabelGap: 60,
  vertFontSize: 15,
  labelBaselineLift: 2,
  labelGap: 5,
  labelRightRoom: 1.5,
  sectionX: 10,
  sectionLineEm: 1,
  axisBottomGap: 50,
  tickFontSize: 10,
  tickPadding: 3,
  tickLabelEm: 1,
  tickCount: 10,
  tickUnitMs: {
    millisecond: 1,
    second: 1e3,
    minute: 6e4,
    hour: 3.6e6,
    day: 8.64e7,
    week: 6.048e8,
    month: 2.592e9,
  },
  maxTicks: 10000,
  excludeSpanMonths: 72,
  titleFontSize: 18,
  weightNormal: 400,
  weightBold: 700,
};
