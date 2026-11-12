/**
 * ClassModel: the plain-data result of a class-diagram parse (DESIGN §4.3), and the builder
 * the parser drives. The builder does what v12's `ClassDB` (`classDb.ts` at fa796a943) did
 * with each parsed statement, in the same order, so the model matches v12's DB.
 *
 * Differences from v12's ClassDB: text is kept as written (no sanitising: that happens when
 * SVG is written); links keep the trimmed URL as written (checked at render time); callbacks
 * are recorded instead of bound; collections are insertion-ordered arrays (R-ARCH-7); and
 * where v12 threw on a statement (an annotation for a class that does not exist, a method it
 * could not read) the builder reports an error instead.
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';
import { idEscaper } from '@mermaid-js/core/parser-kit';
import { readMember } from './member.ts';
import type { MemberParts } from './member.ts';

export type { Classifier, MemberParts, Visibility } from './member.ts';

/** An attribute or a method. */
export interface ClassMember extends MemberParts {
  /** `m:<class>#<k>`: the k-th attribute or method written for the class. */
  ast: AstId;
}

export interface ClassNode {
  /** The class name, generic type left out. */
  id: string;
  /** AST id of the mention that created the class (`n:<id>`, or `n:<id>@<k>`). */
  ast: AstId;
  /** `class A["label"]`, else the id. */
  label: string;
  /** The generic type of `Name~T~` (`T`), or `''`. Nested generics keep their first part. */
  type: string;
  /** CSS classes in the order given, starting with `default` (`:::`, `cssClass`, clicks). */
  classes: string[];
  /** Inline styles: `style` statements and `classDef`s applied to the class. */
  styles: string[];
  annotations: string[];
  attributes: ClassMember[];
  methods: ClassMember[];
  /** Qualified id of the namespace the class was last placed in. */
  parent?: string;
  /** `link` / `click … href` URL, trimmed. Checked against `securityLevel` when SVG is written. */
  link?: string;
  /** The link's target; `_blank` when none was given (v12). */
  linkTarget?: string;
  tooltip?: string;
  /** A `callback` or `click … call` names the class. */
  haveCallback?: true;
}

/** An end type of a relationship: the marker drawn at that end. */
export type RelationType =
  | 'none'
  | 'aggregation'
  | 'extension'
  | 'composition'
  | 'dependency'
  | 'lollipop';

export interface RelationEnd {
  /** Class (or lollipop interface) id. */
  id: string;
  type: RelationType;
  /** The quoted label at this end (`"1"`, `"many"`), trimmed. */
  multiplicity?: string;
}

export interface ClassRelation {
  /** `e:<from>><to>`, `#<k>` for the k-th between the same two names. */
  ast: AstId;
  start: RelationEnd;
  end: RelationEnd;
  /** `--` solid, `..` dotted (v12 draws it dashed). */
  line: 'solid' | 'dotted';
  /** The `: label` after the relationship. */
  label?: string;
}

export interface ClassNamespace {
  /** Qualified id (`A.B`). */
  id: string;
  /**
   * `s:<id>` of the first `namespace` statement that opens it; undefined for an ancestor made
   * from a dotted id (`A` of `namespace A.B`) that no statement opens.
   */
  ast?: AstId;
  /** `namespace A["label"]`, else the last part of the id. */
  label: string;
  /** Qualified id of the enclosing namespace. */
  parent?: string;
  /** Written by the user; false for an ancestor made from a dotted id (`A` of `A.B`). */
  explicit: boolean;
  /** Ids of the classes placed in it, in order. */
  classes: string[];
  /** Ids of the notes placed in it, in order. */
  notes: string[];
  /** Ids of the namespaces directly inside it, in order. */
  children: string[];
}

export interface ClassNote {
  /** `note0`, `note1`, … */
  id: string;
  /** `note:<ordinal>`. */
  ast: AstId;
  text: string;
  /** `note for <class>`: the class name as written (generic type included). */
  class?: string;
  parent?: string;
}

