/**
 * The v12 side of gantt parity (spec #293, T2): mermaid\@12's gantt DB, driven through the oracle
 * (`oracle-env.ts` runs `getTasks()` after the parse and records the calls the DB cannot give
 * back). Raw fields only: what each task was written as, not when it is scheduled (T3 compares
 * the scheduled fields).
 *
 * - a task's start is `null` when it starts at the previous task's end (one field);
 * - its section is the index of the `addSection` call before its `addTask` (v12 kept only the
 *   name, and two sections can share one), `null` before the first;
 * - `weekday` is the last `setWeekday` call's day, `null` when none (v12 reports `sunday`);
 * - clicks are the grammar's `setClickEvent`/`setLink` calls in order, one entry per id;
 * - texts with v12's `encodeEntities` placeholders decoded, as v13 reads them.
 */
import { v12DecodeEntities } from '../v12-entities.ts';
import { ganttOracleCalls, ganttOracleTasks } from './oracle-env.ts';

/** `diagram.type` values mermaid\@12 reports for gantt sources. */
export const GANTT_V12_TYPES = ['gantt'];

export interface GanttTaskSnapshot {
  id: string;
  text: string;
  section: number | null;
  tags: { active: boolean; done: boolean; crit: boolean; milestone: boolean; vert: boolean };
  start: string | null;
  end: string;
  prevId: string | null;
  order: number;
}

/** The plain-data form both sides of gantt parity normalise to. */
export interface GanttSnapshot {
  title: string;
  accTitle: string;
  accDescr: string;
  dateFormat: string;
  axisFormat: string;
  tickInterval: string | null;
  todayMarker: string;
  includes: string[];
  excludes: string[];
  inclusiveEndDates: boolean;
  topAxis: boolean;
  weekday: string | null;
  weekend: string;
  sections: string[];
  tasks: GanttTaskSnapshot[];
  /** `['setClickEvent', id, name, args | null]` and `['setLink', id, url]`, in call order. */
  clicks: unknown[][];
}

interface RawTaskV12 {
  id: string;
  task: string;
  section: string;
  active?: boolean;
  done?: boolean;
  crit?: boolean;
  milestone?: boolean;
  vert?: boolean;
  order: number;
  prevTaskId?: string;
  raw: { startTime: { type: string; startData?: string }; endTime: { data: string } };
}

interface GanttDbV12 {
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
  getDateFormat(): string;
  getAxisFormat(): string;
  getTickInterval(): string | undefined;
  getTodayMarker(): string;
  getIncludes(): string[];
  getExcludes(): string[];
  endDatesAreInclusive(): boolean;
  topAxisEnabled(): boolean;
  getSections(): string[];
}

const text = (v: unknown): unknown => (typeof v === 'string' ? v12DecodeEntities(v) : v);

export function ganttV12Snapshot(dbValue: unknown): GanttSnapshot {
  const db = dbValue as GanttDbV12;
  let weekend = 'saturday';
  let weekday: string | null = null;
  const clicks: unknown[][] = [];
  const sectionOf: (number | null)[] = [];
  let section = -1;
  for (const [method, args] of ganttOracleCalls()) {
    if (method === 'setWeekend') weekend = String(args[0]);
    else if (method === 'setWeekday') weekday = String(args[0]);
    else if (method === 'addSection') section++;
    else if (method === 'addTask') sectionOf.push(section < 0 ? null : section);
    else {
      const [ids, ...rest] = args;
      for (const id of String(ids).split(',')) clicks.push([method, text(id), ...rest.map(text)]);
    }
  }
  return {
    title: v12DecodeEntities(db.getDiagramTitle()),
    accTitle: v12DecodeEntities(db.getAccTitle()),
    accDescr: v12DecodeEntities(db.getAccDescription()),
    dateFormat: v12DecodeEntities(db.getDateFormat()),
    axisFormat: v12DecodeEntities(db.getAxisFormat()),
    tickInterval:
      db.getTickInterval() === undefined ? null : v12DecodeEntities(db.getTickInterval() ?? ''),
    todayMarker: v12DecodeEntities(db.getTodayMarker()),
    includes: db.getIncludes().map(v12DecodeEntities),
    excludes: db.getExcludes().map(v12DecodeEntities),
    inclusiveEndDates: db.endDatesAreInclusive(),
    topAxis: db.topAxisEnabled(),
    weekday,
    weekend,
    sections: db.getSections().map(v12DecodeEntities),
    tasks: (ganttOracleTasks() as RawTaskV12[]).map((t, i) => ({
      id: v12DecodeEntities(t.id),
      text: v12DecodeEntities(t.task),
      section: sectionOf[i] ?? null,
      tags: {
        active: !!t.active,
        done: !!t.done,
        crit: !!t.crit,
        milestone: !!t.milestone,
        vert: !!t.vert,
      },
      start:
        t.raw.startTime.type === 'prevTaskEnd'
          ? null
          : v12DecodeEntities(t.raw.startTime.startData ?? ''),
      end: v12DecodeEntities(t.raw.endTime.data),
      prevId: t.prevTaskId === undefined ? null : v12DecodeEntities(t.prevTaskId),
      order: t.order,
    })),
    clicks,
  };
}
