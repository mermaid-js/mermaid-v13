/**
 * The v12 side of journey parity (spec #290, #302): a plain-data snapshot of mermaid\@12's
 * journey DB (`journeyDb.js`, a module object) right after the oracle parsed a source.
 *
 * `getTasks()` appends the parse's raw tasks to the task list on every call, and `getActors()`
 * reads that list, so the snapshot calls `getTasks()` exactly once, then `getActors()`. Text has
 * v12's `encodeEntities` placeholders decoded back to what the author wrote (as for flowchart).
 * The oracle's DOMPurify is the identity, so `sanitizeText` changes nothing.
 */
import { v12DecodeEntities } from '../v12-entities.ts';

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
    name: v12DecodeEntities(t.task),
    score: t.score,
    people: t.people.map(v12DecodeEntities),
    section: v12DecodeEntities(t.section),
  }));
  return {
    title: v12DecodeEntities(db.getDiagramTitle()),
    accTitle: v12DecodeEntities(db.getAccTitle()),
    accDescr: v12DecodeEntities(db.getAccDescription()),
    sections: db.getSections().map(v12DecodeEntities),
    tasks,
    actors: db.getActors().map(v12DecodeEntities),
  };
}