/** The interface end of a lollipop relationship (`A ()-- B`), drawn as its own node. */
export interface ClassInterface {
  /** `interface0`, `interface1`, … */
  id: string;
  /** AST id of the mention it was made from. */
  ast: AstId;
  /** The name written at the lollipop end. */
  label: string;
  /** The class at the other end. */
  classId: string;
}

/** `classDef name styles`. */
export interface ClassStyleClass {
  id: string;
  styles: string[];
  /** Styles with `color` in them, `fill` read as `bgFill` (v12's label styles). */
  textStyles: string[];
}

/** A `callback` or `click … call` on a class that exists (v12 dropped the others). */
export interface ClassCallback {
  /** Class id. */
  id: string;
  /** The function name as written (`fn`, `app.handlers.fn`). */
  name: string;
  /**
   * The arguments to call it with, as v12 passed them: the text in parentheses split at
   * commas outside double quotes, each trimmed and unquoted; `[id]` when none were written.
   */
  args: string[];
  range: Range;
}

export interface ClassModel {
  /** `TB`, `BT`, `LR` or `RL`. */
  direction: string;
  accTitle: string;
  accDescr: string;
  classes: ClassNode[];
  relations: ClassRelation[];
  /** Every namespace, ancestors made from dotted ids included, in creation order. */
  namespaces: ClassNamespace[];
  notes: ClassNote[];
  interfaces: ClassInterface[];
  styleClasses: ClassStyleClass[];
  /** `callback` and `click … call` statements. Ignored unless a plugin claims `callbacks`. */
  callbacks: ClassCallback[];
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  warnings: Diagnostic[];
}

/** One relationship as the grammar reads it. */
export interface RelationParts {
  from: string;
  to: string;
  /** AST ids of the two end mentions. */
  fromAst: AstId;
  toAst: AstId;
  ast: AstId;
  startType: RelationType;
  endType: RelationType;
  line: 'solid' | 'dotted';
  startLabel?: string;
  endLabel?: string;
  label?: string;
}

export interface BuilderOptions {
  error(code: string, message: string, range: Range): void;
}

const CLASS_ID_PREFIX = 'classId-';

/** v12 `splitClassNameAndType`: `A~T~` → `A` and `T` (a `~` at index 0 does not split). */
export function splitClassName(raw: string): { id: string; type: string } {
  const at = raw.indexOf('~');
  if (at <= 0) return { id: raw, type: '' };
  const parts = raw.split('~');
  return { id: parts[0] ?? '', type: parts[1] ?? '' };
}

/**
 * v12 `setClickFunc`'s argument list: `args` split at every comma followed by an even number
 * of `"` (outside quotes), each item trimmed and stripped of one pair of surrounding quotes;
 * `[id]` when there are no arguments.
 */
export function callbackArgs(args: string | undefined, id: string): string[] {
  if (args === undefined) return [id];
  let quotes = 0;
  for (const c of args) if (c === '"') quotes++;
  const out: string[] = [];
  let from = 0;
  let seen = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '"') seen++;
    else if (c === ',' && (quotes - seen) % 2 === 0) {
      out.push(args.slice(from, i));
      from = i + 1;
    }
  }
  out.push(args.slice(from));
  return out.map((a) => {
    const item = a.trim();
    // `substr(1, length - 2)`: a lone `"` gives `''`.
    return item.startsWith('"') && item.endsWith('"') ? item.slice(1, -1) : item;
  });
}

const escMember = /* @__PURE__ */ idEscaper();

/**
 * v12's `ClassDB`, driven by the parser. Method names follow ClassDB's; arguments are what
 * v12's grammar passed, plus AST ids and ranges.
 */
export class ClassBuilder {
  private readonly classes = new Map<string, ClassNode>();
  private readonly relations: ClassRelation[] = [];
  private readonly namespaces = new Map<string, ClassNamespace>();
  private readonly namespaceStack: string[] = [];
  private readonly notes: ClassNote[] = [];
  private readonly noteById = new Map<string, ClassNote>();
  /** Per namespace, the classes and notes placed in it (for the model's ordered lists). */
  private readonly placed = new Map<string, Set<string>>();
  private readonly interfaces: ClassInterface[] = [];
  private readonly styleClasses = new Map<string, ClassStyleClass>();
  private readonly callbacks: ClassCallback[] = [];
  private readonly memberCount = new Map<string, number>();
  private direction = 'TB';
  private accTitle = '';
  private accDescr = '';

