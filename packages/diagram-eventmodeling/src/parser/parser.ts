// cspell:words eventmodeling accdescr jsobj readmodel resetframe timeframe
/**
 * Event modeling parser: recursive descent over the significant {@link lex} tokens (gated
 * against v12's Langium lexer, #600), producing an {@link EventModel}, the typed AST, symbols,
 * statement spans and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `event-modeling.langium`, ported rule for rule (below);
 * `grammar/eventmodeling.ebnf` is the normative form, so it accepts and rejects what v12's
 * parser does. Whitespace, line breaks included, is not a token: statements are separated by
 * nothing, so `eventmodeling tf 01 evt A tf 02 evt B` is two frames. Unlike v12 the parser does
 * not stop at the first error: it reports it, skips to the next token that starts a statement
 * and carries on, so N errors give N diagnostics (R-PARSE-4). v12's one thrown error, a
 * duplicate frame id (`db.ts` `setAst`), is an error with its message; what v12 dropped
 * silently gets D525's warnings ({@link normalise}).
 */
/*
    EventModel : 'eventmodeling' (AccDescr | AccTitle | Title | Entity | Frame | Data | Note | Gwt)* EOF
    Frame      : ('tf'|'timeframe'|'rf'|'resetframe') FID Kind QualifiedName ('->>' FID)*
                 ('[[' ID ']]')? (('`' DataType '`')? DATA_INLINE)?
    Entity     : 'entity' QualifiedName
    Data       : 'data' ID ('`' DataType '`')? DATA_BLOCK
    Note       : 'note' FID ('`' DataType '`')? DATA_BLOCK
    Gwt        : 'gwt' FID 'given' Step+ ('when' Step+)? 'then' Step+       Step: Kind ID
    QualifiedName : ID ('.' ID)*
*/
import { checkLimit } from '@mermaid-js/core/limits';
import { ExpectedTable, formatExpected, Kind, kindSet, skipTo } from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import { RuleParser, textProbeMode, textStatements } from '@mermaid-js/shared/parser/rule';
import type { RuleGrammar } from '@mermaid-js/shared/parser/rule';
import type { ParseOptions, ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { EVENTMODELING_DUPLICATE_FRAME } from '../codes.ts';
import type { EventModel, EventModelKind } from '../model.ts';
import type {
  EventModelDataNode,
  EventModelDocument,
  EventModelFrameNode,
  EventModelGwtStepNode,
  EventModelStatementNode,
  EventModelText,
  EventModelTextNode,
} from './ast.ts';
import { accDescrValue, accTitleValue, dataText, displayText, titleValue } from './convert.ts';
import { lex } from './lexer.ts';
import { normalise } from './normalise.ts';
import {
  DATA_TYPES,
  EVENTMODELING_TRIVIA,
  KEYWORDS,
  KIND_LIST,
  KINDS,
  T,
  TEXT_WORD,
} from './tokens.ts';
import { eventModelingView } from './view.ts';

export interface EventModelParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** The integrator's cap on frames (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
  /** The integrator's cap on relations (a frame's sources) (core `DEFAULT_LIMITS.maxEdges` when absent). */
  maxEdges?: number;
}

export type EventModelParseResult = ParseResult<EventModel, EventModelDocument>;

const DATA_TYPE_SET = kindSet(...DATA_TYPES);
const FRAMES = [T.Tf, T.Timeframe, T.Rf, T.Resetframe];
const TEXTS = [T.Title, T.AccTitle, T.AccDescr];
/** The tokens a statement starts with: where recovery stops. */
const STARTS = [...FRAMES, T.Entity, T.Data, T.Note, T.Gwt, ...TEXTS];
const STARTS_SET = kindSet(...STARTS);
const AFTER_STATEMENT = [...STARTS, Kind.EOF];
/** What may follow a `gwt`'s `given` steps, and its `when` steps (R-ERR-2). */
const AFTER_GIVEN = [...KIND_LIST, T.When, T.Then];
const AFTER_WHEN = [...KIND_LIST, T.Then];
/** Probe lists (constant, so a plain parse allocates none). */
const HEADER = [T.Header];
const DOT = [T.Dot];
const ARROW = [T.Arrow];
const OPEN_REF = [T.OpenRef];
const BACKTICK = [T.Backtick];
const INLINE_DATA = [T.Backtick, T.DataInline];

