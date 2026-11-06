/**
 * What `schedule()` reads and returns (spec #293 T3). The input is the raw data of T2's
 * `GanttModel` (D274): nothing in it is a date yet, and a `GanttModel` is a `ScheduleInput`.
 */
import type { GanttModel, GanttTask } from '../model.ts';

/** What scheduling reads of a task. */
export type ScheduleTask = Pick<
  GanttTask,
  'id' | 'text' | 'tags' | 'fields' | 'start' | 'end' | 'prevId'
>;

/** What scheduling reads of the model. */
export interface ScheduleInput
  extends Pick<
    GanttModel,
    'dateFormat' | 'includes' | 'excludes' | 'inclusiveEndDates' | 'weekend'
  > {
  readonly tasks: readonly ScheduleTask[];
}

/** A task with its times, in ms since the epoch. */
export interface ScheduledTask {
  /** Index into `ScheduleInput.tasks`. */
  readonly index: number;
  readonly task: ScheduleTask;
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
  /** The steps the schedule took (`steps.ts`, D542), on the counter it was given. */
  readonly steps: number;
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
