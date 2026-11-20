/**
 * Class-diagram parser: recursive descent over the {@link lex} tokens, producing a
 * {@link ClassModel}, the typed AST, symbols, statement spans and diagnostics (DESIGN §4.3).
 *
 * The rules are v12's `classDiagram.jison` grammar (LALR(1), conflict-free), ported one to
 * one: each method names the jison rule it reads, and the builder gets the calls v12's rule
 * actions made, in the same order. Unlike jison it does not stop at the first error: it
 * reports it, skips to the next statement boundary and carries on (R-PARSE-4). A string or
 * other lexer mode that runs to the end of the text is reported at its opener, and lexing
 * restarts on the line after it.
 */
// cspell:words LALR
import { Kind, inKindSet, isLineEnd, isSpace, nodeId } from '@mermaid-js/core/parser-kit';
import type { ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import { LIMIT_CODES, checkLimit } from '@mermaid-js/core/limits';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  ClassAnnotationStmt,
  ClassDocument,
  ClassNamespaceStmt,
  ClassNoteStmt,
  ClassRefNode,
  ClassRelationStmt,
  ClassSimpleKind,
  ClassSimpleStmt,
  ClassStatementNode,
  ClassStmt,
  ClassTextNode,
} from './ast.ts';
import type { ClassModel, RelationType } from './model.ts';
import { T } from './tokens.ts';
import { ParserBase } from './base.ts';
import {
  ACC_DESCR_VALUE,
  ACC_TITLE_VALUE,
  AFTER_CLASS,
  AFTER_LABEL,
  AFTER_NAME,
  AFTER_NS_NAME,
  ALPHA,
  ANNOTATION_END,
  BODY,
  CLASS_DIAGRAM,
  COMMA,
  DIRECTIONS,
  DOC_KINDS,
  LABEL,
  LINE_KINDS,
  NAME_PART,
  NEWLINE,
  NS_BODY_KINDS,
  NS_EXPECTED,
  NS_FIRST_KINDS,
  NS_HINT,
  NS_ITEM_KINDS,
  NS_SEPARATOR,
  RELATION_START,
  RELATION_START_SET,
  RELATION_TYPES,
  RELATION_TYPE_KINDS,
  SEPARATOR,
  STATEMENT_HINTS,
  STATEMENT_KINDS,
  STOP,
  STR,
  STRUCT_START,
  cleanupLabel,
  looksLikeStatement,
  trimmed,
} from './tables.ts';
import type { Frame, Name } from './tables.ts';

export interface ClassParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Relationship cap (core `DEFAULT_LIMITS.maxEdges`). */
  maxEdges?: number;
  /** Class cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number;
  /** Namespace nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
  /** Features claimed by extension plugins; `callbacks` silences `CALLBACK_IGNORED`. */
  claims?: readonly string[];
}

export type ClassParseResult = ParseResult<ClassModel, ClassDocument>;

/** Parse a class diagram. Never throws: problems are error diagnostics. */
export function parseClass(src: string, options: ClassParseOptions = {}): ClassParseResult {
  return new ClassParser(src, options).parse();
}

