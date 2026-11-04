/**
 * State parser: recursive descent over the {@link lex} tokens, producing a {@link StateModel},
 * the typed AST, symbols, statement spans and diagnostics (DESIGN §4.2, R-PARSE-3).
 *
 * The grammar is v12's `stateDiagram.jison` (LALR), ported rule by rule; the normative form is
 * `grammar/state.ebnf`. Statements need no separator: a line break is a statement of its own,
 * so `A B` is two states, as in v12. Unlike jison the parser does not stop at the first error:
 * it reports it, skips to the next line break (or the `}` closing the composite state it is
 * in) and carries on (R-PARSE-4).
 *
 * jison's lexer threw on `state a b {`; the lexer writes a token there and the parser reports
 * it. Tokens for text jison consumed without a terminal (the `state` keyword, quotes,
 * `<<fork>>`-style markers, `end note`, …) only widen the ranges of the terminals around them.
 */
// cspell:words LALR
import { Kind, LineIndex, ParseState, Probe, skipTo } from '@mermaid-js/core/parser-kit';
import type { ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  StateCompositeStmt,
  StateDocument,
  StateHeader,
  StateNoteStmt,
  StateSimpleKind,
  StateSimpleStmt,
  StateStatementNode,
  StateStmt,
  StateTransitionStmt,
} from './ast.ts';
import type { lex } from './lexer.ts';
import { StateBuilder } from './model.ts';
import type { Item, StateItem, StateModel } from './model.ts';
import {
  AFTER_ID,
  AFTER_TARGET,
  AS,
  BOUNDARY,
  BOUNDARY_IN_COMPOSITE,
  CLASS_IDS,
  CLASS_NAME,
  CLASSDEF_ID,
  CLASSDEF_STYLES,
  CLICK_ACTION,
  COMPOSITE_DOC_KINDS,
  DESCR_VALUE,
  DIRECTIONS,
  DOC_KINDS,
  EXPECTED,
  HEADER,
  HEADER_START,
  HINTS,
  ID_KINDS,
  ID_ONLY,
  MISPLACED,
  NL,
  NOTE_AFTER,
  NOTE_TEXT,
  PROBE_FOLLOWS,
  PSEUDO,
  STRING,
  STRUCT_START,
  STRUCT_STOP,
  STYLE_IDS,
  STYLE_STYLES,
  TITLE,
  WIDTH,
} from './tables.ts';
import { blankAt, keyOf, multiWordMessage, trimColon } from './names.ts';
import type { Scope } from './names.ts';
import { splitRegions } from './regions.ts';
import { terminals } from './terminals.ts';
import type { Tokens } from './terminals.ts';
import { T } from './tokens.ts';

export interface StateParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Composite nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
}

export type StateParseResult = ParseResult<StateModel, StateDocument>;

/** Parse a state diagram. Never throws: problems are error diagnostics. */
export function parseState(src: string, options: StateParseOptions = {}): StateParseResult {
  return new StateParser(src, options).parse();
}

/** Thrown after a diagnostic is recorded; caught at statement level. One instance. */
class Stop extends Error {}
const STOP = new Stop();

/** What v12 kept of a statement whose action returned a string: nothing, but it counts. */
const NOOP: Item = Object.freeze({ stmt: 'noop' });

/** What a document collects: v12's statement list and the AST nodes. */
interface Doc {
  items: Item[];
  nodes: StateStatementNode[];
}

/**
 * One parse. Each grammar rule is a method; `i` indexes the parser tokens. A rule that fails
 * records a diagnostic and throws {@link STOP}; the statement loop catches it and recovers.
 */
class StateParser {
  private readonly pre: PreprocessResult;
  private readonly st = new ParseState();
  private readonly ids: ParseState['ids'];
  private readonly db: StateBuilder;
  private readonly tokens: Tokens;
  private readonly all: ReturnType<typeof lex>['tokens'];
  private readonly probe: Probe | undefined;
  private readonly maxDepth: number;
  private readonly seen = new Set<string>();
  /**
   * Symbols of the statements being parsed: recorded when a statement completes, dropped when
   * it fails, so a failed `A -->` does not define `A`.
   */
  private readonly pending: [name: string, kind: string, range: Range, role?: 'def' | 'ref'][] = [];
  /** Region ordinals handed out per composite name. */
  private readonly regionCount = new Map<string, number>();
  /** `state X` lines on their own, which v12 does not draw unless X is mentioned elsewhere. */
  private readonly declared: [string, Range][] = [];
  private lines: LineIndex | undefined;
  private dividers = 0;
  private hint: string | undefined;
  /** The hint of the statement before the current one, and where the current one starts. */
  private prevHint: string | undefined;
  private stmtFrom = 0;
  private i = 0;

