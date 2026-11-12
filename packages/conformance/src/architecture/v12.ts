/**
 * The v12 side of architecture parity: a plain-data snapshot of mermaid\@12's architecture DB
 * (`getGroups()`, `getServices()`, `getJunctions()`, `getEdges()`, `getLayoutHints()`, the title
 * and accessibility), in the shape of v13's `ArchitectureModel` without AST ids and warnings.
 * v12's DB is reset on the next parse: this copies what it needs right after the oracle's parse.
 *
 * Normalisation, chosen so the snapshot holds what v12 built and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to `&name;`, the form v13 keeps;
 * - every optional field is present, `undefined` when v12 left it unset, and the arrowhead and
 *   `{group}` flags are booleans;
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { decodeEntities as d } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for architecture sources. */
export const ARCHITECTURE_V12_TYPES = ['architecture'];

export interface ArchitectureSnapshot {
  groups: { id: string; icon?: string; title?: string; in?: string }[];
  services: { id: string; icon?: string; iconText?: string; title?: string; in?: string }[];
  junctions: { id: string; in?: string }[];
  edges: {
    lhsId: string;
    lhsDir: string;
    lhsInto: boolean;
    lhsGroup: boolean;
    rhsId: string;
    rhsDir: string;
    rhsInto: boolean;
    rhsGroup: boolean;
    title?: string;
  }[];
  alignments: { direction: string; members: string[] }[];
  title: string;
  accTitle: string;
  accDescr: string;
}

interface NodeV12 {
  id: string;
  icon?: string;
  iconText?: string;
  title?: string;
  in?: string;
}

interface EdgeV12 {
  lhsId: string;
  lhsDir: string;
  lhsInto?: boolean;
  lhsGroup?: boolean;
  rhsId: string;
  rhsDir: string;
  rhsInto?: boolean;
  rhsGroup?: boolean;
  title?: string;
}

interface ArchitectureDbV12 {
  getGroups(): NodeV12[];
  getServices(): NodeV12[];
  getJunctions(): NodeV12[];
  getEdges(): EdgeV12[];
  getLayoutHints(): { direction: string; members: string[] }[];
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

const opt = (v: string | undefined) => (v === undefined ? undefined : d(v));

export function architectureV12Snapshot(dbValue: unknown): ArchitectureSnapshot {
  const db = dbValue as ArchitectureDbV12;
  return {
    groups: db.getGroups().map((g) => ({
      id: g.id,
      icon: opt(g.icon),
      title: opt(g.title),
      in: g.in,
    })),
    services: db.getServices().map((s) => ({
      id: s.id,
      icon: opt(s.icon),
      iconText: opt(s.iconText),
      title: opt(s.title),
      in: s.in,
    })),
    junctions: db.getJunctions().map((j) => ({ id: j.id, in: j.in })),
    edges: db.getEdges().map((e) => ({
      lhsId: e.lhsId,
      lhsDir: e.lhsDir,
      lhsInto: e.lhsInto === true,
      lhsGroup: e.lhsGroup === true,
      rhsId: e.rhsId,
      rhsDir: e.rhsDir,
      rhsInto: e.rhsInto === true,
      rhsGroup: e.rhsGroup === true,
      title: opt(e.title),
    })),
    alignments: db
      .getLayoutHints()
      .map((h) => ({ direction: h.direction, members: [...h.members] })),
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
