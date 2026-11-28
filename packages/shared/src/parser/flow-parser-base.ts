/**
 * The flow family parser's base ({@link FlowParser} in `flow-parser.ts` has the grammar rules):
 * the parse state, the token helpers, error reporting and recovery (R-PARSE-4), the token rules
 * and the text of a `@{ … }` block.
 *
 * The grammar is v12's `flow.jison` (LALR); the descent follows the reference implementation's port
 * of it (`src/diagrams/flowchart/parser.ts` at 3a2f075), so it accepts and rejects what jison does.
 * Unlike jison it does not stop at the first error: it reports it, skips to the next statement
 * boundary and carries on (R-PARSE-4). An unclosed label or string, which swallows the rest of the
 * text, is reported at its opener and lexing restarts on the following line. Changed from the
 * reference implementation besides: one parser for flowchart and the grammars cut from it; each
 * diagram gives it its token kinds, tables, lexer and model builder ({@link FlowParserDialect}) and
 * writes its own block rules.
 */
// cspell:words LALR
import {
  cook,
  inKindSet,
  isSpace,
  Kind,
  LBRACE,
  LineIndex,
  ParseState,
  Probe,
  RBRACE,
  significantTokens,
  skipTo,
} from '@mermaid-js/core/parser-kit';
import { STOP } from './support.ts';
import type {
  AstId,
  Diagnostic,
  Diagnostics,
  KindSet,
  ParseOptions,
  Range,
  SourceView,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS } from '@mermaid-js/core/limits';
import type { Limits } from '@mermaid-js/core/limits';
import { parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult, YamlMap } from '@mermaid-js/core/preprocess';
import type { FlowLabelNode, FlowLabelText, FlowLabelType, FlowStatement } from './flow-ast.ts';
import type { FlowKinds } from './flow-kinds.ts';
import type { FlowTables } from './flow-tables.ts';

/**
 * The characters `cook` may read other than they are. `}` counts only with `braceNewline`, but
 * one search serves every dialect: without it a token near a `}` is merely cooked.
 */