  constructor(
    private readonly src: string,
    private readonly options: StateParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.ids = this.st.ids;
    const diagnostics = this.st.diagnostics;
    this.db = new StateBuilder({
      error: (code, message, range) => void diagnostics.error(code, message, range),
      warn: (code, message, range) => void diagnostics.warning(code, message, range),
    });
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    const { tokens, all } = terminals(src, pre);
    this.tokens = tokens;
    this.all = all;
    if (options.probe !== undefined) {
      const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(all);
    }
  }

  parse(): StateParseResult {
    const { st, src } = this;
    const children: StateStatementNode[] = [];
    const items: Item[] = [];
    this.header(children);
    this.document(undefined, { items, nodes: children });
    const warnings = () => st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = this.db.build(items, []);
    const drawn = new Set(model.states.map((s) => s.id));
    for (const [name, range] of this.declared) {
      if (!drawn.has(name)) {
        st.diagnostics.warning(
          'STATE_NOT_DRAWN',
          `\`state ${name}\` on its own declares nothing, so \`${name}\` is not drawn: mention it in a transition or give it a description, e.g. \`${name} : text\`.`,
          range
        );
      }
    }
    model.warnings = warnings();
    const ast: StateDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children,
    };
    return st.result(model, ast, this.all, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.tokens.kind[j] ?? Kind.EOF;
  }

  private text(j = this.i): string {
    return this.tokens.text[j] ?? '';
  }

  /** Source range of token `j` (with the text jison consumed around it). */
  private range(j = this.i): Range {
    const t = this.tokens;
    if (j >= t.length) return { start: this.src.length, end: this.src.length };
    return { start: t.from[j] ?? 0, end: t.to[j] ?? 0 };
  }

  /** From token `from` to the last one consumed, blanks trimmed off the end. */
  private span(from: number): Range {
    const start = this.range(from).start;
    if (this.i <= from) return { start, end: start };
    let end = this.range(this.i - 1).end;
    while (end > start && /\s/.test(this.src[end - 1] ?? '')) end--;
    return { start, end };
  }

  /** A token's own range, blanks trimmed. */
  private own(j: number): Range {
    let s = this.tokens.start[j] ?? 0;
    let e = this.tokens.end[j] ?? 0;
    while (s < e && /\s/.test(this.src[s] ?? '')) s++;
    while (e > s && /\s/.test(this.src[e - 1] ?? '')) e--;
    return { start: s, end: e };
  }

