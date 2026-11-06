/**
 * The v12 side of gantt parity (spec #293, T2): mermaid\@12's gantt DB, driven through the oracle
 * (`oracle-env.ts` runs `getTasks()` after the parse and records the calls the DB cannot give
 * back). Raw fields only: what each task was written as, not when it is scheduled (T3 compares
 * the scheduled fields).
 *
 * - a task's start is `null` when it starts at the previous task's end (one field);
 * - its section is the section's name (v12 kept no index), `''` before the first one;
 * - clicks are the grammar's `setClickEvent`/`setLink` calls in order, ids as written;
 * - texts with v12's `encodeEntities` placeholders decoded, as v13 reads them.
 */
import { decodeEntities } from '../flowchart/v12.ts';
import { ganttOracleCalls, ganttOracleTasks } from './oracle-env.ts';

/** `diagram.type` values mermaid\@12 reports for gantt sources. */
export const GANTT_V12_TYPES = ['gantt'];

export interface GanttTaskSnapshot {
  id: string;
  text: string;
  section: string;
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
  weekday: string;
  weekend: string;
  sections: string[];
  tasks: GanttTaskSnapshot[];
  /** `['setClickEvent', ids, name, args | null]` and `['setLink', ids, url]`, in call order. */
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
  getWeekday(): string;
  getSections(): string[];
}

const text = (v: unknown): unknown => (typeof v === 'string' ? decodeEntities(v) : v);

export function ganttV12Snapshot(dbValue: unknown): GanttSnapshot {
  const db = dbValue as GanttDbV12;
  let weekend = 'saturday';
  const clicks: unknown[][] = [];
  for (const [method, args] of ganttOracleCalls()) {
    if (method === 'setWeekend') weekend = String(args[0]);
    else clicks.push([method, ...args.map(text)]);
  }
  return {
    title: decodeEntities(db.getDiagramTitle()),
    accTitle: decodeEntities(db.getAccTitle()),
    accDescr: decodeEntities(db.getAccDescription()),
    dateFormat: decodeEntities(db.getDateFormat()),
    axisFormat: decodeEntities(db.getAxisFormat()),
    tickInterval:
      db.getTickInterval() === undefined ? null : decodeEntities(db.getTickInterval() ?? ''),
    todayMarker: decodeEntities(db.getTodayMarker()),
    includes: db.getIncludes().map(decodeEntities),
    excludes: db.getExcludes().map(decodeEntities),
    inclusiveEndDates: db.endDatesAreInclusive(),
    topAxis: db.topAxisEnabled(),
    weekday: db.getWeekday(),
    weekend,
    sections: db.getSections().map(decodeEntities),
    tasks: (ganttOracleTasks() as RawTaskV12[]).map((t) => ({
      id: decodeEntities(t.id),
      text: decodeEntities(t.task),
      section: decodeEntities(t.section),
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
          : decodeEntities(t.raw.startTime.startData ?? ''),
      end: decodeEntities(t.raw.endTime.data),
      prevId: t.prevTaskId === undefined ? null : decodeEntities(t.prevTaskId),
      order: t.order,
    })),
    clicks,
  };
}
