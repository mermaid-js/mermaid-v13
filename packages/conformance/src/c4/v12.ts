/**
 * The v12 side of C4 parity (spec #522): mermaid\@12's C4 DB, driven through the oracle (see
 * `oracle-env.ts` for the per-case accessibility reset and the render-time end check). The
 * snapshot is what `getC4ShapeArray()`, `getBoundaries()`, `getRels()`, `getTitle()`,
 * `getC4Type()`, the row counts and the accessibility getters return:
 *
 * - each item's fields by name, so a field a statement left out is absent (a named argument
 *   leaves its own slot's `descr`/`techn` unset): `{ text }` values unwrapped, any other value as
 *   a string (a non-string `text`, which a named argument in the label slot stored, as JSON);
 *   v12's `encodeEntities` placeholders decoded, as v13 reads them;
 * - the structural fields apart: the alias (or relation ends), the kind, the parent boundary's
 *   alias (`global` at the top level), a deployment node's kind;
 * - a relation's offsets as v12's renderer read them (`offsetX ? parseInt(String(offsetX)) : 0`);
 * - the root boundary `global` left out: v13 has none (D454).
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for C4 sources. */
export const C4_V12_TYPES = ['c4'];

/** A field's value as a string. */
export type C4Fields = Record<string, string>;

export interface C4ElementSnapshot {
  alias: string;
  kind: string;
  parent: string;
  fields: C4Fields;
}

export interface C4BoundarySnapshot {
  alias: string;
  parent: string;
  nodeKind: string | null;
  fields: C4Fields;
}

export interface C4RelationSnapshot {
  kind: string;
  from: string;
  to: string;
  offsetX: number;
  offsetY: number;
  fields: C4Fields;
}

/** The plain-data form both sides of C4 parity normalise to. */
export interface C4Snapshot {
  type: string;
  title: string;
  accTitle: string;
  accDescr: string;
  shapeInRow: number;
  boundaryInRow: number;
  shapes: C4ElementSnapshot[];
  boundaries: C4BoundarySnapshot[];
  rels: C4RelationSnapshot[];
}

interface C4DbV12 {
  getC4Type(): string | undefined;
  getTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
  getC4ShapeInRow(): number;
  getC4BoundaryInRow(): number;
  getC4ShapeArray(): Record<string, unknown>[];
  getBoundaries(): Record<string, unknown>[];
  getRels(): Record<string, unknown>[];
}

/** A value v12 stored, as a string: `{ text }` unwrapped, entities decoded. */
function asText(v: unknown): string {
  if (typeof v === 'object' && v !== null && 'text' in v) {
    const text = (v as { text: unknown }).text;
    return typeof text === 'string' ? decodeEntities(text) : JSON.stringify(text);
  }
  if (typeof v === 'string') return decodeEntities(v);
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

/** Every field of `item` but the structural ones, by name. */
function fields(item: Record<string, unknown>, structural: ReadonlySet<string>): C4Fields {
  const out: C4Fields = {};
  for (const key of Object.keys(item).sort()) {
    const v = item[key];
    if (structural.has(key) || v === undefined || v === null) continue;
    out[key] = asText(v);
  }
  return out;
}

const SHAPE_KEYS = new Set(['alias', 'typeC4Shape', 'parentBoundary', 'wrap']);
const BOUNDARY_KEYS = new Set(['alias', 'parentBoundary', 'nodeType', 'wrap']);
const REL_KEYS = new Set(['type', 'from', 'to', 'wrap', 'offsetX', 'offsetY']);

/** An offset as v12's `drawRels` read it (a string or a number, as v12 stored it). */
function drawnOffset(v: unknown): number {
  if (typeof v !== 'string' && typeof v !== 'number') return 0;
  return v ? parseInt(String(v)) : 0;
}

export function c4V12Snapshot(dbValue: unknown): C4Snapshot {
  const db = dbValue as C4DbV12;
  return {
    type: db.getC4Type() ?? '',
    title: decodeEntities(db.getTitle()),
    accTitle: decodeEntities(db.getAccTitle()),
    accDescr: decodeEntities(db.getAccDescription()),
    shapeInRow: db.getC4ShapeInRow(),
    boundaryInRow: db.getC4BoundaryInRow(),
    shapes: db.getC4ShapeArray().map((s) => ({
      alias: asText(s.alias),
      kind: asText(s.typeC4Shape),
      parent: asText(s.parentBoundary),
      fields: fields(s, SHAPE_KEYS),
    })),
    boundaries: db
      .getBoundaries()
      .slice(1)
      .map((b) => ({
        alias: asText(b.alias),
        parent: asText(b.parentBoundary),
        nodeKind: typeof b.nodeType === 'string' ? b.nodeType : null,
        fields: fields(b, BOUNDARY_KEYS),
      })),
    rels: db.getRels().map((r) => ({
      kind: asText(r.type),
      from: asText(r.from),
      to: asText(r.to),
      offsetX: drawnOffset(r.offsetX),
      offsetY: drawnOffset(r.offsetY),
      fields: fields(r, REL_KEYS),
    })),
  };
}
