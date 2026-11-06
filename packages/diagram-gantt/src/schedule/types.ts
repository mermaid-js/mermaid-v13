/**
 * What `schedule()` reads and returns (spec #293 T3). The input is the raw data v12's `addTask`
 * kept (D274): nothing here is a date yet. T2's `GanttModel` (#378) carries these fields; until
 * it lands the layout and its specs build this shape by hand.
 */
import type { Range } from '@mermaid-js/core/parser-kit';

export type GanttTag = 'active' | 'done' | 'crit' | 'milestone' | 'vert';

/** One task as v12's `addTask` stored it. */
export interface RawGanttTask {
  /** The task text as written (trailing blanks kept, v12 `[^:\n]+`). */
  readonly text: string;
  /** The text of the section the task is in, as written; `''` before the first section. */
  readonly section: string;
  /** The leading tags, in any order. */
  readonly tags: readonly GanttTag[];
  /** The id as written, or v12's `task<n>`. */
  readonly id: string;
  /** The start field, trimmed; undefined for one field (the task starts where the one before ends). */
  readonly start?: string;
  /** The end field (a date, a duration or `until …`), trimmed; undefined for more than three fields. */
  readonly end?: string;
  /** Where the task is in the original source, for schedule errors (D274). */
  readonly range?: Range;
}

/** The settings scheduling reads. */
export interface ScheduleSettings {
  /** `dateFormat` as written (v12 `substr(11)`, untrimmed); `''` when unset. */
  readonly dateFormat: string;
  /** Lowercased tokens, merged across lines in first-seen order (v12 `mergeTokens`). */
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
  readonly inclusiveEndDates: boolean;
  /** `weekend friday|saturday`; v12's default is `saturday`. */
  readonly weekend: 'friday' | 'saturday';
}

export interface ScheduleInput extends ScheduleSettings {
  readonly tasks: readonly RawGanttTask[];
}

/** A task with its times, in ms since the epoch. */
export interface ScheduledTask {
  /** Index into `ScheduleInput.tasks`. */
  readonly index: number;
  readonly task: RawGanttTask;
  /** Undefined when it never resolved (a cycle of `after`/`until` references). */
  readonly start?: number;
  readonly end?: number;
  /** Where the bar ends when excluded days pushed the end out (v12 `renderEndTime`). */
  readonly renderEnd?: number;
  /** The end field reads as `YYYY-MM-DD`, whatever the format (v12 `manualEndTime`). */
  readonly manualEnd: boolean;
  /** v12's row: source order among the tasks that are not `vert`; -1 for `vert`. */
  readonly order: number;
}

export interface Schedule {
  /** In source order. */
  readonly tasks: readonly ScheduledTask[];
  /** `after`/`until` ids that name no task, in first-seen order (D276). */
  readonly unknownIds: readonly string[];
  /** End fields that are neither a date nor a duration, in first-seen order (D276). */
  readonly badDurations: readonly string[];
}

export type ScheduleErrorKind = 'invalidDate' | 'noStart' | 'tooManyFields' | 'excluded';

/** Scheduling failed at one task, where v12's `getTasks` threw (D274). */
export class ScheduleError extends Error {
  readonly kind: ScheduleErrorKind;
  /** Index into `ScheduleInput.tasks`. */
  readonly index: number;

  constructor(kind: ScheduleErrorKind, index: number, message: string) {
    super(message);
    this.name = 'ScheduleError';
    this.kind = kind;
    this.index = index;
  }
}
