// cspell:words LALR
/**
 * Quadrant parser: recursive descent over the {@link lex} tokens, producing a
 * {@link QuadrantModel}, the typed AST, symbols, statement spans and diagnostics (DESIGN §4.3).
 *
 * The grammar is v12's `quadrant.jison` (LALR), ported rule for rule (`grammar/quadrant.ebnf` is
 * the normative form; the dead `section`, `NODE_STRING`, `DOWN`, `DEFAULT`, `UNIT`, `STYLE` and
 * `PCT` are gone), so it accepts and rejects what jison does. The parser reads the tokens jison
 * returned: the quotes, `:::`, `accDescr {`, `}`, the `,` between coordinates and the `]`, for
 * which jison returns none, are trivia here, as are comments. Values convert as v12's DB did
 * (`quadrantDb.ts`): labels trimmed, styles checked as `parseStyles` (`styles.ts`). Unlike jison
 * it does not stop at the first error: it reports it, skips to the end of the statement (a line
 * break, `;` or the end of the text) and carries on (R-PARSE-4). With `probe`, a
 * {@link ProbeCursor} records what the parser tests at the probed offset (R-LANG-7, D95).
 */
import { checkLimit } from '@mermaid-js/core/limits';
import {
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  ProbeCursor,
  syncTo,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import { foundText, idEscaper, STOP } from '@mermaid-js/shared/parser/support';
import { span, trimmed } from '@mermaid-js/shared/parser/facet';
import type {
  ParseOptions,
  ParseResult,
  Range,
  SymbolOccurrence,
} from '@mermaid-js/core/parser-kit';
import { decodePlaceholders } from '@mermaid-js/core/parser-kit/support';
import { preprocess } from '@mermaid-js/core/preprocess';
import { outerRanges } from '@mermaid-js/shared/parser/table';
import { tokenText, tokenValue, v12Text } from '@mermaid-js/shared/parser/v12-text';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  QuadrantAxis,
  QuadrantClass,
  QuadrantLabel,
  QuadrantLabels,
  QuadrantModel,
  QuadrantPoint,
  QuadrantStyles,
  QuadrantText,
} from '../model.ts';
import type {
  QuadrantAxisEndNode,
  QuadrantAxisNode,
  QuadrantClassDefNode,
  QuadrantDocument,
  QuadrantPointNode,
  QuadrantQuadrantNode,
  QuadrantStatementNode,
  QuadrantStyleNode,
  QuadrantTextNode,
  QuadrantTextStatementNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import type { QuadrantLex } from './lexer.ts';
import { applyStyle } from './styles.ts';
import { T } from './tokens.ts';

export interface QuadrantParseOptions extends ParseOptions {
  /** The integrator's cap on points (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type QuadrantParseResult = ParseResult<QuadrantModel, QuadrantDocument>;

/** jison's `alphaNumToken`: what text starts with. */
const TEXT_START = [
  T.Punctuation,
  T.Amp,
  T.Num,
  T.Alpha,
  T.Comma,
  T.Plus,
  T.Equals,
  T.Mult,
  T.Dot,
  T.Brkt,
  T.Underscore,
  T.UnicodeText,
];
const LABEL_START = [...TEXT_START, T.Str, T.MdStr];
/** jison's `textNoTagsToken`: what text goes on with. */
const TEXT_MORE = [...TEXT_START, T.Space, T.Minus];
/** jison's `idStringToken`, less its dead terminals: a `classDef` name. */
const CLASS_NAME = [
  T.Alpha,
  T.Num,
  T.Minus,
  T.Comma,
  T.Colon,
  T.Amp,
  T.Brkt,
  T.Mult,
  T.UnicodeText,
];
/** jison's `styleComponent`, less its dead terminals. */
const STYLE_PART = [T.Alpha, T.Num, T.Colon, T.Space, T.Brkt, T.Minus];
/** jison's `eol`. */
const EOL = [Kind.Newline, T.Semi, T.Eof];
const STYLE_END = [T.Comma, ...EOL];
const QUADRANTS = [T.Quadrant1, T.Quadrant2, T.Quadrant3, T.Quadrant4];
/** What may start a statement: its keywords (`accDescr {` as `AccDescr`) and a point's label. */
const STATEMENT_START = [
  T.Title,
  T.AccTitle,
  T.AccDescr,
  T.XAxis,
  T.YAxis,
  ...QUADRANTS,
  T.ClassDef,
  ...LABEL_START,
];

/** Text jison matched without returning a token: trivia to the parser. */
const GLUE = [
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd,
  T.AccDescrMultiline,
  T.AccDescrMultilineEnd,
  T.ClassMarker,
  T.PointComma,
  T.PointEnd,
];
const SKIPPED = kindSet(Kind.Comment, Kind.Directive, ...GLUE);
/** Glue whose text counts towards the next token's range (an opening quote). */
const OPENS = kindSet(T.StringStart, T.MdStringStart, T.AccDescrMultiline);
/** Glue whose text counts towards the previous token's range (a closing quote, the `]`). */
const CLOSES = kindSet(T.StringEnd, T.MdStringEnd, T.AccDescrMultilineEnd, T.PointEnd);
const COMMENTS = kindSet(Kind.Comment, Kind.Directive);
/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * blanks, separators and punctuation (`:::`, `-->`, `: [`, `,`, `]`).
 */
const PROBE_FOLLOWS = kindSet(
  T.Space,
  T.Colon,
  T.Comma,
  T.Semi,
  T.AxisTextDelimiter,
  T.ClassMarker,
  T.PointStart,
  T.PointComma,
  T.PointEnd
);

/** The node type and statement-span kind of a text statement. */
type TextStatement = readonly [QuadrantTextStatementNode['type'], string];

/** The text statements, `title`, `accTitle:` and `accDescr:`, by keyword kind. */
const TEXT_STATEMENTS: Partial<Record<number, TextStatement>> = {
  [T.Title]: ['Title', 'title'],
  [T.AccTitle]: ['AccTitle', 'accTitle'],
  [T.AccDescr]: ['AccDescr', 'accDescr'],
};

/** A line break the line index counts that is not `\n`, the one {@link foundText} cuts at. */
const OTHER_BREAK = /\r\n?|[\u2028\u2029]/g;

/** Where recovery resumes (R-PARSE-4), and the strings it checks on the way. */
const RESUME = kindSet(Kind.EOF, ...EOL, T.Str, T.MdStr);
const END = kindSet(Kind.EOF);

const LINE_END = ['a line break or `;`'];
const LABEL = ['a label'];
const POINT_START = ['`: [x, y]`'];
const COORDINATE = ['a coordinate from 0 to 1'];
const STYLE = ['a style such as `radius: 10`'];
const STATEMENT = [
  'a statement such as `title`, `x-axis`, `quadrant-1` or `classDef`',
  'a point such as `Name: [0.5, 0.5]`',
];

const COORDINATE_HINT =
  'a coordinate is `0`, `1` or `0.` and digits, e.g. `0.25`; write a point as `Name: [0.25, 0.75]`';
const POINT_HINT = 'write a point as `Name: [x, y]`, e.g. `Campaign A: [0.3, 0.6]`';
const AXIS_HINT = 'write an axis as `x-axis <start> --> <end>`, e.g. `x-axis Low --> High`';
const QUADRANT_HINT = 'write a quadrant label as `quadrant-1 <label>`, e.g. `quadrant-1 Expand`';
const CLASS_DEF_HINT =
  'write it as `classDef <name> <styles>` with one blank after `classDef`, e.g. `classDef hot radius: 10, color: #ff0000`';
const STYLES_HINT =
  'styles are `radius: 10`, `color: #ff0000`, `stroke-color: #ff0000` and `stroke-width: 2px`, separated by `,`';

/** Parse a quadrant chart. Never throws: problems are error diagnostics. */
export function parseQuadrant(
  src: string,
  options: QuadrantParseOptions = {}
): QuadrantParseResult {
  return new QuadrantParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class QuadrantParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: QuadrantLex;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly probe: Probe | undefined;
  private readonly children: QuadrantStatementNode[] = [];
  /** Source range of each token with the quotes and `]` next to it (jison's text). */
  private readonly outerStart: Uint32Array;
  private readonly outerEnd: Uint32Array;
  /** Index of the last token consumed. */
  private last = 0;
  private hint: string | undefined;
  /** The unclosed string reported last, so recovery does not report it again. */
  private reported = -1;
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: QuadrantParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const directives = pre.directives.map((d) => d.range);
    const probe =
      options.probe === undefined
        ? undefined
        : (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
    this.lexed = lex(src, v12Text(src, pre.bodyStart, directives), undefined, probe);
    if (probe === undefined) this.c = new TokenCursor(this.lexed.tokens, SKIPPED);
    else {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      this.c = new ProbeCursor(this.lexed.tokens, probe, SKIPPED);
    }
    [this.outerStart, this.outerEnd] = outerRanges(this.lexed, OPENS, CLOSES, SKIPPED);
  }

  /** The points so far, for the integrator's cap. */
  private points = 0;

  parse(): QuadrantParseResult {
    this.header();
    this.document();
    this.classSymbols();
    const model = buildModel(this.children, this.st, this.pre.frontMatter?.title);
    const ast: QuadrantDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: this.src.length },
      children: this.children,
    };
    return this.st.result(model, ast, this.lexed.tokens, this.options, this.probe);
  }

  /**
   * Class symbols in source order. Every `:::name` that lexes is a `ref`, in a statement that
   * failed too, so a rename and its clash check cover it (the occurrence has no statement link).
   * Of the `classDef`s of a name, only the last, which the model keeps (`c:<name>`), is the
   * `def`; earlier ones are references.
   */
  private classSymbols(): void {
    const { kind, start, end, length } = this.lexed.tokens;
    for (let i = 0; i < length; i++) {
      if (kind[i] !== T.ClassName) continue;
      const range = trimmed(this.src, span(start[i] ?? 0, end[i] ?? 0), true);
      this.st.symbol(tokenValue(this.lexed, i), 'class', range, 'ref');
    }
    const symbols = this.st.symbols.sort((a, b) => a.range.start - b.range.start);
    const last = new Map<string, SymbolOccurrence>();
    for (const s of symbols) if (s.role === 'def') last.set(s.name, s);
    for (const s of symbols) if (s.role === 'def' && last.get(s.name) !== s) s.role = 'ref';
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

  /** The range from token `first` to the last token consumed, quotes and `]` included. */
  private span(first: number): Range {
    const r = span(this.outerStart[first] ?? 0, this.outerEnd[this.last] ?? 0);
    return trimmed(this.src, r, true);
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

  /** The current token's range, without the blanks a padded keyword takes. */
  private here(): Range {
    return trimmed(this.src, span(this.c.start, this.c.end), true);
  }

  /** How an error message names the current token: at most 24 characters of one line. */
  private found(): string {
    const k = this.c.kind;
    if (k === T.Eof) return 'the end of the text';
    if (k === T.Space) return 'a blank';
    const r = this.here();
    const t = this.src.slice(r.start, r.end).trim() || tokenValue(this.lexed, this.c.pos).trim();
    // A quoted label may span lines: quote its first, whatever line break ends it.
    return foundText(k, t.replace(OTHER_BREAK, '\n'));
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[]): never {
    const { st, c } = this;
    // An unclosed quote anywhere swallows the rest of the text: that is the error to report.
    if (c.kind === T.Str || c.kind === T.MdStr) this.closed(c.kind);
    const where = this.here();
    if (c.kind === Kind.Error) {
      const ch = this.src.slice(c.start, c.end);
      const what = ch === '' ? 'Unexpected end of the line' : `Unexpected character \`${ch}\``;
      const why = (ch === '' ? undefined : this.explainCharacter(ch)) ?? this.hint;
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
    if (k === T.Colon) {
      return '`:` can only be in a quoted label, e.g. `"Q: x"`';
    }
    if (k === T.Quadrant) return '`quadrantChart` starts the chart and comes only once';
    return undefined;
  }

  private explainCharacter(ch: string): string | undefined {
    if ('()<>[]{}@^~|'.includes(ch)) return 'quote the label to use it, e.g. `"a (b)"`';
    return undefined;
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
      if (c.kind !== T.Str && c.kind !== T.MdStr) return;
      // An unclosed one takes the rest of the text.
      if (this.unclosed(c.kind)) return void syncTo(c, END);
      c.next();
    }
  }

  /** Add a node, and its span, to the document. */
  private add(node: QuadrantStatementNode, kind: string): void {
    this.st.statement(kind, node.range);
    this.children.push(node);
  }

  // ---- document -----------------------------------------------------------------------

  /**
   * `{ eol | SPACE } QUADRANT`. Text before a later `quadrantChart` is one error, and the chart
   * starts there; without a header at all, the rest is still read as statements.
   */
  private header(): void {
    const { c } = this;
    while (c.kind === T.Space || EOL.includes(c.kind)) {
      c.tested([T.Quadrant]);
      c.next();
    }
    if (!this.in([T.Quadrant])) {
      const at = this.lexed.tokens.kind.indexOf(T.Quadrant, c.pos);
      try {
        this.fail(['`quadrantChart`']);
      } catch (error) {
        if (error !== STOP) throw error;
      }
      if (at < 0) return this.recover();
      c.recovering();
      while (c.pos < at) c.next();
    }
    const first = c.pos;
    this.take();
    this.add({ id: '', type: 'Header', range: this.span(first) }, 'header');
  }

  /** `{ { SPACE } [ statement ] eol }`. */
  private document(): void {
    const { c } = this;
    // Whether a statement may start at the current token: not before the `eol` ending one.
    let fresh = true;
    for (;;) {
      const k = c.kind;
      if (fresh) c.tested(STATEMENT_START);
      if (k === Kind.EOF) break;
      if (k === T.Space || EOL.includes(k)) {
        if (k !== T.Space) fresh = true;
        c.next();
        continue;
      }
      this.statement(() => this.stmt());
      fresh = false;
    }
  }

  /** The end of a statement; `names` are what else the statement could have gone on with. */
  private eol(names: string[] = []): void {
    if (!this.in(EOL)) this.fail([...names, ...LINE_END]);
  }

  private stmt(): void {
    const k = this.c.kind;
    const text = TEXT_STATEMENTS[k];
    if (text) return this.textStatement(text);
    if (k === T.AccDescrMultilineValue) return this.multilineDescription();
    if (k === T.XAxis || k === T.YAxis) return this.axis(k);
    if (QUADRANTS.includes(k)) return this.quadrant(k);
    if (k === T.ClassDef) return this.classDef();
    if (this.in(LABEL_START)) return this.point();
    this.fail(STATEMENT);
  }

  /** `title …`, `accTitle: …`, `accDescr: …`: the rest of the line, trimmed. */
  private textStatement([type, kind]: TextStatement): void {
    const first = this.c.pos;
    this.take();
    // The value always follows: its rule matches the empty rest of a line too.
    const text = this.take().trim();
    const node: QuadrantTextStatementNode = { id: '', type, range: this.span(first), text };
    this.eol();
    this.add(node, kind);
  }

  /** `accDescr { … }`: the text up to `}`, trimmed. */
  private multilineDescription(): void {
    const first = this.c.pos;
    const text = this.take().trim();
    if (this.kindAfter(first) !== T.AccDescrMultilineEnd) {
      // The range starts at `accDescr {`, which counts towards the value.
      const at = this.outerStart[first] ?? 0;
      this.st.diagnostics.error(
        'UNCLOSED_DESCRIPTION',
        `Unclosed description: the \`accDescr {\` at line ${this.lineOf(at)} has no closing \`}\`. Add \`}\` after the description.`,
        { start: at, end: Math.min(this.src.length, at + 'accDescr'.length) }
      );
      throw STOP;
    }
    const node: QuadrantTextStatementNode = {
      id: '',
      type: 'AccDescr',
      range: this.span(first),
      text,
    };
    this.eol();
    this.add(node, 'accDescr');
  }

  /** `x-axis <text> [--> [<text>]]`. */
  private axis(k: number): void {
    const first = this.c.pos;
    this.hint = AXIS_HINT;
    this.take();
    const label = this.text();
    let end: QuadrantAxisEndNode | undefined;
    let arrow = false;
    if (this.in([T.AxisTextDelimiter])) {
      arrow = true;
      this.take();
      if (this.in(LABEL_START)) {
        const endLabel = this.text();
        end = { id: '', type: 'AxisEnd', range: endLabel.range, label: endLabel };
      }
      this.eol(end ? [] : LABEL);
    } else this.eol(['`-->` and an end label']);
    const node: QuadrantAxisNode = {
      id: '',
      type: 'Axis',
      range: this.span(first),
      axis: k === T.XAxis ? 'x' : 'y',
      label,
      arrow,
    };
    if (end) node.children = [end];
    this.add(node, 'axis');
  }

  /** `quadrant-N <text>`. */
  private quadrant(k: number): void {
    const first = this.c.pos;
    this.hint = QUADRANT_HINT;
    this.take();
    const label = this.text();
    this.eol();
    const quadrant = (QUADRANTS.indexOf(k) + 1) as 1 | 2 | 3 | 4;
    const node: QuadrantQuadrantNode = {
      id: '',
      type: 'Quadrant',
      range: this.span(first),
      quadrant,
      label,
    };
    this.add(node, 'quadrant');
  }

  /** `<text>[:::class] : [x, y] [styles]`. */
  private point(): void {
    const first = this.c.pos;
    const label = this.text();
    this.hint = POINT_HINT;
    let className: string | undefined;
    let classRange: Range | undefined;
    if (this.in([T.ClassName])) {
      classRange = this.here();
      className = this.take();
    }
    this.expect([T.PointStart], POINT_START);
    this.hint = COORDINATE_HINT;
    const x = this.expect([T.PointX], COORDINATE);
    const y = this.expect([T.PointY], COORDINATE);
    this.hint = STYLES_HINT;
    const styles = this.in(STYLE_PART) ? this.styles() : [];
    this.eol(styles.length > 0 ? ['`,` and a style'] : STYLE);
    const node: QuadrantPointNode = {
      id: '',
      type: 'Point',
      range: this.span(first),
      name: label.text.trim(),
      label,
      x,
      y,
      styles,
    };
    if (className !== undefined && classRange !== undefined) {
      node.className = className;
      node.classRange = classRange;
    }
    checkLimit(
      this.st.diagnostics,
      'maxNodes',
      ++this.points,
      this.options.maxNodes,
      'points',
      node.range
    );
    this.add(node, 'point');
  }

  /** `classDef SPACE <name> SPACE <styles>`. */
  private classDef(): void {
    const first = this.c.pos;
    this.hint = CLASS_DEF_HINT;
    this.take();
    this.expect([T.Space], ['a blank and a class name']);
    const nameFirst = this.c.pos;
    let name = this.expect(CLASS_NAME, ['a class name']);
    while (this.in(CLASS_NAME)) name += this.take();
    const nameRange = this.span(nameFirst);
    if (this.c.kind === T.Underscore) {
      this.hint = 'a class name defined with `classDef` cannot hold `_`';
    }
    this.expect([T.Space], ['a blank and styles']);
    this.hint = STYLES_HINT;
    const styles = this.styles();
    this.eol(['`,` and a style']);
    this.st.symbol(name, 'class', nameRange, 'def');
    const node: QuadrantClassDefNode = {
      id: '',
      type: 'ClassDef',
      range: this.span(first),
      name,
      nameRange,
      styles,
    };
    this.add(node, 'classDef');
  }

  /** `style { COMMA style }`, each style checked as v12's `parseStyles`. */
  private styles(): QuadrantStyleNode[] {
    const out = [this.style()];
    while (this.in([T.Comma])) {
      this.take();
      out.push(this.style());
    }
    return out;
  }

  private style(): QuadrantStyleNode {
    const first = this.c.pos;
    let raw = this.expect(STYLE_PART, STYLE);
    while (this.in(STYLE_PART)) raw += this.take();
    const range = this.span(first);
    const text = raw.trim();
    // A style cut short by a syntax error is not checked: that error is the one reported.
    const problem = this.in(STYLE_END) ? applyStyle(text, {}) : undefined;
    if (problem) this.st.diagnostics.error(problem.code, problem.message, range);
    return { text, range };
  }

  /** jison's `text`: a word, a string or a markdown string, then words, blanks and `-`. */
  private text(): QuadrantTextNode {
    const first = this.c.pos;
    const k = this.c.kind;
    if (!this.in(LABEL_START)) this.fail(LABEL);
    if (k === T.Str || k === T.MdStr) this.closed(k);
    // v12's lexer split a placeholder over several tokens (`#name;` is `ﬂ°`, `name`, `¶ß`), so
    // the text is decoded whole: a name core cannot decode is then seen and kept (D561).
    let text = this.raw();
    while (this.in(TEXT_MORE)) text += this.raw();
    return {
      text: decodePlaceholders(text),
      markdown: k === T.MdStr,
      range: this.span(first),
    };
  }

  /** Consume the current token; its text as v12's lexer read it, placeholders kept. */
  private raw(): string {
    const text = tokenText(this.lexed, this.c.pos);
    this.last = this.c.next();
    return text;
  }

  /** A string or markdown string at the cursor must be closed. */
  private closed(k: number): void {
    if (this.unclosed(k)) throw STOP;
  }

  /** Whether the string at the cursor is unclosed; reported once if so. */
  private unclosed(k: number): boolean {
    const p = this.c.pos;
    const close = k === T.Str ? T.StringEnd : T.MdStringEnd;
    if (this.kindAfter(p) === close) return false;
    if (p === this.reported) return true;
    this.reported = p;
    const quote = this.outerStart[p] ?? this.c.start;
    const mark = k === T.Str ? '"' : '"`';
    const at = { start: quote, end: quote + mark.length };
    this.st.diagnostics.error(
      'UNCLOSED_STRING',
      `Unclosed string: the \`${mark}\` at line ${this.lineOf(quote)} has no closing \`${k === T.Str ? '"' : '`"'}\`. Add it after the text.`,
      at
    );
    return true;
  }
}

// ---- model ----------------------------------------------------------------------------

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** `pt:<name>`-style id part: `%`, `>`, `@` and `#` percent-encoded. */
const esc = idEscaper();

const label = (t: QuadrantTextNode, suffix = ''): QuadrantText => ({
  text: (t.text + suffix).trim(),
  markdown: t.markdown,
});

function stylesOf(nodes: readonly QuadrantStyleNode[]): QuadrantStyles {
  const out: Mutable<QuadrantStyles> = {};
  for (const s of nodes) applyStyle(s.text, out);
  return out;
}

/** The statements the model keeps: the last of each `quadrant-N`, axis, end label and class. */
interface Kept {
  quadrants: (QuadrantQuadrantNode | undefined)[];
  axes: Record<string, QuadrantAxisNode>;
  ends: Record<string, QuadrantAxisEndNode>;
  classes: Map<string, QuadrantClassDefNode>;
}

function keptOf(nodes: readonly QuadrantStatementNode[]): Kept {
  const kept: Kept = { quadrants: [], axes: {}, ends: {}, classes: new Map() };
  for (const n of nodes) {
    if (n.type === 'Quadrant') kept.quadrants[n.quadrant] = n;
    else if (n.type === 'Axis') {
      kept.axes[n.axis] = n;
      const end = n.children?.[0];
      if (end) kept.ends[n.axis] = end;
    } else if (n.type === 'ClassDef') kept.classes.set(n.name, n);
  }
  return kept;
}

/** Give every node its id (see `ast.ts`), in source order. */
function assignIds(nodes: readonly QuadrantStatementNode[], st: ParseState): void {
  const kept = keptOf(nodes);
  const statement = () => st.ids.statement('st');
  const seen = new Map<string, number>();
  for (const n of nodes) {
    if (n.type === 'Quadrant') {
      n.id = kept.quadrants[n.quadrant] === n ? `q:${n.quadrant}` : statement();
    } else if (n.type === 'Axis') {
      n.id = kept.axes[n.axis] === n ? `ax:${n.axis}` : statement();
      const end = n.children?.[0];
      if (end) end.id = kept.ends[n.axis] === end ? `ax:${n.axis}/end` : statement();
    } else if (n.type === 'Point') {
      const count = (seen.get(n.name) ?? 0) + 1;
      seen.set(n.name, count);
      n.id = count === 1 ? `pt:${esc(n.name)}` : `pt:${esc(n.name)}@${count}`;
    } else if (n.type === 'ClassDef') {
      n.id = kept.classes.get(n.name) === n ? `c:${esc(n.name)}` : statement();
    } else n.id = statement();
  }
}

/**
 * Give every node its id and build the model as v12's DB did: the last `quadrant-N`, `title`,
 * `accTitle`, `accDescr` and `classDef` of a name win, an axis statement sets the labels it
 * names, points keep source order and repeats.
 */
function buildModel(
  nodes: readonly QuadrantStatementNode[],
  st: ParseState,
  frontMatterTitle: string | undefined
): QuadrantModel {
  assignIds(nodes, st);
  let title: QuadrantTextStatementNode | undefined;
  let accTitle = '';
  let accDescr = '';
  const quadrants: (QuadrantLabel | undefined)[] = [undefined, undefined, undefined, undefined];
  const axes: Record<string, Mutable<QuadrantAxis>> = {};
  const points: QuadrantPoint[] = [];
  const classes = new Map<string, QuadrantClass>();
  for (const n of nodes) {
    if (n.type === 'Title') title = n;
    else if (n.type === 'AccTitle') accTitle = n.text;
    else if (n.type === 'AccDescr') accDescr = n.text.replace(/\n\s+/g, '\n');
    else if (n.type === 'Quadrant') {
      if (n.id.startsWith('q:')) quadrants[n.quadrant - 1] = { ast: n.id, ...label(n.label) };
    } else if (n.type === 'Axis') {
      const end = n.children?.[0];
      const axis = (axes[n.axis] ??= { ast: `ax:${n.axis}` });
      axis.start = label(n.label, n.arrow && !end ? ' ⟶ ' : '');
      if (end) axis.end = label(end.label);
    } else if (n.type === 'Point') points.push(pointOf(n));
    else if (n.type === 'ClassDef') {
      // Map order is the first definition's, as v12's `Map.set`.
      classes.set(n.name, { ast: `c:${esc(n.name)}`, styles: stylesOf(n.styles) });
    }
  }
  const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
  const model: Mutable<QuadrantModel> = {
    accTitle,
    accDescr,
    quadrants: quadrants as unknown as QuadrantLabels,
    points,
    classes,
    warnings,
  };
  if (title) {
    model.title = title.text;
    model.titleAst = title.id;
  } else if (frontMatterTitle !== undefined) model.title = frontMatterTitle;
  if (axes.x) model.xAxis = axes.x;
  if (axes.y) model.yAxis = axes.y;
  return model;
}

function pointOf(n: QuadrantPointNode): QuadrantPoint {
  const point: Mutable<QuadrantPoint> = {
    ast: n.id,
    label: label(n.label),
    x: n.x,
    y: n.y,
    styles: stylesOf(n.styles),
  };
  if (n.className) point.className = n.className;
  return point;
}