/** Human names for what the parser expects (R-ERR-2); never a token or rule name (R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['a statement such as `tf 01 evt Name`', STARTS],
  ['`eventmodeling`', [T.Header]],
  ['a frame id such as `01`', [T.FrameId]],
  ['a kind (`ui`, `pcr`, `cmd`, `rmo` or `evt`)', KIND_LIST],
  ['a name', [T.Id]],
  ['`.` and a name', [T.Dot]],
  ['`->>` and a source frame id', [T.Arrow]],
  ['`[[data name]]`', [T.OpenRef]],
  ['`]]`', [T.CloseRef]],
  ['a data type such as `json`', DATA_TYPES],
  ['inline data such as `{ … }` or `"…"`', [T.DataInline]],
  ['a data block: `{`, its lines, then `}` on a line of its own', [T.DataBlock]],
  ['`` ` ``', [T.Backtick]],
  ['`given`', [T.Given]],
  ['`when`', [T.When]],
  ['`then`', [T.Then]],
  ['the end of the text', [Kind.EOF]],
]);

/**
 * Kinds a probe's cursor follows rather than extends (R-LANG-7): the punctuation, and closed
 * data, which its closer ends.
 */
const PROBE_FOLLOWS = kindSet(
  T.Arrow,
  T.OpenRef,
  T.CloseRef,
  T.Backtick,
  T.Dot,
  T.DataInline,
  T.DataBlock
);

/** The end of a data token's closer: a block's `}`, inline data's last character. */
function dataEnd(src: string, start: number, end: number, kind: number): number {
  return kind === T.DataBlock ? start + src.slice(start, end).lastIndexOf('}') + 1 : end;
}

/**
 * Where the probe's offset `o` is (R-LANG-7). The lexer has no modes (Langium's has none), so
 * the mode names what the offset is in: `comment` inside a `/* *\/` or `//` comment and `yaml`
 * inside a `---` block in the body (v12 hid both: not code); `data` inside inline data or a data
 * block; `title`, `accTitle` or `accDescr` past the keyword of that statement;
 * else `INITIAL` (code).
 */
const probeMode = /* @__PURE__ */ textProbeMode({
  texts: /* @__PURE__ */ textStatements(T.Title, T.AccTitle, T.AccDescr),
  accDescr: T.AccDescr,
  other: hiddenMode,
});

/**
 * The comment, YAML and data modes, for the token `[start, end)` of `kind` that holds `o`;
 * undefined where the token gives none.
 */
function hiddenMode(src: string, kind: number, start: number, end: number, o: number) {
  // At its end, a `//` comment holds the offset (its line break is not in it); a closed
  // `/* *\/` or data token does not.
  if (kind === T.LineComment) return 'comment';
  if (kind === T.BlockComment) return o < end ? 'comment' : undefined;
  // A `---` block, up to its closing `---` (its token takes the line break after it).
  if (kind === T.Yaml) {
    return o < start + src.slice(start, end).lastIndexOf('---') + 3 ? 'yaml' : undefined;
  }
  // Data up to its closer: a block's token also takes the line break after its `}`.
  if (kind === T.DataInline || kind === T.DataBlock) {
    return o < dataEnd(src, start, end, kind) ? 'data' : undefined;
  }
  return undefined;
}

const GRAMMAR: RuleGrammar<PreprocessResult> = {
  view: (src, pre) => eventModelingView(src, pre).view,
  lex,
  trivia: EVENTMODELING_TRIVIA,
  probeFollows: PROBE_FOLLOWS,
  probeMode,
};

/** v12's text-statement words, which v12 lexes as a name at a line start. */
const TEXT_WORDS = Object.values(TEXT_WORD);

/** The parts of a frame the model reads, by statement. */
export interface ParsedFrame {
  node: EventModelFrameNode;
  kind: EventModelKind;
}

/** What the parser hands {@link normalise}: the statements read, in source order. */
export interface Parsed {
  readonly children: readonly EventModelStatementNode[];
  readonly frames: readonly ParsedFrame[];
  /** Kinds of gwt steps, by node, in step order (given, when, then). */
  readonly stepKinds: ReadonlyMap<EventModelGwtStepNode, EventModelKind>;
  readonly title?: EventModelTextNode;
  readonly accTitle?: EventModelTextNode;
  readonly accDescr?: EventModelTextNode;
  /**
   * Ids of frames whose statement failed after its id: no D525 warning names them as missing,
   * since the error already covers them.
   */
  readonly failedIds: ReadonlySet<string>;
}

