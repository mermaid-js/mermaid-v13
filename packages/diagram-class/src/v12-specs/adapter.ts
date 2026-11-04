/**
 * Test-only adapter for the ported v12 class specs (R-TEST-3): v12's jison `parser` (with
 * `parser.yy`), `ClassDB` getters and `ClassMember`, backed by the v13 class parse. The specs'
 * expectations are kept as v12 wrote them; this file only translates names and shapes.
 *
 * The `set…` methods the specs spy on (`setClickEvent`, `setLink`, `setTooltip`) are called
 * after each parse with the arguments v12's grammar passed, read from the AST.
 */
import { attribute, memberDisplay, memberText, method } from '../parser/member.ts';
import type { MemberParts } from '../parser/member.ts';
import { parseClass } from '../parser/parser.ts';
import { namespaceGroups } from '../parser/model.ts';
import type { ClassModel, ClassNode, RelationType } from '../parser/model.ts';
import type { ClassDocument, ClassSimpleStmt, ClassStatementNode } from '../parser/ast.ts';

const RELATION_TYPE = { AGGREGATION: 0, EXTENSION: 1, COMPOSITION: 2, DEPENDENCY: 3, LOLLIPOP: 4 };
const RELATION_NUMBER: Record<RelationType, number | 'none'> = {
  none: 'none',
  aggregation: 0,
  extension: 1,
  composition: 2,
  dependency: 3,
  lollipop: 4,
};

/** v12's `ClassMember`: the parsed parts, `text`, and `getDisplayDetails()`. */
export class ClassMember {
  id: string;
  memberType: 'method' | 'attribute';
  visibility: string;
  classifier: string;
  parameters?: string;
  returnType?: string;
  text: string;
  declare private readonly parts: MemberParts;

  constructor(input: string | MemberParts, memberType: 'method' | 'attribute') {
    const read = memberType === 'method' ? method : attribute;
    const parts = typeof input === 'string' ? read(input) : input;
    if (!parts) throw new TypeError("Cannot read properties of undefined (reading 'startsWith')");
    Object.defineProperty(this, 'parts', { value: parts, enumerable: false });
    this.memberType = memberType;
    this.visibility = parts.visibility;
    this.classifier = parts.classifier;
    this.text = memberText(parts);
    this.id = parts.name;
    if (memberType === 'method') {
      this.parameters = parts.parameters;
      this.returnType = parts.returnType;
    }
  }

  getDisplayDetails(): { displayText: string; cssStyle: string } {
    return memberDisplay(this.parts);
  }

  parseClassifier(): string {
    return memberDisplay(this.parts).cssStyle;
  }
}

const EMPTY: ClassModel = {
  direction: 'TB',
  accTitle: '',
  accDescr: '',
  classes: [],
  relations: [],
  namespaces: [],
  notes: [],
  interfaces: [],
  styleClasses: [],
  callbacks: [],
  warnings: [],
};

function v12Class(c: ClassNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: c.id,
    type: c.type,
    label: c.label,
    text:
      c.label === c.id
        ? `${c.id}${c.type ? `&lt;${c.type}&gt;` : ''}`
        : `${c.label}${c.type ? `<${c.type}>` : ''}`,
    shape: 'classBox',
    cssClasses: c.classes.join(' '),
    methods: c.methods.map((m) => new ClassMember(m, 'method')),
    members: c.attributes.map((m) => new ClassMember(m, 'attribute')),
    annotations: [...c.annotations],
    styles: [...c.styles],
    domId: `classId-${c.id}`,
  };
  if (c.parent !== undefined) out.parent = c.parent;
  if (c.link !== undefined) out.link = c.link;
  if (c.linkTarget !== undefined) out.linkTarget = c.linkTarget;
  if (c.tooltip !== undefined) out.tooltip = c.tooltip;
  if (c.haveCallback) out.haveCallback = true;
  return out;
}

const nothing = (...args: unknown[]): void => void args;

let hierarchical = true;

/** v12's `setConfig` (the specs set `class.hierarchicalNamespaces` only). */
export function setConfig(next: { class?: { hierarchicalNamespaces?: boolean } }): void {
  hierarchical = next.class?.hierarchicalNamespaces ?? true;
}

/** v12's config `reset`. */
export function reset(): void {
  hierarchical = true;
}

/** v12's `ClassDB` getters over a v13 model. */
export class ClassDB {
  private model: ClassModel = EMPTY;
  private classMap = new Map<string, Record<string, unknown>>();
  readonly relationType = RELATION_TYPE;
  readonly lineType = { LINE: 0, DOTTED_LINE: 1 };
  // The functions v12's grammar called, as own properties (the specs check for them).
  addRelation = nothing;
  cleanupLabel = (label: string): string =>
    (label.startsWith(':') ? label.substring(1) : label).trim();
  setAccTitle = nothing;
  setAccDescription = nothing;
  addClassesToNamespace = nothing;
  addNamespace = nothing;
  setCssClass = nothing;
  addMembers = nothing;
  addClass = nothing;
  setClassLabel = nothing;
  addAnnotation = nothing;
  addMember = nothing;
  addNote = nothing;
  defineClass = nothing;
  setDirection = nothing;
  setClickEvent = nothing;
  setTooltip = nothing;
  setLink = nothing;
  setCssStyle = nothing;

