// cspell:words LALR accdescr acctitle docref verifymethod
/**
 * Requirement parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #560), producing a {@link RequirementModel}, the typed AST, statement spans and
 * diagnostics (DESIGN §4.3), the symbols (D437) and, with a probe, what it expects at the probed
 * offset (R-LANG-7: `ProbeCursor`, and `tested` where a rule looks at a token's kind itself).
 *
 * The grammar is v12's `requirementDiagram.jison` (LALR), ported rule for rule;
 * `grammar/requirement.ebnf` is the normative form. Statements need no separator, as in v12:
 * two quoted relations may share a line with nothing between them. The DB actions are v12's
 * (`./builder.ts`); a body's repeated field keeps its first value (jison's right recursion ran
 * the last action first).
 *
 * Two kinds the lexer adds where jison returns no token:
 * - `NewlineAfterBlank` (D431, GAPS #560): a line break after blanks. It is the line break
 *   where the grammar needs one (after `requirementDiagram`, after `{`, after a field's value),
 *   which v12 rejected, and is skipped anywhere else, where v12's `\s+` swallowed it: so the six
 *   forms v12 accepts that way (`requirement ⏎ a {`, `a - traces ⏎-> b`, …) keep their model;
 * - `StyleEnd`: the line break that ends a `style`, `classDef` or `class` statement. jison
 *   popped its style state there with no token, so the parser skips it inside a statement too,
 *   and recovery stops at it.
 *
 * As decided for v13: a `direction` statement ends its line (D432; GAPS #560): text after it
 * on the line is one diagnostic, where v12 dropped it silently.
 *
 * Unlike jison the parser does not stop at the first error: it reports it, skips to the next
 * line (inside a body, to the next line of the body) and carries on (R-PARSE-4). A definition
 * whose header or body fails is still added, so its `}` closes it (one error, one diagnostic).
 */
import {
  Kind,
  LineIndex,
  ParseState,
  Probe,
  ProbeCursor,
  syncTo,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import type { KindSet, ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  RelationshipKind,
  RequirementDirection,
  RequirementKind,
  RequirementModel,
} from '../model.ts';
import type {
  ElementDefNode,
  RequirementDefNode,
  RequirementDocument,
  RequirementFieldNode,
  RequirementSimpleNode,
  RequirementStatementNode,
  RequirementText,
} from './ast.ts';
import { RequirementBuilder } from './builder.ts';
import type { ElementFields, Ref, RequirementFields } from './builder.ts';
import { NameIds } from './ids.ts';
import { symbolsOf } from './symbols.ts';
import type { Occurrence } from './symbols.ts';
import { lex, requirementView } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import {
  BODY_BOUNDARY,
  BOUNDARY,
  BRACE_LINE_HINT,
  CLASSDEF_HINT,
  CLASS_HINT,
  CLASS_NAMES,
  DIRECTIONS,
  DIRECTION_HINT,
  DIRECTION_OF,
  ELEMENT_FIELDS,
  ELEMENT_FIELD_HINT,
  ELEMENT_HINT,
  EMPTY_QUOTES_HINT,
  ENDS_BODY,
  EXPECTED,
  FIELD_LINE_HINT,
  HEADER_HINT,
  HEADER_LINE_HINT,
  HEADER_SYNC,
  ID_ITEM,
  KEYWORDS,
  KIND_OF,
  METHODS,
  METHOD_OF,
  NAME,
  NAMES,
  NEWLINES,
  PERCENT_HINT,
  PROBE_FOLLOWS,
  RELATION_HINT,
  RELS,
  REL_OF,
  REQUIREMENT_FIELD_HINT,
  REQUIREMENT_HINT,
  REQ_FIELDS,
  REQ_KINDS,
  RISKS,
  RISK_OF,
  SHORTHAND_HINT,
  SOFT,
  STATEMENT,
  STATEMENT_HINT,
  STRAY_BRACE_HINT,
  STYLE_CHAR_HINT,
  STYLE_HINT,
  STYLE_PART,
  TEXT_VALUE,
  TITLE_HINT,
} from './syntax.ts';
import { T } from './tokens.ts';

export interface RequirementParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /**
   * Entries `style`, `class` and `classDef` statements may add to boxes and classes before
   * the model records the overflow (`styleCopies`, D433); default `MAX_STYLE_COPIES`.
   */
  maxStyleCopies?: number;
  /** Requirement and element cap (core `DEFAULT_LIMITS.maxNodes`, D608). */
  maxNodes?: number;
  /** Relationship cap (core `DEFAULT_LIMITS.maxEdges`, D608). */
  maxEdges?: number;
}