/** Parse an event model. Never throws: problems are error diagnostics. */
export function parseEventModel(
  src: string,
  options: EventModelParseOptions = {}
): EventModelParseResult {
  return new EventModelParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class EventModelParser extends RuleParser<PreprocessResult> {
  private readonly children: EventModelStatementNode[] = [];
  private readonly frames: ParsedFrame[] = [];
  /** The relations (`->>` sources) read so far (the edge cap counts them). */
  private relations = 0;
  private readonly stepKinds = new Map<EventModelGwtStepNode, EventModelKind>();
  /** Where the statement being read started (its first token). */
  private from = 0;
  /** Frame ids read so far (duplicates are v12's thrown error). */
  private readonly frameIds = new Set<string>();
  /** Ids of frames that failed after their id was read. */
  private readonly failedIds = new Set<string>();
  /** The id of the frame being read, until it completes. */
  private pending: string | undefined;
  private title: EventModelTextNode | undefined;
  private accTitle: EventModelTextNode | undefined;
  private accDescr: EventModelTextNode | undefined;

  constructor(
    src: string,
    private readonly opts: EventModelParseOptions
  ) {
    const given = opts.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, opts.probe);
    // `comment` and `yaml` are not code (v12 hid both): the probe is outside them. The set-up
    // took the mode from `probeMode` with `lexed` (or from a `%%` comment, already outside), and
    // `outside` after `lexed` leaves the probe as `outside` alone would.
    const probe = this.probe;
    if (probe && (probe.mode === 'comment' || probe.mode === 'yaml')) probe.outside(probe.mode);
  }

  parse(): EventModelParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const parsed: Parsed = {
      children: this.children,
      frames: this.frames,
      stepKinds: this.stepKinds,
      title: this.title,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      failedIds: this.failedIds,
    };
    const model = normalise(parsed, st, this.pre.frontMatter?.title);
    const ast: EventModelDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.opts, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's lexer read it, `#name;` codes as their characters. */
  private displayed(j = this.i): string {
    const { start, end } = this.range(j);
    return displayText(this.src, start, end, this.view);
  }

  /** Consume a token of `kind` and return its text and range, or fail. */
  private expectText(kind: number, hint?: string): EventModelText {
    const j = this.expect(kind, hint);
    return { value: this.displayed(j), range: this.range(j) };
  }

  /** The current token's text and range; consumes it. */
  private text(): EventModelText {
    const range = this.range();
    const value = this.displayed();
    this.i++;
    return { value, range };
  }

  /** The end of the last token read. */
  private end(): number {
    return this.t.end[this.i - 1] ?? 0;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** How an error message names the token at `j` (its text as {@link displayed}). */
  protected override found(j = this.i): string {
    if (this.kind(j) === Kind.EOF) return 'the end of the text';
    const text = this.displayed(j).trim();
    const line = text.split('\n', 1)[0] ?? '';
    return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected override fail(want: readonly number[], hint?: string): never {
    if (this.kind() === Kind.Error) this.badCharacters();
    const names = EXPECTED.names(want);
    const why = hint ?? this.explain(want);
    const message = `Expected ${formatExpected(names)}, got ${this.found()}${why ? `; ${why}` : ''}.`;
    this.st.diagnostics.error('UNEXPECTED', message, this.range(), { expected: names });
    throw STOP;
  }

  /** Text no token rule matched: unclosed data, or stray characters. */
  private badCharacters(): never {
    const where = this.range();
    const text = this.displayed();
    const line = this.lineOf(where.start);
    const c = text.charAt(0);
    if (c === '"' || c === "'") {
      this.st.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed quote: the \`${c}\` at line ${line} has no closing \`${c}\` on its line. Inline data in quotes ends on the line it starts.`,
        where,
        { expected: [`\`${c}\``] }
      );
      throw STOP;
    }
    if (c === '{') {
      this.st.diagnostics.error(
        'UNCLOSED_DATA',
        `Unclosed data: the \`{\` at line ${line} is not closed. Inline data ends with \`}\` on its line; a data block starts a new line after \`{\` and ends with \`}\` on a line of its own.`,
        where,
        { expected: ['`}`'] }
      );
      throw STOP;
    }
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    const why = /^[\w.]*$/.test(text)
      ? ''
      : '; names are ASCII letters, digits and `_`, and start with a letter or `_`';
    this.st.diagnostics.error(
      'UNEXPECTED_CHARACTER',
      `Unexpected character \`${shown}\`${why}.`,
      where
    );
    throw STOP;
  }

  private explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    const text = k === Kind.EOF ? '' : this.displayed();
    if (want.includes(T.Tf)) return this.explainStatement(k, text);
    if (want.includes(T.Id) && KEYWORDS.has(text)) {
      return `\`${text}\` is a keyword and cannot be a name`;
    }
    if (want.includes(T.Id) && k === T.FrameId) return 'a name starts with a letter or `_`';
    if (k === T.FrameId && want.includes(T.Ui)) return 'a frame id has one to three digits';
    if (k === T.DataBlock && want.includes(T.DataInline)) {
      return 'inline data stays on one line; write a multi-line block as `data Name { … }` and refer to it with `[[Name]]`';
    }
    if (k === T.DataInline && want.includes(T.DataBlock)) {
      return 'a block starts a new line after `{`, and its `}` stands on a line of its own';
    }
    if (k === T.Dot && want.includes(T.Then)) return 'a `gwt` step names an entity without a `.`';
    return undefined;
  }

  /** Why the token `k` (`text`) starts no statement. */
  private explainStatement(k: number, text: string): string | undefined {
    if (k === T.Id) {
      const word = TEXT_WORDS.find((w) => text === w);
      if (word) {
        return `\`${word}\` is read only after another statement on the same line, as in \`eventmodeling ${word}${word === 'title' ? ' My model' : ': …'}\``;
      }
      if (KEYWORDS.has(text.toLowerCase())) return 'keywords are written in lower case';
    }
    if (k === T.Header) return 'an event model has one `eventmodeling`, at its start';
    if (k === T.DataBlock) {
      return 'inline data after a frame stays on one line; write a multi-line block as `data Name { … }` and refer to it with `[[Name]]`';
    }
    if (k === T.Arrow || k === T.OpenRef || k === T.DataInline) {
      return 'a frame takes its parts in this order: `->>` sources, then `[[data]]`, then inline data';
    }
    if (k === T.Backtick) return 'a data type goes right before its data, as in `` `json` { … } ``';
    return undefined;
  }

  /** Run one statement rule; on failure, skip to the next statement start (R-PARSE-4). */
  protected override statement(rule: () => void): void {
    this.from = this.i;
    super.statement(rule);
  }

  /** Skip to the next statement start after a failure (R-PARSE-4). */
  protected override recover(): void {
    const { from } = this;
    this.probe?.freeze();
    if (this.pending !== undefined) this.failedIds.add(this.pending);
    this.pending = undefined;
    // Resume at the failing token when it starts a statement (`->> tf 02 cmd B`), else after
    // it. A failure on the statement's first token always moves on.
    const resume = this.i > from && this.startsStatement(this.i);
    this.i = skipTo(this.t, resume ? this.i : Math.max(this.i + 1, from + 1), STARTS_SET);
  }

  /**
   * Whether token `j` starts a statement: a statement keyword followed by what that statement
   * takes next. A keyword that is not (`tf 01 evt data tf 02 …`: `data` meant as a name) is
   * skipped with the rest of the broken statement.
   */
  private startsStatement(j: number): boolean {
    const k = this.kind(j);
    if (STARTS_SET[k] !== 1) return false;
    const next = this.kind(j + 1);
    if (k === T.Data || k === T.Entity) return next === T.Id;
    if (k === T.Title || k === T.AccTitle || k === T.AccDescr) return true;
    return next === T.FrameId;
  }

  // ---- rules --------------------------------------------------------------------------

  /** `'eventmodeling'` */
  private header(): void {
    this.tested(HEADER);
    if (this.kind() !== T.Header) {
      const text = this.kind() === Kind.EOF ? '' : this.displayed();
      const hint = text.toLowerCase().startsWith('eventmodeling')
        ? 'an event model starts with `eventmodeling`, in lower case and followed by a blank or a line break'
        : 'an event model starts with `eventmodeling`';
      this.fail([T.Header], hint);
    }
    const range = this.range(this.i++);
    this.st.statement('header', range);
    this.children.push({ id: 'eventmodeling', type: 'Header', range });
  }

  /** `(AccDescr | AccTitle | Title | Entity | Frame | Data | Note | Gwt)* EOF` */
  private document(): void {
    for (;;) {
      this.tested(AFTER_STATEMENT);
      const k = this.kind();
      if (k === Kind.EOF) return;
      this.statement(() => this.dispatch(k));
    }
  }

  private dispatch(k: number): void {
    if (k === T.Tf || k === T.Timeframe || k === T.Rf || k === T.Resetframe) this.frame();
    else if (k === T.Entity) this.entity();
    else if (k === T.Data) this.dataBlock();
    else if (k === T.Note) this.note();
    else if (k === T.Gwt) this.gwt();
    else if (k === T.Title || k === T.AccTitle || k === T.AccDescr) this.textLine(k);
    else this.fail(AFTER_STATEMENT);
  }

  /** Record a finished statement: its node, its span. */
  private done(node: EventModelStatementNode, kind: string): void {
    this.children.push(node);
    this.st.statement(kind, node.range);
  }

  /** `Kind`: one of the kind keywords; its short form. */
  private kindOf(): { text: EventModelText; kind: EventModelKind } {
    this.tested(KIND_LIST);
    const kind = KINDS[this.kind()];
    if (kind === undefined) this.fail(KIND_LIST);
    return { text: this.text(), kind };
  }

  /** `QualifiedName: ID ('.' ID)*` */
  private qualifiedName(): EventModelText {
    const first = this.expectText(T.Id);
    let value = first.value;
    for (;;) {
      this.tested(DOT);
      if (this.kind() !== T.Dot) break;
      this.i++;
      value += `.${this.expectText(T.Id, 'a name goes after each `.`').value}`;
    }
    return { value, range: { start: first.range.start, end: this.end() } };
  }

  /** An optional data type between backticks, then a data token of `kind`. */
  private data(kind: number): EventModelDataNode {
    let type: EventModelText | undefined;
    this.tested(BACKTICK);
    if (this.kind() === T.Backtick) {
      this.i++;
      this.tested(DATA_TYPES);
      if (DATA_TYPE_SET[this.kind()] !== 1) this.fail(DATA_TYPES);
      type = this.text();
      this.expect(T.Backtick);
    }
    const token = this.expectText(kind);
    const node: EventModelDataNode = { text: dataText(token.value), range: token.range };
    if (type) node.type = type;
    return node;
  }

  /**
   * A frame keyword, its id, kind and qualified name, then its sources, a data reference and
   * inline data, each optional (see the grammar at the top).
   */
  private frame(): void {
    const k = this.kind();
    const keyword = this.text();
    const frame = this.expectText(T.FrameId);
    this.pending = frame.value;
    // Reported when read (a later syntax error in the frame is its own), reserved only once the
    // frame is complete: a frame that fails reaches no model and takes no id.
    this.duplicate(frame, keyword.range.start);
    const { text: kindText, kind } = this.kindOf();
    const name = this.qualifiedName();
    const node: EventModelFrameNode = {
      id: '',
      type: 'Frame',
      range: { start: keyword.range.start, end: 0 },
      keyword,
      reset: k === T.Rf || k === T.Resetframe,
      frame,
      kind: kindText,
      name,
      children: [],
    };
    for (;;) {
      this.tested(ARROW);
      if (this.kind() !== T.Arrow) break;
      const arrow = this.range(this.i++).start;
      const source = this.expectText(T.FrameId);
      node.children.push({
        id: '',
        type: 'Source',
        range: { start: arrow, end: source.range.end },
        frame: source,
      });
      const relation = { start: arrow, end: source.range.end };
      checkLimit(
        this.st.diagnostics,
        'maxEdges',
        ++this.relations,
        this.opts.maxEdges,
        'relations',
        relation
      );
    }
    this.tested(OPEN_REF);
    if (this.kind() === T.OpenRef) {
      this.i++;
      node.dataRef = this.expectText(T.Id);
      this.expect(T.CloseRef);
    }
    this.tested(INLINE_DATA);
    if (this.kind() === T.Backtick || this.kind() === T.DataInline)
      node.data = this.data(T.DataInline);
    node.range.end = this.end();
    node.id = this.id(`frame:${frame.value}`);
    for (const s of node.children) s.id = this.id(`relation:${s.frame.value}->${frame.value}`);
    this.frameIds.add(frame.value);
    this.pending = undefined;
    this.frames.push({ node, kind });
    checkLimit(
      this.st.diagnostics,
      'maxNodes',
      this.frames.length,
      this.opts.maxNodes,
      'frames',
      node.range
    );
    this.done(node, 'frame');
  }

  /** v12's thrown error (`db.ts` `setAst`): a frame id read before, tf and rf alike. */
  private duplicate(frame: EventModelText, start: number): void {
    if (!this.frameIds.has(frame.value)) return;
    this.st.diagnostics.error(
      EVENTMODELING_DUPLICATE_FRAME,
      `Duplicate event modeling frame ID "${frame.value}" on line ${this.lineOf(start)}`,
      frame.range
    );
  }

  /** `'entity' QualifiedName` */
  private entity(): void {
    const start = this.range(this.i++).start;
    const name = this.qualifiedName();
    const range = { start, end: this.end() };
    this.done({ id: this.id(`entity:${name.value}`), type: 'Entity', range, name }, 'entity');
  }

  /** `'data' ID ('`' DataType '`')? DATA_BLOCK` */
  private dataBlock(): void {
    const start = this.range(this.i++).start;
    const name = this.expectText(T.Id);
    const data = this.data(T.DataBlock);
    const range = { start, end: this.end() };
    this.done({ id: this.id(`data:${name.value}`), type: 'Data', range, name, data }, 'data');
  }

  /** `'note' FID ('`' DataType '`')? DATA_BLOCK` */
  private note(): void {
    const start = this.range(this.i++).start;
    const frame = this.expectText(T.FrameId);
    const data = this.data(T.DataBlock);
    const range = { start, end: this.end() };
    this.done({ id: this.id(`note:${frame.value}`), type: 'Note', range, frame, data }, 'note');
  }

  /** `'gwt' FID 'given' Step+ ('when' Step+)? 'then' Step+` */
  private gwt(): void {
    const start = this.range(this.i++).start;
    const frame = this.expectText(T.FrameId);
    this.expect(T.Given);
    const given = this.steps();
    let when: EventModelGwtStepNode[] = [];
    this.tested(AFTER_GIVEN);
    if (this.kind() === T.When) {
      this.i++;
      when = this.steps();
    } else if (this.kind() !== T.Then) this.fail(AFTER_GIVEN);
    this.tested(AFTER_WHEN);
    if (this.kind() !== T.Then) this.fail(AFTER_WHEN);
    this.i++;
    const then = this.steps();
    const range = { start, end: this.end() };
    const node = { id: this.id(`gwt:${frame.value}`), type: 'Gwt' as const, range, frame };
    this.done({ ...node, given, when, then }, 'gwt');
  }

  /** `Step+`, `Step: Kind ID` */
  private steps(): EventModelGwtStepNode[] {
    const out: EventModelGwtStepNode[] = [];
    do {
      const { text, kind } = this.kindOf();
      const step = { kind: text, name: this.expectText(T.Id) };
      this.stepKinds.set(step, kind);
      out.push(step);
      this.tested(KIND_LIST);
    } while (KINDS[this.kind()] !== undefined);
    return out;
  }

  /** `title …`, `accTitle: …`, `accDescr …` (the last of each wins, as Langium assigns). */
  private textLine(k: number): void {
    const token = this.text();
    // The image keeps the blanks before the keyword (EM_TITLE's `[\t ]*`); the node does not.
    const lead = token.value.length - token.value.trimStart().length;
    const range = { start: token.range.start + lead, end: token.range.end };
    if (k === T.Title) {
      const node: EventModelTextNode = {
        id: this.id('title'),
        type: 'Title',
        range,
        text: titleValue(token.value),
      };
      this.title = node;
      this.done(node, 'title');
    } else if (k === T.AccTitle) {
      const node: EventModelTextNode = {
        id: this.id('accTitle'),
        type: 'AccTitle',
        range,
        text: accTitleValue(token.value),
      };
      this.accTitle = node;
      this.done(node, 'accTitle');
    } else {
      const node: EventModelTextNode = {
        id: this.id('accDescr'),
        type: 'AccDescr',
        range,
        text: accDescrValue(token.value),
      };
      this.accDescr = node;
      this.done(node, 'accDescr');
    }
  }
}