const COOKED = /[\r#}]/g;

/**
 * The parse options every dialect has. `maxDepth` caps block nesting, core's
 * `DEFAULT_LIMITS.maxDepth` when unset.
 */
export interface FlowParseOptionsBase extends ParseOptions, Partial<Pick<Limits, 'maxDepth'>> {
  /** Features claimed by extension plugins; `callbacks` silences `CALLBACK_IGNORED`. */
  claims?: readonly string[];
}

/** What a link's arrow says, as v12's `destructLink` read it. */
export interface FlowLinkInfo {
  type: string;
  stroke: string;
  length?: number;
  text?: FlowLabelText;
  id?: string;
}

/** Item of a block body as v12's grammar collects it. */
export type FlowDocItem = string | readonly string[] | { stmt: 'dir'; value: string };

/** What one mention of a vertex sets. */
export interface FlowVertexParts {
  label?: FlowLabelText;
  /** The shape, from brackets or `@{ shape }`. */
  type?: string;
  styles?: string[];
  props?: Record<string, string>;
  /** The parsed `@{ … }` block; null when it did not parse. */
  data?: YamlMap | null;
}

/** What one link statement asks for: every start to every end. */
export interface FlowLinkParts<L extends FlowLinkInfo = FlowLinkInfo> {
  starts: string[];
  ends: string[];
  info: L;
  astFor: (start: string, end: string) => AstId;
  /** The link, for the edge-limit diagnostic. */
  at: Range;
}

/** An edge as the parser reads it back from the builder. */
export interface FlowParserEdge {
  readonly id: string;
  readonly ast: AstId;
  readonly isUserDefinedId: boolean;
  readonly start: string;
  readonly end: string;
}

/** What the parser asks of a diagram's model builder (v12's DB). */
export interface FlowParserBuilder {
  readonly direction: string;
  /** `ast` is written once more after the document, for a vertex only a `style` line made. */
  readonly vertices: ReadonlyMap<string, { ast: AstId }>;
  readonly edges: readonly FlowParserEdge[];
  hasEdge(id: string): boolean;
  edgeNamed(id: string): FlowParserEdge | undefined;
  addVertex(id: string, ast: AstId, at: Range, parts?: FlowVertexParts): void;
  addLink(parts: FlowLinkParts): void;
  updateLink(positions: string[], style: string[], at: Range): boolean;
  updateLinkInterpolate(positions: string[], interpolate: string, at: Range): boolean;
  addClass(ids: string, styles: string[]): void;
  setClass(ids: string, className: string): void;
  setTooltip(ids: string, tooltip: string): void;
  setLink(ids: string, url: string, at: Range, target?: string): void;
  setClickEvent(ids: string, name: string, at: Range, args?: string): void;
  setAccTitle(text: string): void;
  setAccDescription(text: string): void;
  setDirection(dir: string): void;
}

/** What a diagram gives the family's parser. Built once a diagram, at module scope. */
export interface FlowParserDialect<B extends FlowParserBuilder, O extends FlowParseOptionsBase> {
  /** The diagram's token kinds. */
  readonly kinds: FlowKinds;
  /** Its tables (`flowTables`). */
  readonly tables: FlowTables;
  /** The text v12 lexed, from the body's start. */
  view(src: string, pre: PreprocessResult, options: O): SourceView;
  /** Its lexer. */
  lex(
    src: string,
    from: number,
    view: SourceView,
    graphKeyword: boolean,
    probe?: Probe
  ): TokenStream;
  /** A model builder for one parse, reporting to `diagnostics`. */
  builder(options: O, diagnostics: Diagnostics): B;
  /** v12's `destructLink`: an arrow's text, and the text that opened its label if any. */
  destructLink(end: string, start?: string): FlowLinkInfo;
  /**
   * v12 12.3.0's `node shapeData spaceList` (D621): blanks after `@{ … }` may end the node, so
   * an edge id, a link or the end of the statement may follow them. Off, as in 12.2.0, only
   * `&` and another node may.
   */
  readonly blanksAfterData: boolean;
}

/** The `maxNodes`, `maxEdges` and `inheritDir` a builder is made with, from the parse options. */
export function flowBuilderLimits(
  options: Partial<Pick<Limits, 'maxEdges' | 'maxNodes'>> & { inheritDir?: boolean }
): { maxEdges: number; maxNodes: number; inheritDir: boolean } {
  return {
    maxEdges: options.maxEdges ?? DEFAULT_LIMITS.maxEdges,
    maxNodes: options.maxNodes ?? DEFAULT_LIMITS.maxNodes,
    inheritDir: options.inheritDir ?? false,
  };
}

/** A bracket or label open around the current token. */
export interface FlowOpener {
  range: Range;
  what: string;
  closer: string;
}

/** A parsed `@{ … }` block. */
export interface FlowShapeData {
  value: YamlMap | null;
  range: Range;
}

/** The text of a `@{ … }` block (of blocks back to back), before it is read as YAML. */
export interface FlowDataBlock {
  /** The text v12 read: the pieces joined, a line break inside a string as `<br/>`. */
  built: string;
  /** The first `@{`. */
  opener: Range;
  /** From the first `@{` to the last `}`. */
  whole: Range;
  /** Between them. */
  inner: Range;
  /** Whether `built` is the source text between them, so it can be read where it stands. */
  inPlace: boolean;
  multiline: boolean;
}

/**
 * One parse. Each grammar rule is a method; `i` indexes the significant tokens. A rule that
 * fails records a diagnostic and throws {@link STOP}; the statement loop catches it and
 * recovers. `X` is the dialect's own statement nodes, `F` what it keeps of an open block.
 */
export abstract class FlowParserBase<
  B extends FlowParserBuilder,
  O extends FlowParseOptionsBase,
  X,
  F,
> {
  protected readonly T: FlowKinds;
  protected readonly tb: FlowTables;
  protected readonly pre: PreprocessResult;
  protected readonly view: SourceView;
  protected readonly st = new ParseState();
  protected readonly ids: ParseState['ids'];
  protected readonly db: B;
  protected readonly fullTokens: TokenStream;
  protected tokens: TokenView;
  protected i = 0;
  /** Probe mode only (R-LANG-7). */
  protected readonly probe: Probe | undefined;
  /** Source offset {@link tokens} was lexed from (after a restart, mid-document). */
  protected viewFrom: number;
  /** Line numbers, built for messages only. */
  private lines: LineIndex | undefined;
  /** Brackets and labels open around the current token, innermost last. */
  protected readonly opens: FlowOpener[] = [];
  /** How the current statement is written, for errors inside it. */
  protected hint: string | undefined;
  // Lexing restarts in the initial state after an error inside a label or other lexer mode,
  // which would otherwise swallow the following lines.
  private restartFrom = -1;
  private lastRestart = -1;
  private restarts = 0;
  // The document, and the blocks open around the current statement.
  protected readonly children: FlowStatement<X>[] = [];
  protected readonly frames: F[] = [];
  protected readonly maxDepth: number;
  /** What v12's grammar collects into the innermost open block. */
  protected list: FlowDocItem[] = [];
  protected collect = false;
  protected body: FlowStatement<X>[];

  constructor(
    protected readonly src: string,
    protected readonly options: O,
    protected readonly dialect: FlowParserDialect<B, O>
  ) {
    this.T = dialect.kinds;
    const tb = (this.tb = dialect.tables);
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    this.view = dialect.view(src, pre, options);
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.ids = this.st.ids;
    this.db = dialect.builder(options, this.st.diagnostics);
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.body = this.children;
    const probe =
      options.probe === undefined ? undefined : new Probe(src, options.probe, tb.PROBE_FOLLOWS);
    this.viewFrom = pre.bodyStart;
    this.probe = probe;
    this.fullTokens = dialect.lex(src, pre.bodyStart, this.view, true, probe);
    this.tokens = significantTokens(this.fullTokens, tb.PARSER_TRIVIA);
    if (probe) {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.fullTokens);
    }
  }

  // ---- tokens -------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.tokens.kind[j] ?? Kind.EOF;
  }

  protected start(j: number): number {
    return this.tokens.start[j] ?? 0;
  }

  protected end(j: number): number {
    return this.tokens.end[j] ?? 0;
  }

  /**
   * Without removed spans or a mask, `src[lo, hi)` holds none of {@link COOKED}, so a token
   * whose text and the character before it lie inside reads as it is (`isPlainRange`).
   * `hi` is the first such character at or after `lo` (the end without one): a token past it
   * searches again from the character before it, so each part of the source is searched once.
   */
  private lo = 0;
  private hi = 0;

  /** A token's text as v12 saw it (removed spans dropped, entities decoded). */
  protected raw(j = this.i): string {
    const { src, view } = this;
    const s = this.start(j);
    const e = this.end(j);
    if (view.holes.length === 0 && !view.mask) {
      if (s > this.hi) {
        COOKED.lastIndex = this.lo = s - 1;
        this.hi = COOKED.test(src) ? COOKED.lastIndex - 1 : src.length;
      }
      if (s > this.lo && e <= this.hi) return src.slice(s, e);
    }
    return cook(src, s, e, view);
  }

  /**
   * Probe hook: the parser tests the current token for `kinds` (a constant list), or would
   * accept them there. Records them when it is the probed token.
   */
  protected tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.tokens, this.i, this.viewFrom)) p.tested(kinds, this.start(this.i));
  }

  /** Source start of a token, with the quotes around a string (the lexer drops them). */
  protected tokStart(j: number): number {
    const { src, T } = this;
    const s = this.start(j);
    const k = this.kind(j);
    if (k === T.Str && src[s - 1] === '"') return s - 1;
    if (k === T.MdStr && src.startsWith('"`', s - 2)) return s - 2;
    // `click` and its blanks, and `accDescr {` and the blanks around `{`, are consumed
    // without a token (the lexer's RE_CLICK and RE_ACC_DESCR_ML).
    if (k === T.Click) return this.keywordBefore(s, 'click', false) ?? s;
    if (k === T.AccDescrMultilineValue) return this.keywordBefore(s, 'accDescr', true) ?? s;
    return s;
  }

  /**
   * The source start of `word`, then blanks (with `{` and more blanks when `brace`), that end
   * at the source offset `at`, if they are there.
   */
  protected keywordBefore(at: number, word: string, brace: boolean): number | undefined {
    const { src } = this;
    let b = at;
    while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
    if (brace) {
      if (src.charCodeAt(b - 1) !== LBRACE) return undefined;
      b--;
      while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
    }
    return src.startsWith(word, b - word.length) ? b - word.length : undefined;
  }

  /** Source end of a token, with what the lexer consumed after it without a token. */
  protected tokEnd(j: number): number {
    const { T } = this;
    const e = this.end(j);
    const k = this.kind(j);
    if (k === T.Str && this.src[e] === '"') return e + 1;
    if (k === T.MdStr && this.src.startsWith('`"', e)) return e + 2;
    // The closing `}` of `accDescr { … }` is consumed without a token.
    if (k === T.AccDescrMultilineValue && this.src.charCodeAt(e) === RBRACE) return e + 1;
    return e;
  }

  protected range(a: number, b = a): Range {
    return { start: this.tokStart(a), end: this.tokEnd(b) };
  }

  /** From token `from` to the last one consumed. */
  protected span(from: number): Range {
    const start = this.tokStart(from);
    return { start, end: this.i > from ? this.tokEnd(this.i - 1) : start };
  }

  /** Concatenated token text of a run (ids, styles), as v12 joined the token texts. */
  protected runText(from: number, to: number): string {
    let s = '';
    for (let j = from; j < to; j++) s += this.raw(j);
    return s;
  }

  // ---- errors and recovery ------------------------------------------------------------

  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  protected found(j = this.i): string {
    const { T } = this;
    const k = this.kind(j);
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === T.Space) return 'a space';
    if (k === Kind.Error) return `the character \`${this.raw(j)}\``;
    const { src } = this;
    const quoted = k === T.Str || k === T.MdStr;
    const t = (
      quoted
        ? src.slice(this.tokStart(j), this.start(j)) +
          this.raw(j) +
          src.slice(this.end(j), this.tokEnd(j))
        : this.raw(j)
    ).trim();
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Offset of the line break ending the line that holds `at`. */
  protected lineBreakAfter(at: number): number {
    const { src } = this;
    let e = at;
    while (e < src.length && src[e] !== '\n' && src[e] !== '\r') e++;
    return e;
  }

  /** The next statement boundary (`;` or line break) at or after `at`. */
  private boundaryAfter(at: number): number {
    const { src } = this;
    let e = at;
    while (e < src.length && src[e] !== '\n' && src[e] !== '\r' && src[e] !== ';') e++;
    return e;
  }

  private restartAt(at: number): void {
    if (at > this.lastRestart && at <= this.src.length && this.restarts < 64) {
      this.restartFrom = at;
    }
  }

  /** A fix hint for common slips, from the text found where the error is. */
  private hintFor(text: string): string | undefined {
    if (/^\s*[-=.<>ox~]+\s*$/.test(text) && /[-=.~]/.test(text)) return this.tb.linkHint;
    return undefined;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint?: string): never {
    this.tested(want);
    const { st, opens, tb } = this;
    const k = this.kind();
    const where = this.range(this.i);
    this.unclosedString(k, where);
    const open = opens[opens.length - 1];
    if (open) this.unclosed(open, k, where, want);
    // The tokens after an error may come from a lexer mode the bad text opened (`>` starts a
    // label, for one): lex again from the next statement boundary.
    this.restartAt(
      opens.length > 0 || inKindSet(tb.LEXER_MODE, k) || (k === Kind.Error && this.raw() === '#')
        ? this.lineBreakAfter(where.start)
        : this.boundaryAfter(where.start)
    );
    if (k === Kind.Error) this.badCharacter(want, hint, where);
    st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      tb.EXPECTED.names(want),
      this.found(),
      undefined,
      hint ?? this.explain(want, open !== undefined)
    );
    throw STOP;
  }

  /** {@link fail} for a string that ran to the end of the text; returns when that is not it. */
  private unclosedString(k: number, where: Range): void {
    const { st, src, T } = this;
    if (k !== Kind.EOF) return;
    const prev = this.i - 1;
    const prevKind = this.kind(prev);
    if ((prevKind !== T.Str && prevKind !== T.MdStr) || this.end(prev) < src.length) return;
    const q = { start: this.tokStart(prev), end: this.start(prev) };
    st.diagnostics.error(
      'UNCLOSED_STRING',
      prevKind === T.MdStr
        ? `Unclosed markdown string: the string opened at line ${this.lineOf(q.start)} has no closing backtick and quote.`
        : `Unclosed string: the string opened at line ${this.lineOf(q.start)} has no closing quote.`,
      q,
      { related: [{ message: 'The text ends here.', range: where }] }
    );
    this.restartAt(this.lineBreakAfter(q.end));
    throw STOP;
  }

  /**
   * {@link fail} inside `open`, when the text ends or the error is on a later line than the
   * opener; returns when it is on the opener's line.
   */
  private unclosed(open: FlowOpener, k: number, where: Range, want: readonly number[]): void {
    const { st, src, tb } = this;
    const atEnd = k === Kind.EOF;
    if (!atEnd && this.lineOf(where.start) <= this.lineOf(open.range.start)) return;
    const got = atEnd ? '' : ` before ${this.found()} at line ${this.lineOf(where.start)}`;
    st.diagnostics.error(
      'UNCLOSED',
      `Unclosed ${open.what}: the \`${src.slice(open.range.start, open.range.end)}\` at line ${this.lineOf(open.range.start)} has no closing ${open.closer}${got}. Add ${open.closer} to close it.`,
      open.range,
      {
        expected: tb.EXPECTED.names(want),
        related: [{ message: atEnd ? 'The text ends here.' : 'Found here.', range: where }],
      }
    );
    // The label swallowed the lines after it: carry on from the line after its opener.
    this.restartAt(this.lineBreakAfter(open.range.end));
    throw STOP;
  }

  /** {@link fail} at a character the lexer has no token for. */
  private badCharacter(want: readonly number[], hint: string | undefined, where: Range): never {
    const { st, src, tb } = this;
    const text = this.raw();
    if (text === '#' && /^#\w+;/.test(src.slice(where.start, where.start + 40))) {
      st.diagnostics.error(
        'ENTITY_OUTSIDE_LABEL',
        'Entities such as `#quot;` work only inside labels: put the text in a label, e.g. `A["#quot;"]`.',
        where
      );
      throw STOP;
    }
    const why = hint ?? this.hintFor(text);
    st.diagnostics.error(
      'UNEXPECTED_CHARACTER',
      `Unexpected character \`${text}\`${why ? `; ${why}` : ''}.`,
      where,
      { expected: tb.EXPECTED.names(want) }
    );
    throw STOP;
  }

  /** A fix for an unexpected token, from what it is and where. */
  private explain(want: readonly number[], inLabel: boolean): string | undefined {
    const { T, tb } = this;
    const k = this.kind();
    const text = this.raw();
    if (inLabel && /^[[\](){}|]/.test(text)) {
      return 'to use brackets in a label, put it in quotes, e.g. `A["a (b)"]`';
    }
    if (inLabel && (k === T.Str || k === T.MdStr)) {
      return 'to use quotes in a label, quote it all and write them as `#quot;`, e.g. `A["say #quot;hi#quot;"]`';
    }
    const general = this.hintFor(text);
    if (general) return general;
    if (inKindSet(tb.KEYWORDS, k)) {
      const word = text.trim();
      return `\`${word}\` is a keyword: use another node id, and \`${word}\` as its label if needed, e.g. \`X[${word}]\``;
    }
    if (want === tb.LINE_END && inKindSet(tb.ID, k)) {
      return 'put each statement on its own line, or separate them with `;`';
    }
    return this.hint;
  }

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  protected recover(): void {
    this.opens.length = 0;
    const { probe, tb } = this;
    if (this.restartFrom < 0) {
      probe?.freeze();
      this.i = skipTo(this.tokens, this.i, tb.BOUNDARY);
      return;
    }
    const from = this.restartFrom;
    this.restartFrom = -1;
    this.lastRestart = from;
    this.restarts++;
    // Text lexed again before the probe offset replaces what the probe saw there. A restart at
    // or after it skipped the probed token: the probe is done.
    const lexedAgain = probe !== undefined && from < probe.offset ? probe : undefined;
    if (lexedAgain) lexedAgain.reset();
    else probe?.freeze(true);
    this.tokens = significantTokens(
      this.dialect.lex(this.src, from, this.view, false, lexedAgain),
      tb.PARSER_TRIVIA
    );
    this.viewFrom = from;
    this.i = 0;
  }

  // ---- token rules --------------------------------------------------------------------

  protected expect(k: number, ...also: number[]): number {
    if (this.probe !== undefined) this.tested([k, ...also]);
    if (this.kind() !== k) this.fail([k, ...also]);
    return this.i++;
  }

  protected separator(): void {
    const { tb } = this;
    this.tested(tb.LINE_END);
    if (!inKindSet(tb.LINE_END_SET, this.kind())) this.fail(tb.LINE_END);
    this.i++;
  }

  private run(table: KindSet, want: readonly number[]): [string, Range] {
    this.tested(want);
    if (!inKindSet(table, this.kind())) this.fail(want);
    const from = this.i++;
    for (;;) {
      this.tested(want);
      if (!inKindSet(table, this.kind())) break;
      this.i++;
    }
    return [this.runText(from, this.i), this.span(from)];
  }

  protected idString(): [string, Range] {
    return this.run(this.tb.ID, this.tb.STYLE_WANT);
  }

  protected alphaNum(): [string, Range] {
    return this.run(this.tb.ALPHANUM, this.tb.STYLE_WANT);
  }

  /**
   * A label: a string (one Str/MdStr token) or a first text token, then more text tokens of
   * `part` (jison's left-recursive `text`).
   */
  protected labelRun(
    part: KindSet,
    want: readonly number[],
    strType: FlowLabelType
  ): FlowLabelNode {
    const { T } = this;
    const from = this.i;
    this.tested(want);
    const k = this.kind();
    let type: FlowLabelType;
    if (k === T.Str || k === T.MdStr) type = k === T.Str ? strType : 'markdown';
    else if (inKindSet(part, k)) type = 'text';
    else return this.fail(want);
    this.i++;
    for (;;) {
      this.tested(want);
      if (!inKindSet(part, this.kind())) break;
      this.i++;
    }
    return { text: this.runText(from, this.i), type, range: this.span(from) };
  }

  protected text(): FlowLabelNode {
    return this.labelRun(this.tb.TEXT_PART, this.tb.TEXT_WANT, 'string');
  }

  protected edgeText(): FlowLabelNode {
    return this.labelRun(this.tb.EDGE_PART, this.tb.EDGE_WANT, 'string');
  }

  protected textNoTags(): FlowLabelNode {
    return this.labelRun(this.tb.NO_TAGS, this.tb.NO_TAGS_WANT, 'text');
  }

  /** Consume an opener, remembered for errors until {@link closer}. */
  protected open(what: string, close: string): void {
    this.opens.push({ range: this.range(this.i), what, closer: close });
    this.i++;
  }

  protected closer(k: number): void {
    this.expect(k, this.T.Text);
    this.opens.pop();
  }

  // ---- `@{ … }` -----------------------------------------------------------------------

  /** The `@{ … }` block at the cursor, as the dialect reads it. */
  protected abstract shapeData(): FlowShapeData;

  /**
   * The text of the `@{ … }` at the cursor, as v12 put it together: blocks back to back are
   * one, a line break in a string is `<br/>`.
   */
  protected dataBlock(): FlowDataBlock {
    const { src, T, tb } = this;
    const opener = this.range(this.i);
    this.i++;
    const text = { built: '', inString: false };
    let close: number;
    let blockOpener = opener;
    for (;;) {
      this.dataPieces(text);
      if (this.kind() !== T.ShapeDataEnd) {
        this.opens.push({ range: blockOpener, what: tb.dataName, closer: '`}`' });
        this.fail([T.ShapeDataEnd]);
      }
      close = this.start(this.i);
      this.i++;
      // Blocks back to back (`A@{…}@{…}`) are one: v12's `shapeData` rule joins their texts.
      this.tested(tb.SHAPE_DATA);
      if (this.kind() !== T.ShapeData) break;
      blockOpener = this.range(this.i);
      this.i++;
    }
    const { built } = text;
    const inner = { start: opener.end, end: close };
    return {
      built,
      opener,
      whole: { start: opener.start, end: close + 1 },
      inner,
      // v12 parsed `{\n<data>\n}`; a `#` comment reads differently without those newlines.
      inPlace: src.slice(inner.start, inner.end) === built && !built.includes('#'),
      multiline: built.includes('\n'),
    };
  }

  /**
   * The text tokens of one `@{ … }` added to `text.built`. A string may run from one block
   * into the next, so `text.inString` carries on.
   */
  private dataPieces(text: { built: string; inString: boolean }): void {
    const { T, tb } = this;
    for (;;) {
      this.tested(tb.SHAPE_DATA_PARTS);
      if (this.kind() !== T.ShapeData) return;
      const piece = this.raw();
      if (piece === '"' && this.end(this.i) === this.start(this.i) + 1) {
        text.inString = !text.inString;
        text.built += piece;
      } else text.built += text.inString ? piece.replace(/\n\s*/g, '<br/>') : piece;
      this.i++;
    }
  }

  /**
   * `block` read as YAML: several lines as block YAML, one line as `{ … }`, from the source
   * offset `braceAt` of its `{` when it is read where it stands.
   */
  protected readData(block: FlowDataBlock, braceAt: number): ReturnType<typeof parseYaml> {
    const { built, whole, inner, inPlace, multiline } = block;
    return inPlace
      ? parseYaml(this.src, multiline ? inner : { start: braceAt, end: whole.end })
      : parseYaml(multiline ? built + '\n' : `{\n${built}\n}`);
  }

  /**
   * Report a block's YAML diagnostics, at their own ranges when `ranged`, else at `whole`. An
   * error is semantic: the tokens are fine, so the parse goes on and reports later errors in
   * the same statement too (R-PARSE-4).
   */
  protected reportData(diagnostics: readonly Diagnostic[], ranged: boolean, whole: Range): void {
    const { st } = this;
    for (const d of diagnostics) {
      const r = ranged ? d.range : whole;
      if (d.severity === 'error') {
        st.diagnostics.error('SHAPE_DATA', d.message, r);
      } else st.diagnostics.warning(d.code, d.message, r);
    }
  }
}