  clear(): void {
    this.load(EMPTY);
  }

  load(model: ClassModel): void {
    this.model = model;
    this.classMap = new Map(model.classes.map((c) => [c.id, v12Class(c)]));
  }

  getClass(id: string): Record<string, unknown> {
    return this.classMap.get(id) as Record<string, unknown>;
  }

  getClasses(): Map<string, Record<string, unknown>> {
    return this.classMap;
  }

  getRelations(): Record<string, unknown>[] {
    return this.model.relations.map((r) => {
      const out: Record<string, unknown> = {
        id1: r.start.id,
        id2: r.end.id,
        relation: {
          type1: RELATION_NUMBER[r.start.type],
          type2: RELATION_NUMBER[r.end.type],
          lineType: r.line === 'dotted' ? 1 : 0,
        },
        relationTitle1: r.start.multiplicity ?? 'none',
        relationTitle2: r.end.multiplicity ?? 'none',
      };
      if (r.label !== undefined) out.title = r.label;
      return out;
    });
  }

  getNotes(): Map<string, Record<string, unknown>> {
    return new Map(
      this.model.notes.map((n, index) => {
        const note: Record<string, unknown> = { id: n.id, class: n.class, text: n.text, index };
        if (n.parent !== undefined) note.parent = n.parent;
        return [n.id, note];
      })
    );
  }

  getNote(id: string | number): Record<string, unknown> {
    return this.getNotes().get(typeof id === 'number' ? `note${id}` : id) as Record<
      string,
      unknown
    >;
  }

  getNamespaces(): Map<string, Record<string, unknown>> {
    const notes = this.getNotes();
    const out = new Map<string, Record<string, unknown>>();
    for (const ns of this.model.namespaces) {
      const node: Record<string, unknown> = {
        id: ns.id,
        label: ns.label,
        explicit: ns.explicit,
        classes: new Map(ns.classes.map((c) => [c, this.classMap.get(c)])),
        notes: new Map(ns.notes.map((n) => [n, notes.get(n)])),
        children: new Map(),
      };
      if (ns.parent !== undefined) node.parent = ns.parent;
      out.set(ns.id, node);
    }
    for (const ns of this.model.namespaces) {
      const node = out.get(ns.id) as { children: Map<string, unknown> };
      for (const c of ns.children) node.children.set(c, out.get(c));
    }
    return out;
  }

  getNamespace(name: string): Record<string, unknown> {
    return this.getNamespaces().get(name) as Record<string, unknown>;
  }

  /** The group and class nodes of v12's `getData`, from {@link namespaceGroups}. */
  getData(): { nodes: Record<string, unknown>[] } {
    const { groups, parentOf } = namespaceGroups(this.model, hierarchical);
    const nodes: Record<string, unknown>[] = groups.map((g) => ({
      id: g.id,
      label: g.label,
      isGroup: true,
      parentId: g.parent,
    }));
    for (const c of this.model.classes) {
      nodes.push({ ...v12Class(c), isGroup: false, parentId: parentOf(c.parent) });
    }
    return { nodes };
  }

  getDirection(): string {
    return this.model.direction;
  }

  getAccTitle(): string {
    return this.model.accTitle;
  }

  getAccDescription(): string {
    return this.model.accDescr;
  }
}

/** The click statements of a document, in source order. */
function clicks(doc: ClassDocument): ClassSimpleStmt[] {
  const out: ClassSimpleStmt[] = [];
  const walk = (list: readonly ClassStatementNode[]) => {
    for (const s of list) {
      if (s.type === 'Click') out.push(s);
      else if (s.type === 'Namespace') walk(s.children);
    }
  };
  walk(doc.children);
  return out;
}

/** v12's jison parser: `parse` throws on an error, and fills `parser.yy`. */
export const parser = {
  yy: undefined as ClassDB | undefined,
  parse(text: string): void {
    const result = parseClass(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`${error.code}: ${error.message}`);
    const db = this.yy;
    if (!db) return;
    db.load(result.model);
    for (const c of clicks(result.ast)) {
      const id = c.refs[0] ?? '';
      if (c.callback) {
        if (c.callback.args === undefined) db.setClickEvent(id, c.callback.name);
        else db.setClickEvent(id, c.callback.name, c.callback.args);
      }
      if (c.url !== undefined) {
        if (c.target === undefined) db.setLink(id, c.url);
        else db.setLink(id, c.url, c.target);
      }
      if (c.tooltip !== undefined) db.setTooltip(id, c.tooltip);
    }
  },
};