  constructor(private readonly options: BuilderOptions) {}

  has(id: string): boolean {
    return this.classes.has(id);
  }

  getClass(id: string): ClassNode | undefined {
    return this.classes.get(id);
  }

  /** `addClass`: the first declaration wins. Returns whether it created the class. */
  addClass(raw: string, ast: AstId): boolean {
    const { id, type } = splitClassName(raw);
    if (this.classes.has(id)) return false;
    this.classes.set(id, {
      id,
      ast,
      label: id,
      type,
      classes: ['default'],
      styles: [],
      annotations: [],
      attributes: [],
      methods: [],
    });
    return true;
  }

  setClassLabel(raw: string, label: string): void {
    const node = this.classes.get(splitClassName(raw).id);
    if (node) node.label = label;
  }

  /** `addRelation`, with v12's lollipop handling: the lollipop end becomes an interface. */
  addRelation(r: RelationParts): void {
    let from = r.from;
    let to = r.to;
    if (r.startType === 'lollipop' && r.endType === 'none') {
      this.addClass(to, r.toAst);
      from = this.addInterface(from, to, r.fromAst);
    } else if (r.endType === 'lollipop' && r.startType === 'none') {
      this.addClass(from, r.fromAst);
      to = this.addInterface(to, from, r.toAst);
    } else {
      this.addClass(from, r.fromAst);
      this.addClass(to, r.toAst);
    }
    const start: RelationEnd = { id: splitClassName(from).id, type: r.startType };
    const end: RelationEnd = { id: splitClassName(to).id, type: r.endType };
    if (r.startLabel !== undefined) start.multiplicity = r.startLabel.trim();
    if (r.endLabel !== undefined) end.multiplicity = r.endLabel.trim();
    const rel: ClassRelation = { ast: r.ast, start, end, line: r.line };
    if (r.label !== undefined) rel.label = r.label;
    this.relations.push(rel);
  }

  private addInterface(label: string, classId: string, ast: AstId): string {
    const id = `interface${this.interfaces.length}`;
    this.interfaces.push({ id, ast, label, classId });
    return id;
  }

  /** `addAnnotation`; v12 threw when the class did not exist. */
  addAnnotation(raw: string, annotation: string, range: Range): void {
    const node = this.classes.get(splitClassName(raw).id);
    if (!node) {
      this.options.error(
        'UNKNOWN_CLASS',
        `Unknown class \`${splitClassName(raw).id}\`: declare it (for example \`class ${splitClassName(raw).id}\`) before giving it an annotation.`,
        range
      );
      return;
    }
    node.annotations.push(annotation);
  }

  /**
   * `addMember`: one member line of the class (created if new). Returns the attribute or
   * method it adds, if any.
   */
  addMember(raw: string, line: string, range: Range, ast: AstId): ClassMember | undefined {
    this.addClass(raw, ast);
    const id = splitClassName(raw).id;
    const node = this.classes.get(id);
    if (!node) return undefined;
    const read = readMember(line);
    if (read === undefined) return undefined;
    if ('annotation' in read) {
      node.annotations.push(read.annotation);
      return undefined;
    }
    if ('invalid' in read) {
      this.options.error(
        'INVALID_METHOD',
        'Invalid method: a method needs a name before its `(`, e.g. `+getName() String`.',
        range
      );
      return undefined;
    }
    const k = (this.memberCount.get(id) ?? 0) + 1;
    this.memberCount.set(id, k);
    const member: ClassMember = { ...read.member, ast: `m:${escMember(id)}#${k}` };
    if (member.kind === 'method') node.methods.push(member);
    else node.attributes.push(member);
    return member;
  }

  get classCount(): number {
    return this.classes.size;
  }

