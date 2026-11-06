/**
 * The v12 side of timeline parity (spec #291): mermaid\@12's timeline DB, driven through the
 * oracle. The DB is a module namespace (`timelineDb.js`), so the snapshot copies what it needs
 * before the next parse:
 *
 * - `getTasks()` is called once: it appends the raw tasks to its list on every call;
 * - a period's section is the section's name (v12 kept no index), `''` before the first one;
 * - texts with v12's `encodeEntities` placeholders decoded, as v13 reads them;
 * - title and accessibility values from the common DB (`getCommonDb()`); the DB has no
 *   `setDiagramTitle`, so a front-matter title never reaches it.
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for timeline sources. */
export const TIMELINE_V12_TYPES = ['timeline'];

export interface TimelinePeriodSnapshot {
  text: string;
  /** The section's name, `''` before the first section. */
  section: string;
  events: string[];
}

/** The plain-data form both sides of timeline parity normalise to. */
export interface TimelineSnapshot {
  direction: string;
  title: string;
  accTitle: string;
  accDescr: string;
  sections: string[];
  periods: TimelinePeriodSnapshot[];
}

interface TimelineDbV12 {
  getDirection(): string;
  getSections(): string[];
  getTasks(): { task: string; section: string; events: string[] }[];
  getCommonDb(): {
    getDiagramTitle(): string;
    getAccTitle(): string;
    getAccDescription(): string;
  };
}

export function timelineV12Snapshot(dbValue: unknown): TimelineSnapshot {
  const db = dbValue as TimelineDbV12;
  const common = db.getCommonDb();
  return {
    direction: db.getDirection(),
    title: decodeEntities(common.getDiagramTitle()),
    accTitle: decodeEntities(common.getAccTitle()),
    accDescr: decodeEntities(common.getAccDescription()),
    sections: db.getSections().map(decodeEntities),
    periods: db.getTasks().map((t) => ({
      text: decodeEntities(t.task),
      section: decodeEntities(t.section),
      events: t.events.map(decodeEntities),
    })),
  };
}
