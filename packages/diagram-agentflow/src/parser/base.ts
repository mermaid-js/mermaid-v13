/**
 * The agentflow parser's base (`parser.ts`): the parse state, the token helpers, error reporting
 * and recovery (R-PARSE-4), the token rules and `@{ … }` metadata.
 *
 * Split from the parser (a copy of v13 flowchart's, D467); flowchart's parser is ported from
 * Pele's `src/diagrams/flowchart/parser.ts` at 3a2f075 (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano).
 * cspell:ignore kepano
 */
import {
  cook,
  inKindSet,
  isSpace,
  Kind,
  LBRACE,
  LineIndex,
  localOffset,
  ParseState,
  Probe,
  RBRACE,
  significantTokens,
  skipTo,
  SourceOffsets,
} from '@mermaid-js/core/parser-kit';
import type {
  KindSet,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS } from '@mermaid-js/core/limits';
import { isYamlMap, parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import {
  ALPHANUM,
  BOUNDARY,
  EDGE_PART,
  EXPECTED,
  hintFor,
  ID,
  LEXER_MODE,
  LINE_END,
  LINE_END_SET,
  NO_TAGS,
  PARSER_TRIVIA,
  PROBE_FOLLOWS,
  SHAPE_DATA,
  SHAPE_DATA_PARTS,
  STOP,
  TEXT_PART,
} from './tables.ts';
import type { Frame, Opener, ShapeData } from './tables.ts';
import type { AgentflowDocument, AgentflowLabelNode, AgentflowStatementNode } from './ast.ts';
import { lex } from './lexer.ts';
import { AgentflowBuilder } from './model.ts';
import type { AgentflowModel, DocItem, LabelType } from './model.ts';
import { agentflowSourceView, MAX_TEXT_SIZE } from './source.ts';
import { stripLineTrailingCommas } from './trailing-commas.ts';
import { T } from './tokens.ts';

export interface AgentflowParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /**
   * v12's `maxTextSize` (the site config's): past it v12 parsed the text without its comments
   * (`agentflowSourceView`).
   */
  maxTextSize?: number;
  /** Edge cap (core `DEFAULT_LIMITS.maxEdges`; v12's `maxEdges` was 500). */
  maxEdges?: number;
  /** Vertex cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number;
  /** Flow nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
  /** v12 `flowchart.inheritDir`, which agentflow reads (D466). */
  inheritDir?: boolean;
  /** Features claimed by extension plugins; `callbacks` silences `CALLBACK_IGNORED`. */
  claims?: readonly string[];
}

export type AgentflowParseResult = ParseResult<AgentflowModel, AgentflowDocument>;

/**
 * One parse. Each grammar rule is a method; `i` indexes the significant tokens. A rule that
 * fails records a diagnostic and throws {@link STOP}; the statement loop catches it and
 * recovers.
 */
export abstract class ParserBase {
  protected readonly pre: PreprocessResult;
  protected readonly view: SourceView;
  protected readonly st = new ParseState();
  protected readonly ids: ParseState['ids'];
  protected readonly db: AgentflowBuilder;
  protected readonly fullTokens: TokenStream;
  protected tokens: TokenView;
  protected i = 0;
  /** Probe mode only (R-LANG-7). */
  protected readonly probe: Probe | undefined;
  /** Source offset {@link tokens} was lexed from (after a restart, mid-document). */
  protected viewFrom: number;
  /** Text offsets to source offsets, for {@link keywordBefore}; made on first use. */
  protected offsets: SourceOffsets | undefined;
  /** Directive starts by their end, for ranges over the blanks around them. */
  protected directiveAt: Map<number, number> | undefined;
  /** Line numbers, built for messages only. */
  protected lines: LineIndex | undefined;
  /** Brackets and labels open around the current token, innermost last. */
  protected readonly opens: Opener[] = [];
  /** How the current statement is written, for errors inside it. */
  protected hint: string | undefined;
  // Lexing restarts in the initial state after an error inside a label or other lexer mode,
  // which would otherwise swallow the following lines.
  protected restartFrom = -1;
  protected lastRestart = -1;
  protected restarts = 0;
  // The document, and the blocks open around the current statement.
  protected readonly children: AgentflowStatementNode[] = [];
  protected readonly frames: Frame[] = [];
  protected readonly maxDepth: number;
  /** What v12's grammar collects into the innermost open block. */
  protected list: DocItem[] = [];
  protected collect = false;
  protected body: AgentflowStatementNode[];

