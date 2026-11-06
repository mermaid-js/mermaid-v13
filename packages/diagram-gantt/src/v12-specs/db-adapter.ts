/**
 * Test-only adapter for the ported v12 `ganttDb.spec.ts` (R-TEST-3, spec #293 T3): v12's
 * `ganttDb` method names over the v13 schedule. The spec's DB calls build a schedule input as
 * v12's `addTask`/`parseData` stored it, and `getTasks()` runs `schedule()` at `now`, returning
 * v12's task shape (`startTime`, `endTime`, `renderEndTime` as `Date`s or null, `task`, `id`,
 * `order`, `manualEndTime`). The spec passes `now` (core never reads the clock, D270), where
 * v12's test read `new Date()`. Warnings are the schedule's lists (v12 logged them).
 */
import { parseDuration as v12ParseDuration } from '../dates/index.ts';
import { schedule, type Schedule } from '../schedule/index.ts';
import { FixtureDb } from '../schedule/fixtures.ts';

/** v12's task as `getTasks()` returned it. */
export interface V12Task {
  id: string;
  task: string;
  section: string;
  type: string;
  startTime?: Date;
  endTime?: Date;
  renderEndTime: Date | null;
  manualEndTime: boolean;
  order: number;
  active?: boolean;
  done?: boolean;
  crit?: boolean;
  milestone?: boolean;
  vert?: boolean;
}

const date = (t: number | undefined): Date | undefined =>
  t === undefined ? undefined : new Date(t);

export class GanttDbAdapter {
  private db = new FixtureDb();
  private axisFormat = '';
  private todayMarker = '';
  private displayMode = '';
  private accTitle = '';
  private accDescription = '';
  private sections: string[] = [];
  /** The last `getTasks()`'s schedule. */
  last: Schedule | undefined;

  constructor(private readonly now: number) {}

  clear(): void {
    this.db = new FixtureDb();
    this.axisFormat = this.todayMarker = this.displayMode = '';
    this.accTitle = this.accDescription = '';
    this.sections = [];
    this.last = undefined;
  }

  parseDuration = (str: string): [number, string] => v12ParseDuration(str);
  setDateFormat = (txt: string): void => void this.db.setDateFormat(txt);
  getDateFormat = (): string => this.db.dateFormat;
  setAxisFormat = (txt: string): void => void (this.axisFormat = txt);
  getAxisFormat = (): string => this.axisFormat;
  setTodayMarker = (txt: string): void => void (this.todayMarker = txt);
  getTodayMarker = (): string => this.todayMarker;
  setDisplayMode = (txt: string): void => void (this.displayMode = txt);
  getDisplayMode = (): string => this.displayMode;
  enableInclusiveEndDates = (): void => void this.db.enableInclusiveEndDates();
  endDatesAreInclusive = (): boolean => this.db.inclusiveEndDates;
  setExcludes = (txt: string): void => void this.db.setExcludes(txt);
  getExcludes = (): string[] => this.db.excludes;
  setIncludes = (txt: string): void => void this.db.setIncludes(txt);
  getIncludes = (): string[] => this.db.includes;
  setWeekend = (day: 'friday' | 'saturday'): void => void this.db.setWeekend(day);
  setAccTitle = (txt: string): void => void (this.accTitle = txt);
  getAccTitle = (): string => this.accTitle;
  getAccDescription = (): string => this.accDescription;
  getSections = (): string[] => this.sections;

  addSection(txt: string): void {
    this.sections.push(txt);
    this.db.addSection(txt);
  }

  addTask(text: string, data: string): void {
    this.db.addTask(text, data);
  }

  getTasks(): V12Task[] {
    const s = schedule(this.db.input(), { now: this.now });
    this.last = s;
    return s.tasks.map(({ task, start, end, renderEnd, manualEnd, order }) => {
      const out: V12Task = {
        id: task.id,
        task: task.text,
        section: task.section,
        type: task.section,
        renderEndTime: date(renderEnd) ?? null,
        manualEndTime: manualEnd,
        order,
      };
      const startTime = date(start);
      const endTime = date(end);
      if (startTime) out.startTime = startTime;
      if (endTime) out.endTime = endTime;
      for (const tag of task.tags) out[tag] = true;
      return out;
    });
  }
}