  get interfaceCount(): number {
    return this.interfaces.length;
  }

  get relationCount(): number {
    return this.relations.length;
  }

  addNote(text: string, ast: AstId, className?: string): string {
    const id = `note${this.notes.length}`;
    const note: ClassNote = { id, ast, text };
    if (className !== undefined) note.class = className;
    this.notes.push(note);
    this.noteById.set(id, note);
    return id;
  }

  /**
   * `setCssClass`: ids are comma-separated. v12 looked up an id that starts with a digit as
   * `classId-<id>`, so such classes never get the class.
   */
  setCssClass(ids: string, cls: string): void {
    for (const part of ids.split(',')) {
      const lookup = /^\d/.test(part) ? CLASS_ID_PREFIX + part : part;
      this.classes.get(splitClassName(lookup).id)?.classes.push(cls);
    }
  }

  /**
   * `defineClass`. As in v12, the styles also go to every class whose CSS class list, as one
   * string, contains the name (so `classDef a` reaches every class through `default`).
   */
  defineClass(ids: readonly string[], styles: readonly string[]): void {
    for (const id of ids) {
      let sc = this.styleClasses.get(id);
      if (!sc) {
        sc = { id, styles: [], textStyles: [] };
        this.styleClasses.set(id, sc);
      }
      for (const s of styles) {
        if (s.includes('color')) sc.textStyles.push(s.replace('fill', 'bgFill'));
        sc.styles.push(s);
      }
      for (const node of this.classes.values()) {
        if (node.classes.join(' ').includes(id)) {
          for (const s of styles) node.styles.push(...s.split(','));
        }
      }
    }
  }

  setTooltip(ids: string, tooltip: string): void {
    for (const part of ids.split(',')) {
      const node = this.classes.get(splitClassName(part).id);
      if (node) node.tooltip = tooltip;
    }
  }

  setLink(ids: string, url: string, target = '_blank'): void {
    const trimmed = url.trim();
    for (const part of ids.split(',')) {
      const lookup = /^\d/.test(part) ? CLASS_ID_PREFIX + part : part;
      const node = this.classes.get(splitClassName(lookup).id);
      if (!node) continue;
      if (trimmed) node.link = trimmed;
      else delete node.link;
      node.linkTarget = target;
    }
    this.setCssClass(ids, 'clickable');
  }

  setClickEvent(ids: string, name: string, range: Range, args?: string): void {
    for (const part of ids.split(',')) {
      const id = splitClassName(part).id;
      const node = this.classes.get(id);
      if (!node) continue;
      this.callbacks.push({ id, name, args: callbackArgs(args, id), range });
      node.haveCallback = true;
    }
    this.setCssClass(ids, 'clickable');
  }

  /** `setCssStyle` (`style id …`): the id is looked up as written. */
  setCssStyle(id: string, styles: readonly string[]): void {
    const node = this.classes.get(id);
    if (!node) return;
    for (const s of styles) node.styles.push(...s.split(','));
  }

  setDirection(dir: string): void {
    this.direction = dir;
  }

  setAccTitle(text: string): void {
    this.accTitle = text.replace(/^\s+/, '');
  }

  setAccDescription(text: string): void {
    this.accDescr = text.replace(/\n\s+/g, '\n');
  }

  /**
   * `addNamespace`: the qualified id (inside another namespace, `outer.id`), with its dotted
   * ancestors made as needed. Returns the qualified id; `popNamespace` closes it.
   */
  addNamespace(id: string, ast: AstId, label?: string): string {
    const top = this.namespaceStack[this.namespaceStack.length - 1];
    const qualified = top ? `${top}.${id}` : id;
    this.namespaceStack.push(qualified);
    const existing = this.namespaces.get(qualified);
    if (existing) {
      existing.explicit = true;
      existing.ast ??= ast;
      if (label) existing.label = label;
      return qualified;
    }
    const parts = qualified.split('.');
    let currentId = '';
    for (let i = 0; i < parts.length; i++) {
      const parentId = i > 0 ? currentId : undefined;
      currentId = i > 0 ? `${currentId}.${parts[i] ?? ''}` : (parts[0] ?? '');
      const leaf = i === parts.length - 1;
      const node = this.namespaces.get(currentId);
      if (!node) {
        const ns: ClassNamespace = {
          id: currentId,
          label: leaf && label ? label : (parts[i] ?? ''),
          explicit: leaf,
          classes: [],
          notes: [],
          children: [],
        };
        if (leaf) ns.ast = ast;
        if (parentId !== undefined) ns.parent = parentId;
        this.namespaces.set(currentId, ns);
      } else if (leaf) node.explicit = true;
      if (parentId !== undefined) this.linkParentChild(parentId, currentId);
    }
    return qualified;
  }

