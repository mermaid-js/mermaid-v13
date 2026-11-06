/**
 * The gantt layout's result (spec #293 T3): plain data for the renderer (T4), from T2's
 * `GanttModel` (#378). Lengths are px; rectangles have their top-left corner at `x`, `y`; times
 * are ms since the epoch.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { MeasuredLabel } from '@mermaid-js/core/text';
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where a task's label sits, by v12's rule; it gives the text anchor. */
export type LabelSide = 'inside' | 'right' | 'left';

/** A measured label drawn at (`x`, `y`): `y` is the first baseline, `anchor` the text anchor. */
export interface PlacedText {
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly text: MeasuredLabel;
}

export interface GanttTaskLabel extends PlacedText {
  /**
   * v12's class rule (`taskText`, `taskTextOutsideRight|Left`), which reads `endTime` where
   * `x` reads `renderEndTime`, so with excludes the two can disagree (v12, kept). The anchor
   * follows the side; a `vert` label is centred whatever its side (`.vertText`).
   */
  readonly side: LabelSide;
}

export type GanttBarKind = 'bar' | 'milestone' | 'vert';

export interface GanttBar extends Rect {
  /** Index into the model's tasks. */
  readonly task: number;
  readonly id: string;
  readonly ast?: AstId;
  readonly kind: GanttBarKind;
  /** The scheduled times (`end` is v12's `endTime`, excludes included). */
  readonly start: number;
  readonly end: number;
  readonly active: boolean;
  readonly done: boolean;
  readonly crit: boolean;
  /** A `click` names it (v12's `clickable` class: the latest task with the id before the click). */
  readonly clickable: boolean;
  /** The `click … href` URL of a clickable task, as written (v12 `setLink`); unchecked. */
  readonly href?: string;
  /** Section colour slot: the section's index among sections with tasks, mod `numberSectionStyles`. */
  readonly slot: number;
  /** v12 `rx`/`ry`. */
  readonly radius: number;
  /** The `milestone` tag: also set on a `vert` marker that has it (`kind` is then `vert`). */
  readonly milestone: boolean;
  /**
   * A milestone is this rectangle rotated 45° and scaled by `scale` about `pivot` (v12's CSS
   * `transform` and `transform-origin`): the square's centre, or above a `vert` marker.
   */
  readonly scale?: number;
  readonly pivot?: { readonly x: number; readonly y: number };
  readonly label: GanttTaskLabel;
}

/** A row's background band (v12 `section sectionN`). */
export interface GanttBand extends Rect {
  readonly slot: number;
}

/** A section title, its lines centred on `y` (v12 `dy = −(lines − 1) / 2 em`). */
export interface GanttSectionLabel {
  readonly section: string;
  readonly ast?: AstId;
  readonly slot: number;
  /** Rows the section takes. */
  readonly rows: number;
  readonly x: number;
  /** The middle of the section's rows: the centre of the line block. */
  readonly y: number;
  /** One line per `<br>` part. */
  readonly text: MeasuredLabel;
  /** The line pitch (`1em` of the section font). */
  readonly lineHeight: number;
}

export interface GanttTick {
  readonly time: number;
  /** In the chart's coordinates. */
  readonly x: number;
  readonly label: string;
  readonly width: number;
}

/** One axis: its tick lines run from `y1` to `y2`, labels on `labelY` (baseline). */
export interface GanttAxis {
  readonly y: number;
  readonly y1: number;
  readonly y2: number;
  readonly labelY: number;
  readonly ticks: readonly GanttTick[];
}

export interface GanttToday {
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
  /** `todayMarker` as written, when it is a style; the renderer splits and checks it. */
  readonly style?: string;
}

export interface GanttLayout {
  /** v12's chart size: `w` per D272, `h = 2·topPadding + rows·(barHeight + barGap)`. */
  readonly width: number;
  readonly height: number;
  /** The plot: from `leftPadding`, `w − leftPadding − rightPadding` wide. */
  readonly plot: { readonly x: number; readonly width: number };
  /** The time domain; undefined when there is nothing to schedule (D277). */
  readonly domain?: { readonly start: number; readonly end: number };
  readonly rows: number;
  readonly compact: boolean;
  /** `gantt.fontSize` and `gantt.sectionFontSize` in px: the sizes labels were measured in. */
  readonly fontSize: number;
  readonly sectionFontSize: number;
  readonly bands: readonly GanttBand[];
  /** In v12's drawing order: by start, `vert` markers last. */
  readonly bars: readonly GanttBar[];
  readonly sections: readonly GanttSectionLabel[];
  readonly excludes: readonly Rect[];
  readonly bottomAxis: GanttAxis;
  readonly topAxis?: GanttAxis;
  readonly today?: GanttToday;
  /** Centred on `x` with its baseline at `y` (v12 `x = w / 2`, `y = titleTopMargin`). */
  readonly title?: PlacedText;
  /** v12's `0 0 w h`, grown to cover everything drawn (D224): the SVG `viewBox`. */
  readonly bounds: Rect;
}