export type RequirementParseResult = ParseResult<RequirementModel, RequirementDocument>;

/** The first line of a text, for messages. */
const FIRST_LINE = /^[^\n]*/;

/** Parse a requirement diagram. Never throws: problems are error diagnostics. */
export function parseRequirement(
  src: string,
  options: RequirementParseOptions = {}
): RequirementParseResult {
  return new RequirementParser(src, options).parse();
}

interface Taken {
  j: number;
  kind: number;
  text: string;
  range: Range;
}

/** What a body's lines give: the fields in order and what the model keeps. */
interface Body<F> {
  nodes: RequirementFieldNode[];
  /** The fields read so far (the model fills in the rest with `''`). */
  fields: Partial<F>;
  /** Keys read so far: a repeated one keeps the first value. */
  seen: Set<string>;
  range: Range;
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails records
 * a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class RequirementParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: Lexed;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly probe: Probe | undefined;
  private readonly db: RequirementBuilder;
  private readonly ids = new NameIds();
  private readonly children: RequirementStatementNode[] = [];
  /** Name and class occurrences in the order read; roles and kinds are settled at the end. */
  private readonly occurrences: Occurrence[] = [];
  private lines: LineIndex | undefined;
  /** The token after the last one consumed: soft tokens after it are not part of a rule. */
  private mark = 0;
  /** The range of the last token consumed. */
  private last: Range = { start: 0, end: 0 };
  /** The text ended inside a string or description, which was reported. */
  private exhausted = false;
  /** jison's `EOF` was read. */
  private ended = false;
  /** The hint for errors in the statement being read. */
  private hint: string | undefined;

