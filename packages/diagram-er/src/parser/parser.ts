// cspell:words LALR accdescr
/**
 * ER parser: recursive descent over the {@link lex} tokens (a {@link TokenCursor}, or a
 * {@link ProbeCursor} in probe mode), producing an {@link ErModel}, the typed AST, symbols,
 * statement spans and diagnostics (DESIGN §4.3).
 *
 * The grammar is v12's `erDiagram.jison` (LALR), ported rule for rule (`grammar/er.ebnf` is
 * the normative form), so it accepts and rejects what jison does. Statements need no separator
 * (`A B` is two entities), as in v12. Unlike jison it does not stop at the first error: it
 * reports it, skips to the next line (or past the `}` of an attribute block it is in) and
 * carries on (R-PARSE-4).
 */
import {
  ExpectedTable,
  Kind,
  kindSet,
  LineIndex,
  nodeId,
  ParseState,
  Probe,
  ProbeCursor,
  syncTo,
  TokenCursor,
  TRIVIA,
} from '@mermaid-js/core/parser-kit';
import type { ParseOptions, ParseResult, Range, StatementSpan } from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  ErAttributeNode,
  ErDocument,
  ErEntityNode,
  ErRelationshipNode,
  ErSimpleKind,
  ErSimpleNode,
  ErStatementNode,
  ErSubgraphNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import type { LexResult } from './lexer.ts';
import { attributeId, ErBuilder } from './model.ts';
import type { ErAttribute, ErCardinality, ErDirection, ErDocItem, ErModel } from './model.ts';
import { decodeEntities } from './view.ts';
import { T } from './tokens.ts';

export interface ErParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Entity cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number;
  /** Relationship cap (core `DEFAULT_LIMITS.maxEdges`). */
  maxEdges?: number;
  /** Subgraph nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
}

export type ErParseResult = ParseResult<ErModel, ErDocument>;

const ENTITY_NAME = [T.EntityName, T.UnicodeText, T.Num, T.DecimalNum, T.EntityOne];
const CARDINALITY = [T.ZeroOrOne, T.ZeroOrMore, T.OneOrMore, T.OnlyOne, T.MdParent];
const REL_TYPE = [T.Identifying, T.NonIdentifying];
const ROLE = [T.Word, T.EntityName, T.UnicodeText];
const ID = [T.UnicodeText, T.StyleText];
const STYLE_PART = [T.StyleText, T.Num, T.Colon, T.Brkt];
const SEPARATOR = [T.Semi, Kind.Newline, T.Eof];
const DIRECTIONS = [T.DirectionTB, T.DirectionBT, T.DirectionRL, T.DirectionLR];
const STATEMENT = [
  ...ENTITY_NAME,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrMultilineValue,
  ...DIRECTIONS,
  T.ClassDef,
  T.Class,
  T.Style,
  T.Subgraph,
];
const DOC = [...STATEMENT, Kind.Newline, T.Eof, Kind.EOF];
const SUBGRAPH_DOC = [...DOC, T.End];
/** After an entity name, in a statement of its own. */
const AFTER_ENTITY = [...CARDINALITY, T.StyleSeparator, T.BlockStart, T.Sqs];
const AFTER_CLASSES = [...CARDINALITY, T.BlockStart];
const AFTER_ALIAS = [T.StyleSeparator, T.BlockStart];
const ATTRIBUTE_START = [T.AttributeWord, T.BlockStop];
const AFTER_NAME = [T.AttributeKey, T.AttributeComment, T.AttributeWord, T.BlockStop];
const COLON_OR_CLASSES = [T.Colon, T.StyleSeparator];

const CARDINALITIES: Record<number, ErCardinality> = {
  [T.ZeroOrOne]: 'zeroOrOne',
  [T.ZeroOrMore]: 'zeroOrMore',
  [T.OneOrMore]: 'oneOrMore',
  [T.OnlyOne]: 'onlyOne',
  [T.MdParent]: 'mdParent',
};
const DIRECTION_OF: Record<number, ErDirection> = {
  [T.DirectionTB]: 'TB',
  [T.DirectionBT]: 'BT',
  [T.DirectionRL]: 'RL',
  [T.DirectionLR]: 'LR',
};

/** Where recovery resumes (R-PARSE-4). */
const BOUNDARY = kindSet(Kind.EOF, Kind.Newline, T.Eof, T.End);
const BLOCK_END = kindSet(Kind.EOF, T.BlockStop);

