/**
 * The gantt layout's input and result (spec #293 T3). `GanttLayoutModel` is what the layout
 * reads of T2's `GanttModel` (#378); `GanttLayout` is plain data for the renderer (T4). Lengths
 * are px; rectangles have their top-left corner at `x`, `y`; times are ms since the epoch.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { RawGanttTask, ScheduleInput } from '../schedule/index.ts';

/** A raw task and its AST id (`t:<id>`). */
export interface GanttModelTask extends RawGanttTask {
  readonly ast?: AstId;
}

export interface GanttModelSection {
  /** As written (v12 `substr(8)`). */
  readonly text: string;
  readonly ast?: AstId;
}

/** A `click` statement: the ids it names (v12 splits them on `,`). */
export interface GanttModelClick {
  readonly ids: readonly string[];
}

export interface GanttLayoutModel extends ScheduleInput {
  /** The original source, for positioned schedule errors (D274). */
  readonly source?: string;
  readonly tasks: readonly GanttModelTask[];
  readonly sections: readonly GanttModelSection[];
  readonly clicks: readonly GanttModelClick[];
  /** The `title` statement, or the front-matter title (v12 `getDiagramTitle`). */
  readonly title?: string;
  /** Statement values as written; `''` / undefined when absent. */
  readonly axisFormat: string;
  readonly tickInterval?: string;
  readonly todayMarker: string;
  /** The `topAxis` statement (D273). */
  readonly topAxis: boolean;
  /** The `weekday` statement's day (D279: it wins over `gantt.weekday`). */
  readonly weekday?: string;
}

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
  /** A `click` names its id (v12's `clickable` class, on the last task with that id). */
  readonly clickable: boolean;
  /** Section colour slot: the section's index among sections with tasks, mod `numberSectionStyles`. */
  readonly slot: number;
  /** v12 `rx`/`ry`. */
  readonly radius: number;
  /** A milestone's diamond is this rectangle rotated 45° and scaled about its centre. */
  readonly scale?: number;
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
