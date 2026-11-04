/**
 * The v12 side of sequence parity: a plain-data snapshot of mermaid\@12's SequenceDB.
 *
 * It keeps v12's own message list (DB `getMessages()`): messages, notes, activations, the
 * start, section and end rows of fragments and `rect`, and autonumber rows, in order, with
 * v12's numeric line types. The v13 normaliser (`v13.ts`) flattens the model's statement tree
 * back into that list, so the comparison checks order, nesting and every value. Also kept:
 * participants in map order with box, description, type and wrap; boxes with their member
 * lists; the message each created or destroyed participant is drawn at; actor menus; title
 * and accessibility text. Text has v12's `encodeEntities` placeholders decoded back to what
 * the author wrote (as for flowchart).
 *
 * Bridged here: v12 kept a participant type it does not know (`@{ type: foo }`) and drew
 * nothing for it; v13 warns and draws a participant, so an unknown v12 type reads as
 * `participant`.
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for sequence sources. */
export const SEQUENCE_V12_TYPES = ['sequence'];

export interface SequenceRowSnapshot {
  type: number;
  from: string | null;
  to: string | null;
  text: string;
  wrap: boolean;
  activate: boolean;
  central: number;
  placement: number | null;
  /** Autonumber rows only. */
  autonumber?: { start: number | null; step: number | null; visible: boolean };
}

export interface SequenceSnapshot {
  participants: {
    id: string;
    label: string;
    kind: string;
    wrap: boolean;
    box: number | null;
    links: Record<string, unknown>;
    properties: Record<string, unknown>;
  }[];
  boxes: { label: string; color: string; wrap: boolean; members: string[] }[];
  rows: SequenceRowSnapshot[];
  /** `[participant, row index of the message that creates it]`, in participant order. */
  created: [string, number | null][];
  destroyed: [string, number | null][];
  title: string;
  accTitle: string;
  accDescr: string;
}

/** v12 `LINETYPE` values the normalisers share. */
export const LINETYPE = {
  SOLID: 0,
  DOTTED: 1,
  NOTE: 2,
  SOLID_CROSS: 3,
  DOTTED_CROSS: 4,
  SOLID_OPEN: 5,
  DOTTED_OPEN: 6,
  LOOP_START: 10,
  LOOP_END: 11,
  ALT_START: 12,
  ALT_ELSE: 13,
  ALT_END: 14,
  OPT_START: 15,
  OPT_END: 16,
  ACTIVE_START: 17,
  ACTIVE_END: 18,
  PAR_START: 19,
  PAR_AND: 20,
  PAR_END: 21,
  RECT_START: 22,
  RECT_END: 23,
  SOLID_POINT: 24,
  DOTTED_POINT: 25,
  AUTONUMBER: 26,
  CRITICAL_START: 27,
  CRITICAL_OPTION: 28,
  CRITICAL_END: 29,
  BREAK_START: 30,
  BREAK_END: 31,
  PAR_OVER_START: 32,
  BIDIRECTIONAL_SOLID: 33,
  BIDIRECTIONAL_DOTTED: 34,
  SOLID_TOP: 41,
  SOLID_BOTTOM: 42,
  STICK_TOP: 43,
  STICK_BOTTOM: 44,
  SOLID_ARROW_TOP_REVERSE: 45,
  SOLID_ARROW_BOTTOM_REVERSE: 46,
  STICK_ARROW_TOP_REVERSE: 47,
  STICK_ARROW_BOTTOM_REVERSE: 48,
  SOLID_TOP_DOTTED: 51,
  SOLID_BOTTOM_DOTTED: 52,
  STICK_TOP_DOTTED: 53,
  STICK_BOTTOM_DOTTED: 54,
  SOLID_ARROW_TOP_REVERSE_DOTTED: 55,
  SOLID_ARROW_BOTTOM_REVERSE_DOTTED: 56,
  STICK_ARROW_TOP_REVERSE_DOTTED: 57,
  STICK_ARROW_BOTTOM_REVERSE_DOTTED: 58,
  CENTRAL_CONNECTION: 59,
  CENTRAL_CONNECTION_REVERSE: 60,
  CENTRAL_CONNECTION_DUAL: 61,
} as const;