  /** Probe hook: the parser tests the current token for `kinds` (a constant list). */
  private tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.tokens, this.i)) p.tested(kinds, this.tokens.start[this.i] ?? 0);
  }

  private at(kinds: readonly number[], k: number): boolean {
    this.tested(kinds);
    return this.kind() === k;
  }

  private expect(want: readonly number[]): number {
    this.tested(want);
    if (!want.includes(this.kind())) this.fail(want);
    return this.i++;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  private found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF || (k === T.EndOfInput && this.text(j) === '')) return 'the end of the text';
    if (k === Kind.Newline || k === T.EndOfInput) return 'a line break';
    const r = this.own(j);
    const t = this.src.slice(r.start, r.end).trim();
    if (t === '') return 'nothing';
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string): never {
    this.tested(want);
    const { st } = this;
    const k = this.kind();
    const where = this.where();
    if (k === T.MultiWordState) {
      this.multiWord(where);
      throw STOP;
    }
    if (k === T.DefaultClassDefId) {
      st.diagnostics.error(
        'CLASSDEF_DEFAULT',
        '`classDef default` is not supported in state diagrams: give the class another name and apply it with `class`.',
        where
      );
      throw STOP;
    }
    // A lexical error at the start of a statement comes from the text before it (`scale 3`
    // with no `width`): explain that statement.
    const zeroWidth = k === Kind.Error && where.end === where.start;
    const why = this.why(
      hint ?? (zeroWidth && this.i === this.stmtFrom ? this.prevHint : undefined)
    );
    if ((k === Kind.Error || k === T.Invalid) && !this.crossesLine()) {
      const ch = this.src.slice(where.start, Math.max(where.end, where.start + 1)).trim();
      const what = ch ? `character \`${ch}\`` : blankAt(this.src, where.start);
      const arrow = ch === '-' && !why ? '; a transition is written `A --> B`' : '';
      st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected ${what}${why || arrow}.`, where, {
        expected: EXPECTED.names(want),
      });
      throw STOP;
    }
    const found = this.crossesLine() ? 'the end of the line' : this.found();
    const d = st.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), found);
    if (why) d.message = `${d.message.slice(0, -1)}${why}.`;
    throw STOP;
  }

  /** Whether the current token is on a later line than the statement's previous token. */
  private crossesLine(): boolean {
    const { i, tokens } = this;
    if (i <= this.stmtFrom || i >= tokens.length) return false;
    const k = this.kind();
    if (k === Kind.Newline || k === T.EndOfInput) return false;
    return /[\n\r]/.test(this.src.slice(tokens.end[i - 1] ?? 0, tokens.start[i] ?? 0));
  }

  /**
   * Where an error is reported: the current token, or, at a line break or on a later line, the
   * end of the statement's line.
   */
  private where(): Range {
    const { i, tokens } = this;
    if (i >= tokens.length) return { start: this.src.length, end: this.src.length };
    const k = this.kind();
    if (k === Kind.Newline || k === T.EndOfInput) {
      const s = tokens.start[i] ?? 0;
      return { start: s, end: s };
    }
    if (this.crossesLine()) {
      const e = this.own(i - 1).end;
      return { start: e, end: e };
    }
    return this.own(i);
  }

  /** Queue a symbol; a state's role is decided when it is recorded (its first is the def). */
  private symbol(name: string, kind: string, range: Range, role?: 'def' | 'ref'): void {
    this.pending.push([name, kind, range, role]);
  }

  /** Record the queued symbols of the statements that completed. */
  private flushSymbols(): void {
    for (const [name, kind, range, role] of this.pending) {
      const r = role ?? (this.seen.has(name) ? 'ref' : 'def');
      if (role === undefined) this.seen.add(name);
      this.st.symbol(name, kind, range, r);
    }
    this.pending.length = 0;
  }

  /** `state a b {`: one error for the name, which is returned (v12's lexer threw here). */
  private multiWord(where: Range): string {
    const name = this.text()
      .replace(/\s*\{$/, '')
      .trim();
    this.st.diagnostics.error('MULTI_WORD_STATE', multiWordMessage(name), where);
    return name;
  }

  private why(hint: string | undefined): string {
    const h = hint ?? this.hint;
    return h ? `; ${h}` : '';
  }

  /**
   * Skip to the next statement boundary after an error in the statement that starts at token
   * `from` (R-PARSE-4): a line break, or the `}` of the composite state it is in. Some line
   * breaks are no tokens (all of them inside a composite, as in jison), so the first token on
   * a later line is a boundary too.
   */
  private recover(inComposite: boolean, from: number): void {
    this.prevHint = this.hint;
    this.hint = undefined;
    this.probe?.freeze();
    const { tokens, src } = this;
    const boundary = inComposite ? BOUNDARY_IN_COMPOSITE : BOUNDARY;
    let j = this.i;
    while (j < tokens.length && boundary[tokens.kind[j] ?? Kind.EOF] !== 1) {
      if (j > from && /[\n\r]/.test(src.slice(tokens.end[j - 1] ?? 0, tokens.start[j] ?? 0))) break;
      j++;
    }
    this.i = j;
  }

  // ---- document -----------------------------------------------------------------------

  private header(out: StateStatementNode[]): void {
    for (;;) {
      this.tested(HEADER_START);
      const k = this.kind();
      if (k === Kind.Newline || k === T.EndOfInput) this.i++;
      else break;
    }
    if (this.kind() !== T.Sd) {
      try {
        this.fail(HEADER);
      } catch (e) {
        if (e !== STOP) throw e;
      }
      // One error for a missing or late header: parse on after a later one, if any.
      const sd = this.tokens.kind.indexOf(T.Sd, this.i);
      if (sd < 0) {
        this.i = skipTo(this.tokens, this.i, BOUNDARY);
        return;
      }
      this.probe?.freeze();
      this.i = sd;
    }
    const j = this.i++;
    const node: StateHeader = {
      id: this.ids.statement('st'),
      type: 'Header',
      range: this.own(j),
      keyword: this.text(j).trim(),
    };
    out.push(node);
    this.st.statement('Header', node.range);
  }

  /** `document`: statements and line breaks, to the end (or the `}` of `scope`). */
  private document(scope: Scope | undefined, doc: Doc): void {
    for (;;) {
      this.tested(scope ? COMPOSITE_DOC_KINDS : DOC_KINDS);
      const k = this.kind();
      if (k === Kind.Newline || k === T.EndOfInput) {
        this.i++;
        continue;
      }
      if (k === Kind.EOF) return;
      if (k === T.StructStop && scope) return;
      const from = (this.stmtFrom = this.i);
      const mark = this.pending.length;
      try {
        this.statement(scope, doc);
        this.prevHint = this.hint;
        this.flushSymbols();
      } catch (e) {
        if (e !== STOP) throw e;
        this.pending.length = mark;
        this.recover(scope !== undefined, from);
        // A `}` on the line of the error closes the composite state.
        if (this.i === from) this.i++;
      }
    }
  }

  private simple(kind: StateSimpleKind, from: number, refs: string[] = []): StateSimpleStmt {
    const node: StateSimpleStmt = {
      id: this.ids.statement('st'),
      type: kind,
      range: this.span(from),
      refs,
    };
    this.st.statement(kind, node.range);
    return node;
  }

  private statement(scope: Scope | undefined, doc: Doc): void {
    const { items, nodes } = doc;
    const from = this.i;
    const k = this.kind();
    this.hint = HINTS[k];
    switch (k) {
      case T.Id:
      case T.EdgeState:
        return this.stateOrTransition(scope, doc);
      case T.ClassDef: {
        this.i++;
        const id = this.text(this.expect(CLASSDEF_ID)).trim();
        const classes = this.text(this.expect(CLASSDEF_STYLES)).trim();
        this.symbol(id, 'class', this.own(from + 1), 'def');
        items.push({ stmt: 'classDef', id, classes });
        nodes.push(this.simple('ClassDef', from, [id]));
        return;
      }
      case T.Style: {
        this.i++;
        const id = this.text(this.expect(STYLE_IDS)).trim();
        const styleClass = this.text(this.expect(STYLE_STYLES)).trim();
        this.refs(from + 1);
        items.push({ stmt: 'style', id, styleClass });
        nodes.push(this.simple('Style', from, id.split(',')));
        return;
      }
      case T.Class: {
        this.i++;
        const id = this.text(this.expect(CLASS_IDS)).trim();
        const j = this.expect(CLASS_NAME);
        const styleClass = this.text(j).trim();
        this.refs(from + 1);
        this.symbol(styleClass, 'class', this.own(j), 'ref');
        items.push({ stmt: 'applyClass', id, styleClass });
        nodes.push(this.simple('Class', from, [...id.split(','), styleClass]));
        return;
      }
      case T.CompositeState: {
        this.i++;
        const name = this.text(from).trim();
        if (this.at(STRUCT_START, T.StructStart)) {
          return this.composite(scope, doc, from, name, from, undefined);
        }
        // `state X` alone: jison's action returns the name, which v12 then ignores.
        const node = this.stateNode(from, name, this.own(from), scope);
        node.declaredOnly = true;
        nodes.push(node);
        this.st.statement('State', node.range);
        this.declared.push([name, node.range]);
        items.push(NOOP);
        return;
      }
      case T.StateDescr:
        return this.describedState(scope, doc);
      case T.MultiWordState: {
        // One error for the name; the block still opens, so its `}` closes it (pitfall 8).
        const name = this.multiWord(this.own(this.i));
        this.i++;
        if (this.at(STRUCT_START, T.StructStart)) {
          return this.composite(scope, doc, from, name, from, undefined);
        }
        return;
      }
      case T.Click:
        return this.click(doc);
      default:
        if (this.simpleStatement(k, scope, doc)) return;
        return this.fail(scope ? COMPOSITE_DOC_KINDS : DOC_KINDS, MISPLACED[k]);
    }
  }

  /** The statements with no state name to parse: pseudo-states, `--`, notes, keywords. */
  private simpleStatement(k: number, scope: Scope | undefined, doc: Doc): boolean {
    const { items, nodes } = doc;
    const from = this.i;
    switch (k) {
      case T.Fork:
      case T.Join:
      case T.Choice: {
        this.i++;
        const name = this.text(from).trim();
        const node = this.stateNode(from, name, this.own(from), scope);
        node.pseudo = PSEUDO[k];
        nodes.push(node);
        this.st.statement('State', node.range);
        items.push({
          stmt: 'state',
          id: this.text(from),
          type: PSEUDO[k],
          ast: node.id,
          range: node.range,
        });
        return true;
      }
      case T.Concurrent: {
        this.i++;
        const node = this.simple('Divider', from);
        nodes.push(node);
        items.push({
          stmt: 'state',
          id: `divider-id-${++this.dividers}`,
          type: 'divider',
          ast: node.id,
          range: node.range,
        });
        return true;
      }
      case T.Note:
        this.note(scope, doc);
        return true;
      case T.DirectionTB:
      case T.DirectionBT:
      case T.DirectionRL:
      case T.DirectionLR: {
        this.i++;
        items.push({ stmt: 'dir', value: DIRECTIONS[k] ?? 'TB' });
        nodes.push(this.simple('Direction', from));
        return true;
      }
      case T.AccTitle: {
        this.i++;
        this.db.setAccTitle(this.text(this.expect(TITLE)).trim());
        items.push(NOOP);
        nodes.push(this.simple('AccTitle', from));
        return true;
      }
      case T.AccDescr: {
        this.i++;
        this.db.setAccDescr(this.text(this.expect(DESCR_VALUE)).trim());
        items.push(NOOP);
        nodes.push(this.simple('AccDescr', from));
        return true;
      }
      case T.AccDescrMultilineValue: {
        this.i++;
        this.db.setAccDescr(this.text(from).trim());
        items.push(NOOP);
        nodes.push(this.simple('AccDescr', from));
        return true;
      }
      case T.HideEmpty: {
        this.i++;
        items.push(NOOP);
        nodes.push(this.simple('HideEmpty', from));
        return true;
      }
      case T.Scale: {
        this.i++;
        this.expect(WIDTH);
        items.push(NOOP);
        nodes.push(this.simple('Scale', from));
        return true;
      }
      default:
        return false;
    }
  }
  /** Symbols for the ids of `style` / `class` (`A,B`). */
  private refs(j: number): void {
    const r = this.own(j);
    let at = r.start;
    for (const part of this.src.slice(r.start, r.end).split(',')) {
      const name = part.trim();
      const s = at + part.indexOf(name);
      if (name) this.symbol(name, 'state', { start: s, end: s + name.length }, 'ref');
      at += part.length + 1;
    }
  }

  /** A state mention's AST node, `n:<name>` (or the scoped id of `[*]`). */
  private stateNode(
    j: number,
    name: string,
    nameRange: Range,
    scope: Scope | undefined,
    end?: boolean
  ): StateStmt {
    const ast = this.ids.node(keyOf(name, scope, end));
    if (name !== '[*]') {
      this.symbol(name, 'state', nameRange);
    }
    return { id: ast, type: 'State', range: this.span(j), name, nameRange };
  }

  /** `idStatement`: `A`, `[*]`, `A:::cls`. */
  private idStatement(scope: Scope | undefined, end?: boolean): [StateItem, StateStmt] {
    const j = this.expect(ID_KINDS);
    const name = this.text(j).trim();
    const node = this.stateNode(j, name, this.own(j), scope, end);
    const item: StateItem = {
      stmt: 'state',
      id: name,
      type: 'default',
      description: '',
      ast: node.id,
      range: node.range,
    };
    if (this.at(AFTER_ID, T.StyleSeparator)) {
      this.i++;
      const c = this.expect(ID_ONLY);
      const cls = this.text(c).trim();
      this.symbol(cls, 'class', this.own(c), 'ref');
      item.classes = [cls];
      node.className = cls;
      node.range = this.span(j);
    }
    return [item, node];
  }

  private stateOrTransition(scope: Scope | undefined, doc: Doc): void {
    const from = this.i;
    const [item, node] = this.idStatement(scope);
    this.tested(AFTER_ID);
    if (this.kind() === T.Descr) {
      const d = this.i++;
      item.description = trimColon(this.text(d));
      node.description = item.description;
      node.range = this.span(from);
      doc.items.push(item);
      doc.nodes.push(node);
      this.st.statement('State', node.range);
      return;
    }
    if (this.kind() !== T.Arrow) {
      doc.items.push(item);
      doc.nodes.push(node);
      this.st.statement('State', node.range);
      return;
    }
    this.i++;
    const [item2, node2] = this.idStatement(scope, true);
    const fromName = keyOf(node.name, scope, false);
    const toName = keyOf(node2.name, scope, true);
    const edge: StateTransitionStmt = {
      id: this.ids.edge(fromName, toName),
      type: 'Transition',
      range: this.span(from),
      from: node.name,
      to: node2.name,
      children: [node, node2],
    };
    const rel: Item = { stmt: 'relation', state1: item, state2: item2, ast: edge.id };
    this.tested(AFTER_TARGET);
    if (this.kind() === T.Descr) {
      const label = trimColon(this.text(this.i++));
      rel.description = label;
      edge.label = label;
      edge.range = this.span(from);
    }
    doc.items.push(rel);
    doc.nodes.push(edge);
    this.st.statement('Transition', edge.range);
  }

  /** `state "…" as X`, optionally with a body. */
  private describedState(scope: Scope | undefined, doc: Doc): void {
    const from = this.i++;
    const descr = this.text(from);
    this.expect(AS);
    const j = this.expect(ID_ONLY);
    const raw = this.text(j);
    if (this.at(STRUCT_START, T.StructStart)) {
      return this.composite(scope, doc, from, raw.trim(), j, descr);
    }
    let id = raw;
    let description: string | string[] = descr.trim();
    if (raw.includes(':')) {
      const parts = raw.split(':');
      id = parts[0] ?? '';
      description = [description, parts[1] ?? ''];
    }
    const own = this.own(j);
    const name = id.trim();
    const nameRange = { start: own.start, end: own.start + name.length };
    const node = this.stateNode(from, name, nameRange, scope);
    node.description = Array.isArray(description) ? description.join(':') : description;
    doc.nodes.push(node);
    this.st.statement('State', node.range);
    doc.items.push({
      stmt: 'state',
      id,
      type: 'default',
      description,
      ast: node.id,
      range: node.range,
    });
  }

  /** `… { document }`: the `{` is the current token. */
  private composite(
    scope: Scope | undefined,
    doc: Doc,
    from: number,
    name: string,
    nameTok: number,
    descr: string | undefined
  ): void {
    const open = this.i++;
    const depth = (scope?.depth ?? 0) + 1;
    const nameRange = this.own(nameTok);
    if (name !== '') {
      this.symbol(name, 'state', nameRange);
    }
    const node: StateCompositeStmt = {
      id: this.ids.subgraph(name),
      type: 'Composite',
      range: this.range(from),
      name,
      nameRange,
      children: [],
    };
    if (descr !== undefined) node.description = descr;
    const span = this.st.beginStatement('Composite', node.range.start);
    const body: Doc = { items: [], nodes: [] };
    if (depth > this.maxDepth) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Composite states are nested ${depth} deep here, over the limit of ${this.maxDepth}. The limit is set by the page or app that renders the diagram.`,
        this.own(open)
      );
      this.skipBody();
    } else this.document({ name, depth }, body);
    if (this.kind() === T.StructStop) this.i++;
    else {
      const opener = this.own(open);
      this.st.diagnostics.error(
        'UNCLOSED',
        `Unclosed composite state: the \`{\` of \`${name}\` at line ${this.lineOf(opener.start)} has no closing \`}\`. Add \`}\` after its last statement.`,
        opener,
        {
          expected: EXPECTED.names(STRUCT_STOP),
          related: [
            {
              message: 'The text ends here.',
              range: { start: this.src.length, end: this.src.length },
            },
          ],
        }
      );
    }
    node.range = this.span(from);
    this.st.endStatement(span, node.range.end);
    const split = splitRegions(name, body.nodes, body.items, this.regionCount);
    node.children = split.children;
    const item: StateItem = {
      stmt: 'state',
      id: name,
      type: 'default',
      description: descr ?? '',
      doc: body.items,
      ast: node.id,
      range: node.range,
    };
    // The last region is the one v12 made up: the builder takes its AST id from here.
    if (split.tail) item.tail = split.tail;
    doc.items.push(item);
    doc.nodes.push(node);
  }

  /** Past the body of a composite nested over the limit, to its `}`. */
  private skipBody(): void {
    let depth = 0;
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === T.StructStart) depth++;
      else if (k === T.StructStop) {
        if (depth === 0) return;
        depth--;
      }
      this.i++;
    }
  }

  /** `note left of A : …`, `note right of A … end note`, `note "…" as N`. */
  private note(scope: Scope | undefined, doc: Doc): void {
    const from = this.i++;
    this.tested(NOTE_AFTER);
    const k = this.kind();
    if (k === T.NoteText) {
      // A floating note: jison's grammar accepts it and v12 draws nothing.
      const text = this.text(this.i++).trim();
      this.expect(AS);
      const j = this.expect(ID_ONLY);
      const node: StateNoteStmt = {
        id: this.ids.statement('note'),
        type: 'Note',
        range: this.span(from),
        target: this.text(j).trim(),
        text,
        floating: true,
      };
      doc.nodes.push(node);
      doc.items.push(NOOP);
      this.st.statement('Note', node.range);
      this.st.diagnostics.warning(
        'FLOATING_NOTE',
        'A note with `as` is not attached to a state and is not drawn: write `note left of <state>` or `note right of <state>`.',
        node.range
      );
      return;
    }
    if (k !== T.LeftOf && k !== T.RightOf) this.fail(NOTE_AFTER);
    const position = this.text(this.i++).trim();
    const j = this.expect(ID_ONLY);
    const target = this.text(j).trim();
    if (this.kind() === Kind.Error) {
      const r = this.own(from);
      this.st.diagnostics.error(
        'UNCLOSED_NOTE',
        `Unclosed note: the note on \`${target}\` at line ${this.lineOf(r.start)} has no text. Write it after \`:\` on the same line, or on the lines after it and end it with \`end note\`.`,
        r,
        { related: [{ message: 'The text ends here.', range: this.where() }] }
      );
      throw STOP;
    }
    const t = this.expect(NOTE_TEXT);
    const text = this.text(t).trim();
    const noteId = this.ids.statement('note');
    const mention = this.stateNode(j, target, this.own(j), scope);
    mention.range = this.own(j);
    const node: StateNoteStmt = {
      id: noteId,
      type: 'Note',
      range: this.span(from),
      target,
      side: position === 'left of' ? 'left' : 'right',
      text,
      children: [mention],
    };
    doc.nodes.push(node);
    this.st.statement('Note', node.range);
    doc.items.push({
      stmt: 'state',
      id: target,
      type: undefined,
      note: { position, text, ast: noteId },
      ast: mention.id,
      range: mention.range,
    });
  }

  /** `click A "url" "tooltip"` / `click A href "url"`, then a line break. */
  private click(doc: Doc): void {
    const from = this.i++;
    const j = this.expect(ID_KINDS);
    const name = this.text(j).trim();
    this.symbol(name, 'state', this.own(j));
    const id: StateItem = {
      stmt: 'state',
      id: name,
      type: 'default',
      description: '',
      ast: '',
      range: this.own(j),
    };
    this.tested(CLICK_ACTION);
    let url: string;
    let tooltip = '';
    if (this.kind() === T.Href) {
      this.i++;
      url = this.text(this.expect(STRING));
    } else {
      url = this.text(this.expect(STRING));
      tooltip = this.text(this.expect(STRING));
    }
    this.expect(NL);
    const node = this.simple('Click', from, [name]);
    doc.nodes.push(node);
    doc.items.push({ stmt: 'click', id, url, tooltip, ast: node.id });
  }
}
