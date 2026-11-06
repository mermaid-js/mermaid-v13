/**
 * The gantt schedule (spec #293 T3, D274): v12's `ganttDb.js` `getTasks()` as a pure function of
 * the raw tasks, the settings and `now` (D270). It follows v12 step by step, quirks included:
 * up to eleven passes over every task (a task may refer to one defined after it), `after` takes
 * the latest end and `until` the earliest start of the tasks it names (last definition wins),
 * unknown ids fall back to local midnight of `now`, excluded days push an end out one day each
 * (at most 10,000), and an end written as `YYYY-MM-DD` is never pushed, whatever the format.
 *
 * Where v12 threw (`Invalid date:`, a TypeError for a first task with no start or for more
 * than three fields, the 10,000-day guard) this throws a {@link ScheduleError} for the task.
 */
import {
  add,
  addDays,
  format,
  isValid,
  parseDuration,
  parseStrict,
  readEndDate,
  readStartDate,
  WEEKDAYS,
} from '../dates/index.ts';
import {
  ScheduleError,
  type RawGanttTask,
  type Schedule,
  type ScheduledTask,
  type ScheduleInput,
} from './types.ts';

/** v12 `getTasks`: one pass, then up to ten more while a task is unresolved. */
const MAX_PASSES = 11;
/** v12 `fixTaskDates`: an end pushed past this many days fails. */
const MAX_PUSHED_DAYS = 10000;
const WEEKEND_START_DAY = { friday: 5, saturday: 6 } as const;
const RE_AFTER = /^after\s+([\d\w- ]+)/;
const RE_UNTIL = /^until\s+([\d\w- ]+)/;
const MANUAL_END_FORMAT = 'YYYY-MM-DD';
const NAMES = WEEKDAYS.map((d) => d.toLowerCase());

/** One task's mutable state across passes, as v12's `rawTasks` entry. */
interface State {
  start?: number;
  end?: number;
  renderEnd?: number;
  manualEnd: boolean;
  processed: boolean;
}

export interface ScheduleOptions {
  /** The instant treated as now (ms since the epoch, D270). */
  readonly now: number;
}

/** Schedules `input` against `now` as v12's `getTasks()` did. */
export function schedule(input: ScheduleInput, options: ScheduleOptions): Schedule {
  return new Scheduler(input, options.now).run();
}

class Scheduler {
  private readonly tasks: readonly RawGanttTask[];
  private readonly state: State[];
  /** v12 `taskDb`: id → index of its last definition. */
  private readonly byId = new Map<string, number>();
  private readonly nowDate: Date;
  private readonly today: number;
  private readonly format: string;
  private readonly includes: ReadonlySet<string>;
  private readonly excludes: ReadonlySet<string>;
  private readonly hasExcludes: boolean;
  private readonly weekendStart: number;
  private readonly unknown = new Set<string>();
  private readonly bad = new Set<string>();

  constructor(
    private readonly input: ScheduleInput,
    now: number
  ) {
    this.tasks = input.tasks;
    this.state = input.tasks.map(() => ({ manualEnd: false, processed: false }));
    input.tasks.forEach((t, i) => {
      // v12 assigns `taskDb[id]`, a plain object: `__proto__` is never stored.
      if (t.id !== '__proto__') this.byId.set(t.id, i);
    });
    this.nowDate = new Date(now);
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    this.today = midnight.getTime();
    this.format = input.dateFormat.trim();
    this.includes = new Set(input.includes);
    this.excludes = new Set(input.excludes);
    this.hasExcludes = input.excludes.length > 0;
    this.weekendStart = WEEKEND_START_DAY[input.weekend];
  }