  constructor(
    protected readonly src: string,
    protected readonly options: AgentflowParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    this.view = agentflowSourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range),
      options.maxTextSize ?? MAX_TEXT_SIZE
    );
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.ids = this.st.ids;
    const diagnostics = this.st.diagnostics;
    this.db = new AgentflowBuilder({
      maxEdges: options.maxEdges ?? DEFAULT_LIMITS.maxEdges,
      maxNodes: options.maxNodes ?? DEFAULT_LIMITS.maxNodes,
      inheritDir: options.inheritDir ?? false,
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
      warn: (code, message, range, extra) => {
        const { related, astIds } = extra ?? {};
        const d = diagnostics.warning(code, message, range, related ? { related } : undefined);
        // Core's render `Warning` keeps `astIds` (and drops `related`): `AgentflowParseWarning`.
        if (astIds) Object.assign(d, { astIds });
      },
    });
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.body = this.children;
    const probe =
      options.probe === undefined ? undefined : new Probe(src, options.probe, PROBE_FOLLOWS);
    this.viewFrom = pre.bodyStart;
    this.probe = probe;
    this.fullTokens = lex(src, pre.bodyStart, this.view, true, probe);
    this.tokens = significantTokens(this.fullTokens, PARSER_TRIVIA);
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

  /** A token's text as v12 saw it (removed spans dropped, entities decoded). */
  protected raw(j = this.i): string {
    return cook(this.src, this.start(j), this.end(j), this.view);
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
    const { src } = this;
    const s = this.start(j);
    const k = this.kind(j);
    if (k === T.Str && src[s - 1] === '"') return s - 1;
    if (k === T.MdStr && src.startsWith('"`', s - 2)) return s - 2;
    // `click` and its blanks, and `accDescr {` and the blanks around `{`, are consumed
    // without a token (RE_CLICK, RE_ACC_DESCR_ML).
    if (k === T.Click) return this.keywordBefore(s, 'click', false) ?? s;
    if (k === T.AccDescrMultilineValue) return this.keywordBefore(s, 'accDescr', true) ?? s;
    return s;
  }

  /**
   * The source start of `word`, then blanks (with `{` and more blanks when `brace`), that end
   * at `at` in the text v12 lexed (a directive may stand anywhere in them), if they are there.
   */
  protected keywordBefore(at: number, word: string, brace: boolean): number | undefined {
    const { view } = this;
    const t = view.text;
    let b = localOffset(view, at);
    while (b > 0 && isSpace(t.charCodeAt(b - 1))) b--;
    if (brace) {
      if (t.charCodeAt(b - 1) !== LBRACE) return undefined;
      b--;
      while (b > 0 && isSpace(t.charCodeAt(b - 1))) b--;
    }
    const i = b - word.length;
    if (i < 0 || !t.startsWith(word, i)) return undefined;
    if (!view.runs) return i;
    // One cursor per parse: the tokens come in source order, so its walks add up to one pass.
    this.offsets ??= new SourceOffsets(view.runs);
    return this.offsets.source(i);
  }

  /** The end of the text before the blanks (and directives) that end at `at`. */
  protected blanksAfter(from: number, at: number): number {
    const { src } = this;
    let e = at;
    for (;;) {
      while (e > from && (src[e - 1] === ' ' || src[e - 1] === '\t')) e--;
      const d = (this.directiveAt ??= new Map(
        this.pre.directives.map((x) => [x.range.end, x.range.start])
      )).get(e);
      if (d === undefined || d < from) return e;
      e = d;
    }
  }

  protected tokEnd(j: number): number {
    const e = this.end(j);
    const k = this.kind(j);
    if (k === T.Str && this.src[e] === '"') return e + 1;
    if (k === T.MdStr && this.src.startsWith('`"', e)) return e + 2;
    // `end` and `global` take the blanks after them (`[ \t]*`).
    if (k === T.End || k === T.Global) return this.blanksAfter(this.start(j), e);
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
    const k = this.kind(j);
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === T.Space) return 'a space';
    if (k === T.Comment) return 'a comment';
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
  protected boundaryAfter(at: number): number {
    const { src } = this;
    let e = at;
    while (e < src.length && src[e] !== '\n' && src[e] !== '\r' && src[e] !== ';') e++;
    return e;
  }

  protected restartAt(at: number): void {
    if (at > this.lastRestart && at <= this.src.length && this.restarts < 64) {
      this.restartFrom = at;
    }
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint?: string): never {
    this.tested(want);
    const { st, src, opens, i } = this;
    const k = this.kind();
    const where = this.range(i);
    const open = opens[opens.length - 1];
    const prev = i - 1;
    const prevKind = this.kind(prev);
    if (
      k === Kind.EOF &&
      (prevKind === T.Str || prevKind === T.MdStr) &&
      this.end(prev) >= src.length
    ) {
      // A string ran to the end of the text.
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
    if (open && (k === Kind.EOF || this.lineOf(where.start) > this.lineOf(open.range.start))) {
      const got =
        k === Kind.EOF ? '' : ` before ${this.found()} at line ${this.lineOf(where.start)}`;
      st.diagnostics.error(
        'UNCLOSED',
        `Unclosed ${open.what}: the \`${src.slice(open.range.start, open.range.end)}\` at line ${this.lineOf(open.range.start)} has no closing ${open.closer}${got}. Add ${open.closer} to close it.`,
        open.range,
        {
          expected: EXPECTED.names(want),
          related: [
            { message: k === Kind.EOF ? 'The text ends here.' : 'Found here.', range: where },
          ],
        }
      );
      // The label swallowed the lines after it: carry on from the line after its opener.
      this.restartAt(this.lineBreakAfter(open.range.end));
      throw STOP;
    }
    // The tokens after an error may come from a lexer mode the bad text opened (`>` starts a
    // label, for one): lex again from the next statement boundary.
    this.restartAt(
      opens.length > 0 || inKindSet(LEXER_MODE, k) || (k === Kind.Error && this.raw() === '#')
        ? this.lineBreakAfter(where.start)
        : this.boundaryAfter(where.start)
    );
    if (
      k === Kind.Error &&
      this.raw() === '#' &&
      /^#\w+;/.test(src.slice(where.start, where.start + 40))
    ) {
      st.diagnostics.error(
        'ENTITY_OUTSIDE_LABEL',
        'Entities such as `#quot;` work only inside labels: put the text in a label, e.g. `A["#quot;"]`.',
        where
      );
      throw STOP;
    }
    if (k === Kind.Error) {
      const why = hint ?? hintFor(this.raw());
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${this.raw()}\`${why ? `; ${why}` : ''}.`,
        where,
        { expected: EXPECTED.names(want) }
      );
      throw STOP;
    }
    const d = st.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), this.found());
    const why = hint ?? this.explain(want, open !== undefined);
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  /** A fix for an unexpected token, from what it is and where. */
  protected explain(want: readonly number[], inLabel: boolean): string | undefined {
    const k = this.kind();
    const text = this.raw();
    if (inLabel && /^[[\](){}|]/.test(text)) {
      return 'to use brackets in a label, put it in quotes, e.g. `A["a (b)"]`';
    }
    if (inLabel && (k === T.Str || k === T.MdStr)) {
      return 'to use quotes in a label, quote it all and write them as `#quot;`, e.g. `A["say #quot;hi#quot;"]`';
    }
    const general = hintFor(text);
    if (general) return general;
    if (k === T.End || k === T.Graph || k === T.Flow || k === T.Global || k === T.Connector) {
      const word = text.trim();
      return `\`${word}\` is a keyword: use another node id, and \`${word}\` as its label if needed, e.g. \`X[${word}]\``;
    }
    if (want === LINE_END && inKindSet(ID, k)) {
      return 'put each statement on its own line, or separate them with `;`';
    }
    return this.hint;
  }

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  protected recover(): void {
    this.opens.length = 0;
    const { probe } = this;
    if (this.restartFrom < 0) {
      probe?.freeze();
      this.i = skipTo(this.tokens, this.i, BOUNDARY);
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
      lex(this.src, from, this.view, false, lexedAgain),
      PARSER_TRIVIA
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
    this.tested(LINE_END);
    if (!inKindSet(LINE_END_SET, this.kind())) this.fail(LINE_END);
    this.i++;
  }

  protected run(table: KindSet, want: readonly number[]): [string, Range] {
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
    return this.run(ID, [T.NodeString]);
  }

  protected alphaNum(): [string, Range] {
    return this.run(ALPHANUM, [T.NodeString]);
  }

  /**
   * A label: a string (one Str/MdStr token) or a first text token, then more text tokens of
   * `part` (jison's left-recursive `text`).
   */
  protected labelRun(
    part: KindSet,
    first: KindSet,
    want: readonly number[],
    strType: LabelType
  ): AgentflowLabelNode {
    const from = this.i;
    this.tested(want);
    const k = this.kind();
    let type: LabelType;
    if (k === T.Str || k === T.MdStr) type = k === T.Str ? strType : 'markdown';
    else if (inKindSet(first, k)) type = 'text';
    else return this.fail(want);
    this.i++;
    for (;;) {
      this.tested(want);
      if (!inKindSet(part, this.kind())) break;
      this.i++;
    }
    return { text: this.runText(from, this.i), type, range: this.span(from) };
  }

  protected text(): AgentflowLabelNode {
    return this.labelRun(TEXT_PART, TEXT_PART, [T.Text, T.Str], 'string');
  }

  protected edgeText(): AgentflowLabelNode {
    return this.labelRun(EDGE_PART, EDGE_PART, [T.EdgeText, T.Str], 'string');
  }

  protected textNoTags(): AgentflowLabelNode {
    return this.labelRun(NO_TAGS, NO_TAGS, [T.NodeString, T.Str], 'text');
  }

  /** Consume an opener, remembered for errors until {@link closer}. */
  protected open(what: string, close: string): void {
    this.opens.push({ range: this.range(this.i), what, closer: close });
    this.i++;
  }

  protected closer(k: number): void {
    this.expect(k, T.Text);
    this.opens.pop();
  }

  // ---- metadata -----------------------------------------------------------------------

  /**
   * `@{ … }`, read as v12 read it: blocks back to back are one, a newline in a string is
   * `<br/>`, one line is read as `{ … }`, several as block YAML, retried once without the
   * commas that end a line when that fails (v12's trailing-comma retry, D464).
   */
  protected shapeData(): ShapeData {
    const { st, src } = this;
    const opener = this.range(this.i);
    this.i++;
    let built = '';
    let inString = false;
    let close: number;
    let blockOpener = opener;
    for (;;) {
      for (;;) {
        this.tested(SHAPE_DATA_PARTS);
        if (this.kind() !== T.ShapeData) break;
        const piece = this.raw();
        if (piece === '"' && this.end(this.i) === this.start(this.i) + 1) {
          inString = !inString;
          built += piece;
        } else built += inString ? piece.replace(/\n\s*/g, '<br/>') : piece;
        this.i++;
      }
      if (this.kind() !== T.ShapeDataEnd) {
        this.opens.push({ range: blockOpener, what: 'metadata', closer: '`}`' });
        this.fail([T.ShapeDataEnd]);
      }
      close = this.start(this.i);
      this.i++;
      // Blocks back to back (`A@{…}@{…}`) are one: v12's `shapeData` rule joins their texts.
      this.tested(SHAPE_DATA);
      if (this.kind() !== T.ShapeData) break;
      blockOpener = this.range(this.i);
      this.i++;
    }
    const whole: Range = { start: opener.start, end: close + 1 };
    const inner = { start: opener.end, end: close };
    // v12 parsed `{\n<data>\n}`; a `#` comment reads differently without those newlines.
    const inPlace = src.slice(inner.start, inner.end) === built && !built.includes('#');
    const multiline = built.includes('\n');
    // One line is read from the opener's `{` (a directive may stand between `@` and `{`).
    let result = inPlace
      ? parseYaml(src, multiline ? inner : { start: opener.end - 1, end: whole.end })
      : parseYaml(multiline ? built + '\n' : `{\n${built}\n}`);
    let ranged = inPlace;
    const failed = (r: typeof result) => r.diagnostics.some((d) => d.severity === 'error');
    if (failed(result) && multiline) {
      const stripped = stripLineTrailingCommas(built);
      if (stripped !== built) {
        const retry = parseYaml(stripped + '\n');
        if (!failed(retry)) {
          result = retry;
          ranged = false;
        }
      }
    }
    for (const d of result.diagnostics) {
      const r = ranged ? d.range : whole;
      if (d.severity === 'error') {
        st.diagnostics.error('SHAPE_DATA', d.message, r);
      } else st.diagnostics.warning(d.code, d.message, r);
    }
    // A semantic error: the tokens are fine, so parse on and report later errors in the same
    // statement too (R-PARSE-4). The element keeps no data.
    if (failed(result)) return { value: null, range: whole };
    const value = result.value;
    // v12 read an empty document as `{}`.
    return { value: isYamlMap(value) ? value : {}, range: whole };
  }
}
