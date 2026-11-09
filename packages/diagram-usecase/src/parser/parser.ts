// cspell:words accdescr markerless
/**
 * Usecase parser: recursive descent over the {@link lex} tokens (gated against v12's
 * Chevrotain lexer, #562), producing a {@link UsecaseModel}, the typed AST, symbols, statement
 * spans and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `usecase.parser.ts` (a Chevrotain `CstParser`), ported rule for rule;
 * `grammar/usecase.ebnf` is its normative form. Chevrotain chose between alternatives with up to
 * three tokens of lookahead and reported a failed choice at its first token; where that differs
 * from reading one token at a time (a statement that starts with a name, the separators of a
 * multi-line `@{ … }`), the tables in `tables.ts` repeat its decision, so the parser accepts
 * what v12 accepted and reports its first error where v12 did. The `--` labels of v12's
 * `hasLabeledRight` gate are found with one scan per run of label tokens (R-PARSE-7).
 *
 * The model is built as v12's `UsecaseModelBuilder` built it (`build.ts`). Unlike v12 the parser
 * does not stop at the first error: it reports it, skips to the line end and carries on; a
 * `systemBoundary` whose header fails still opens its block, so its `end` closes it (pitfall 8).
 */
/*
    start      := 'usecase-beta' lineEnd ( NEWLINE | COMMENT lineEnd | statement )*
    statement  := accTitle | accDescr | 'direction' DIR lineEnd
                | 'actor' actorItem ( (',' actorItem)+ | relationTail )? lineEnd
                | 'systemBoundary' bName metadata? classSuffix? lineEnd
                    ( NEWLINE | COMMENT lineEnd | 'actor' actorItem (',' actorItem)* lineEnd
                    | entityName lineEnd )* 'end' lineEnd
                | 'note' 'for' ID label lineEnd
                | JSON_DECLARATION_START JSON_OBJECT classSuffix? lineEnd
                | 'classDef' ID (',' ID)* styles lineEnd
                | 'class' ID (',' ID)* ID (',' ID)* lineEnd | 'style' ID styles lineEnd
                | (ID | STR | MD) metadata lineEnd | entityName relationTail? lineEnd
    actorItem  := (ID ('(' label ')')? | STR | MD) metadata? stereotype? classSuffix?
    entityName := (ID ('(' label ')' | '[' label ']')? | STR | MD) metadata? stereotype? classSuffix?
    relationTail := (ID '@')? arrow entityName
*/
import { Kind } from '@mermaid-js/core/parser-kit';
import type { AstId, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import {
  USECASE_INVALID_JSON,
  USECASE_UNCLOSED_ACC_DESCR,
  USECASE_UNCLOSED_BOUNDARY,
} from '../codes.ts';
import type { UsecaseModel } from '../model.ts';
import { assembleModel, assignIds, recordSymbols } from './assemble.ts';
import type { Mention, Occurrence } from './assemble.ts';
import type {
  UsecaseBoundaryNode,
  UsecaseDocument,
  UsecaseElementNode,
  UsecaseJsonNode,
  UsecaseRelationNode,
  UsecaseSimpleKind,
  UsecaseStatementNode,
} from './ast.ts';
import { UsecaseBuilder } from './build.ts';
import type { EndpointDraft, MetadataDraft, RelationshipDraft } from './drafts.ts';
import { ItemReader } from './items.ts';
import type { ItemRead, NameRead, TailRead } from './items.ts';
import { parseOrderedJson } from './json.ts';
import { STOP } from './reader.ts';
import type { UsecaseParseOptions } from './reader.ts';
import {
  ARROW_SET,
  ARROWS,
  DIRECTION_SET,
  DIRECTIONS,
  ENTITY_SECOND_ID,
  ENTITY_SECOND_QUOTED,
  IN_BOUNDARY,
  KEYWORD_LINE,
  LINE_END,
  METADATA_THIRD,
  NAME_SET,
  PLANTUML,
  PROPERTY_KEYS,
  RELATION_START,
  STARTS,
  STYLE_PART,
  STYLE_PROPERTY,
  STYLE_PROPERTY_SET,
  WORD_KINDS,
  WORD_SET,
} from './tables.ts';
import { esc, generatedId, shown } from './text.ts';
import { T } from './tokens.ts';

export type { UsecaseParseOptions } from './reader.ts';

export type UsecaseParseResult = ParseResult<UsecaseModel, UsecaseDocument>;

/** Parse a usecase diagram. Never throws: problems are error diagnostics. */
export function parseUsecase(src: string, options: UsecaseParseOptions = {}): UsecaseParseResult {
  return new UsecaseParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class UsecaseParser extends ItemReader {
  private readonly builder = new UsecaseBuilder({
    error: (code, message, range, related) => this.modelError(code, message, range, related),
    shown,
  });
  private readonly children: UsecaseStatementNode[] = [];
  /** Element, boundary and JSON nodes in source order: their ids wait for the model's kinds. */
  private readonly mentions: Mention[] = [];
  private readonly occurrences: Occurrence[] = [];
  private readonly relationIds = new Map<string, number>();
  private notes = 0;

  parse(): UsecaseParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const built = this.builder.build();
    assignIds(this.mentions, built);
    const model = assembleModel(built, this.pre, st.diagnostics.list);
    recordSymbols(st, this.occurrences, built);
    // The model's diagnostics are found after the parse: keep the list in source order.
    st.diagnostics.list.sort((x, y) => x.range.start - y.range.start);
    const ast: UsecaseDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.opts);
  }

  // ---- rules: document ----------------------------------------------------------------

  /** `'usecase-beta' lineEnd` */
  private header(): void {
    this.expect(T.Usecase);
    const range = this.range(this.i - 1);
    this.st.statement('header', range);
    this.children.push({ id: 'usecase', type: 'Header', range });
    this.lineEnd([], 'a diagram starts with `usecase-beta` on a line of its own');
  }

  /** `( NEWLINE | COMMENT lineEnd | statement )* EOF` */
  private document(): void {
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline || k === Kind.Comment) {
        this.i++;
        continue;
      }
      this.statement(() => this.dispatch(k));
    }
  }

  /** v12's `statement` choice. */
  private dispatch(k: number): void {
    if (k === T.AccTitleLine) this.accTitle();
    else if (k === T.AccDescrLine || k === T.AccDescrBlock) this.accDescr();
    else if (k === T.Direction) this.direction();
    else if (k === T.Actor) this.actorStatement();
    else if (k === T.SystemBoundary) this.boundary();
    else if (k === T.Note) this.note();
    else if (k === T.JsonDeclarationStart) this.json();
    else if (k === T.ClassDef) this.classDef();
    else if (k === T.Class) this.classStatement();
    else if (k === T.Style) this.style();
    else if (NAME_SET[k] === 1) this.named(k);
    else this.fail(STARTS);
  }

  /**
   * A statement that starts with a name: `Name@{ … }` or an element and its relation. v12's
   * parser chose with three tokens of lookahead, and reported a choice that fits neither at
   * the name.
   */
  private named(k: number): void {
    const s = this.i;
    const k2 = this.kind(s + 1);
    if (k2 === T.MetadataStart) {
      if (METADATA_THIRD[this.kind(s + 2)] === 1) {
        this.metadataStatement();
        return;
      }
      this.unexpected(s, s + 2, [...PROPERTY_KEYS, T.RBrace, Kind.Newline]);
      throw STOP;
    }
    if (k === T.Identifier && this.raw(s) === 'accDescr' && k2 === T.LBrace) {
      // No `}` after it: v12's lexer read no description, and its lines are no statements.
      this.description = true;
      this.st.diagnostics.error(
        USECASE_UNCLOSED_ACC_DESCR,
        `Unclosed accessible description: the \`accDescr {\` at line ${this.lineOf(this.range(s).start)} has no closing \`}\`. Write \`accDescr { … }\` or \`accDescr: …\`.`,
        { start: this.range(s).start, end: this.range(s + 1).end },
        { expected: ['`}`'] }
      );
      throw STOP;
    }
    if (k === T.Identifier && PLANTUML.has(this.raw(s).toLowerCase())) {
      const word = this.raw(s);
      const range = this.range(s);
      this.st.diagnostics.error(
        'UNEXPECTED',
        `Unexpected \`${word}\`: it is PlantUML syntax, which a usecase diagram does not take. Use \`systemBoundary … end\` for a frame, or quote the name.`,
        range
      );
      throw STOP;
    }
    const second = k === T.Identifier ? ENTITY_SECOND_ID : ENTITY_SECOND_QUOTED;
    if (second[k2] !== 1) {
      const want =
        k === T.Identifier
          ? [T.LParen, T.LBracket, T.MetadataStart, T.StereotypeStart, T.ClassSeparator]
          : [T.MetadataStart, T.StereotypeStart, T.ClassSeparator];
      this.unexpected(s, s + 1, [...want, ...ARROWS, ...LINE_END]);
      throw STOP;
    }
    this.entityStatement();
  }

  // ---- rules: statements --------------------------------------------------------------

  /** `'actor' actorItem ( (',' actorItem)+ | relationTail )? lineEnd` */
  private actorStatement(): void {
    const start = this.range(this.i++).start;
    const items = [this.item(false)];
    let tail: TailRead | undefined;
    if (this.kind() === T.Comma) {
      while (this.kind() === T.Comma) {
        this.i++;
        items.push(this.item(false));
      }
    } else if (RELATION_START[this.kind()] === 1) tail = this.relationTail();
    const range = { start, end: this.end() };
    this.lineEnd(tail || items.length > 1 ? [T.Comma] : [T.Comma, ...ARROWS]);
    const nodes = items.map((it) => this.declare(it, 'actor'));
    if (!tail) {
      this.st.statement('actor', range);
      this.children.push(...nodes);
      return;
    }
    const source = items[0] as ItemRead;
    this.relation(range, source, nodes[0] as UsecaseElementNode, tail, true, 'actor');
  }

  /** `entityName relationTail? lineEnd` */
  private entityStatement(): void {
    const source = this.item(true);
    let tail: TailRead | undefined;
    if (RELATION_START[this.kind()] === 1) tail = this.relationTail();
    const range = { start: source.span.start, end: this.end() };
    this.lineEnd(tail ? [] : ARROWS);
    if (!tail) {
      source.shape ??= 'ellipse';
      const node = this.declare(source, 'usecase');
      this.st.statement('usecase', range);
      this.children.push(node);
      return;
    }
    const node = source.explicit ? this.declare(source, 'usecase') : this.mention(source);
    this.relation(range, source, node, tail, false, 'relation');
  }

  /** A relation's model draft, AST node and statement. */
  private relation(
    range: Range,
    source: ItemRead,
    sourceNode: UsecaseElementNode,
    tail: TailRead,
    sourceDeclares: boolean,
    statement: string
  ): void {
    const target = tail.target;
    const targetNode = target.explicit ? this.declare(target, 'usecase') : this.mention(target);
    const end = (it: ItemRead, declaration: boolean): EndpointDraft => ({
      id: it.id,
      label: it.label,
      range: it.range,
      generated: it.generated,
      declaration,
      classes: it.classes.length > 0,
    });
    let id: AstId;
    if (tail.edgeId) {
      id = this.bump(`rel:${esc(tail.edgeId.id)}`);
      this.occurrences.push({ id: tail.edgeId.id, range: tail.edgeId.range });
    } else id = this.bump(`rel:${esc(source.id)}->${esc(target.id)}`);
    const draft: RelationshipDraft = {
      astId: id,
      source: end(source, sourceDeclares || source.explicit),
      target: end(target, target.explicit),
      range: tail.range,
      type: tail.arrow.type,
      arrowType: tail.arrow.arrowType,
      minlen: tail.arrow.minlen,
    };
    if (tail.edgeId) draft.explicitId = tail.edgeId;
    if (tail.arrow.label) draft.label = tail.arrow.label;
    this.builder.addRelationship(draft);
    const node: UsecaseRelationNode = {
      id,
      type: 'Relation',
      range,
      source: source.id,
      target: target.id,
      arrowRange: tail.arrow.range,
      children: [sourceNode, targetNode],
    };
    if (tail.edgeId) {
      node.edgeId = tail.edgeId.id;
      node.edgeIdRange = tail.edgeId.range;
    }
    if (tail.arrow.labelRange && tail.arrow.type === 'association') {
      node.labelRange = tail.arrow.labelRange;
    }
    this.st.statement(statement, range);
    this.children.push(node);
  }

  /** `id`, then `id@2`, `id@3`, … */
  private bump(base: string): AstId {
    const n = (this.relationIds.get(base) ?? 0) + 1;
    this.relationIds.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  /** The AST node of an element declaration, and its model draft. */
  private declare(
    it: ItemRead,
    kind: 'actor' | 'usecase',
    parent?: { id: string; range: Range }
  ): UsecaseElementNode {
    const draft: Parameters<UsecaseBuilder['addElement']>[0] = {
      id: it.id,
      kind,
      label: it.label,
      range: it.range,
      generated: it.generated,
      classes: it.classes,
    };
    if (parent) draft.parent = parent;
    if (kind === 'usecase' && it.shape) draft.shape = it.shape;
    if (it.metadata) draft.metadata = it.metadata;
    if (it.stereotype !== undefined) draft.stereotype = it.stereotype;
    this.builder.addElement(draft);
    const node = this.elementNode(it, true);
    this.mentions.push({ node, kind });
    return node;
  }

  /** The AST node of a name that only refers to an element (an end of a relation). */
  private mention(it: ItemRead): UsecaseElementNode {
    const node = this.elementNode(it, false);
    this.mentions.push({ node });
    return node;
  }

  private elementNode(it: ItemRead, declares: boolean): UsecaseElementNode {
    this.occurrences.push({ id: it.id, range: it.range });
    const node: UsecaseElementNode = {
      id: '',
      type: 'Element',
      range: it.span,
      name: it.id,
      nameRange: it.range,
      kind: 'usecase',
      declares,
    };
    if (it.labelRange) node.labelRange = it.labelRange;
    return node;
  }

  /**
   * `'systemBoundary' bName metadata? classSuffix? lineEnd content 'end' lineEnd`. A header that
   * fails still opens the block, so its `end` closes it (pitfall 8).
   */
  private boundary(): void {
    const keyword = this.range(this.i++);
    let name: NameRead | undefined;
    let classes: string[] = [];
    let metadata: MetadataDraft | undefined;
    try {
      name = this.name(true);
      if (this.kind() === T.MetadataStart) metadata = this.metadata();
      if (this.kind() === T.ClassSeparator) classes = this.classSuffix();
      this.lineEnd(
        metadata ? [T.ClassSeparator] : [T.MetadataStart, T.ClassSeparator],
        this.kind() === T.StereotypeStart || (this.kind() === T.MetadataStart && classes.length > 0)
          ? 'a `systemBoundary` takes `@{ … }` and then `:::`, and no stereotype'
          : undefined
      );
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
    const parent = name && { id: name.id, range: name.range };
    if (name) {
      this.builder.addBoundary({
        id: name.id,
        label: name.label,
        range: name.range,
        generated: name.generated,
        classes,
      });
      this.occurrences.push({ id: name.id, range: name.range });
    }
    const span = this.st.beginStatement('boundary', keyword.start);
    const node: UsecaseBoundaryNode = {
      id: '',
      type: 'Boundary',
      range: { start: keyword.start, end: keyword.end },
      name: name?.id ?? '',
      nameRange: name?.range ?? keyword,
      children: [],
    };
    if (name) this.mentions.push({ node, kind: 'boundary' });
    this.boundaryBody(node, parent, keyword);
    node.range.end = node.endRange?.end ?? this.lastEnd();
    this.st.endStatement(span, node.range.end);
    // Inline metadata resolves like a standalone `id@{ … }` after the body (v12's order).
    if (name && metadata) this.builder.addMetadata(name.id, name.range, metadata);
    this.children.push(node);
  }

  /**
   * The body of a boundary, through its `end` (or to the end of the text). v12 has no nested
   * boundaries: one inside is an error, read as a block (no recursion, so any depth is fine),
   * and its `end` is its own; its members belong to no boundary.
   */
  private boundaryBody(
    node: UsecaseBoundaryNode,
    parent: { id: string; range: Range } | undefined,
    keyword: Range
  ): void {
    const open: Range[] = [keyword];
    for (;;) {
      const k = this.kind();
      if (k === Kind.Newline || k === Kind.Comment) {
        this.i++;
        continue;
      }
      if (k === Kind.EOF) {
        this.unclosedBoundary(keyword);
        return;
      }
      if (k === T.End) {
        const end = this.range(this.i++);
        open.pop();
        this.statement(() => this.lineEnd());
        if (open.length > 0) continue;
        node.endRange = end;
        return;
      }
      this.stmt = this.i;
      try {
        if (k === T.SystemBoundary) {
          this.unexpected(
            this.i,
            this.i,
            IN_BOUNDARY,
            'a `systemBoundary` cannot hold another one'
          );
          open.push(this.range(this.i));
          throw STOP;
        }
        const inner = open.length > 1 ? undefined : parent;
        for (const child of this.boundaryLine(k, inner)) node.children.push(child);
      } catch (error) {
        if (error !== STOP) throw error;
        this.recover();
      }
    }
  }

  /** `'actor' actorItem (',' actorItem)* lineEnd | entityName lineEnd` inside a boundary. */
  private boundaryLine(
    k: number,
    parent: { id: string; range: Range } | undefined
  ): UsecaseElementNode[] {
    const outside = 'a relation goes outside the `systemBoundary`';
    if (k === T.Actor) {
      const start = this.range(this.i++).start;
      const items = [this.item(false)];
      while (this.kind() === T.Comma) {
        this.i++;
        items.push(this.item(false));
      }
      const range = { start, end: this.end() };
      this.lineEnd([T.Comma], ARROW_SET[this.kind()] === 1 ? outside : undefined);
      this.st.statement('actor', range);
      return items.map((it) => this.declare(it, 'actor', parent));
    }
    if (NAME_SET[k] === 1) {
      const it = this.item(true);
      this.lineEnd([], RELATION_START[this.kind()] === 1 ? outside : undefined);
      it.shape ??= 'ellipse';
      this.st.statement('usecase', it.span);
      return [this.declare(it, 'usecase', parent)];
    }
    this.fail(
      IN_BOUNDARY,
      KEYWORD_LINE[k] === 1 ? 'a `systemBoundary` holds only actors and use cases' : undefined
    );
  }

  /** The end of the last token read that is not a line break. */
  private lastEnd(): number {
    let j = this.i - 1;
    while (j > 0 && this.kind(j) === Kind.Newline) j--;
    return this.range(j).end;
  }

  /** A boundary that reaches the end of the text: the error is there, the opener related. */
  private unclosedBoundary(keyword: Range): void {
    this.st.diagnostics.error(
      USECASE_UNCLOSED_BOUNDARY,
      `Unclosed \`systemBoundary\`: the one at line ${this.lineOf(keyword.start)} has no \`end\`. Add a line with \`end\` after its elements.`,
      this.range(),
      { expected: ['`end`'], related: [{ message: 'the `systemBoundary`', range: keyword }] }
    );
  }

  /** `(ID | STR | MD) metadata lineEnd` */
  private metadataStatement(): void {
    const j = this.i++;
    const k = this.kind(j);
    const target =
      k === T.Identifier
        ? { id: this.raw(j), range: this.range(j) }
        : (() => {
            const q = this.quotedLabel(j);
            return { id: generatedId(q.label.raw), range: q.range };
          })();
    const metadata = this.metadata();
    const range = { start: this.range(j).start, end: this.end() };
    this.lineEnd();
    this.builder.addMetadata(target.id, target.range, metadata);
    this.occurrences.push(target);
    this.simple('Metadata', 'metadata', range, [target.id]);
  }

  /** `'note' 'for' ID label lineEnd` */
  private note(): void {
    const start = this.range(this.i++).start;
    this.expect(T.For, 'write `note for Id "text"`');
    const t = this.expect(T.Identifier);
    const read = this.nodeLabel(Kind.Newline);
    const range = { start, end: this.end() };
    this.lineEnd();
    const target = this.raw(t);
    const id = `note:${++this.notes}`;
    this.builder.addNote(id, target, this.range(t), read.label);
    this.occurrences.push({ id: target, range: this.range(t) });
    this.st.statement('note', range);
    this.children.push({ id, type: 'Note', range, target, targetRange: this.range(t) });
  }

  /** `JSON_DECLARATION_START JSON_OBJECT classSuffix? lineEnd` */
  private json(): void {
    const decl = this.i++;
    const image = this.raw(decl);
    const m = /^json[\t ]+(\w+)/.exec(image);
    const id = m?.[1] ?? '';
    const from = this.range(decl).start + (m ? m[0].length - id.length : 0);
    const nameRange = { start: from, end: from + id.length };
    const body = this.expect(T.JsonObjectLiteral);
    const classes = this.kind() === T.ClassSeparator ? this.classSuffix() : [];
    const range = { start: this.range(decl).start, end: this.end() };
    this.lineEnd();
    const bodyRange = this.range(body);
    const parsed = parseOrderedJson(this.raw(body));
    if ('offset' in parsed) {
      const at = this.input.start((this.ats[body] ?? 0) + parsed.offset);
      this.st.diagnostics.error(
        USECASE_INVALID_JSON,
        `Invalid JSON in \`json ${id}\`: expected ${parsed.expected} at line ${this.lineOf(at)}.`,
        { start: at, end: Math.min(at + 1, bodyRange.end) },
        { expected: [parsed.expected] }
      );
    } else {
      this.builder.addJson({
        id,
        range: nameRange,
        value: parsed.value,
        propertyOrder: parsed.propertyOrder,
        classes,
      });
    }
    this.occurrences.push({ id, range: nameRange });
    const node: UsecaseJsonNode = { id: '', type: 'Json', range, name: id, nameRange, bodyRange };
    this.mentions.push({ node, kind: 'json' });
    this.st.statement('json', range);
    this.children.push(node);
  }

  /** `'direction' (TD | TB | BT | LR | RL) lineEnd` */
  private direction(): void {
    const start = this.range(this.i++).start;
    const j = this.expectOne(DIRECTION_SET, DIRECTIONS, 'a direction is upper case');
    const range = { start, end: this.end() };
    this.lineEnd();
    this.builder.setDirection(this.raw(j));
    this.simple('Direction', 'direction', range, []);
  }

  /** `'classDef' ID (',' ID)* styles lineEnd` */
  private classDef(): void {
    const start = this.range(this.i++).start;
    const ids = [this.raw(this.expect(T.Identifier))];
    while (this.kind() === T.Comma) {
      this.i++;
      ids.push(this.raw(this.expect(T.Identifier)));
    }
    const styles = this.styles();
    const range = { start, end: this.end() };
    this.lineEnd([T.Comma]);
    this.builder.addClassDef(ids, styles);
    this.simple('ClassDef', 'classDef', range, []);
  }

  /** `'class' ID (',' ID)* ID (',' ID)* lineEnd`: the targets, then the class names. */
  private classStatement(): void {
    const start = this.range(this.i++).start;
    const ids = (): number[] => {
      const out = [this.expect(T.Identifier)];
      while (this.kind() === T.Comma) {
        this.i++;
        out.push(this.expect(T.Identifier));
      }
      return out;
    };
    const targets = ids();
    const classes = ids();
    const range = { start, end: this.end() };
    this.lineEnd([T.Comma]);
    const read = targets.map((j) => ({ id: this.raw(j), range: this.range(j) }));
    this.builder.addClassAssignment(
      read,
      classes.map((j) => this.raw(j))
    );
    this.occurrences.push(...read);
    this.simple(
      'Class',
      'class',
      range,
      read.map((t) => t.id)
    );
  }

  /** `'style' ID styles lineEnd` */
  private style(): void {
    const start = this.range(this.i++).start;
    const t = this.expect(T.Identifier);
    const styles = this.styles();
    const range = { start, end: this.end() };
    this.lineEnd([T.Comma]);
    const target = { id: this.raw(t), range: this.range(t) };
    this.builder.addStyle(target.id, target.range, styles);
    this.occurrences.push(target);
    this.simple('Style', 'style', range, [target.id]);
  }

  /** `styleValue (',' styleValue)*` */
  private styles(): string[] {
    const out = [this.styleValue()];
    while (this.kind() === T.Comma) {
      this.i++;
      out.push(this.styleValue());
    }
    return out;
  }

  /** `(WORD | CSS_IDENTIFIER | '--' WORD) ':' styleComponent+`, as written (`\,` read as `,`). */
  private styleValue(): string {
    const first = this.i;
    const k = this.kind();
    if (k === T.MarkerlessSolid) {
      this.i++;
      this.expectOne(WORD_SET, WORD_KINDS);
    } else this.expectOne(STYLE_PROPERTY_SET, STYLE_PROPERTY, 'write a style as `fill:#f9f`');
    this.expect(T.Colon, 'write a style as `fill:#f9f`');
    if (STYLE_PART[this.kind()] !== 1) this.fail([T.Identifier, T.HashColor, T.Number]);
    while (STYLE_PART[this.kind()] === 1) this.i++;
    return this.rawSpan(first, this.i - 1).replaceAll('\\,', ',');
  }

  /** `ACC_TITLE_LINE lineEnd`: the text after `:`, trimmed. */
  private accTitle(): void {
    const j = this.i++;
    const image = this.raw(j);
    const range = this.range(j);
    this.lineEnd();
    this.builder.accTitle = image.slice(image.indexOf(':') + 1).trim();
    this.simple('AccTitle', 'accTitle', range, []);
  }

  /**
   * `(ACC_DESCR_LINE | ACC_DESCR_BLOCK) lineEnd`: the text after `:` or between the braces,
   * trimmed, then commonDb's `setAccDescription` (a line break and the blanks after it as one
   * line break).
   */
  private accDescr(): void {
    const j = this.i++;
    const image = this.raw(j);
    const range = this.range(j);
    this.lineEnd();
    const text =
      this.kind(j) === T.AccDescrLine
        ? image.slice(image.indexOf(':') + 1)
        : image.slice(image.indexOf('{') + 1, image.lastIndexOf('}'));
    this.builder.accDescr = text.trim().replace(/\n\s+/g, '\n');
    this.simple('AccDescr', 'accDescr', range, []);
  }

  private simple(type: UsecaseSimpleKind, kind: string, range: Range, refs: string[]): void {
    const word = type.charAt(0).toLowerCase() + type.slice(1);
    this.st.statement(kind, range);
    this.children.push({ id: this.st.ids.statement(word), type, range, refs });
  }
}