/** One parse: the statement rules over {@link ParserBase}. */
class ClassParser extends ParserBase {
  parse(): ClassParseResult {
    const { st, db, options } = this;
    this.header();
    this.document();
    this.mentionIds();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = db.model(warnings);
    const title = this.pre.frontMatter?.title;
    if (title) model.title = title;
    if (model.callbacks.length > 0 && !options.claims?.includes('callbacks')) {
      const first = model.callbacks[0];
      model.warnings.push(
        st.diagnostics.warning(
          'CALLBACK_IGNORED',
          '`callback` and `click … call` are ignored: install the interactions plugin to run callbacks.',
          first?.range ?? { start: 0, end: 0 }
        )
      );
    }
    const ast: ClassDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: this.src.length },
      children: this.children,
    };
    // Edges counted across embedded diagrams (ADR-15).
    return {
      ...st.result(model, ast, this.fullTokens.tokens, options, this.probe),
      edgeCount: db.relationCount,
    };
  }

  // ---- statements ---------------------------------------------------------------------

  /** A statement led by a class name: a relationship, `A : member`, or a bare name. */
  protected nameStatement(out: ClassStatementNode[]): void {
    const { db, ids, st } = this;
    const from = this.i;
    const first = this.className();
    this.tested(AFTER_NAME);
    const k = this.kind();
    if (k === T.Str || inKindSet(RELATION_START_SET, k)) {
      this.relationStatement(first, from, out);
      return;
    }
    if (k === T.Label) {
      const j = this.i++;
      const text = cleanupLabel(this.val(j));
      const textRange = this.range(j);
      const had = db.has(first.id);
      const member = db.addMember(first.raw, text, textRange, nodeId(first.id));
      if (!had) this.checkNodes(first.range);
      const r = this.span(from);
      const owner = this.ref(first, !had);
      st.statement('member', r);
      out.push({
        id: ids.statement('st'),
        type: 'MemberStatement',
        range: r,
        children: member
          ? [
              owner,
              { id: member.ast, type: 'Member', range: trimmed(this.src, textRange, 1), text },
            ]
          : [owner],
      });
      return;
    }
    // jison `memberStatement: className`: a bare name, which v12 ignores.
    st.statement('classRef', first.range);
    out.push(this.ref(first, false));
  }

  /** jison `relationStatement [LABEL]`, after its first class name. */
  protected relationStatement(first: Name, from: number, out: ClassStatementNode[]): void {
    const { db, ids, st } = this;
    const k = this.kind();
    const startLabel = k === T.Str ? this.textNode(this.i++) : undefined;
    const arrowFrom = this.i;
    const [startType, line, endType] = this.relation();
    const arrowRange = this.span(arrowFrom);
    this.tested(STR);
    const endLabel = this.kind() === T.Str ? this.textNode(this.i++) : undefined;
    const second = this.className();
    this.tested(LABEL);
    const label =
      this.kind() === T.Label
        ? { text: cleanupLabel(this.val(this.i)), range: this.range(this.i++) }
        : undefined;
    const ast = ids.edge(first.id, second.id);
    const had = [db.has(first.id), db.has(second.id)];
    // v12 makes the lollipop end of `A ()-- B` an interface, not a class.
    const startInterface = startType === 'lollipop' && endType === 'none';
    const endInterface = endType === 'lollipop' && startType === 'none';
    const fromAst = startInterface ? this.interfaceId(first.id) : nodeId(first.id);
    const toAst = endInterface ? this.interfaceId(second.id) : nodeId(second.id);
    const interfaceCount = db.interfaceCount;
    db.addRelation({
      from: first.raw,
      to: second.raw,
      fromAst,
      toAst,
      ast,
      startType,
      endType,
      line,
      ...(startLabel ? { startLabel: startLabel.text } : {}),
      ...(endLabel ? { endLabel: endLabel.text } : {}),
      ...(label ? { label: label.text } : {}),
    });
    // Check each new class with the count it had when it was added (#748): `checkLimit` expects
    // one call per class, so when the relation made both ends, the first is checked at one less.
    // `A --> A` makes one class.
    const madeFirst = !had[0] && db.has(first.id);
    const madeSecond = first.id !== second.id && !had[1] && db.has(second.id);
    if (madeFirst) this.checkNodes(first.range, db.classCount - (madeSecond ? 1 : 0));
    if (madeSecond) this.checkNodes(second.range);
    checkLimit(
      st.diagnostics,
      'maxEdges',
      db.relationCount,
      this.maxEdges,
      'relationships',
      this.span(from)
    );
    const r = this.span(from);
    const node: ClassRelationStmt = {
      id: ast,
      type: 'Relation',
      range: r,
      children: [
        startInterface
          ? this.interfaceRef(first, fromAst, interfaceCount)
          : this.ref(first, !had[0] && db.has(first.id)),
        endInterface
          ? this.interfaceRef(second, toAst, interfaceCount)
          : this.ref(second, !had[1] && db.has(second.id)),
      ],
      arrowRange,
    };
    if (startLabel) node.startLabel = startLabel;
    if (endLabel) node.endLabel = endLabel;
    if (label) node.label = label;
    st.statement('relation', r);
    out.push(node);
  }

  /** jison `relation`: `[relationType] lineType [relationType]`. */
  protected relation(): [RelationType, 'solid' | 'dotted', RelationType] {
    this.tested(RELATION_START);
    let k = this.kind();
    let startType: RelationType = 'none';
    const first = RELATION_TYPES[k];
    if (first !== undefined) {
      startType = first;
      this.i++;
      this.tested(LINE_KINDS);
      k = this.kind();
    }
    if (k !== T.Line && k !== T.DottedLine)
      this.fail(startType === 'none' ? RELATION_START : LINE_KINDS);
    this.i++;
    const line = k === T.Line ? 'solid' : 'dotted';
    this.tested(RELATION_TYPE_KINDS);
    const et = RELATION_TYPES[this.kind()];
    if (et !== undefined) this.i++;
    return [startType, line, et ?? 'none'];
  }

  /** jison `classStatement`. Returns the class name as written. */
  protected classStatement(out: ClassStatementNode[]): string {
    const { db, st } = this;
    const from = this.i++;
    const name = this.className();
    // The class is made before its label is read, so a bad label still leaves it in the
    // model (v12 made it with the label; only an accepted text reaches the model there).
    const made = this.addClass(name);
    const node: ClassStmt = {
      id: '',
      type: 'Class',
      range: name.range,
      name: name.raw,
      classId: name.id,
      nameRange: name.range,
      children: [],
    };
    this.st.symbol(name.id, 'class', this.symbolRange(name), made ? 'def' : 'ref');
    this.mention(node, name.id, made);
    try {
      this.tested(AFTER_CLASS);
      const label = this.kind() === T.SQS ? this.classLabel() : undefined;
      if (label) {
        db.setClassLabel(name.raw, label.text);
        node.label = label;
      }
      this.tested(label ? AFTER_LABEL : AFTER_CLASS);
      const k = this.kind();
      if (k === T.StyleSeparator) {
        this.i++;
        const r = this.range(this.i);
        const cls = this.alphaNumToken();
        st.symbol(cls, 'cssClass', r, 'ref');
        node.cssClass = cls;
        db.setCssClass(name.raw, cls);
        this.tested(STRUCT_START);
        if (this.kind() === T.StructStart) this.body(name, node, true);
      } else if (k === T.StructStart) {
        this.body(name, node, false);
      } else if (k === T.AnnotationStart) {
        this.i++;
        const annotation = this.alphaNumToken();
        this.expect(T.AnnotationEnd, ANNOTATION_END);
        node.annotation = annotation;
        db.addAnnotation(name.raw, annotation, this.span(from));
        this.tested(STRUCT_START);
        if (this.kind() === T.StructStart) this.body(name, node, false);
      }
    } finally {
      node.range = this.span(from);
      st.statement('class', node.range);
      out.push(node);
    }
    return name.raw;
  }

  /** `{ MEMBER* }` (`members` must be non-empty after `:::name`). */
  protected body(name: Name, node: ClassStmt, needMembers: boolean): void {
    const open = this.i++;
    const lines: number[] = [];
    let errors = 0;
    for (;;) {
      this.tested(BODY);
      const k = this.kind();
      if (k === T.Member) {
        lines.push(this.i++);
        continue;
      }
      if (k === T.StructStop) {
        if (needMembers && lines.length === 0 && errors === 0) {
          this.report(
            [T.Member],
            'a class with `:::style` and a body needs at least one member, or no braces'
          );
          errors++;
        }
        this.i++;
        break;
      }
      const ends = k === T.EofInStruct || k === Kind.EOF || k === T.Eof;
      if ((ends || k === T.OpenInStruct) && this.bodyRunsOn(name, node, open, lines)) throw STOP;
      if (ends) {
        const r = this.range(open);
        this.st.diagnostics.error(
          'UNCLOSED_BODY',
          `Unclosed class body: the \`{\` of class \`${name.id}\` at line ${this.lineOf(r.start)} has no closing \`}\`. Add \`}\` to close it.`,
          r,
          {
            related: [
              {
                message: 'The text ends here.',
                range: { start: this.src.length, end: this.src.length },
              },
            ],
          }
        );
        this.addMembers(name, node, lines);
        node.bodyRange = { start: r.start, end: this.src.length };
        this.ended = true;
        throw STOP;
      }
      // `{` or `[*]` inside a body: reported once each, then the body goes on.
      this.report(BODY, 'a class body holds one member per line; close it with `}`');
      errors++;
      this.i++;
    }
    this.addMembers(name, node, lines);
    node.bodyRange = this.span(open);
  }

  /**
   * A body that fails (the text ends in it, or a `{` opens inside it) was most likely left
   * unclosed when a member line reads as a statement (`class B`, `A --> B`): report the
   * unclosed `{`, keep the members before that line, and lex again from it, so the following
   * statements are read as statements. v12 rejects the text either way.
   */
  protected bodyRunsOn(name: Name, node: ClassStmt, open: number, lines: number[]): boolean {
    const q = lines.findIndex((j) => looksLikeStatement(this.val(j)));
    if (q < 0) return false;
    const j = lines[q] ?? 0;
    const r = this.range(open);
    const at = trimmed(this.src, this.range(j));
    this.st.diagnostics.error(
      'UNCLOSED_BODY',
      `Unclosed class body: the \`{\` of class \`${name.id}\` at line ${this.lineOf(r.start)} has no closing \`}\`. Add \`}\` before line ${this.lineOf(at.start)}.`,
      r,
      { related: [{ message: 'The body runs on to here.', range: at }] }
    );
    this.addMembers(name, node, lines.slice(0, q));
    node.bodyRange = { start: r.start, end: at.start };
    // Lex again from the line break before that line, which then ends the class statement.
    let from = this.start(j);
    while (from > 0 && !isLineEnd(this.src.charCodeAt(from - 1))) from--;
    while (from > 0 && isLineEnd(this.src.charCodeAt(from - 1))) from--;
    this.restartAt(from);
    return true;
  }

  /** v12 `addMembers`: each member line in order. */
  protected addMembers(name: Name, node: ClassStmt, lines: readonly number[]): void {
    for (const j of lines) {
      const text = this.val(j);
      const r = this.range(j);
      const member = this.db.addMember(name.raw, text, trimmed(this.src, r), nodeId(name.id));
      if (member) {
        node.children.push({
          id: member.ast,
          type: 'Member',
          range: trimmed(this.src, r),
          text: text.trim(),
        });
      }
    }
  }

  /** `<<annotation>> Class`. */
  protected annotationStatement(out: ClassStatementNode[]): void {
    const from = this.i++;
    const annotation = this.alphaNumToken();
    this.expect(T.AnnotationEnd, ANNOTATION_END);
    const name = this.className();
    this.db.addAnnotation(name.raw, annotation, name.range);
    const r = this.span(from);
    this.st.statement('annotation', r);
    const node: ClassAnnotationStmt = {
      id: this.ids.statement('st'),
      type: 'Annotation',
      range: r,
      annotation,
      children: [this.ref(name, false)],
    };
    out.push(node);
  }

  /** `note for Class "text"` / `note "text"`. Returns the note id. */
  protected noteStatement(out: ClassStatementNode[]): string {
    const from = this.i;
    const forClass = this.kind() === T.NoteFor;
    this.i++;
    let ref: ClassRefNode | undefined;
    let raw: string | undefined;
    if (forClass) {
      const name = this.className();
      raw = name.raw;
      ref = this.ref(name, false);
    }
    const text = this.str();
    const ast = this.ids.statement('note');
    const noteId = this.db.addNote(text.text, ast, raw);
    const r = this.span(from);
    this.st.statement('note', r);
    const node: ClassNoteStmt = {
      id: ast,
      type: 'Note',
      range: r,
      text,
      noteId,
      children: ref ? [ref] : [],
    };
    out.push(node);
    return noteId;
  }

  protected simple(kind: ClassSimpleKind, from: number, refs: string[]): ClassSimpleStmt {
    const r = this.span(from);
    this.st.statement(kind.charAt(0).toLowerCase() + kind.slice(1), r);
    return { id: this.ids.statement('st'), type: kind, range: r, refs };
  }

  /** `callback`, `link` and `click`: the node, then its span. */
  protected clickCase(from: number, refs: string[], out: ClassStatementNode[]): void {
    const { st } = this;
    // The span is recorded once the statement is read, or failed (folding, code↔diagram
    // highlight); an unclosed string or error keeps it to the statement's first line.
    const node: ClassSimpleStmt = {
      id: this.ids.statement('st'),
      type: 'Click',
      range: this.span(from),
      refs,
    };
    out.push(node);
    const errors = st.diagnostics.list.length;
    try {
      this.clickStatement(node);
    } finally {
      let r = this.span(from);
      if (st.diagnostics.list.length > errors || this.runsToEnd(from)) {
        r = { start: r.start, end: Math.min(r.end, this.lineBreakAfter(r.start)) };
      }
      node.range = r;
      st.statement('click', r);
    }
  }

  /** One statement at the top level (jison `statement`). */
  protected statement(out: ClassStatementNode[]): void {
    const { db, st } = this;
    this.tested(STATEMENT_KINDS);
    const t = this.kind();
    this.hint = STATEMENT_HINTS[t];
    const from = this.i;
    const refs: string[] = [];
    switch (t) {
      case T.Class:
        this.classStatement(out);
        return;
      case T.Namespace:
        this.namespaceHeader();
        return;
      case T.AnnotationStart:
        this.annotationStatement(out);
        return;
      case T.NoteFor:
      case T.Note:
        this.noteStatement(out);
        return;
      case T.Member:
        // jison `memberStatement: MEMBER`, which v12 ignores.
        this.i++;
        return;
      case T.Callback:
      case T.Link:
      case T.Click: {
        this.clickCase(from, refs, out);
        return;
      }
      case T.Style: {
        this.i++;
        const r = this.range(this.i);
        const id = this.val(this.expect(T.Alpha, ALPHA));
        st.symbol(id, 'class', r, 'ref');
        refs.push(id);
        db.setCssStyle(id, this.stylesOpt());
        out.push(this.simple('Style', from, refs));
        return;
      }
      case T.CssClass: {
        this.i++;
        const j = this.expect(T.Str, STR);
        const list = this.val(j);
        const r = this.range(this.i);
        const cls = this.val(this.expect(T.Alpha, ALPHA));
        this.listRefs(list, this.range(j), 'class', refs);
        st.symbol(cls, 'cssClass', r, 'ref');
        refs.push(cls);
        db.setCssClass(list, cls);
        out.push(this.simple('CssClass', from, refs));
        return;
      }
      case T.ClassDef: {
        this.i++;
        const ids: string[] = [];
        for (;;) {
          const r = this.range(this.i);
          const id = this.val(this.expect(T.Alpha, ALPHA));
          st.symbol(id, 'cssClass', r, 'def');
          ids.push(id);
          this.tested(COMMA);
          if (this.kind() !== T.Comma) break;
          this.i++;
        }
        refs.push(...ids);
        db.defineClass(ids, this.stylesOpt());
        out.push(this.simple('ClassDef', from, refs));
        return;
      }
      case T.DirectionTB:
      case T.DirectionBT:
      case T.DirectionRL:
      case T.DirectionLR:
        this.i++;
        db.setDirection(DIRECTIONS[t] ?? 'TB');
        out.push(this.simple('Direction', from, refs));
        return;
      case T.AccTitle:
        this.i++;
        db.setAccTitle(this.val(this.expect(T.AccTitleValue, ACC_TITLE_VALUE)).trim());
        out.push(this.simple('AccTitle', from, refs));
        return;
      case T.AccDescr:
        this.i++;
        db.setAccDescription(this.val(this.expect(T.AccDescrValue, ACC_DESCR_VALUE)).trim());
        out.push(this.simple('AccDescr', from, refs));
        return;
      case T.AccDescrMultilineValue:
        db.setAccDescription(this.val(this.i++).trim());
        out.push(this.simple('AccDescr', from, refs));
        return;
      default:
        if (inKindSet(NAME_PART, t)) {
          this.nameStatement(out);
          return;
        }
        this.fail(STATEMENT_KINDS);
    }
  }

  // ---- namespaces and the document ----------------------------------------------------

  /** jison `namespaceIdentifier STRUCT_START`: opens a namespace body. */
  protected namespaceHeader(): void {
    const from = this.i;
    const opener = this.range(from);
    this.i++;
    let name: string | undefined;
    let nameRange: Range | undefined;
    let label: ClassTextNode | undefined;
    let failed = false;
    try {
      [name, nameRange] = this.namespaceName();
      this.tested(AFTER_NS_NAME);
      if (this.kind() === T.SQS) label = this.classLabel();
      this.tested(STRUCT_START);
      if (this.kind() !== T.StructStart) this.fail(label ? STRUCT_START : AFTER_NS_NAME);
    } catch (e) {
      if (e !== STOP) throw e;
      failed = true;
      // When the line opens a body anyway, the namespace is open, so its `}` closes it (one
      // error, one diagnostic); otherwise recovery skips the line.
      let j = this.i;
      for (; j < this.tokens.length; j++) {
        const k = this.kind(j);
        if (k === T.StructStart || k === Kind.Newline || k === T.Eof || k === Kind.EOF) break;
      }
      if (this.kind(j) !== T.StructStart) throw e;
      this.i = j;
      this.restartFrom = -1;
    }
    let outer: Frame | undefined;
    for (let f = this.frames.length - 1; f >= 0 && !outer; f--) {
      if (this.frames[f]?.real) outer = this.frames[f];
    }
    this.i++;
    if (name === undefined || nameRange === undefined) {
      // No name: the body is read, but makes no namespace.
      const node: ClassNamespaceStmt = {
        id: this.ids.statement('st'),
        type: 'Namespace',
        range: this.span(from),
        name: '',
        children: [],
      };
      this.openFrame(node, opener, from, false);
    } else {
      const qualified = outer ? `${outer.id}.${name}` : name;
      const ast = this.ids.subgraph(qualified);
      const role = this.db.namespaceExists(qualified) ? 'ref' : 'def';
      this.st.symbol(qualified, 'namespace', nameRange, role);
      this.db.addNamespace(name, ast, label?.text);
      const node: ClassNamespaceStmt = {
        id: ast,
        type: 'Namespace',
        range: this.span(from),
        name: qualified,
        children: [],
      };
      if (label) node.label = label;
      this.openFrame(node, opener, from, true);
    }
    // After a header error the body is still read (its diagnostic is recorded).
    void failed;
  }

  protected openFrame(node: ClassNamespaceStmt, opener: Range, from: number, real: boolean): void {
    const frame: Frame = {
      id: node.name,
      real,
      node,
      opener,
      span: this.st.beginStatement('namespace', this.tokStart(from)),
      classes: [],
      notes: [],
      items: 0,
      needSeparator: false,
      leadingBreak: false,
    };
    this.frames.push(frame);
    if (this.frames.length === this.maxDepth + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Namespaces are nested ${this.frames.length} deep here, over the limit of ${this.maxDepth}. The limit is set by the page or app that renders the diagram.`,
        opener
      );
    }
  }

  /** `}` of the innermost namespace: v12's `addClassesToNamespace` and `popNamespace`. */
  protected closeFrame(end: number): void {
    const frame = this.frames.pop();
    if (!frame) return;
    if (frame.real) {
      this.db.addClassesToNamespace(frame.id, frame.classes, frame.notes);
      this.db.popNamespace();
    }
    frame.node.range = { start: frame.node.range.start, end };
    this.st.endStatement(frame.span, end);
    const outer = this.frames[this.frames.length - 1];
    if (outer) {
      outer.node.children.push(frame.node);
      outer.items++;
      outer.needSeparator = true;
    } else {
      this.children.push(frame.node);
      this.statementCount++;
      this.needSeparator = true;
    }
  }

  /** One item of the innermost namespace body (jison `classStatements`). */
  protected namespaceItem(frame: Frame): void {
    const k = this.kind();
    if (k === T.EofInStruct || k === T.Eof) {
      this.unclosedNamespaces();
      if (k === T.EofInStruct) this.i++;
      return;
    }
    if (frame.needSeparator) {
      this.tested(NS_SEPARATOR);
      if (k === Kind.Newline) {
        this.i++;
        frame.needSeparator = false;
        return;
      }
      if (k !== T.StructStop) this.fail(NS_SEPARATOR, NS_HINT, NS_EXPECTED);
      frame.needSeparator = false;
    }
    this.tested(frame.items === 0 && !frame.leadingBreak ? NS_FIRST_KINDS : NS_BODY_KINDS);
    if (k === T.StructStop) {
      if (frame.items === 0) {
        this.fail(
          NS_ITEM_KINDS,
          'a namespace holds at least one class, note or namespace',
          NS_EXPECTED
        );
      }
      this.i++;
      this.closeFrame(this.tokEnd(this.i - 1));
      return;
    }
    if (k === Kind.Newline && frame.items === 0 && !frame.leadingBreak) {
      frame.leadingBreak = true;
      this.i++;
      return;
    }
    this.hint = STATEMENT_HINTS[k] ?? NS_HINT;
    const out = frame.node.children as ClassStatementNode[];
    if (k === T.Class) {
      frame.items++;
      frame.needSeparator = true;
      frame.classes.push(this.classStatement(out));
      return;
    }
    if (k === T.Note || k === T.NoteFor) {
      frame.items++;
      frame.needSeparator = true;
      frame.notes.push(this.noteStatement(out));
      return;
    }
    if (k === T.Namespace) {
      this.namespaceHeader();
      return;
    }
    this.fail(
      frame.items === 0 && !frame.leadingBreak ? NS_FIRST_KINDS : NS_BODY_KINDS,
      undefined,
      NS_EXPECTED
    );
  }

  /** The text ended inside namespace bodies: one error for the innermost, all closed. */
  protected unclosedNamespaces(): void {
    const frame = this.frames[this.frames.length - 1];
    if (frame) {
      this.st.diagnostics.error(
        'UNCLOSED_NAMESPACE',
        `Unclosed namespace: the \`{\` of namespace \`${frame.id}\` at line ${this.lineOf(frame.opener.start)} has no closing \`}\`. Add \`}\` to close it.`,
        frame.opener,
        {
          related: [
            {
              message: 'The text ends here.',
              range: { start: this.src.length, end: this.src.length },
            },
          ],
        }
      );
    }
    while (this.frames.length > 0) this.closeFrame(this.src.length);
    this.ended = true;
  }

  /**
   * Whether the current token could start a new statement: a statement keyword or a name,
   * after a blank (`A B` is not, `style A font-size` is not: there `-` goes on the word).
   */
  protected startsStatement(): boolean {
    const k = this.kind();
    if (!STATEMENT_KINDS.includes(k) || this.i === 0) return false;
    const s = this.tokStart(this.i);
    return s > this.tokEnd(this.i - 1) && isSpace(this.src.charCodeAt(s - 1));
  }

  /** One step at the top level: a statement, or the separator after one. */
  protected topItem(): void {
    const k = this.kind();
    if (this.needSeparator) {
      this.tested(SEPARATOR);
      if (k === Kind.Newline) {
        this.i++;
        this.needSeparator = false;
        return;
      }
      if (k !== T.Eof) {
        if (this.startsStatement()) this.hint = 'put each statement on its own line';
        this.fail(SEPARATOR);
      }
      this.needSeparator = false;
    }
    this.tested(this.statementCount === 0 ? STATEMENT_KINDS : DOC_KINDS);
    if (k === T.Eof) {
      if (this.statementCount === 0) {
        this.fail(STATEMENT_KINDS, 'a class diagram needs at least one statement, e.g. `class A`');
      }
      this.i++;
      this.ended = true;
      return;
    }
    if (k !== T.Namespace) {
      this.statementCount++;
      this.needSeparator = true;
    }
    this.statement(this.children);
  }

  protected document(): void {
    for (let k = this.kind(); k !== Kind.EOF; k = this.kind()) {
      const frame = this.frames[this.frames.length - 1];
      try {
        if (frame) this.namespaceItem(frame);
        else if (this.ended) {
          this.i++;
        } else this.topItem();
      } catch (e) {
        if (e !== STOP) throw e;
        this.recover();
      }
    }
    if (this.frames.length > 0) this.unclosedNamespaces();
    else if (!this.ended) {
      // The text ended in a lexer mode (an unclosed string, …): jison's end token never came.
      try {
        this.fail(this.needSeparator ? SEPARATOR : STATEMENT_KINDS);
      } catch (e) {
        if (e !== STOP) throw e;
      }
    }
  }

  /** `classDiagram` (or `classDiagram-v2`) and a line break. */
  protected header(): void {
    const from = this.i;
    try {
      this.tested(CLASS_DIAGRAM);
      if (this.kind() !== T.ClassDiagram) {
        this.fail(CLASS_DIAGRAM, 'a class diagram starts with `classDiagram` on its own line');
      }
      this.i++;
      this.expect(Kind.Newline, NEWLINE);
      const r = this.range(from);
      this.st.statement('header', r);
      this.children.push({ id: this.ids.statement('st'), type: 'Header', range: r, refs: [] });
    } catch (e) {
      if (e !== STOP) throw e;
      this.recover();
    }
  }
}