/** Kinds a probe's cursor follows rather than extends: punctuation and relationship parts. */
const PROBE_FOLLOWS = kindSet(
  ...CARDINALITY,
  ...REL_TYPE,
  T.StyleSeparator,
  T.Colon,
  T.Comma,
  T.BlockStart,
  T.BlockStop,
  T.Sqs,
  T.Sqe,
  T.Semi,
  T.End
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['an entity name', ENTITY_NAME],
  ['a cardinality such as `||` or `o{`', CARDINALITY],
  ['a line such as `--` or `..`', REL_TYPE],
  ['`:` and a label', [T.Colon]],
  ['a label', [T.Word]],
  ['`:::` and a class name', [T.StyleSeparator]],
  ['a name', [T.StyleText]],
  ['`{` and attributes', [T.BlockStart]],
  ['`}`', [T.BlockStop]],
  ['an attribute type or name', [T.AttributeWord]],
  ['a key such as `PK`', [T.AttributeKey]],
  ['an attribute comment `"…"`', [T.AttributeComment]],
  ['`[` and an alias', [T.Sqs]],
  ['`]`', [T.Sqe]],
  ['a style such as `fill:#f9f`', [T.Num, T.Colon, T.Brkt]],
  ['`,`', [T.Comma]],
  ['a line break or `;`', [Kind.Newline, T.Semi]],
  [
    'a statement such as `style`, `classDef`, `class` or `subgraph`',
    [
      T.AccTitle,
      T.AccDescr,
      T.AccDescrMultilineValue,
      ...DIRECTIONS,
      T.ClassDef,
      T.Class,
      T.Style,
      T.Subgraph,
    ],
  ],
  ['the accessible title', [T.AccTitleValue]],
  ['the accessible description', [T.AccDescrValue]],
  ['`erDiagram`', [T.ErDiagram]],
  ['`end`', [T.End]],
  ['the end of the text', [Kind.EOF, T.Eof]],
]);

/** How each statement is written, for errors inside it. */
const HINTS: Record<number, string> = {
  [T.Style]: 'write it as `style <entity> <styles>`, e.g. `style CUSTOMER fill:#f9f`',
  [T.ClassDef]: 'write it as `classDef <name> <styles>`, e.g. `classDef hot fill:#f96`',
  [T.Class]: 'write it as `class <entities> <class name>`, e.g. `class A,B hot`',
  [T.Subgraph]: 'write it as `subgraph <id>` or `subgraph <id> [title]`, then statements and `end`',
};
const RELATIONSHIP_HINT =
  'write a relationship as `A ||--o{ B : label`, with a cardinality at each end and a label';
const ATTRIBUTE_HINT = 'write each attribute as `type name`, e.g. `string name PK "comment"`';
const ALIAS_HINT = 'write an alias as `A[Alias]`, e.g. `CUSTOMER[Customer]`';
const NAME = ['a name'];
const KEY_COMMA = ['`,` between keys, e.g. `PK, FK`'];
const LABEL = ['a label such as `places` or `"places order"`'];
const STYLE_NAMES = ['a style such as `fill:#f9f`'];

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

interface Frame {
  node: ErSubgraphNode;
  /** Undefined when the header failed: its `end` still closes it, nothing reaches the model. */
  name: string | undefined;
  title: string;
  items: ErDocItem[];
  span: StatementSpan;
  outer: ErStatementNode[];
  outerItems: ErDocItem[] | undefined;
}

interface Name {
  name: string;
  range: Range;
}

