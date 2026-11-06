/**
 * The v12 side of journey parity (spec #290, #302): a plain-data snapshot of mermaid\@12's
 * journey DB (`journeyDb.js`, a module object) right after the oracle parsed a source.
 *
 * `getTasks()` appends the parse's raw tasks to the task list on every call, and `getActors()`
 * reads that list, so the snapshot calls `getTasks()` exactly once, then `getActors()`. Text has
 * v12's `encodeEntities` placeholders decoded back to what the author wrote (as for flowchart).
 * The oracle's DOMPurify is the identity, so `sanitizeText` changes nothing.
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for journey sources. */
export const JOURNEY_V12_TYPES = ['journey'];

export interface JourneySnapshot {
  title: string;
  accTitle: string;
  accDescr: string;
  sections: string[];
  /** `score` is `NaN` where v12's `Number()` gave it (compared with `Object.is`). */
  tasks: { name: string; score: number; people: string[]; section: string }[];
  actors: string[];
}

interface JourneyDbV12 {
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
  getSections(): string[];
  getTasks(): { task: string; score: number; people: string[]; section: string }[];
  getActors(): string[];
}

export function journeyV12Snapshot(dbValue: unknown): JourneySnapshot {
  const db = dbValue as JourneyDbV12;
  const tasks = db.getTasks().map((t) => ({
    name: decodeEntities(t.task),
    score: t.score,
    people: t.people.map(decodeEntities),
    section: decodeEntities(t.section),
  }));
  return {
    title: decodeEntities(db.getDiagramTitle()),
    accTitle: decodeEntities(db.getAccTitle()),
    accDescr: decodeEntities(db.getAccDescription()),
    sections: db.getSections().map(decodeEntities),
    tasks,
    actors: db.getActors().map(decodeEntities),
  };
}