  run(): Schedule {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let all = true;
      for (let i = 0; i < this.tasks.length; i++) all = this.compile(i) && all;
      if (all) break;
    }
    let order = 0;
    const tasks = this.tasks.map((task, index): ScheduledTask => {
      const s = this.state[index]!;
      return {
        index,
        task,
        ...(s.start !== undefined ? { start: s.start } : {}),
        ...(s.end !== undefined ? { end: s.end } : {}),
        ...(s.renderEnd !== undefined ? { renderEnd: s.renderEnd } : {}),
        manualEnd: s.manualEnd,
        order: task.tags.includes('vert') ? -1 : order++,
      };
    });
    return { tasks, unknownIds: [...this.unknown], badDurations: [...this.bad] };
  }

  /** v12 `compileTask`: whether the task is processed after this pass. */
  private compile(i: number): boolean {
    const task = this.tasks[i]!;
    const s = this.state[i]!;
    if (task.end === undefined) {
      throw new ScheduleError(
        'tooManyFields',
        i,
        `Task "${task.text.trim()}" has too many fields: a task takes tags, then an id, a start, and an end or a duration.`
      );
    }
    if (task.start === undefined) {
      const prevId = i > 0 ? this.tasks[i - 1]!.id : undefined;
      const prev = prevId === undefined ? undefined : this.byId.get(prevId);
      if (prev === undefined) {
        throw new ScheduleError(
          'noStart',
          i,
          `Task "${task.text.trim()}" has no start: the first task needs a start date or "after <id>".`
        );
      }
      s.start = this.state[prev]!.end;
    } else {
      const start = this.startDate(i, task.start);
      if (start !== undefined) s.start = start;
    }
    if (s.start === undefined) return s.processed;
    const end = this.endDate(s.start, task.end);
    if (end === undefined) return s.processed;
    s.end = end;
    s.processed = true;
    s.manualEnd = parseStrict(task.end, MANUAL_END_FORMAT, this.nowDate) !== undefined;
    if (this.hasExcludes && !s.manualEnd) this.pushEnd(i, s);
    return s.processed;
  }

  /** The tasks `list` names (space-separated), unknown ones noted. */
  private referenced(list: string): number[] {
    const out: number[] = [];
    for (const id of list.split(' ')) {
      if (id === '') continue;
      const at = this.byId.get(id);
      if (at === undefined) this.unknown.add(id);
      else out.push(at);
    }
    return out;
  }

  /** v12 `getStartDate`. */
  private startDate(i: number, raw: string): number | undefined {
    const str = raw.trim();
    const after = RE_AFTER.exec(str);
    if (after !== null) {
      // The first task named, then any whose end is later; an unresolved first one wins (v12).
      let latest: number | undefined;
      let found = false;
      for (const at of this.referenced(after[1]!)) {
        const end = this.state[at]!.end;
        if (!found || (end !== undefined && latest !== undefined && end > latest)) latest = end;
        found = true;
      }
      return found ? latest : this.today;
    }
    const date = readStartDate(str, this.format, this.nowDate);
    if (date === undefined || !isValid(date)) {
      throw new ScheduleError(
        'invalidDate',
        i,
        `Invalid date:${str} (it is not a date in the "${this.format}" format, nor one JavaScript can read).`
      );
    }
    return date.getTime();
  }

  /** v12 `getEndDate`. */
  private endDate(start: number, raw: string): number | undefined {
    const str = raw.trim();
    const until = RE_UNTIL.exec(str);
    if (until !== null) {
      let earliest: number | undefined;
      let found = false;
      for (const at of this.referenced(until[1]!)) {
        const begin = this.state[at]!.start;
        if (!found || (begin !== undefined && earliest !== undefined && begin < earliest))
          earliest = begin;
        found = true;
      }
      return found ? earliest : this.today;
    }
    const date = readEndDate(str, this.format, this.nowDate);
    if (date !== undefined) {
      return (this.input.inclusiveEndDates ? add(date, 1, 'd') : date).getTime();
    }
    const [value, unit] = parseDuration(str);
    if (Number.isNaN(value)) {
      this.bad.add(str);
      return start;
    }
    const end = add(new Date(start), value, unit);
    return isValid(end) ? end.getTime() : start;
  }

  /** v12 `checkTaskDates` and `fixTaskDates`: each excluded day pushes the end one day. */
  private pushEnd(i: number, s: State): void {
    let day = addDays(new Date(s.start!), 1);
    let end = new Date(s.end!);
    const limit = addDays(end, MAX_PUSHED_DAYS).getTime();
    let invalid = false;
    let renderEnd: number | undefined;
    while (day.getTime() <= end.getTime()) {
      if (!invalid) renderEnd = end.getTime();
      invalid = this.excluded(day);
      if (invalid) {
        end = addDays(end, 1);
        if (end.getTime() > limit) {
          throw new ScheduleError(
            'excluded',
            i,
            `Task "${this.tasks[i]!.text.trim()}": failed to find a valid date that was not excluded by \`excludes\` after 10,000 iterations.`
          );
        }
      }
      day = addDays(day, 1);
    }
    s.end = end.getTime();
    // v12 leaves `renderEndTime` null when the loop never ran.
    if (renderEnd === undefined) delete s.renderEnd;
    else s.renderEnd = renderEnd;
  }

  /** v12 `isInvalidDate`. */
  excluded(date: Date): boolean {
    return isExcluded(date, this.format, this.includes, this.excludes, this.weekendStart);
  }
}

/**
 * v12 `isInvalidDate`: a day an include names is never excluded; otherwise `weekends`, a
 * weekday name, or the day as `YYYY-MM-DD` or in `dateFormat` excludes it.
 */
export function isExcluded(
  date: Date,
  dateFormat: string,
  includes: ReadonlySet<string>,
  excludes: ReadonlySet<string>,
  weekendStart: number
): boolean {
  const formatted = format(date, dateFormat.trim());
  const dateOnly = format(date, MANUAL_END_FORMAT)!;
  if ((formatted !== undefined && includes.has(formatted)) || includes.has(dateOnly)) return false;
  const iso = date.getDay() || 7;
  if (excludes.has('weekends') && (iso === weekendStart || iso === weekendStart + 1)) return true;
  if (excludes.has(NAMES[date.getDay()]!)) return true;
  return (formatted !== undefined && excludes.has(formatted)) || excludes.has(dateOnly);
}

export { WEEKEND_START_DAY };
