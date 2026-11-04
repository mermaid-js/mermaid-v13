/**
 * The v12 side of class-diagram parity: a plain-data snapshot of mermaid 12's `ClassDB`.
 *
 * Text has v12's `encodeEntities` placeholders decoded back to what the author wrote. Left
 * out: `domId` (a module-level counter v12 never resets), `text` of a class (derived from
 * `label` and `type`, with `&lt;`/`&gt;` or `<`/`>` depending on whether a label was set),
 * `shape`, and the click bindings v12 queues only at `securityLevel: 'loose'`.
 */

/** `diagram.type` values mermaid 12 reports for class sources (`classDiagram-v2` too). */
export const CLASS_V12_TYPES = ['classDiagram'];

export interface ClassMemberSnapshot {
  memberType: string;
  visibility: string;
  id: string;
  parameters: string;
  returnType: string;
  classifier: string;
  /** v12's escaped display text (`ClassMember.text`). */
  text: string;
}

export interface ClassNodeSnapshot {
  id: string;
  type: string;
  label: string;
  cssClasses: string;
  styles: string[];
  annotations: string[];
  members: ClassMemberSnapshot[];
  methods: ClassMemberSnapshot[];
  parent: string | undefined;
  link: string | undefined;
  linkTarget: string | undefined;
  tooltip: string | undefined;
  haveCallback: boolean;
}

export interface ClassRelationSnapshot {
  id1: string;
  id2: string;
  type1: string;
  type2: string;
  lineType: string;
  /** Multiplicities; v12's `'none'` (none written) as undefined. */
  relationTitle1: string | undefined;
  relationTitle2: string | undefined;
  title: string | undefined;
}

export interface ClassSnapshot {
  direction: string;
  accTitle: string;
  accDescr: string;
  classes: ClassNodeSnapshot[];
  relations: ClassRelationSnapshot[];
  notes: { id: string; class: string | undefined; text: string; parent: string | undefined }[];
  namespaces: {
    id: string;
    label: string;
    parent: string | undefined;
    explicit: boolean;
    classes: string[];
    notes: string[];
    children: string[];
  }[];
  interfaces: { id: string; label: string; classId: string }[];
  styleClasses: { id: string; styles: string[]; textStyles: string[] }[];
}

/** Undo v12's `encodeEntities` placeholders (v12 `utils.ts` `decodeEntities`). */
export function decodeEntities(text: string): string {
  return text.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' ? decodeEntities(v) : undefined;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => decodeEntities(String(s))) : [];

/** v12's relation type numbers (`ClassDB.relationType`) by name. */
const RELATION = ['aggregation', 'extension', 'composition', 'dependency', 'lollipop'];
export const relationName = (t: unknown): string =>
  typeof t === 'number' ? (RELATION[t] ?? String(t)) : String(t);
const title = (t: unknown): string | undefined => (t === 'none' ? undefined : text(t));

type Rec = Record<string, unknown>;

function member(m: Rec): ClassMemberSnapshot {
  return {
    memberType: String(m.memberType),
    visibility: typeof m.visibility === 'string' ? m.visibility : '',
    id: text(m.id) ?? '',
    parameters: text(m.parameters) ?? '',
    returnType: text(m.returnType) ?? '',
    classifier: typeof m.classifier === 'string' ? m.classifier : '',
    text: text(m.text) ?? '',
  };
}

interface ClassDbV12 {
  getDirection(): string;
  getAccTitle(): string;
  getAccDescription(): string;
  getClasses(): Map<string, Rec>;
  getRelations(): Rec[];
  getNotes(): Map<string, Rec>;
  getNamespaces(): Map<string, Rec>;
}

export function classV12Snapshot(dbValue: unknown): ClassSnapshot {
  const db = dbValue as ClassDbV12;
  const raw = dbValue as { interfaces?: Rec[]; styleClasses?: Map<string, Rec> };
  return {
    direction: db.getDirection(),
    accTitle: decodeEntities(db.getAccTitle()),
    accDescr: decodeEntities(db.getAccDescription()),
    classes: [...db.getClasses().values()].map((c) => ({
      id: decodeEntities(String(c.id)),
      type: text(c.type) ?? '',
      label: text(c.label) ?? '',
      cssClasses: decodeEntities(String(c.cssClasses)),
      styles: strings(c.styles),
      annotations: strings(c.annotations),
      members: (c.members as Rec[]).map(member),
      methods: (c.methods as Rec[]).map(member),
      parent: text(c.parent),
      link: text(c.link),
      linkTarget: text(c.linkTarget),
      tooltip: text(c.tooltip),
      haveCallback: c.haveCallback === true,
    })),
    relations: db.getRelations().map((r) => {
      const rel = r.relation as Rec;
      return {
        id1: decodeEntities(String(r.id1)),
        id2: decodeEntities(String(r.id2)),
        type1: relationName(rel.type1),
        type2: relationName(rel.type2),
        lineType: rel.lineType === 1 ? 'dotted' : 'solid',
        relationTitle1: title(r.relationTitle1),
        relationTitle2: title(r.relationTitle2),
        title: text(r.title),
      };
    }),
    notes: [...db.getNotes().values()].map((n) => ({
      id: String(n.id),
      class: text(n.class),
      text: text(n.text) ?? '',
      parent: text(n.parent),
    })),
    namespaces: [...db.getNamespaces().values()].map((ns) => ({
      id: decodeEntities(String(ns.id)),
      label: text(ns.label) ?? '',
      parent: text(ns.parent),
      explicit: ns.explicit === true,
      classes: [...(ns.classes as Map<string, unknown>).keys()].map(decodeEntities),
      notes: [...(ns.notes as Map<string, unknown>).keys()],
      children: [...(ns.children as Map<string, unknown>).keys()].map(decodeEntities),
    })),
    interfaces: (raw.interfaces ?? []).map((f) => ({
      id: String(f.id),
      label: text(f.label) ?? '',
      classId: text(f.classId) ?? '',
    })),
    styleClasses: [...(raw.styleClasses?.values() ?? [])].map((s) => ({
      id: String(s.id),
      styles: strings(s.styles),
      textStyles: strings(s.textStyles),
    })),
  };
}