const KINDS = new Set([
  'participant',
  'actor',
  'boundary',
  'control',
  'entity',
  'database',
  'collections',
  'queue',
]);

/** Line types of messages (rows a `create`/`destroy` check looks at). */
export const MESSAGE_TYPES: ReadonlySet<number> = new Set([
  0, 1, 3, 4, 5, 6, 24, 25, 33, 34, 41, 42, 43, 44, 45, 46, 47, 48, 51, 52, 53, 54, 55, 56, 57, 58,
]);

interface ActorV12 {
  description: string;
  type: string;
  wrap: boolean;
  box?: object;
  links?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}
interface BoxV12 {
  name?: string;
  fill: string;
  wrap: boolean;
  actorKeys: string[];
}
interface MessageV12 {
  type?: number;
  from?: string;
  to?: string;
  message: unknown;
  wrap: boolean;
  activate?: boolean;
  centralConnection?: number;
  placement?: number;
}
interface SequenceDbV12 {
  getActors(): Map<string, ActorV12>;
  getBoxes(): BoxV12[];
  getMessages(): MessageV12[];
  getCreatedActors(): Map<string, number>;
  getDestroyedActors(): Map<string, number>;
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? decodeEntities(v) : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * The row v12 draws a create or destroy at: the row it stored (the message count when the
 * statement came), and only when that row is a message to `id` (or, for a destroy, from it),
 * as v12's renderer checked (`sequenceRenderer.ts:1002–1022`); otherwise v12 drew none.
 */
export function drawnAt(
  rows: readonly SequenceRowSnapshot[],
  at: number,
  id: string,
  either: boolean
): number | null {
  const r = rows[at];
  if (!r || !MESSAGE_TYPES.has(r.type)) return null;
  return r.to === id || (either && r.from === id) ? at : null;
}

/** A menu record as plain data, with v12's entity placeholders decoded in keys and strings. */
const plain = (v: unknown): Record<string, unknown> => {
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return decodeEntities(x);
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object')
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [decodeEntities(k), walk(y)]));
    return x;
  };
  return v && typeof v === 'object' ? (walk(v) as Record<string, unknown>) : {};
};

export function sequenceV12Snapshot(dbValue: unknown): SequenceSnapshot {
  const db = dbValue as SequenceDbV12;
  const boxes = db.getBoxes();
  const rows = db.getMessages().map((m): SequenceRowSnapshot => {
    const type = m.type ?? -1;
    if (type === LINETYPE.AUTONUMBER) {
      const a = (m.message ?? {}) as { start?: unknown; step?: unknown; visible?: unknown };
      return {
        type,
        from: null,
        to: null,
        text: '',
        wrap: m.wrap,
        activate: m.activate ?? false,
        central: m.centralConnection ?? 0,
        placement: null,
        autonumber: { start: num(a.start), step: num(a.step), visible: a.visible === true },
      };
    }
    return {
      type,
      from: str(m.from),
      to: str(m.to),
      text: str(m.message) ?? '',
      wrap: m.wrap,
      activate: m.activate ?? false,
      central: m.centralConnection ?? 0,
      placement: num(m.placement),
    };
  });
  const actors = [...db.getActors()];
  const ids = (m: Map<string, number>, either: boolean): [string, number | null][] =>
    actors
      .filter(([id]) => m.has(id))
      .map(([id]) => {
        const name = decodeEntities(id);
        return [name, drawnAt(rows, m.get(id) ?? 0, name, either)];
      });
  return {
    participants: actors.map(([id, a]) => ({
      id: decodeEntities(id),
      label: decodeEntities(a.description),
      kind: KINDS.has(a.type) ? a.type : 'participant',
      wrap: a.wrap,
      box: a.box ? boxes.indexOf(a.box as BoxV12) : null,
      links: plain(a.links),
      properties: plain(a.properties),
    })),
    boxes: boxes.map((b) => ({
      label: str(b.name) ?? '',
      color: b.fill,
      wrap: b.wrap,
      members: b.actorKeys.map(decodeEntities),
    })),
    rows,
    created: ids(db.getCreatedActors(), false),
    destroyed: ids(db.getDestroyedActors(), true),
    title: decodeEntities(db.getDiagramTitle()),
    accTitle: decodeEntities(db.getAccTitle()),
    accDescr: decodeEntities(db.getAccDescription()),
  };
}
