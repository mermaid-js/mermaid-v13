// cspell:words LALR
/**
 * XY chart parser: recursive descent over the {@link lex} tokens, producing an
 * {@link XyChartModel}, the typed AST, symbols, statement spans and diagnostics (DESIGN §4.3).
 *
 * The grammar is v12's `xychart.jison` (LALR), ported rule for rule (`grammar/xychart.ebnf` is
 * the normative form; the unreachable `MD_STR` is gone), so it accepts and rejects what jison
 * does: the header may repeat before the first statement, statements need no separator, and an
 * unclosed `accDescr {` is two descriptions (its text, then an empty one). The parser reads the
 * tokens jison returned: the quotes, `accDescr {`, its `}`, blanks and the dead markdown rule, for
 * which jison returns none, are trivia here, as are comments. Values convert as v12's DB did
 * (`build.ts`). Unlike jison it does not stop at the first error: it reports it, skips to the
 * end of the statement (a line break, `;` or the end of the text) and carries on (R-PARSE-4).
 * With `probe`, a {@link ProbeCursor} records what the parser tests at the probed offset
 * (R-LANG-7, D95), and the lexer the start condition there.
 */
import { checkLimit } from '@mermaid-js/core/limits';
import {
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  PERCENT,
  Probe,
  ProbeCursor,
  STOP,
  syncTo,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import type { ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { outerRanges } from '@mermaid-js/shared/parser/table';
import { tokenValue } from '@mermaid-js/shared/parser/v12-text';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { XyChartModel, XyChartOrientation } from '../model.ts';
import type {
  XyChartAxisNode,
  XyChartDocument,
  XyChartHeaderNode,
  XyChartPlotNode,
  XyChartPointNode,
  XyChartRangeNode,
  XyChartStatementNode,
  XyChartTextNode,
  XyChartTextStatementNode,
} from './ast.ts';
import { plotId, XyChartBuilder } from './build.ts';
import type { Mutable } from './build.ts';
import { lex } from './lexer.ts';
import type { XyChartLex } from './lexer.ts';
import { T } from './tokens.ts';
import { v12Text } from './v12-text.ts';

export interface XyChartParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** The integrator's cap on data points, every plot's together (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type XyChartParseResult = ParseResult<XyChartModel, XyChartDocument>;

/** v12's `No Plot to render…`: a chart with no plot is rejected at parse (v12 failed at render). */
export const XYCHART_NO_PLOT = 'XYCHART_NO_PLOT';
/** An `accDescr {` with no closing `}`: accepted with an empty description, as v12. */
export const XYCHART_UNCLOSED_DESCRIPTION = 'XYCHART_UNCLOSED_DESCRIPTION';
/** Plots read before an `x-axis` with other data keep the x values they saw (D386). */
export const XYCHART_PLOT_BEFORE_AXIS = 'XYCHART_PLOT_BEFORE_AXIS';

/** jison's `alphaNumToken`: unquoted text. */
const ALPHA_NUM = [
  T.Amp,
  T.Num,
  T.Alpha,
  T.Plus,
  T.Equals,
  T.Mult,
  T.Dot,
  T.Brkt,
  T.Minus,
  T.Underscore,
];
const TEXT_START = [...ALPHA_NUM, T.Str];
/** jison's `eol`. */
const EOL = [Kind.Newline, T.Semi, T.Eof];
/** What may start a statement. */
const STATEMENT_START = [
  T.Title,
  T.XAxis,
  T.YAxis,
  T.Line,
  T.Bar,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrMultilineValue,
];
/** What may follow a statement: `Kind.EOF` ends the text inside a string or `accDescr {`. */
const AFTER_STATEMENT = [...EOL, ...STATEMENT_START, Kind.EOF];

/** Text jison matched without returning a token: trivia to the parser. */
const GLUE = [
  T.StringStart,
  T.StringEnd,
  T.AccDescrMultiline,
  T.AccDescrMultilineEnd,
  T.DeadMdRule,
  T.Blanks,
];
const SKIPPED = kindSet(Kind.Comment, Kind.Directive, ...GLUE);
/** Glue whose text counts towards the next token's range (an opening quote, `accDescr {`). */
const OPENS = kindSet(T.StringStart, T.AccDescrMultiline);
/** Glue whose text counts towards the previous token's range (a closing quote, the `}`). */
const CLOSES = kindSet(T.StringEnd, T.AccDescrMultilineEnd);
const COMMENTS = kindSet(Kind.Comment, Kind.Directive);
/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * blanks, separators and punctuation (`[`, `]`, `,`, `-->`, `;`, `:`).
 */
const PROBE_FOLLOWS = kindSet(
  T.Blanks,
  T.Colon,
  T.Comma,
  T.Semi,
  T.ArrowDelimiter,
  T.SquareBracesStart,
  T.SquareBracesEnd,
  T.StringEnd,
  T.AccDescrMultilineEnd
);

/** A line break, as the line index counts them. */
const LINE_BREAK = /\r\n?|[\n\u2028\u2029]/;

/** Where recovery resumes (R-PARSE-4), and the strings it checks on the way. */
const RESUME = kindSet(Kind.EOF, ...EOL, T.Str);
const END = kindSet(Kind.EOF);

const LINE_END = 'a line break or `;`';
const STATEMENT = [
  'a statement such as `title`, `x-axis`, `y-axis`, `bar`, `line`, `accTitle:` or `accDescr`',
];
const ORIENTATION = '`vertical` or `horizontal`';
const TITLE = ['a title such as `Sales` or `"Sales 2024"`'];
const AXIS_TITLE = 'an axis title such as `Month` or `"Month of year"`';
const CATEGORIES = 'categories such as `[jan, feb, mar]`';
const RANGE = 'a range such as `0 --> 100`';
const CATEGORY = ['a category such as `jan` or `"Q1 2024"`'];
const NUMBER = ['a number such as `12`, `-3.5` or `.25`'];
const ARROW = ['`-->` and the end of the range'];
const PLOT_NAME = 'a plot name such as `Sales` or `"Sales 2024"`';
const VALUES = '`[` and the values, such as `[1, 2, 3]`';
const POINT_LABEL = 'a point label such as `"peak"`';
const NEXT_VALUE = '`,` and a value';
const CLOSE = '`]`';

const AXIS_HINT =
  'write an axis as `x-axis <title> [a, b, c]` or `x-axis <title> <min> --> <max>`, e.g. `x-axis Month [jan, feb]`';
const Y_AXIS_HINT =
  'write the y axis as `y-axis <title> <min> --> <max>`, e.g. `y-axis Revenue 0 --> 100`; it takes no categories';
const PLOT_HINT = 'write a plot as `bar <name> [1, 2, 3]` or `line <name> [1, 2, 3]`';
const NUMBER_HINT =
  'a value is a plain number such as `12`, `-3.5` or `.25` (no exponent), with an optional quoted label after it';
const DIGITS_HINT =
  'after `x-axis` and `y-axis`, digits start a range: quote a title with digits, e.g. `"Year 2024"`';

/** v12's message for a chart without plots (R-PARSE-4: reported at parse). */
const NO_PLOT = 'No Plot to render, please provide a plot with some data';

/** Parse an XY chart. Never throws: problems are error diagnostics. */
export function parseXyChart(src: string, options: XyChartParseOptions = {}): XyChartParseResult {
  return new XyChartParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails records
 * a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class XyChartParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: XyChartLex;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly probe: Probe | undefined;
  private readonly children: XyChartStatementNode[] = [];
  /** Source range of each token with the quotes and `accDescr {`/`}` next to it. */
  private readonly outerStart: Uint32Array;
  private readonly outerEnd: Uint32Array;
  /** Index of the last token consumed. */
  private last = 0;
  private hint: string | undefined;
  /** The unclosed string reported last, so recovery does not report it again. */
  private reported = -1;
  /** Whether an unclosed `accDescr {` was reported (once). */
  private unclosedDescription = false;
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: XyChartParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const probe =
      options.probe === undefined
        ? undefined
        : (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
    this.lexed = lex(src, v12Text(src, pre.bodyStart), undefined, probe);
    if (probe === undefined) this.c = new TokenCursor(this.lexed.tokens, SKIPPED);
    else {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      this.c = new ProbeCursor(this.lexed.tokens, probe, SKIPPED);
    }
    [this.outerStart, this.outerEnd] = outerRanges(this.lexed, OPENS, CLOSES, SKIPPED);
  }

  /** The data points so far, every plot's together, for the integrator's cap. */
  private points = 0;

  parse(): XyChartParseResult {
    this.header();
    this.document();
    const model = buildModel(this.children, this.st, this.pre.frontMatter?.title);
    // A chart without plots, unless an error already explains it: a statement that failed (it
    // may have been meant as the plot) or text the preprocess cut (an unclosed directive).
    const errors = [...this.pre.diagnostics, ...this.st.diagnostics.list];
    if (model.plots.length === 0 && !errors.some((d) => d.severity === 'error')) {
      // Zero-width after the header, where the plots would go: the header itself is right.
      const header = this.children.find((n) => n.type === 'Header');
      const range = header
        ? { start: header.range.end, end: header.range.end }
        : { start: this.pre.bodyStart, end: this.src.length };
      this.st.diagnostics.error(XYCHART_NO_PLOT, NO_PLOT, range);
    }
    // In source order (the facet contract): the warnings about the model come last otherwise.
    this.st.diagnostics.list.sort((p, q) => p.range.start - q.range.start);
    const ast: XyChartDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: this.src.length },
      children: this.children,
    };
    return this.st.result(model, ast, this.lexed.tokens, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private in(kinds: readonly number[]): boolean {
    this.c.tested(kinds);
    return kinds.includes(this.c.kind);
  }

  /** Consume the current token; its text as v12 read it. */
  private take(): string {
    const text = tokenValue(this.lexed, this.c.pos);
    this.last = this.c.next();
    return text;
  }

  /** Consume a token of one of `kinds` and return its text, or fail. */
  private expect(kinds: readonly number[], names: string[]): string {
    if (!this.in(kinds)) this.fail(names);
    return this.take();
  }

  /** `[start, end)` without the blanks at either end (unless that leaves nothing). */
  private trim(start: number, end: number): Range {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(this.src[s] ?? '')) s++;
    while (e > s && /\s/.test(this.src[e - 1] ?? '')) e--;
    return s < e ? { start: s, end: e } : { start, end };
  }

  /** The range from token `first` to the last token consumed, quotes and `}` included. */
  private span(first: number): Range {
    return this.trim(this.outerStart[first] ?? 0, this.outerEnd[this.last] ?? 0);
  }

  /** The kind of the next token after `i` that is not a comment. */
  private kindAfter(i: number): number {
    const { kind, length } = this.lexed.tokens;
    let j = i + 1;
    while (j < length - 1 && COMMENTS[kind[j] ?? 0] === 1) j++;
    return kind[j] ?? Kind.EOF;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  private here(): Range {
    return this.trim(this.c.start, this.c.end);
  }

  /** How an error message names the current token: at most 24 characters of one line. */
  private found(): string {
    const k = this.c.kind;
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const r = this.here();
    const t = this.src.slice(r.start, r.end).trim() || tokenValue(this.lexed, this.c.pos).trim();
    const line = t.split(LINE_BREAK, 1)[0] ?? '';
    const shown = line.slice(0, 24);
    return shown.length < t.length ? `\`${shown}…\`` : `\`${t}\``;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[]): never {
    const { st, c } = this;
    // An unclosed quote swallows the rest of the text: that is the error to report.
    if (c.kind === T.Str) this.closed();
    const where = this.here();
    if (c.kind === Kind.Error) {
      const ch = this.src.slice(c.start, c.end);
      const shown = ch === '`' ? '`` ` ``' : `\`${ch}\``;
      const what = ch === '' ? 'Unexpected end of the line' : `Unexpected character ${shown}`;
      const why = (ch === '' ? undefined : explainCharacter(ch)) ?? this.hint;
      st.diagnostics.error('UNEXPECTED_CHARACTER', `${what}${why ? `; ${why}` : ''}.`, where, {
        expected: names,
      });
      throw STOP;
    }
    st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      names,
      this.found(),
      undefined,
      this.explain() ?? this.hint
    );
    throw STOP;
  }

  private explain(): string | undefined {
    const k = this.c.kind;
    if (this.gluedComment()) {
      return 'a `%%` comment right after a character takes that character with it: put a blank before `%%`';
    }
    if (k === T.Colon) return '`:` can only be in a quoted text, e.g. `"Q1: sales"`';
    if (k === T.XyChart) return '`xychart` starts the chart, before its statements';
    if (k === T.ChartOrientation) return '`vertical` or `horizontal` goes right after `xychart`';
    return undefined;
  }

  /** Whether a `%%` comment glued to the character before it (which it took) ends right here. */
  private gluedComment(): boolean {
    const { kind, start } = this.lexed.tokens;
    let j = this.c.pos - 1;
    while (j >= 0 && SKIPPED[kind[j] ?? 0] === 1 && kind[j] !== Kind.Comment) j--;
    if (j < 0 || kind[j] !== Kind.Comment) return false;
    const at = start[j] ?? 0;
    return this.src.charCodeAt(at) !== PERCENT && this.src.startsWith('%%', at + 1);
  }

  /** Run one statement rule; on failure, skip to the end of the statement. */
  private statement(rule: () => void): void {
    this.hint = undefined;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
    this.hint = undefined;
  }

  /** Skip to the end of the statement, reporting an unclosed string on the way. */
  private recover(): void {
    const { c } = this;
    for (;;) {
      syncTo(c, RESUME);
      if (c.kind !== T.Str) return;
      // An unclosed one takes the rest of the text.
      if (this.unclosed()) return void syncTo(c, END);
      c.next();
    }
  }

  /** Add a node, and its span, to the document. */
  private add(node: XyChartStatementNode, kind: string): void {
    this.st.statement(kind, node.range);
    this.children.push(node);
  }

  // ---- document -----------------------------------------------------------------------

  /** `{ eol | Header }`: line breaks and headers before the first statement. */
  private header(): void {
    const { c } = this;
    for (;;) {
      // Before the first statement: another header, or a statement (the document follows).
      c.tested([T.XyChart, ...STATEMENT_START]);
      if (this.in(EOL)) c.next();
      else if (this.in([T.XyChart])) {
        const first = c.pos;
        this.take();
        const node: XyChartHeaderNode = { id: '', type: 'Header', range: this.span(first) };
        if (this.in([T.ChartOrientation])) {
          node.orientation = this.take();
          node.range = this.span(first);
        } else if (!this.in(AFTER_STATEMENT) && !this.in([T.XyChart])) {
          this.statement(() => this.fail([ORIENTATION, ...STATEMENT]));
        }
        this.add(node, 'header');
      } else return;
    }
  }

  /** `{ statement { eol } }`. */
  private document(): void {
    const { c } = this;
    for (;;) {
      // Statements need no separator: one may start at every token the loop rests on.
      c.tested(STATEMENT_START);
      const k = c.kind;
      if (k === Kind.EOF) return;
      if (this.in(EOL)) {
        c.next();
        continue;
      }
      this.statement(() => this.stmt());
    }
  }

  /** The end of a statement; `names` are what else the statement could have gone on with. */
  private end(names: string[] = []): void {
    if (!this.in(AFTER_STATEMENT)) this.fail([...names, LINE_END]);
  }

  private stmt(): void {
    const k = this.c.kind;
    if (k === T.Title) return this.title();
    if (k === T.XAxis || k === T.YAxis) return this.axis(k);
    if (k === T.Line || k === T.Bar) return this.plot(k);
    if (k === T.AccTitle || k === T.AccDescr) return this.accessible(k);
    if (k === T.AccDescrMultilineValue) return this.multilineDescription();
    this.fail(STATEMENT);
  }

  /** `title <text>`. */
  private title(): void {
    const first = this.c.pos;
    this.take();
    const text = this.text(TITLE);
    const node: XyChartTextStatementNode = {
      id: '',
      type: 'Title',
      range: this.span(first),
      text: text.text.trim(),
    };
    this.end();
    this.add(node, 'title');
  }

  /** `accTitle: …` or `accDescr: …`: the rest of the line, trimmed. */
  private accessible(k: number): void {
    const first = this.c.pos;
    this.take();
    // The value always follows: its rule matches the empty rest of a line too.
    const text = this.take().trim();
    const type = k === T.AccTitle ? 'AccTitle' : 'AccDescr';
    const node: XyChartTextStatementNode = { id: '', type, range: this.span(first), text };
    this.end();
    this.add(node, k === T.AccTitle ? 'accTitle' : 'accDescr');
  }

  /**
   * `accDescr { … }`: the text up to `}`, trimmed. Without the `}`, jison reads the text, then an
   * empty description at the end; the chart keeps that empty one, so one warning says so.
   */
  private multilineDescription(): void {
    const first = this.c.pos;
    const text = this.take().trim();
    const node: XyChartTextStatementNode = {
      id: '',
      type: 'AccDescr',
      range: this.span(first),
      text,
    };
    if (this.kindAfter(first) !== T.AccDescrMultilineEnd) {
      node.unclosed = true;
      if (!this.unclosedDescription) {
        this.unclosedDescription = true;
        const at = this.outerStart[first] ?? 0;
        this.st.diagnostics.warning(
          XYCHART_UNCLOSED_DESCRIPTION,
          `Unclosed description: the \`accDescr {\` at line ${this.lineOf(at)} has no closing \`}\`, so the chart has no description. Add \`}\` after the description.`,
          { start: at, end: Math.min(this.src.length, at + 'accDescr'.length) }
        );
      }
    }
    this.end();
    this.add(node, 'accDescr');
  }

  /** `x-axis [<text>] ( [<text>, …] | <min> --> <max> )`, or `y-axis` with a range only. */
  private axis(k: number): void {
    const first = this.c.pos;
    const x = k === T.XAxis;
    this.hint = x ? AXIS_HINT : Y_AXIS_HINT;
    this.take();
    const node: XyChartAxisNode = {
      id: '',
      type: 'Axis',
      range: this.c.range,
      axis: x ? 'x' : 'y',
    };
    const data = x ? [CATEGORIES, RANGE] : [RANGE];
    if (this.in(TEXT_START)) node.title = this.text([]);
    if (x && this.in([T.SquareBracesStart])) this.band(node);
    else if (this.in([T.NumberWithDecimal])) {
      if (node.title && !node.title.quoted) this.hint = DIGITS_HINT;
      node.data = this.range();
    } else if (!node.title) this.fail([AXIS_TITLE, ...data]);
    node.range = this.span(first);
    this.end(node.categories || node.data ? [] : data);
    this.add(node, 'axis');
  }

  /** `[ <text> { , <text> } ]`. */
  private band(node: XyChartAxisNode): void {
    const first = this.c.pos;
    this.take();
    const categories = [this.text(CATEGORY)];
    while (this.in([T.Comma])) {
      this.take();
      categories.push(this.text(CATEGORY));
    }
    this.expect([T.SquareBracesEnd], ['`,` and a category', CLOSE]);
    node.categories = categories;
    node.bandRange = this.span(first);
    for (const c of categories) this.st.symbol(c.text.trim(), 'category', c.range, 'def');
  }

  /** `<min> --> <max>`. */
  private range(): XyChartRangeNode {
    const first = this.c.pos;
    const min = this.take();
    this.expect([T.ArrowDelimiter], ARROW);
    this.hint = undefined;
    const max = this.expect([T.NumberWithDecimal], NUMBER);
    return { min, max, range: this.span(first) };
  }

  /** `bar [<text>] [ <point> { , <point> } ]` or `line …`. */
  private plot(k: number): void {
    const first = this.c.pos;
    this.hint = PLOT_HINT;
    this.take();
    let name: XyChartTextNode | undefined;
    if (this.in(TEXT_START)) name = this.text([]);
    this.expect([T.SquareBracesStart], name ? [VALUES] : [PLOT_NAME, VALUES]);
    this.hint = NUMBER_HINT;
    const points = [this.point()];
    while (this.in([T.Comma])) {
      this.take();
      points.push(this.point());
    }
    const lastLabelled = points[points.length - 1]?.label !== undefined;
    this.expect(
      [T.SquareBracesEnd],
      lastLabelled ? [NEXT_VALUE, CLOSE] : [POINT_LABEL, NEXT_VALUE, CLOSE]
    );
    const node: XyChartPlotNode = {
      id: '',
      type: 'Plot',
      range: this.span(first),
      kind: k === T.Line ? 'line' : 'bar',
      points,
    };
    if (name) {
      node.name = name;
      this.st.symbol(name.text.trim(), 'plot', name.range, 'def');
    }
    this.end();
    this.add(node, 'plot');
  }

  /** `<number> [<string>]`. */
  private point(): XyChartPointNode {
    const first = this.c.pos;
    const value = this.expect([T.NumberWithDecimal], NUMBER);
    const point: XyChartPointNode = { value, range: this.span(first) };
    if (this.in([T.Str])) {
      this.closed();
      point.label = this.take();
      point.range = this.span(first);
    }
    const cap = this.options.maxNodes;
    checkLimit(this.st.diagnostics, 'maxNodes', ++this.points, cap, 'data points', point.range);
    return point;
  }

  /** jison's `text`: a run of `alphaNumToken`s joined without blanks, or a string. */
  private text(names: string[]): XyChartTextNode {
    const first = this.c.pos;
    if (!this.in(TEXT_START)) this.fail(names);
    if (this.c.kind === T.Str) {
      this.closed();
      const text = this.take();
      return { text, quoted: true, range: this.span(first) };
    }
    let text = this.take();
    while (this.in(ALPHA_NUM)) text += this.take();
    return { text, quoted: false, range: this.span(first) };
  }

  /** The string at the cursor must be closed. */
  private closed(): void {
    if (this.unclosed()) throw STOP;
  }

  /** Whether the string at the cursor is unclosed; reported once if so. */
  private unclosed(): boolean {
    const p = this.c.pos;
    if (this.kindAfter(p) === T.StringEnd) return false;
    if (p === this.reported) return true;
    this.reported = p;
    const quote = this.outerStart[p] ?? this.c.start;
    this.st.diagnostics.error(
      'UNCLOSED_STRING',
      `Unclosed string: the \`"\` at line ${this.lineOf(quote)} has no closing \`"\`. Add it after the text.`,
      { start: quote, end: quote + 1 }
    );
    return true;
  }
}

/** Why a character outside quotes is an error. */
function explainCharacter(ch: string): string {
  if (ch === '`') return 'a backtick can only be in a quoted text; markdown strings are not read';
  return 'quote the text to use it, e.g. `"a (b)"`';
}

// ---- model ----------------------------------------------------------------------------

/** The id stem of each statement type (plots are numbered instead). */
function stem(n: XyChartStatementNode): string {
  if (n.type === 'Header') return 'header';
  if (n.type === 'Title') return 'title';
  if (n.type === 'Axis') return n.axis === 'x' ? 'x-axis' : 'y-axis';
  if (n.type === 'AccTitle') return 'accTitle';
  return 'accDescr';
}

/** Give every node its id (see `ast.ts`), in source order. */
function assignIds(nodes: readonly XyChartStatementNode[]): void {
  const seen = new Map<string, number>();
  let plots = 0;
  for (const n of nodes) {
    if (n.type === 'Plot') {
      n.id = plotId(plots++);
      continue;
    }
    const s = stem(n);
    const count = (seen.get(s) ?? 0) + 1;
    seen.set(s, count);
    n.id = count === 1 ? s : `${s}@${count}`;
  }
}

const orientationOf = (written: string): XyChartOrientation =>
  // v12's `setOrientation`: only `horizontal` as written (lower case) turns the chart.
  written === 'horizontal' ? 'horizontal' : 'vertical';

/**
 * Give every node its id and build the model as v12's DB did, statement by statement
 * ({@link XyChartBuilder}): the last `title`, `accTitle`, `accDescr` and orientation win.
 */
function buildModel(
  nodes: readonly XyChartStatementNode[],
  st: ParseState,
  frontMatterTitle: string | undefined
): XyChartModel {
  assignIds(nodes);
  const b = new XyChartBuilder();
  let orientation: XyChartOrientation | undefined;
  let title: XyChartTextStatementNode | undefined;
  let accTitle = '';
  let accDescr = '';
  let xAst: string | undefined;
  let yAst: string | undefined;
  const plots: XyChartPlotNode[] = [];
  /** The last `x-axis` that set data: the final x axis's. */
  let lastX: XyChartAxisNode | undefined;
  for (const n of nodes) {
    if (n.type === 'Header') {
      if (n.orientation !== undefined) orientation = orientationOf(n.orientation);
    } else if (n.type === 'Title') title = n;
    else if (n.type === 'AccTitle') accTitle = n.text;
    else if (n.type === 'AccDescr') accDescr = n.text.replace(/\n\s+/g, '\n');
    else if (n.type === 'Axis') axisStatement(b, n);
    else {
      const points = n.points.map((p) => ({ value: Number(p.value), label: p.label ?? '' }));
      b.addPlot(n.kind, n.name?.text ?? '', points);
      plots.push(n);
    }
    if (n.type === 'Axis' && n.axis === 'x') {
      xAst = n.id;
      if (n.categories || n.data) lastX = n;
    } else if (n.type === 'Axis') yAst = n.id;
  }
  // Plots read against other x data: only a later `x-axis` with data (`lastX`) changes it.
  const off = b.plotsOffAxis();
  if (lastX && off.length > 0) {
    st.diagnostics.warning(
      XYCHART_PLOT_BEFORE_AXIS,
      'Plots before this `x-axis` keep the x positions they had without it (on categories they are drawn at the start of the axis); put the `x-axis` before the plots.',
      lastX.range,
      {
        related: off.map((i) => ({
          message: `Plot ${i + 1} comes before the \`x-axis\`.`,
          range: plots[i]?.range ?? lastX.range,
        })),
      }
    );
  }
  const model: Mutable<XyChartModel> = {
    accTitle,
    accDescr,
    xAxis: b.xAxis(xAst),
    yAxis: b.yAxis(yAst),
    plots: b.plots,
    warnings: st.diagnostics.list
      .filter((d) => d.severity === 'warning')
      .sort((p, q) => p.range.start - q.range.start),
  };
  if (orientation) model.orientation = orientation;
  if (title) {
    model.title = title.text;
    model.titleAst = title.id;
  } else if (frontMatterTitle !== undefined) model.title = frontMatterTitle;
  return model;
}

/** An axis statement, as v12's grammar called the DB: the data first, then the title. */
function axisStatement(b: XyChartBuilder, n: XyChartAxisNode): void {
  const title = n.title?.text ?? '';
  if (n.axis === 'x') {
    if (n.categories) b.setXAxisBand(n.categories.map((c) => c.text));
    else if (n.data) b.setXAxisRange(Number(n.data.min), Number(n.data.max));
    b.setXAxisTitle(title);
  } else {
    if (n.data) b.setYAxisRange(Number(n.data.min), Number(n.data.max));
    b.setYAxisTitle(title);
  }
}