  constructor(
    private readonly src: string,
    private readonly options: RequirementParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const { from, view } = requirementView(src, pre);
    const probe =
      options.probe === undefined
        ? undefined
        : (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
    this.lexed = lex(src, from, view, probe);
    if (probe === undefined) this.c = new TokenCursor(this.lexed.tokens);
    else {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      this.c = new ProbeCursor(this.lexed.tokens, probe);
    }
    this.mark = this.c.pos;
    this.db = new RequirementBuilder(options, this.st.diagnostics);
  }

  parse(): RequirementParseResult {
    const { st, pre, src } = this;
    this.header();
    this.document();
    const built = this.db.model(pre.frontMatter?.title, (at) => this.lineOf(at));
    st.diagnostics.list.push(...built.warnings);
    // Warnings are made after the statements are read: keep source order.
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    for (const o of symbolsOf(this.occurrences, built.model)) {
      st.symbol(o.name, o.kind, o.range, o.role);
    }
    const model: RequirementModel = {
      ...built.model,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: RequirementDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.lexed.tokens, this.options, this.probe);
  }

  private recordNames(as: Occurrence['as'], names: readonly RequirementText[]): void {
    for (const n of names) this.occurrences.push({ as, name: n.text, range: n.range });
  }

  // ---- tokens -------------------------------------------------------------------------

  private range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /**
   * Whether the token at the cursor, past any soft token (a line break after blanks, the end
   * of a style line), is one of `kinds`. The cursor moves past the soft tokens either way.
   */
  private in(kinds: readonly number[]): boolean {
    this.skipSoft(false);
    this.test(kinds);
    return kinds.includes(this.c.kind);
  }

  /**
   * Step over what jison never returned to its parser: the end of a style line, an empty
   * `accDescr {}` (no value token, so v12 read nothing there, even inside a statement) and,
   * unless `newlines`, a line break after blanks (D431: v12's `\s+` swallowed it).
   */
  private skipSoft(newlines: boolean): void {
    const { c } = this;
    for (;;) {
      const k = c.kind;
      if (k === T.StyleEnd || (k === T.NewlineAfterBlank && !newlines)) c.next();
      else if (k === T.AccDescrOpen && c.peek() === T.AccDescrClose) {
        c.next();
        c.next();
      } else return;
    }
  }

  /**
   * Tell a probe the rule tests the token at the cursor for `kinds`, and the soft tokens (and
   * trivia) the cursor stepped over just before it: a probe on one of those expects the same.
   */
  private test(kinds: number | readonly number[]): void {
    const { c } = this;
    c.tested(kinds);
    if (this.probe === undefined) return;
    const at = c.pos;
    const { kind } = c.tokens;
    for (let j = at - 1; j >= 0 && SOFT[kind[j] ?? 0] === 1; j--) {
      c.pos = j;
      c.tested(kinds);
    }
    c.pos = at;
  }

  /** Consume a token of one of `kinds` (past soft tokens), or fail. */
  private take(kinds: readonly number[], names?: string[]): Taken {
    if (!this.in(kinds)) this.fail(kinds, names);
    return this.consume();
  }

  /** Consume the token at the cursor. */
  private consume(): Taken {
    const { c } = this;
    const j = c.pos;
    const out = { j, kind: c.kind, text: this.lexed.text(j), range: this.range(j) };
    c.next();
    this.mark = c.pos;
    this.last = out.range;
    return out;
  }

  /** Consume a line break (a plain one, or one after blanks: D431), or fail. */
  private newline(hint: string): void {
    const { c } = this;
    this.skipSoft(true);
    this.test(NEWLINES);
    if (NEWLINES.includes(c.kind)) {
      c.next();
      this.mark = c.pos;
      return;
    }
    this.hint = hint;
    this.fail(NEWLINES);
  }

  /** At a line end: a line break, the end of a style line or the end of the text. */
  private atLineEnd(): boolean {
    const k = this.c.kind;
    return BOUNDARY[k] === 1;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** How an error message names the token at the cursor. */
  private found(): string {
    const { c } = this;
    const k = c.kind;
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (NEWLINES.includes(k) || k === T.StyleEnd) return 'a line break';
    if (k === T.Quote) return 'a `"`';
    const raw = this.src.slice(c.start, c.end);
    if (k === Kind.Error) {
      if (raw === '\t') return 'a tab';
      if (/^\s$/.test(raw)) return 'a blank other than a space';
      return `\`${raw}\``;
    }
    const t = (raw.trim() || this.lexed.text(c.pos).trim()).replace(/\s+/g, ' ');
    if (t === '') return 'blanks';
    const line = FIRST_LINE.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${cut}\``;
  }

  /** Why the token at the cursor cannot stand here, beyond what was expected. */
  private explain(want: readonly number[]): string | undefined {
    const { c } = this;
    const k = c.kind;
    if (k === T.Title) return TITLE_HINT;
    if (k === T.Percent) return PERCENT_HINT;
    if (k === T.StructStop && want.includes(T.UnqString)) return STRAY_BRACE_HINT;
    if (
      KEYWORDS[k] === 1 &&
      (want.includes(T.UnqString) || want.includes(T.Alpha)) &&
      /^[a-z]/i.test(this.lexed.text(c.pos))
    ) {
      const word = this.lexed.text(c.pos).trim();
      return `\`${word}\` is a keyword: put it in quotes to use it as a name or text, e.g. \`"${word}"\``;
    }
    return undefined;
  }

  /**
   * Report what was found where one of `want` was expected (`names`: what the message says
   * was expected, when the kinds' table names do not fit), then stop the statement. When a
   * style line ended before the token, recovery starts there.
   */
  private fail(want: readonly number[], names = EXPECTED.names(want)): never {
    const { st, c } = this;
    this.test(want);
    const k = c.kind;
    const at =
      k === Kind.EOF || k === T.Eof || NEWLINES.includes(k)
        ? { start: c.start, end: c.start }
        : c.range;
    const hint = this.explain(want) ?? this.hint;
    if (k === Kind.Error) {
      const inStyle =
        this.hint === STYLE_HINT || this.hint === CLASSDEF_HINT || this.hint === CLASS_HINT;
      const why = inStyle ? STYLE_CHAR_HINT : hint;
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character ${this.found()}${why ? `; ${why}` : ''}.`,
        at,
        { expected: names }
      );
    } else {
      st.diagnostics.unexpected('UNEXPECTED', at, names, this.found(), undefined, hint);
    }
    const tokens = c.tokens;
    for (let j = this.mark; j < c.pos; j++) {
      if (tokens.kind[j] === T.StyleEnd) {
        c.pos = j;
        break;
      }
    }
    throw STOP;
  }

  /** Run one statement rule; on failure, skip to the next line. */
  private statement(rule: () => void, boundary: KindSet = BOUNDARY): void {
    const { c } = this;
    const from = c.pos;
    this.hint = undefined;
    this.mark = from;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      syncTo(c, boundary);
    }
    this.hint = undefined;
    // Every statement moves on (a rule that fails on its first token is skipped past it).
    if (c.pos === from && boundary[c.kind] !== 1) c.next();
  }

  private unclosedString(open: Range): never {
    this.st.diagnostics.error(
      'UNCLOSED_STRING',
      `Unclosed string: the \`"\` at line ${this.lineOf(open.start)} has no closing \`"\`. Add \`"\` after the text.`,
      { start: open.start, end: open.start + 1 }
    );
    this.exhausted = true;
    throw STOP;
  }

  // ---- document -----------------------------------------------------------------------

  private header(): void {
    const { c, st } = this;
    if (!this.in([T.Rd])) {
      this.statement(() => {
        this.hint = HEADER_HINT;
        this.fail([T.Rd]);
      });
      return;
    }
    const { range } = this.consume();
    st.statement('header', range);
    this.children.push({ id: st.ids.statement('header'), type: 'Header', range });
    if (NEWLINES.includes(c.kind)) {
      c.next();
      return;
    }
    // The statements on the header's line are still read (one error, one diagnostic).
    try {
      this.newline(HEADER_LINE_HINT);
    } catch (error) {
      if (error !== STOP) throw error;
    }
  }

  private document(): void {
    const { c, st } = this;
    for (;;) {
      const k = c.kind;
      this.test(STATEMENT);
      if (k === Kind.EOF) break;
      if (k === T.NewlineAfterBlank || k === T.StyleEnd || k === Kind.Newline) {
        c.next();
        continue;
      }
      if (k === T.Eof) {
        this.ended = true;
        c.next();
        continue;
      }
      this.statement(() => this.stmt());
    }
    if (!this.ended && !this.exhausted && !st.diagnostics.hasErrors) {
      const at = { start: this.src.length, end: this.src.length };
      st.diagnostics.error('UNEXPECTED', 'Unexpected end of the text.', at);
    }
  }

  private stmt(): void {
    const { c } = this;
    this.test(STATEMENT);
    const k = c.kind;
    if (REQ_KINDS.includes(k)) return this.box(false);
    if (k === T.Element) return this.box(true);
    if (NAME.includes(k)) return this.nameStatement();
    if (k === T.AccTitle || k === T.AccDescr) return this.accessible(k);
    if (k === T.AccDescrOpen) return this.accDescrBlock();
    if (DIRECTIONS.includes(k)) return this.direction();
    if (k === T.Style || k === T.ClassDef) return this.styleStatement(k);
    if (k === T.Class) return this.classStatement();
    this.hint = STATEMENT_HINT;
    this.fail(STATEMENT);
  }

  /** Record a statement with no box of its own: its span and its AST node. */
  private simple({ kind, id = this.st.ids.statement(kind), ...node }: SimpleParts): void {
    this.st.statement(kind, node.range);
    this.children.push({ id, ...node });
  }

  // ---- names --------------------------------------------------------------------------

  /** A name or text: an unquoted string, or one in quotes (v12's `unqString | qString`). */
  private name(names: string[] = NAMES): RequirementText {
    if (!this.in(NAME)) this.fail(NAME, names);
    if (this.c.kind === T.UnqString) {
      const t = this.consume();
      return { text: t.text, quoted: false, range: t.range };
    }
    return this.quoted();
  }

  /** `"…"`: the quotes and the text between them, which may span lines. */
  private quoted(): RequirementText {
    const { c } = this;
    const open = this.consume().range;
    if (c.kind === T.Quote) {
      this.hint = EMPTY_QUOTES_HINT;
      this.fail([T.QString], TEXT_VALUE);
    }
    if (c.kind !== T.QString) this.unclosedString(open);
    const value = this.consume();
    if (c.kind !== T.Quote) this.unclosedString(open);
    const close = this.consume().range;
    return { text: value.text, quoted: true, range: { start: open.start, end: close.end } };
  }

  /** `idList`: names separated by `,` (in a style statement a name may be `ALPHA`). */
  private idList(names: string[] = NAMES): RequirementText[] {
    const out = [this.idItem(names)];
    while (this.in([T.Comma])) {
      this.consume();
      out.push(this.idItem(names));
    }
    return out;
  }

  private idItem(names: string[]): RequirementText {
    if (!this.in(ID_ITEM)) this.fail(ID_ITEM, names);
    if (this.c.kind === T.Alpha) {
      const t = this.consume();
      return { text: t.text, quoted: false, range: t.range };
    }
    return this.name(names);
  }

  // ---- requirements and elements ------------------------------------------------------

  /** `requirement name { … }` (any of the six kinds) or `element name { … }`. */
  private box(element: boolean): void {
    const { c, st } = this;
    const start = c.start;
    this.hint = element ? ELEMENT_HINT : REQUIREMENT_HINT;
    const keyword = this.consume();
    const range = { start, end: keyword.range.end };
    const name = { text: '', quoted: false, range: keyword.range };
    const node: RequirementDefNode | ElementDefNode = element
      ? { id: '', type: 'Element', range, name, fields: [] }
      : { id: '', type: 'Requirement', range, name, fields: [], keyword: keyword.text };
    let body: Body<RequirementFields | ElementFields> | undefined;
    try {
      this.boxHeader(node);
      body = this.body(node, element ? ELEMENT_BODY : REQUIREMENT_BODY);
    } finally {
      const named = node.name.text !== '' || node.name.quoted;
      const kind = element ? 'element' : 'requirement';
      node.id = named ? this.ids.named(kind, node.name.text) : st.ids.statement(kind);
      node.range.end = Math.max(node.range.end, this.last.end);
      if (named) {
        this.recordNames(kind, [node.name]);
        const at = { ast: node.id, range: node.range, nameRange: node.name.range };
        const fields = body?.fields;
        if (element) this.db.addElement(node.name.text, at, { ...emptyElement(), ...fields });
        else {
          const k = KIND_OF[keyword.kind] as RequirementKind;
          this.db.addRequirement(node.name.text, k, at, { ...emptyRequirement(), ...fields });
        }
        this.classes(node);
      }
      st.statement(kind, node.range);
      this.children.push(node);
    }
  }

  /** v12's `setClass([$2], $4)` after the definition's `:::`. */
  private classes(node: RequirementDefNode | ElementDefNode): void {
    if (!node.classNames) return;
    this.recordNames('class', node.classNames);
    this.db.setClass(
      [{ name: node.name.text, range: node.name.range }],
      node.classNames.map((n) => n.text),
      { ast: node.id, range: node.range }
    );
  }

  /** `name [::: classes] {`. A header that fails still opens its body when a `{` follows. */
  private boxHeader(node: RequirementDefNode | ElementDefNode): void {
    const { c } = this;
    try {
      node.name = this.name();
      if (this.in([T.StyleSeparator])) {
        this.consume();
        node.classNames = this.idList(CLASS_NAMES);
      }
      if (!this.in([T.StructStart])) this.fail([T.StyleSeparator, T.StructStart]);
    } catch (error) {
      if (error !== STOP) throw error;
      // Read on from the `{` of the same line, or one on the next line (one error, one
      // diagnostic): the fields after it are the body's.
      syncTo(c, HEADER_SYNC);
      if (c.kind !== T.StructStart) {
        const back = c.pos;
        while (NEWLINES.includes(c.kind)) c.next();
        if (c.kind !== T.StructStart) {
          c.pos = back;
          throw STOP;
        }
      }
    }
  }

  /**
   * `{`, a line break, then `key: value` lines and blank lines up to `}`. An error in a line
   * skips to the end of that line, inside the body. A statement keyword or the end of the text
   * before the `}` ends the body there (one error, one diagnostic).
   */
  private body(
    node: RequirementDefNode | ElementDefNode,
    { own, other, otherHint }: BodyKind
  ): Body<RequirementFields | ElementFields> {
    const { c } = this;
    const open = this.consume().range;
    const body: Body<RequirementFields | ElementFields> = {
      nodes: node.fields,
      fields: {},
      seen: new Set(),
      range: { start: open.start, end: open.end },
    };
    node.bodyRange = body.range;
    const close = () => {
      body.range.end = this.last.end;
      return body;
    };
    this.statement(() => {
      if (c.kind === T.StructStop) {
        this.hint = BRACE_LINE_HINT;
        this.fail(NEWLINES);
      }
      this.newline(BRACE_LINE_HINT);
    }, BODY_BOUNDARY);
    for (;;) {
      const k = c.kind;
      this.test(own);
      this.test(T.StructStop);
      if (NEWLINES.includes(k) || k === T.StyleEnd) {
        c.next();
        continue;
      }
      if (k === T.AccDescrOpen && c.peek() === T.AccDescrClose) {
        this.skipSoft(true);
        continue;
      }
      if (k === T.StructStop) {
        this.consume();
        return close();
      }
      if (ENDS_BODY[k] === 1) {
        if (!this.exhausted) this.unclosedBody(open, node);
        return close();
      }
      this.statement(() => {
        if (other.includes(k)) {
          this.hint = otherHint;
          this.fail(own);
        }
        if (!own.includes(k)) this.fail([...own, T.StructStop]);
        const key = this.consume();
        this.take([T.ColonSep]);
        this.record(body, key, this.value(key));
        this.newline(FIELD_LINE_HINT);
      }, BODY_BOUNDARY);
    }
  }

  private unclosedBody(open: Range, node: RequirementDefNode | ElementDefNode): void {
    const last = node.fields[node.fields.length - 1];
    const tail = last?.value.trimEnd().endsWith('}')
      ? ' (a `}` after a value on its line is part of the value)'
      : '';
    const what = node.type === 'Requirement' ? 'requirement' : 'element';
    this.st.diagnostics.error(
      'UNCLOSED_BLOCK',
      `Unclosed ${what}: the \`{\` at line ${this.lineOf(open.start)} has no closing \`}\`${tail}. Add \`}\` on a line of its own after the last field.`,
      open,
      { expected: EXPECTED.names([T.StructStop]) }
    );
  }

  /** Record a field line; the first of a repeated key is the one the model keeps. */
  private record(body: Body<RequirementFields | ElementFields>, key: Taken, field: Field): void {
    body.nodes.push({
      key: field.key,
      keyRange: key.range,
      value: field.value,
      valueRange: field.range,
    });
    if (body.seen.has(field.key)) return;
    body.seen.add(field.key);
    (body.fields as Record<string, string>)[FIELD_SLOT[field.key]] = field.value;
  }

  /** A field's value: a risk or method in its display form, else a name or text. */
  private value(key: Taken): Field {
    if (key.kind === T.Risk) {
      const v = this.take(RISKS);
      return { key: 'risk', value: RISK_OF[v.kind] ?? '', range: v.range };
    }
    if (key.kind === T.VerifyMethod) {
      const v = this.take(METHODS);
      return { key: 'verifyMethod', value: METHOD_OF[v.kind] ?? '', range: v.range };
    }
    const v = this.name(TEXT_VALUE);
    return { key: FIELD_KEY[key.kind] ?? 'text', value: v.text, range: v.range };
  }

  // ---- relations and the class shorthand ----------------------------------------------

  /** `a - kind -> b`, `b <- kind - a` or `a:::class,…`. */
  private nameStatement(): void {
    const { c } = this;
    const start = c.start;
    const a = this.name();
    if (/^direction\b/i.test(a.text) && !a.quoted) this.hint = DIRECTION_HINT;
    if (this.in([T.StyleSeparator])) {
      this.hint = SHORTHAND_HINT;
      this.consume();
      const classNames = this.idList(CLASS_NAMES);
      const range = { start, end: this.last.end };
      const id = this.st.ids.statement('class');
      this.recordNames('name', [a]);
      this.recordNames('class', classNames);
      this.db.setClass(
        [{ name: a.text, range: a.range }],
        classNames.map((n) => n.text),
        { ast: id, range }
      );
      this.simple({ type: 'Class', kind: 'class', range, targets: [a], classNames, id });
      return;
    }
    this.hint ??= RELATION_HINT;
    if (!this.in([T.Line, T.EndArrowL])) this.fail([T.Line, T.EndArrowL, T.StyleSeparator]);
    const left = this.consume().kind === T.EndArrowL;
    const rel = this.take(RELS);
    this.take([left ? T.Line : T.EndArrowR]);
    const b = this.name();
    const [src, dst] = left ? [b, a] : [a, b];
    const kind = REL_OF[rel.kind] as RelationshipKind;
    const range = { start, end: b.range.end };
    const id = this.ids.relation(src.text, dst.text);
    this.recordNames('name', [a, b]);
    this.db.addRelationship(kind, src.text, dst.text, { ast: id, range });
    this.st.statement('relation', range);
    this.children.push({ id, type: 'Relation', range, kind, src, dst });
  }

  // ---- accessibility and direction ----------------------------------------------------

  private accessible(k: number): void {
    const { c } = this;
    const title = k === T.AccTitle;
    const keyword = this.consume();
    const value = this.consume();
    if (value.kind !== (title ? T.AccTitleValue : T.AccDescrValue)) {
      // Never reached: the lexer's value state always gives one.
      c.pos = value.j;
      this.fail([title ? T.AccTitleValue : T.AccDescrValue]);
    }
    if (value.range.start === value.range.end && value.range.end >= this.src.length) {
      this.st.diagnostics.error(
        'UNEXPECTED',
        `The accessible ${title ? 'title' : 'description'} is missing: write it after \`${title ? 'accTitle' : 'accDescr'}:\`.`,
        keyword.range
      );
      this.exhausted = true;
      throw STOP;
    }
    const v = value.text.trim();
    if (title) this.db.setAccTitle(v);
    else this.db.setAccDescr(v);
    const range = { start: keyword.range.start, end: trimEnd(this.src, value.range).end };
    if (title) this.simple({ type: 'AccTitle', kind: 'accTitle', range });
    else this.simple({ type: 'AccDescr', kind: 'accDescr', range });
  }

  /** `accDescr { … }`: the description runs to the first `}`, over lines. */
  private accDescrBlock(): void {
    const { c } = this;
    const open = this.consume().range;
    let value: Taken | undefined;
    if (c.kind === T.AccDescrMultilineValue) value = this.consume();
    if (c.kind !== T.AccDescrClose) {
      this.st.diagnostics.error(
        'UNCLOSED_DESCRIPTION',
        `Unclosed description: the \`accDescr {\` at line ${this.lineOf(open.start)} has no closing \`}\`. Add \`}\` after the description.`,
        { start: open.start, end: Math.min(open.end, open.start + 10) }
      );
      this.exhausted = true;
      throw STOP;
    }
    const close = this.consume().range;
    const range = { start: open.start, end: close.end };
    // `accDescr {}`: jison read no value, so v12 set no description and has no statement.
    if (!value) {
      this.st.statement('accDescr', range);
      return;
    }
    this.db.setAccDescr(value.text.trim());
    this.simple({ type: 'AccDescr', kind: 'accDescr', range });
  }

  /** `direction LR`: a statement of its own line (D432); text after it is one error. */
  private direction(): void {
    const { c, st } = this;
    const d = this.consume();
    this.db.setDirection(DIRECTION_OF[d.kind] as RequirementDirection);
    this.simple({ type: 'Direction', kind: 'direction', range: d.range });
    if (this.atLineEnd()) return;
    const from = c.range;
    let to = from;
    while (!this.atLineEnd()) {
      to = c.range;
      c.next();
    }
    const text = this.src.slice(from.start, to.end).replace(/\s+/g, ' ');
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    st.diagnostics.error(
      'UNEXPECTED',
      `Unexpected \`${shown}\` after \`${d.text.replace(/\s+/g, ' ')}\`; a direction statement ends its line: move what follows to a line of its own.`,
      { start: from.start, end: to.end },
      { expected: EXPECTED.names(NEWLINES) }
    );
  }

  // ---- style, classDef, class ---------------------------------------------------------

  /** A style: its parts joined (v12 skipped the spaces between them). */
  private style(): string {
    let s = this.take(STYLE_PART).text;
    while (this.in(STYLE_PART)) s += this.consume().text;
    return s;
  }

  private styles(): string[] {
    const out = [this.style()];
    while (this.in([T.Comma])) {
      this.consume();
      out.push(this.style());
    }
    return out;
  }

  private styleStatement(k: number): void {
    const { c } = this;
    const style = k === T.Style;
    this.hint = style ? STYLE_HINT : CLASSDEF_HINT;
    const start = c.start;
    this.consume();
    const ids = this.idList(style ? NAMES : CLASS_NAMES);
    const styles = this.styles();
    const range = { start, end: this.last.end };
    this.recordNames(style ? 'name' : 'classDef', ids);
    if (style) {
      const id = this.st.ids.statement('style');
      this.db.setCssStyle(refs(ids), styles, { ast: id, range });
      this.simple({ type: 'Style', kind: 'style', range, targets: ids, id });
      return;
    }
    const id = this.ids.named('classDef', ids[0]?.text ?? '');
    this.db.defineClass(
      ids.map((n) => n.text),
      styles,
      { ast: id, range }
    );
    this.simple({ type: 'ClassDef', kind: 'classDef', range, classNames: ids, id });
  }

  private classStatement(): void {
    const { c } = this;
    this.hint = CLASS_HINT;
    const start = c.start;
    this.consume();
    const ids = this.idList();
    const classNames = this.idList(CLASS_NAMES);
    const range = { start, end: this.last.end };
    const id = this.st.ids.statement('class');
    this.recordNames('name', ids);
    this.recordNames('class', classNames);
    this.db.setClass(
      refs(ids),
      classNames.map((n) => n.text),
      { ast: id, range }
    );
    this.simple({ type: 'Class', kind: 'class', range, targets: ids, classNames, id });
  }
}

/** A field line's key and value, as read. */
interface Field {
  key: RequirementFieldNode['key'];
  value: string;
  range: Range;
}

/** What a body of each kind takes: its own keys, and the other kind's (an error with a hint). */
interface BodyKind {
  own: readonly number[];
  other: readonly number[];
  otherHint: string;
}
const REQUIREMENT_BODY: BodyKind = {
  own: REQ_FIELDS,
  other: ELEMENT_FIELDS,
  otherHint: REQUIREMENT_FIELD_HINT,
};
const ELEMENT_BODY: BodyKind = {
  own: ELEMENT_FIELDS,
  other: REQ_FIELDS,
  otherHint: ELEMENT_FIELD_HINT,
};

/** The AST key of each text field's keyword. */
const FIELD_KEY: Readonly<Record<number, RequirementFieldNode['key']>> = {
  [T.Id]: 'id',
  [T.Text]: 'text',
  [T.Type]: 'type',
  [T.DocRef]: 'docRef',
};

/** A statement with no box of its own (`simple`): its node, its span's kind, maybe its id. */
type SimpleParts = Omit<RequirementSimpleNode, 'id'> & { kind: string; id?: string };

/** The model's field each body key fills. */
const FIELD_SLOT: Readonly<Record<RequirementFieldNode['key'], string>> = {
  id: 'requirementId',
  text: 'text',
  risk: 'risk',
  verifyMethod: 'verifyMethod',
  type: 'type',
  docRef: 'docRef',
};

const emptyRequirement = (): RequirementFields => ({
  requirementId: '',
  text: '',
  risk: '',
  verifyMethod: '',
});

const emptyElement = (): ElementFields => ({ type: '', docRef: '' });

const refs = (names: readonly RequirementText[]): Ref[] =>
  names.map((n) => ({ name: n.text, range: n.range }));

/** `range` without the blanks at its end. */
function trimEnd(src: string, range: Range): Range {
  let end = range.end;
  while (end > range.start && /\s/.test(src[end - 1] ?? '')) end--;
  return { start: range.start, end };
}