  private linkParentChild(parentId: string, childId: string): void {
    const parent = this.namespaces.get(parentId);
    const child = this.namespaces.get(childId);
    if (!parent || !child) return;
    if (!parent.children.includes(childId)) parent.children.push(childId);
    child.parent ??= parentId;
  }

  namespaceExists(id: string): boolean {
    return this.namespaces.has(id);
  }

  popNamespace(): void {
    this.namespaceStack.pop();
  }

  /** `addClassesToNamespace`: place classes (names as written) and notes in namespace `id`. */
  addClassesToNamespace(
    id: string,
    classNames: readonly string[],
    noteIds: readonly string[]
  ): void {
    const ns = this.namespaces.get(id);
    if (!ns) return;
    let seen = this.placed.get(id);
    if (!seen) this.placed.set(id, (seen = new Set()));
    for (const raw of classNames) {
      const cid = splitClassName(raw).id;
      const node = this.classes.get(cid);
      if (!node) continue;
      node.parent = id;
      if (!seen.has(`c${cid}`)) {
        seen.add(`c${cid}`);
        ns.classes.push(cid);
      }
    }
    for (const nid of noteIds) {
      const note = this.noteById.get(nid);
      if (!note) continue;
      note.parent = id;
      if (!seen.has(`n${nid}`)) {
        seen.add(`n${nid}`);
        ns.notes.push(nid);
      }
    }
  }

  model(warnings: Diagnostic[]): ClassModel {
    return {
      direction: this.direction,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      classes: [...this.classes.values()],
      relations: this.relations,
      namespaces: [...this.namespaces.values()],
      notes: this.notes,
      interfaces: this.interfaces,
      styleClasses: [...this.styleClasses.values()],
      callbacks: this.callbacks,
      warnings,
    };
  }
}

/** A namespace as a layout group. */
export interface NamespaceGroup {
  id: string;
  ast?: AstId;
  label: string;
  parent?: string;
}

/**
 * The namespace groups to lay out, as v12's `getData` made them for
 * `class.hierarchicalNamespaces` (default true): every namespace, nested, labelled with the
 * last part of its id; or, when false, only the namespaces the user wrote, flat, labelled with
 * the full id, each class and note in its nearest written namespace. `parentOf` maps a class's
 * or note's `parent` to its group.
 */
export function namespaceGroups(
  model: ClassModel,
  hierarchical = true
): { groups: NamespaceGroup[]; parentOf: (parent: string | undefined) => string | undefined } {
  const byId = new Map(model.namespaces.map((ns) => [ns.id, ns]));
  const groups: NamespaceGroup[] = [];
  for (const ns of model.namespaces) {
    if (!hierarchical && !ns.explicit) continue;
    const g: NamespaceGroup = { id: ns.id, label: hierarchical ? ns.label : ns.id };
    if (ns.ast !== undefined) g.ast = ns.ast;
    if (hierarchical && ns.parent !== undefined) g.parent = ns.parent;
    groups.push(g);
  }
  const parentOf = (parent: string | undefined): string | undefined => {
    if (hierarchical) return parent;
    for (let at = parent; at !== undefined; ) {
      const ns = byId.get(at);
      if (!ns) return undefined;
      if (ns.explicit) return at;
      at = ns.parent;
    }
    return undefined;
  };
  return { groups, parentOf };
}
