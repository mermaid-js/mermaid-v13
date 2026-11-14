/**
 * The v12 side of class-diagram parity: a plain-data snapshot of mermaid 12's `ClassDB`.
 *
 * Text has v12's `encodeEntities` placeholders decoded back to what the author wrote. Left
 * out: `domId` (a module-level counter v12 never resets), `text` of a class (derived from
 * `label` and `type`, with `&lt;`/`&gt;` or `<`/`>` depending on whether a label was set),
 * and `shape`.
 *
 * The oracle parses class sources at `securityLevel: 'loose'` for this snapshot
 * (`classAdapter.v12Config`), so v12 queues its click bindings and keeps link URLs as written.
 * The bindings are closures: {@link clickBindings} runs each against stub `document` and
 * `window` objects and records the function name and arguments it would call.
 */
import { v12DecodeEntities } from '../v12-entities.ts';

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

/** One click binding: the function a click on class `id` calls, with its arguments. */
export interface ClassCallbackSnapshot {
  id: string;
  name: string;
  args: string[];
}

export interface ClassSnapshot {
  direction: string;
  callbacks: ClassCallbackSnapshot[];
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

const text = (v: unknown): string | undefined =>
  typeof v === 'string' ? v12DecodeEntities(v) : undefined;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => v12DecodeEntities(String(s))) : [];

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

/**
 * The click bindings v12 queued (`functions`, after its tooltip setup): each is run with a
 * stub `document` that hands it an element, whose click handler is then fired with a stub
 * `window` that records the call (`utils.runFunc` looks the function up on `window`).
 */
function clickBindings(db: ClassDbV12, dbValue: unknown): ClassCallbackSnapshot[] {
  const functions = (dbValue as { functions?: (() => void)[] }).functions ?? [];
  const byDomId = new Map([...db.getClasses().values()].map((c) => [String(c.domId), c]));
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, window: g.window };
  const out: ClassCallbackSnapshot[] = [];
  const bound: { selector: string; handler: (() => void) | undefined } = {
    selector: '',
    handler: undefined,
  };
  const calls: { name: string; args: unknown[] }[] = [];
  const at = (path: string): unknown =>
    new Proxy(() => undefined, {
      get: (_t, key) => at(path ? `${path}.${String(key)}` : String(key)),
      apply: (_t, _this, args: unknown[]) => {
        calls.push({ name: path, args });
      },
    });
  g.document = {
    querySelector: (sel: string) => {
      bound.selector = sel;
      return {
        addEventListener: (_type: string, h: () => void) => {
          bound.handler = h;
        },
      };
    },
  };
  g.window = at('');
  try {
    for (const fn of functions.slice(1)) {
      bound.handler = undefined;
      calls.length = 0;
      fn();
      (bound.handler as (() => void) | undefined)?.();
      const domId = /\[id="(.*)"\]/s.exec(bound.selector)?.[1] ?? '';
      const cls = byDomId.get(domId);
      for (const c of calls) {
        out.push({
          id: v12DecodeEntities(typeof cls?.id === 'string' ? cls.id : domId),
          name: v12DecodeEntities(c.name),
          args: c.args.map((a) => v12DecodeEntities(String(a))),
        });
      }
    }
  } finally {
    g.document = saved.document;
    g.window = saved.window;
  }
  return out;
}

export function classV12Snapshot(dbValue: unknown): ClassSnapshot {
  const db = dbValue as ClassDbV12;
  const raw = dbValue as { interfaces?: Rec[]; styleClasses?: Map<string, Rec> };
  return {
    direction: db.getDirection(),
    callbacks: clickBindings(db, dbValue),
    accTitle: v12DecodeEntities(db.getAccTitle()),
    accDescr: v12DecodeEntities(db.getAccDescription()),
    classes: [...db.getClasses().values()].map((c) => ({
      id: v12DecodeEntities(String(c.id)),
      type: text(c.type) ?? '',
      label: text(c.label) ?? '',
      cssClasses: v12DecodeEntities(String(c.cssClasses)),
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
        id1: v12DecodeEntities(String(r.id1)),
        id2: v12DecodeEntities(String(r.id2)),
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
      id: v12DecodeEntities(String(ns.id)),
      label: text(ns.label) ?? '',
      parent: text(ns.parent),
      explicit: ns.explicit === true,
      classes: [...(ns.classes as Map<string, unknown>).keys()].map(v12DecodeEntities),
      notes: [...(ns.notes as Map<string, unknown>).keys()],
      children: [...(ns.children as Map<string, unknown>).keys()].map(v12DecodeEntities),
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
