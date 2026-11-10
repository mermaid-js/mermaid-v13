/**
 * The v12 side of requirement parity (spec #520): mermaid\@12's `RequirementDB`, driven through
 * the oracle. The snapshot holds what the DB keeps after a parse, in its order:
 *
 * - the requirements map, then the elements map, each in insertion order (the first definition
 *   of a name), with every field as stored (`''` for an empty one) and each node's `cssStyles`
 *   and `classes` in order (`default` first);
 * - the relations in source order, ends as written (unknown names kept);
 * - the classes map (`classDef`), with its `styles` and `textStyles`;
 * - the direction, and the accessible title and description. The front-matter title is left
 *   out: the oracle never passes the front matter on, so `getDiagramTitle()` holds none
 *   (requirement has no in-text title; the v13 side leaves it out too).
 *
 * Text is as stored with v12's `encodeEntities` placeholders decoded, as v13 reads it (the
 * oracle's DOMPurify is the identity, so `sanitizeText` changes nothing).
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for requirement sources. */
export const REQUIREMENT_V12_TYPES = ['requirement'];

export interface RequirementBoxSnapshot {
  name: string;
  /** A requirement's kind (`Functional Requirement`, …), or an element's `type` field. */
  type: string;
  /** Requirement fields; null for an element. */
  requirementId: string | null;
  text: string | null;
  risk: string | null;
  verifyMethod: string | null;
  /** The element's `docref`; null for a requirement. */
  docRef: string | null;
  cssStyles: string[];
  classes: string[];
}

export interface RequirementSnapshot {
  requirements: RequirementBoxSnapshot[];
  elements: RequirementBoxSnapshot[];
  relations: { type: string; src: string; dst: string }[];
  classes: { id: string; styles: string[]; textStyles: string[] }[];
  direction: string;
  accTitle: string;
  accDescr: string;
}

interface RequirementV12 {
  name: string;
  type: string;
  requirementId: string;
  text: string;
  risk: string;
  verifyMethod: string;
  cssStyles: string[];
  classes: string[];
}

interface ElementV12 {
  name: string;
  type: string;
  docRef: string;
  cssStyles: string[];
  classes: string[];
}

interface RequirementDbV12 {
  getRequirements(): Map<string, RequirementV12>;
  getElements(): Map<string, ElementV12>;
  getRelationships(): { type: string; src: string; dst: string }[];
  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }>;
  getDirection(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

const text = (v: unknown): string => (typeof v === 'string' ? decodeEntities(v) : String(v));
const texts = (v: readonly unknown[]): string[] => v.map(text);

export function requirementV12Snapshot(dbValue: unknown): RequirementSnapshot {
  const db = dbValue as RequirementDbV12;
  return {
    requirements: [...db.getRequirements().values()].map((r) => ({
      name: text(r.name),
      type: text(r.type),
      requirementId: text(r.requirementId),
      text: text(r.text),
      risk: text(r.risk),
      verifyMethod: text(r.verifyMethod),
      docRef: null,
      cssStyles: texts(r.cssStyles),
      classes: texts(r.classes),
    })),
    elements: [...db.getElements().values()].map((e) => ({
      name: text(e.name),
      type: text(e.type),
      requirementId: null,
      text: null,
      risk: null,
      verifyMethod: null,
      docRef: text(e.docRef),
      cssStyles: texts(e.cssStyles),
      classes: texts(e.classes),
    })),
    relations: db.getRelationships().map((r) => ({
      type: text(r.type),
      src: text(r.src),
      dst: text(r.dst),
    })),
    classes: [...db.getClasses().values()].map((c) => ({
      id: text(c.id),
      styles: texts(c.styles),
      textStyles: texts(c.textStyles),
    })),
    direction: db.getDirection(),
    accTitle: text(db.getAccTitle()),
    accDescr: text(db.getAccDescription()),
  };
}
