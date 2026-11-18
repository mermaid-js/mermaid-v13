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
import { Kind, Probe, skipTo } from '@mermaid-js/core/parser-kit';
import type {
  EmbeddedBlock,
  ParseOptions,
  ParseResult,
  ParseState,
  Range,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  StateCompositeStmt,
  StateDocument,
  StateEmbedStmt,
  StateHeader,
  StateNoteStmt,
  StateSimpleKind,
  StateSimpleStmt,
  StateStatementNode,
  StateStmt,
  StateTransitionStmt,
} from './ast.ts';
import { applyFolds, foldData, type Fold } from './fold.ts';
import { StateBuilder } from './model.ts';
import type { Item, StateItem, StateModel } from './model.ts';
import {
  AFTER_ID,
  AFTER_STATE,
  AFTER_TARGET,
  AS,
  BOUNDARY,
  CLASS_IDS,
  CLASS_NAME,
  CLASSDEF_ID,
  CLASSDEF_STYLES,
  CLICK_ACTION,
  COMPOSITE_DOC_KINDS,
  DESCR_VALUE,
  DIRECTIONS,
  DOC_KINDS,
  EMBED_AFTER_ID,
  EMBED_BODY,
  EMBED_END,
  EMBED_ID,
  EMBED_OPEN,
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
import { keyOf, trimColon } from './names.ts';
import type { Scope } from './names.ts';
import { clickInComposite, ignoredInComposite, scaleIgnored, undrawnNotices } from './notices.ts';
import type { Declared } from './notices.ts';
import { splitRegions } from './regions.ts';
import { StateCursor, STOP } from './cursor.ts';
import { terminals } from './terminals.ts';
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
class StateParser extends StateCursor {
  private readonly pre: PreprocessResult;
  private readonly ids: ParseState['ids'];
  private readonly db: StateBuilder;
  private readonly maxDepth: number;
  /** Region ordinals handed out per composite name. */
  private readonly regionCount = new Map<string, number>();
  /** `state X` lines on their own, which v12 does not draw unless X is mentioned elsewhere. */
  private readonly declared: Declared[] = [];
  /** The token of the last `state X` word, to join the words of one line (#362). */
  private lastDeclared = -1;
  /** Where that line's first word starts. */
  private firstWord = 0;
  private readonly clicks: [string, Range][] = []; // top-level `click` targets
  /** Embedded diagram blocks (ADR-15), for `ParseResult.embeds`. */
  private readonly embeds: EmbeddedBlock[] = [];
  /** Each block's model record by id, and the `id@{ view: collapsed }` folds (#670). */
  private readonly blocks = new Map<string, { title?: string; folded?: boolean }>();
  private readonly folds: Fold[] = [];
  private dividers = 0;

  constructor(
    src: string,
    private readonly options: StateParseOptions
  ) {
    const pre = options.preprocessed ?? preprocess(src);
    const probe =
      options.probe === undefined ? undefined : new Probe(src, options.probe, PROBE_FOLLOWS);
    if (probe && pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
    super(src, terminals(src, pre, probe), probe);
    this.pre = pre;
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.ids = this.st.ids;
    const diagnostics = this.st.diagnostics;
    this.db = new StateBuilder({
      error: (code, message, range) => void diagnostics.error(code, message, range),
      warn: (code, message, range) => void diagnostics.warning(code, message, range),
    });
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    probe?.trivia(this.all);
  }

  parse(): StateParseResult {
    const { st, src } = this;
    const children: StateStatementNode[] = [];
    const items: Item[] = [];
    this.header(children);
    this.document(undefined, { items, nodes: children });
    applyFolds(this.folds, this.embeds, this.blocks, this.report);
    const warnings = () => st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = this.db.build(items, []);
    undrawnNotices(this.st.diagnostics, model, this.declared, this.clicks);
    model.warnings = warnings();
    const ast: StateDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children,
    };
    const result: StateParseResult = st.result(model, ast, this.all, this.options, this.probe);
    if (this.embeds.length > 0) result.embeds = this.embeds;
    // Edges counted across embedded diagrams (ADR-15).
    result.edgeCount = model.transitions.length;
    return result;
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
    this.st.statement('header', node.range);
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
    // Statement kinds are camelCase, as flowchart's (`accDescr`, `classDef`; DESIGN §4.5).
    this.st.statement(kind.charAt(0).toLowerCase() + kind.slice(1), node.range);
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
        if (k === T.Id)
          clickInComposite(this.st.diagnostics, scope, this.text(from), this.own(from));
        return this.stateOrTransition(scope, doc);
      case T.ClassDef: {
        this.i++;
        const id = this.text(this.expect(CLASSDEF_ID)).trim();
        const classes = this.text(this.expect(CLASSDEF_STYLES)).trim();
        this.symbol(id, 'class', this.own(from + 1), 'def');
        items.push({ stmt: 'classDef', id, classes });
        nodes.push(this.simple('ClassDef', from, [id]));
        ignoredInComposite(this.st.diagnostics, 'classDef', scope, nodes.at(-1)!.range);
        return;
      }
      case T.Style: {
        this.i++;
        const id = this.text(this.expect(STYLE_IDS)).trim();
        const styleClass = this.text(this.expect(STYLE_STYLES)).trim();
        this.refs(from + 1);
        items.push({ stmt: 'style', id, styleClass });
        nodes.push(this.simple('Style', from, id.split(',')));
        ignoredInComposite(this.st.diagnostics, 'style', scope, nodes.at(-1)!.range);
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
        ignoredInComposite(this.st.diagnostics, 'class', scope, nodes.at(-1)!.range);
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
        this.st.statement('state', node.range);
        this.declare(from, name, node.range);
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
      case T.Embed:
        return this.embed(doc);
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
        this.st.statement('state', node.range);
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
        scaleIgnored(this.st.diagnostics, nodes.at(-1)!.range);
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

  /**
   * Record the `state X` word at token `j`. v12's lexer reads each word of `state A B` (or
   * `state A: text`) as its own `state X`, and so does v13; a word right after another on the
   * same line joins that line's record, so the line gets one warning (#362, D609).
   */
  private declare(j: number, name: string, range: Range): void {
    const prev = this.declared.at(-1);
    const own = this.own(j);
    if (
      prev &&
      this.lastDeclared === j - 1 &&
      !this.src.slice(prev.range.end, own.start).includes('\n')
    ) {
      prev.range = { start: prev.range.start, end: own.end };
      prev.words = this.src.slice(this.firstWord, own.end);
    } else {
      this.declared.push({ name, range });
      this.firstWord = own.start;
    }
    this.lastDeclared = j;
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
      node.range = item.range = this.span(j);
    }
    return [item, node];
  }

  private stateOrTransition(scope: Scope | undefined, doc: Doc): void {
    const from = this.i;
    const [item, node] = this.idStatement(scope);
    this.tested(AFTER_STATE);
    if (this.kind() === T.EmbedFold) return this.fold(from, item.range);
    if (this.kind() === T.Descr) {
      const d = this.i++;
      item.description = trimColon(this.text(d));
      node.description = item.description;
      node.range = this.span(from);
      doc.items.push(item);
      doc.nodes.push(node);
      this.st.statement('state', node.range);
      return;
    }
    if (this.kind() !== T.Arrow) {
      doc.items.push(item);
      doc.nodes.push(node);
      this.st.statement('state', node.range);
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
    this.st.statement('transition', edge.range);
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
    this.st.statement('state', node.range);
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
    const span = this.st.beginStatement('composite', node.range.start);
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
        'UNCLOSED_COMPOSITE',
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
      this.st.statement('note', node.range);
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
    this.st.statement('note', node.range);
    doc.items.push({
      stmt: 'state',
      id: target,
      type: undefined,
      note: { position, text, ast: noteId },
      ast: mention.id,
      range: mention.range,
    });
  }

  /**
   * `mermaid id["Title"] {` body `}` (ADR-15): a state with the block's id, and the block in
   * the parse result. The body is one token; the host never reads it.
   */
  private embed(doc: Doc): void {
    const from = this.i++;
    const j = this.expect(EMBED_ID);
    const name = this.text(j).trim();
    const nameRange = this.own(j);
    let title: string | undefined;
    this.tested(EMBED_AFTER_ID);
    if (this.kind() === T.EmbedTitle) {
      title = this.text(this.i++)
        .slice(1, -1)
        .trim()
        .replace(/^"(.*)"$/s, '$1');
    }
    const open = this.expect(EMBED_OPEN);
    const body = this.expect(EMBED_BODY);
    const bodyRange = { start: this.tokens.start[body] ?? 0, end: this.tokens.end[body] ?? 0 };
    this.tested(EMBED_END);
    if (this.kind() !== T.EmbedEnd) {
      const opener = { start: this.range(from).start, end: this.own(open).end };
      this.st.diagnostics.error(
        'UNCLOSED',
        `Unclosed block: the \`mermaid ${name}\` block at line ${this.lineOf(opener.start)} has no closing \`}\`. Add \`}\` on its own line to close it.`,
        opener,
        {
          expected: EXPECTED.names(EMBED_END),
          related: [
            {
              message: 'The text ends here.',
              range: { start: this.src.length, end: this.src.length },
            },
          ],
        }
      );
      throw STOP;
    }
    this.i++;
    this.symbol(name, 'state', nameRange);
    const range = this.span(from);
    const node: StateEmbedStmt = {
      id: this.ids.node(name),
      type: 'Embed',
      range,
      name,
      nameRange,
      bodyRange,
    };
    if (title) node.title = title;
    doc.nodes.push(node);
    this.st.statement('embed', range);
    doc.items.push({
      stmt: 'state',
      id: name,
      type: 'default',
      description: '',
      ast: node.id,
      range: nameRange,
      embed: this.block(name, title),
    });
    this.embeds.push({
      id: name,
      ...(title ? { title } : {}),
      text: this.src.slice(bodyRange.start, bodyRange.end),
      offset: bodyRange.start,
    });
  }

  /** A block's model record, kept by id for a fold (#670). */
  private block(name: string, title: string | undefined): { title?: string } {
    const rec = title ? { title } : {};
    if (!this.blocks.has(name)) this.blocks.set(name, rec);
    return rec;
  }

  /** `id@{ view: collapsed }` (#670): folds block `id` (at `at`), checked once all is read. */
  private fold(from: number, at: Range): void {
    const k = this.i++;
    if (foldData(this.text(k), this.own(k), this.report))
      this.folds.push({ id: this.text(from).trim(), range: at });
    this.st.statement('fold', this.span(from));
  }

  private readonly report = (code: string, message: string, range: Range): void =>
    void this.st.diagnostics.error(code, message, range);

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
    doc.items.push({ stmt: 'click', id, url, tooltip, ast: node.id });
    doc.nodes.push(node);
    this.clicks.push([name, node.range]); // top level only: in a composite it lexes as an id
  }
}
