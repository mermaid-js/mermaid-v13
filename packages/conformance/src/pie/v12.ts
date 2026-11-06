/**
 * The v12 side of pie parity: a plain-data snapshot of mermaid\@12's pie DB, in the shape of
 * v13's `PieModel` without AST ids and warnings.
 *
 * Normalisation, chosen so the snapshot holds what v12 drew and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote;
 * - sections are `[label, value]` pairs in the DB's (insertion) order;
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { decodeEntities as d } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for pie sources. */
export const PIE_V12_TYPES = ['pie'];

export interface PieSnapshot {
  showData: boolean;
  sections: [label: string, value: number][];
  title: string;
  accTitle: string;
  accDescr: string;
}

interface PieDbV12 {
  getSections(): Map<string, number>;
  getShowData(): boolean;
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

export function pieV12Snapshot(dbValue: unknown): PieSnapshot {
  const db = dbValue as PieDbV12;
  return {
    showData: db.getShowData(),
    sections: [...db.getSections()].map(([label, value]) => [d(label), value]),
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