/** Parse an ER diagram. Never throws: problems are error diagnostics. */
export function parseEr(src: string, options: ErParseOptions = {}): ErParseResult {
  return new ErParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class ErParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: LexResult;
  private readonly st = new ParseState();
  private readonly db: ErBuilder;
  private readonly c: TokenCursor;
  private readonly probe: Probe | undefined;
  private readonly maxDepth: number;
  private lines: LineIndex | undefined;
  /** The statements of the innermost open subgraph (or the document). */
  private body: ErStatementNode[];
  private readonly children: ErStatementNode[] = [];
  /** What the innermost open subgraph collects (v12's `$$` of each statement). */
  private items: ErDocItem[] | undefined;
  private readonly frames: Frame[] = [];
  /** The `{` of the attribute block being read, for recovery and unclosed errors. */
  private block: Range | undefined;
  private hint: string | undefined;

  constructor(
    private readonly src: string,
    private readonly options: ErParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const probe =
      options.probe === undefined
        ? undefined
        : (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
    this.lexed = lex(src, pre, probe);
    const diagnostics = this.st.diagnostics;
    this.db = new ErBuilder({
      maxNodes: options.maxNodes ?? DEFAULT_LIMITS.maxNodes,
      maxEdges: options.maxEdges ?? DEFAULT_LIMITS.maxEdges,
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
    });
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.body = this.children;
    const { tokens } = this.lexed;
    if (probe === undefined) {
      this.c = new TokenCursor(tokens, TRIVIA);
    } else {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      this.c = new ProbeCursor(tokens, probe, TRIVIA);
    }
  }

  parse(): ErParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = this.db.model(warnings);
    const ast: ErDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.lexed.tokens, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** The current token's text as v12 read it (removed spans dropped, entities decoded). */
  private text(): string {
    const { textStart, textEnd, view } = this.lexed;
    const p = this.c.pos;
    return decodeEntities(view.text.slice(textStart[p] ?? 0, textEnd[p] ?? 0));
  }

  /** The current token's source range, without the blanks a token such as `end` takes. */
  private range(): Range {
    const { start } = this.c;
    let end = this.c.end;
    while (end > start && /\s/.test(this.src[end - 1] ?? '')) end--;
    return { start, end };
  }

  private in(kinds: readonly number[]): boolean {
    this.c.tested(kinds);
    return kinds.includes(this.c.kind);
  }

  /**
   * Consume a token of one of `kinds` and return its text and range, or fail (`names`: what
   * the message says was expected, when the kinds' table names do not fit here).
   */
  private take(kinds: readonly number[], names?: string[]): Name {
    if (!this.in(kinds)) this.fail(kinds, names);
    const out = { name: this.text(), range: this.range() };
    this.c.next();
    return out;
  }

  /** Consume a `.` token jison returned as the character itself (`?`, `,` in a block). */
  private char(ch: string): boolean {
    this.c.tested(T.Char);
    if (this.c.kind !== T.Char || this.text() !== ch) return false;
    this.c.next();
    return true;
  }

  /** Source range from `start` to the end of the last token consumed. */
  private span(start: number, last: Range): Range {
    return { start, end: Math.max(start, last.end) };
  }

  // ---- errors and recovery ------------------------------------------------------------

  private trimmed = -1;

  /** The end of the source without its trailing blanks. */
  private textEnd(): number {
    if (this.trimmed < 0) this.trimmed = this.src.trimEnd().length;
    return this.trimmed;
  }

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token. */
  private found(): string {
    const k = this.c.kind;
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const t = this.src.slice(this.range().start, this.range().end).trim() || this.text().trim();
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], names = EXPECTED.names(want)): never {
    const { st, c } = this;
    this.c.tested(want);
    const where = this.range();
    const k = c.kind;
    if (this.block && (k === Kind.EOF || k === T.Eof)) {
      st.diagnostics.error(
        'UNCLOSED_BLOCK',
        `Unclosed attribute block: the \`{\` at line ${this.lineOf(this.block.start)} has no closing \`}\`. Add \`}\` after the last attribute.`,
        this.block,
        { expected: names, related: [{ message: 'The text ends here.', range: where }] }
      );
      throw STOP;
    }
    if (k === Kind.Error) {
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${this.text()}\`${this.hint ? `; ${this.hint}` : ''}.`,
        where,
        { expected: names }
      );
      throw STOP;
    }
    const d = st.diagnostics.unexpected('UNEXPECTED', where, names, this.found());
    const why = this.hint ?? this.explain();
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  private explain(): string | undefined {
    const k = this.c.kind;
    if ((CARDINALITY.includes(k) || REL_TYPE.includes(k)) && /^[a-z]/i.test(this.text())) {
      const word = this.text().trim();
      return `\`${word}\` is a cardinality or line word: quote it to use it as text, e.g. \`"${word}"\``;
    }
    if (k === T.End || k === T.ErDiagram || k === T.Subgraph) {
      const word = this.text().trim();
      return `\`${word}\` is a keyword: quote it to use it as a name, e.g. \`"${word}"\``;
    }
    return undefined;
  }

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  private recover(): void {
    const { c } = this;
    if (this.block) {
      syncTo(c, BLOCK_END);
      c.eat(T.BlockStop);
      this.block = undefined;
      return;
    }
    syncTo(c, BOUNDARY);
  }

  /** Run one statement rule; on failure, recover. */
  private statement(rule: () => void): void {
    this.hint = undefined;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
    this.hint = undefined;
    this.block = undefined;
  }

  // ---- document -----------------------------------------------------------------------

  private header(): void {
    const { name: _, range } = this.take([T.ErDiagram]);
    this.st.statement('header', range);
    this.body.push({ id: this.st.ids.statement('header'), type: 'Header', range });
  }

  private document(): void {
    const { c } = this;
    let ended = false;
    for (;;) {
      c.tested(this.frames.length > 0 ? SUBGRAPH_DOC : DOC);
      const k = c.kind;
      if (k === Kind.EOF) break;
      if (k === Kind.Newline) {
        c.next();
        continue;
      }
      if (k === T.Eof) {
        ended = true;
        c.next();
        continue;
      }
      if (k === T.End) {
        if (this.frames.length > 0) this.closeSubgraph();
        else {
          this.st.diagnostics.error(
            'UNEXPECTED_END',
            '`end` without a `subgraph`: remove it, or open a subgraph before it with `subgraph <id>`.',
            this.range()
          );
        }
        c.next();
        continue;
      }
      this.statement(() => this.stmt());
    }
    for (let f = this.frames.pop(); f; f = this.frames.pop()) {
      // A failed header was reported already (one error, one diagnostic).
      if (f.name !== undefined)
        this.st.diagnostics.error(
          'UNCLOSED_SUBGRAPH',
          `Unclosed subgraph: the subgraph opened at line ${this.lineOf(f.node.range.start)} has no \`end\`. Add \`end\` after its last statement.`,
          f.node.nameRange,
          { expected: EXPECTED.names([T.End]) }
        );
      this.st.endStatement(f.span, this.src.length);
      f.node.range.end = this.src.length;
      this.body = f.outer;
      this.items = f.outerItems;
      this.body.push(f.node);
    }
    if (!ended && !this.st.diagnostics.hasErrors) {
      const at = { start: this.src.length, end: this.src.length };
      this.st.diagnostics.error('UNEXPECTED', 'Unexpected end of the text.', at);
    }
  }

  private stmt(): void {
    const { c } = this;
    const k = c.kind;
    if (this.in(ENTITY_NAME)) return this.entityStatement();
    if (k === T.AccTitle || k === T.AccDescr) return this.accessible(k);
    if (k === T.AccDescrMultilineValue) {
      // jison reads an empty value once more where the text ends inside `accDescr {`.
      if (c.start === c.end && c.start === this.src.length) return void c.next();
      const { name, range } = this.take([k]);
      if (this.src[range.end] !== '}' && range.end >= this.textEnd()) {
        const r = this.multilineRange(range);
        this.st.diagnostics.error(
          'UNCLOSED_DESCRIPTION',
          `Unclosed description: the \`accDescr {\` at line ${this.lineOf(r.start)} has no closing \`}\`. Add \`}\` after the description.`,
          { start: r.start, end: Math.min(r.end, r.start + 10) }
        );
        throw STOP;
      }
      const v = name.trim();
      this.db.setAccDescr(v);
      this.items?.push(v);
      return this.simple('AccDescr', 'accDescr', this.multilineRange(range), []);
    }
    if (this.in(DIRECTIONS)) {
      const { range } = this.take(DIRECTIONS);
      const dir = DIRECTION_OF[k] as ErDirection;
      if (this.frames.length === 0) this.db.setDirection(dir);
      else this.items?.push({ dir });
      return this.simple('Direction', 'direction', range, []);
    }
    if (k === T.Style || k === T.ClassDef) return this.styleStatement(k);
    if (k === T.Class) return this.classStatement();
    if (k === T.Subgraph) return this.openSubgraph();
    this.fail(STATEMENT);
  }

  private simple(type: ErSimpleKind, kind: string, range: Range, refs: string[]): void {
    this.st.statement(kind, range);
    const node: ErSimpleNode = { id: this.st.ids.statement(kind), type, range, refs };
    this.body.push(node);
  }

  /**
   * `accDescr { … }` around its value: the lexer emits no token for `accDescr {` and `}`
   * (`accDescr\s*\{\s*`, then `\}`).
   */
  private multilineRange(value: Range): Range {
    const { src } = this;
    const blank = (i: number) => /\s/.test(src[i] ?? '');
    let b = value.start;
    while (b > 0 && blank(b - 1)) b--;
    if (src[b - 1] === '{') {
      b--;
      while (b > 0 && blank(b - 1)) b--;
      if (src.slice(b - 8, b).toLowerCase() === 'accdescr') b -= 8;
      else b = value.start;
    } else b = value.start;
    let e = this.c.tokens.end[this.c.pos - 1] ?? value.end;
    if (src[e] === '}') e++;
    return { start: b, end: e };
  }

  private accessible(k: number): void {
    const start = this.c.start;
    const keyword = this.take([k]);
    const valueKind = k === T.AccTitle ? T.AccTitleValue : T.AccDescrValue;
    const value = this.take([valueKind]);
    const v = value.name.trim();
    if (k === T.AccTitle) this.db.setAccTitle(v);
    else this.db.setAccDescr(v);
    this.items?.push(v);
    const end = value.range.end > keyword.range.end ? value.range : keyword.range;
    const range = this.span(start, end);
    if (k === T.AccTitle) this.simple('AccTitle', 'accTitle', range, []);
    else this.simple('AccDescr', 'accDescr', range, []);
  }

  // ---- entities and relationships -----------------------------------------------------

  private entityName(): Name {
    const kind = this.c.kind;
    const n = this.take(ENTITY_NAME);
    if (kind === T.EntityName) n.name = n.name.replace(/"/g, '');
    return n;
  }

  private mention(n: Name, start = n.range.start): ErEntityNode {
    const id = this.st.ids.node(n.name);
    this.st.symbol(n.name, 'entity', n.range, id === nodeId(n.name) ? 'def' : 'ref');
    return {
      id,
      type: 'Entity',
      name: n.name,
      nameRange: n.range,
      range: { start, end: n.range.end },
    };
  }

  /** `:::a,b`: class names (jison `idList`). */
  private classList(node: ErEntityNode): string[] {
    this.take([T.StyleSeparator]);
    const names = this.idList();
    node.classNames = names.map((n) => n.name);
    for (const n of names) this.st.symbol(n.name, 'class', n.range, 'ref');
    node.range.end = names[names.length - 1]?.range.end ?? node.range.end;
    return node.classNames;
  }

  private idList(): Name[] {
    const out = [this.take(ID, NAME)];
    while (this.c.at(T.Comma)) {
      this.c.next();
      out.push(this.take(ID, NAME));
    }
    return out;
  }

  private entityStatement(): void {
    const { c } = this;
    const a = this.entityName();
    const node = this.mention(a);
    if (c.at(T.Sqs)) {
      c.next();
      this.hint = ALIAS_HINT;
      const alias = this.entityName();
      this.take([T.Sqe]);
      node.alias = alias.name;
      node.aliasRange = alias.range;
      node.range.end = c.tokens.end[c.pos - 1] ?? node.range.end;
      this.reach(node);
      let classes: string[] | undefined;
      if (c.at(T.StyleSeparator)) classes = this.classList(node);
      const attributes =
        this.in(AFTER_ALIAS) && c.at(T.BlockStart) ? this.attributes(node) : undefined;
      this.endEntity(node, alias.name, attributes, classes);
      return;
    }
    let classesA: string[] | undefined;
    if (c.at(T.StyleSeparator)) classesA = this.classList(node);
    this.c.tested(classesA ? AFTER_CLASSES : AFTER_ENTITY);
    if (CARDINALITY.includes(c.kind)) return this.relationship(node, classesA);
    const attributes = c.at(T.BlockStart) ? this.attributes(node) : undefined;
    this.endEntity(node, '', attributes, classesA);
  }

  /** The current token is the last of `node`. */
  private reach(node: ErEntityNode): void {
    node.range.end = Math.max(node.range.end, this.c.tokens.end[this.c.pos - 1] ?? 0);
  }

  private endEntity(
    node: ErEntityNode,
    alias: string,
    attributes: ErAttribute[] | undefined,
    classes: string[] | undefined
  ): void {
    const { db } = this;
    db.addEntity(node.name, nodeId(node.name), node.nameRange, alias);
    if (attributes) db.addAttributes(node.name, attributes);
    if (classes) db.setClass([node.name], classes);
    this.items?.push(node.name);
    this.st.statement('entity', node.range);
    this.body.push(node);
  }

  private cardinality(): ErCardinality {
    const k = this.c.kind;
    this.take(CARDINALITY);
    return CARDINALITIES[k] as ErCardinality;
  }

  private relationship(a: ErEntityNode, classesA: string[] | undefined): void {
    const { c, db } = this;
    this.hint = RELATIONSHIP_HINT;
    const relStart = c.start;
    const cardA = this.cardinality();
    const identifying = c.kind === T.Identifying;
    this.take(REL_TYPE);
    const cardB = this.cardinality();
    const relRange = { start: relStart, end: c.tokens.end[c.pos - 1] ?? relStart };
    const bName = this.entityName();
    const b = this.mention(bName);
    let classesB: string[] | undefined;
    if (this.in(COLON_OR_CLASSES) && c.at(T.StyleSeparator)) classesB = this.classList(b);
    this.take([T.Colon]);
    const roleKind = c.kind;
    const role = this.take(ROLE, LABEL);
    const label = roleKind === T.UnicodeText ? role.name : role.name.replace(/"/g, '');
    const range = this.span(a.range.start, role.range);
    db.addEntity(a.name, nodeId(a.name), a.nameRange);
    db.addEntity(b.name, nodeId(b.name), b.nameRange);
    const id = this.st.ids.edge(a.name, b.name);
    db.addRelationship(
      {
        id,
        from: { name: a.name, subgraph: db.isSubgraph(a.name), cardinality: cardA },
        to: { name: b.name, subgraph: db.isSubgraph(b.name), cardinality: cardB },
        identifying,
        label,
      },
      range
    );
    if (classesA) db.setClass([a.name], classesA);
    if (classesB) db.setClass([b.name], classesB);
    this.items?.push(a.name, b.name);
    this.st.statement('relationship', range);
    const node: ErRelationshipNode = {
      id,
      type: 'Relationship',
      range,
      from: a.name,
      to: b.name,
      relRange,
      label,
      labelRange: role.range,
      children: [a, b],
    };
    this.body.push(node);
  }

  /** Attribute names seen per entity, for the `#2` of a repeated name. */
  private readonly attributeCounts = new Map<string, Map<string, number>>();

  /** `{ … }`: the attributes in source order. */
  private attributes(node: ErEntityNode): ErAttribute[] {
    const { c } = this;
    const open = this.take([T.BlockStart]);
    this.block = open.range;
    this.hint = ATTRIBUTE_HINT;
    const out: ErAttribute[] = [];
    const nodes: ErAttributeNode[] = [];
    let seen = this.attributeCounts.get(node.name);
    if (!seen) this.attributeCounts.set(node.name, (seen = new Map<string, number>()));
    while (!this.in([T.BlockStop])) {
      if (!this.in(ATTRIBUTE_START)) this.fail(ATTRIBUTE_START);
      const start = c.start;
      let type = this.take([T.AttributeWord]).name;
      if (this.char('?')) type += '?';
      const name = this.take([T.AttributeWord]);
      const keys: string[] = [];
      let last = name.range;
      this.c.tested(AFTER_NAME);
      if (c.at(T.AttributeKey)) {
        const k = this.take([T.AttributeKey]);
        keys.push(k.name);
        last = k.range;
        while (this.char(',')) {
          const more = this.take([T.AttributeKey]);
          keys.push(more.name);
          last = more.range;
        }
      }
      if (keys.length > 0 && c.at(T.AttributeKey)) this.fail([T.Char], KEY_COMMA);
      let comment = '';
      if (c.at(T.AttributeComment)) {
        const cm = this.take([T.AttributeComment]);
        comment = cm.name.replace(/"/g, '');
        last = cm.range;
      }
      const n = (seen.get(name.name) ?? 0) + 1;
      seen.set(name.name, n);
      const id = attributeId(node.name, name.name, n);
      out.push({ id, type, name: name.name, keys, comment });
      nodes.push({
        id,
        type: 'Attribute',
        range: { start, end: last.end },
        name: name.name,
        nameRange: name.range,
      });
    }
    const close = this.take([T.BlockStop]);
    this.block = undefined;
    node.blockRange = { start: open.range.start, end: close.range.end };
    node.range.end = close.range.end;
    if (nodes.length > 0) node.children = nodes;
    return out;
  }

  // ---- style, classDef, class ---------------------------------------------------------

  /** A style: its parts joined (blanks between them are dropped, as in v12). */
  private style(): string {
    let s = this.take(STYLE_PART, STYLE_NAMES).name;
    while (this.in(STYLE_PART)) s += this.take(STYLE_PART).name;
    return s;
  }

  private styleStatement(k: number): void {
    const { c } = this;
    this.hint = HINTS[k];
    const start = c.start;
    this.take([k]);
    const ids = this.idList();
    const styles = [this.style()];
    while (c.at(T.Comma)) {
      c.next();
      styles.push(this.style());
    }
    const lastEnd = c.tokens.end[c.pos - 1] ?? start;
    this.take(SEPARATOR);
    const names = ids.map((n) => n.name);
    const range = { start, end: lastEnd };
    if (k === T.Style) {
      this.db.addCssStyles(names, styles);
      for (const n of ids) this.st.symbol(n.name, 'entity', n.range, 'ref');
      this.items?.push(this.word(start));
      this.simple('Style', 'style', range, names);
    } else {
      this.db.addClass(names, styles);
      for (const n of ids) this.st.symbol(n.name, 'class', n.range, 'def');
      this.items?.push(this.word(start));
      this.simple('ClassDef', 'classDef', range, names);
    }
  }

  /** The keyword at `start` as written (v12's `$$ = $STYLE`). */
  private word(start: number): string {
    let e = start;
    while (e < this.src.length && /[A-Za-z]/.test(this.src[e] ?? '')) e++;
    return this.src.slice(start, e);
  }

  private classStatement(): void {
    const { c } = this;
    this.hint = HINTS[T.Class];
    const start = c.start;
    this.take([T.Class]);
    const ids = this.idList();
    const classes = this.idList();
    const range = { start, end: classes[classes.length - 1]?.range.end ?? start };
    const names = ids.map((n) => n.name);
    this.db.setClass(
      names,
      classes.map((n) => n.name)
    );
    for (const n of ids) this.st.symbol(n.name, 'entity', n.range, 'ref');
    for (const n of classes) this.st.symbol(n.name, 'class', n.range, 'ref');
    this.items?.push(this.word(start));
    this.simple('Class', 'class', range, [...names, ...classes.map((n) => n.name)]);
  }

  // ---- subgraphs ----------------------------------------------------------------------

  private openSubgraph(): void {
    const { c, st } = this;
    const start = c.start;
    const keyword = this.take([T.Subgraph]);
    const node: ErSubgraphNode = {
      id: '',
      type: 'Subgraph',
      name: '',
      nameRange: keyword.range,
      range: { start, end: start },
      children: [],
    };
    const frame: Frame = {
      node,
      name: undefined,
      title: '',
      items: [],
      span: st.beginStatement('subgraph', start),
      outer: this.body,
      outerItems: this.items,
    };
    // A failed header still opens the subgraph, so its `end` closes it (one error, one
    // diagnostic).
    this.frames.push(frame);
    this.body = node.children;
    this.items = frame.items;
    if (this.frames.length > this.maxDepth) {
      st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Subgraphs are nested ${this.frames.length} deep here, over the limit of ${this.maxDepth}. The limit is set by the page or app that renders the diagram.`,
        keyword.range
      );
    }
    try {
      this.hint = HINTS[T.Subgraph];
      const id = this.entityName();
      node.name = id.name.trim();
      node.nameRange = id.range;
      let title = id.name;
      if (c.at(T.Sqs)) {
        c.next();
        const parts = [this.entityName().name];
        while (this.in(ENTITY_NAME)) parts.push(this.entityName().name);
        this.take([T.Sqe]);
        title = parts.join(' ');
        node.title = title;
      }
      this.take(SEPARATOR);
      frame.name = node.name;
      frame.title = title;
      st.symbol(node.name, 'subgraph', id.range, 'def');
    } finally {
      node.id =
        frame.name !== undefined ? st.ids.subgraph(frame.name) : st.ids.statement('subgraph');
    }
  }

  private closeSubgraph(): void {
    const f = this.frames.pop() as Frame;
    const end = this.range().end;
    this.st.endStatement(f.span, end);
    f.node.range.end = end;
    this.body = f.outer;
    this.items = f.outerItems;
    this.body.push(f.node);
    if (f.name === undefined) return;
    this.db.addSubgraph(f.node.id, f.name, f.title, f.items);
    this.items?.push(f.name);
  }
}
