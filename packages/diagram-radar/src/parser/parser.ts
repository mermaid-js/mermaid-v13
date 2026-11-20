// cspell:words accdescr
/**
 * Radar parser: recursive descent over the significant {@link lex} tokens (gated against v12's
 * Langium lexer, #445), producing a {@link RadarModel}, the typed AST, symbols, statement spans
 * and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `radar.langium` (with `common.langium`), ported rule for rule;
 * `grammar/radar.ebnf` is the normative form:
 *
 *     Radar: NEWLINE* ("radar-beta" | "radar-beta:" | "radar-beta" ":") NEWLINE*
 *            (TitleAndAccessibilities | "axis" Axis ("," Axis)* | "curve" Curve ("," Curve)*
 *            | Option ("," Option)* | NEWLINE)*
 *     Axis: ID ("[" STRING "]")?        Curve: ID ("[" STRING "]")? "\{" Entries "\}"
 *     Entries: NEWLINE* NumberEntry ("," NEWLINE* NumberEntry)* NEWLINE*
 *            | NEWLINE* DetailedEntry ("," NEWLINE* DetailedEntry)* NEWLINE*
 *     DetailedEntry: ID ":"? NUMBER     NumberEntry: NUMBER
 *     Option: "showLegend" BOOLEAN | "ticks" NUMBER | "max" NUMBER | "min" NUMBER
 *            | "graticule" GRATICULE
 *     TitleAndAccessibilities: ((ACC_DESCR | ACC_TITLE | TITLE) EOL)+     EOL: NEWLINE+ | EOF
 *
 * so it accepts and rejects what v12's parser does. The model is then resolved as v12's DB did
 * ({@link normalise}); v12's two DB throws are semantic errors with its messages at the curve
 * (R-PARSE-4). Unlike v12 the parser
 * does not stop at the first error: it reports it, skips to the next line break (past the `}`
 * of a curve it was in) and carries on.
 */
import { checkLimit } from '@mermaid-js/core/limits';
import {
  ASCII_MAX,
  ExpectedTable,
  formatExpected,
  Kind,
  kindSet,
} from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import {
  accessibilityAsName,
  RuleParser,
  textProbeMode,
  textValue,
  TITLE_STATEMENT,
  unclosedLabel,
  withoutIndent,
} from '@mermaid-js/shared/parser/rule';
import type { AstId, ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import type { RuleGrammar, TextValues } from '@mermaid-js/shared/parser/rule';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { RadarModel } from '../model.ts';
import type {
  RadarAxisNode,
  RadarCurveNode,
  RadarDocument,
  RadarEntryNode,
  RadarOptionNode,
  RadarStatementNode,
} from './ast.ts';
import { normalise } from './normalise.ts';
import type { OptionName } from './normalise.ts';
import { labelValue } from './convert.ts';
import { lex } from './lexer.ts';
import { PREFIX_KEYWORDS, RADAR_TRIVIA, T, TEXT_STATEMENTS } from './tokens.ts';

export interface RadarParseOptions extends ParseOptions {
  /** The integrator's cap on axes and curves (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type RadarParseResult = ParseResult<RadarModel, RadarDocument>;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const OPTIONS = [T.ShowLegend, T.Ticks, T.Max, T.Min, T.Graticule];
/** What starts a statement after the header. */
const STARTS = [...TEXT, T.Axis, T.Curve, ...OPTIONS];
const DOC = [...STARTS, Kind.Newline, Kind.EOF];
const HEAD = [T.RadarBeta, T.RadarBetaColon, Kind.Newline];
const LINE_END = [Kind.Newline, Kind.EOF];
const STARTS_SET = kindSet(...STARTS);
/** What line breaks may be followed by, inside a curve's `{ }` and elsewhere (probe lists). */
const BEFORE_ENTRIES = [Kind.Newline, T.Number, T.Id];
const BEFORE_DETAILED = [Kind.Newline, T.Id];
const BEFORE_NUMBER = [Kind.Newline, T.Number];
const BEFORE_RBRACE = [Kind.Newline, T.RBrace];
/** Tokens that cannot start or continue a name although they look like one (D357). */
const KEYWORD_PREFIX = kindSet(...PREFIX_KEYWORDS.map((k) => k.kind));
/** `a`, `b` or `c`, each in backticks. */
const words = (list: readonly string[]) => formatExpected(list.map((w) => `\`${w}\``));
const wordsOf = (kind: number) => words(PREFIX_KEYWORDS.find((k) => k.kind === kind)?.words ?? []);
/** `circle`, `polygon`, `true`, `false` or `title`. */
const KEYWORD_NAMES = words(PREFIX_KEYWORDS.flatMap((k) => k.words));

/**
 * Kinds a probe's cursor follows rather than extends: punctuation, and a label, which its
 * closing quote ends (right after `["A"` the parser expects `]`).
 */
const PROBE_FOLLOWS = kindSet(
  T.Colon,
  T.Comma,
  T.LBracket,
  T.RBracket,
  T.LBrace,
  T.RBrace,
  T.String
);

/** Each option keyword's name and the kind of its value. */
const OPTION_OF: Readonly<Record<number, { readonly name: OptionName; readonly value: number }>> = {
  [T.ShowLegend]: { name: 'showLegend', value: T.Boolean },
  [T.Ticks]: { name: 'ticks', value: T.Number },
  [T.Max]: { name: 'max', value: T.Number },
  [T.Min]: { name: 'min', value: T.Number },
  [T.Graticule]: { name: 'graticule', value: T.GraticuleValue },
};

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`radar-beta`', [T.RadarBeta, T.RadarBetaColon]],
  ['a statement such as `axis A, B` or `curve c{1, 2}`', [T.Axis, T.Curve]],
  ['an option such as `ticks 5` or `showLegend false`', OPTIONS],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['a name such as `A`', [T.Id]],
  ['a label such as `["Label"]`', [T.LBracket]],
  ['a label in quotes, such as `"Label"`', [T.String]],
  ['`]`', [T.RBracket]],
  ['`{` and the values', [T.LBrace]],
  ['a value such as `42` or `3.5`', [T.Number]],
  ['`:`', [T.Colon]],
  ['`,`', [T.Comma]],
  ['`}`', [T.RBrace]],
  [wordsOf(T.Boolean), [T.Boolean]],
  [wordsOf(T.GraticuleValue), [T.GraticuleValue]],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

/** Parse a radar chart. Never throws: problems are error diagnostics. */
export function parseRadar(src: string, options: RadarParseOptions = {}): RadarParseResult {
  return new RadarParser(src, options).parse();
}

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: RADAR_TRIVIA,
  probeFollows: PROBE_FOLLOWS,
  probeMode: /* @__PURE__ */ textProbeMode({
    texts: TEXT_STATEMENTS,
    accDescr: T.AccDescr,
    string: T.String,
  }),
};

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class RadarParser extends RuleParser<PreprocessResult> {
  /** Inside the `{ … }` of the curve being read (recovery skips to its `}`). */
  private inBraces = false;
  private readonly children: RadarStatementNode[] = [];
  private readonly axes: RadarAxisNode[] = [];
  private readonly curves: RadarCurveNode[] = [];
  /** The last option of each name (v12 `setOptions`). */
  private readonly options = new Map<OptionName, RadarOptionNode>();
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };
  /** The AST id of the last `title` statement. */
  private titleAstId: AstId | undefined;

  constructor(
    src: string,
    private readonly opts: RadarParseOptions
  ) {
    const given = opts.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, opts.probe);
  }

  parse(): RadarParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    this.unresolved();
    const model = this.model();
    const ast: RadarDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.opts, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  /**
   * Consume the line breaks at the cursor. `next` (a constant list, with `Kind.Newline`) is
   * what may follow them, tested at each: on a blank line inside `{ }` the cursor is at a line
   * break, where an entry may be typed.
   */
  private newlines(next: readonly number[]): void {
    for (;;) {
      this.tested(next);
      if (this.kind() !== Kind.Newline) return;
      this.i++;
    }
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected override fail(want: readonly number[], hint?: string): never {
    const { st } = this;
    const where = this.range();
    if (this.kind() === Kind.Error) this.badCharacters(where);
    if (this.kind() === T.Id) this.accessibilityName(where);
    const names = EXPECTED.names(want);
    const why = hint ?? this.explain(want);
    const message = `Expected ${formatExpected(names)}, got ${this.found()}${why ? `; ${why}` : ''}.`;
    st.diagnostics.error('UNEXPECTED', message, where, { expected: names });
    throw STOP;
  }

  /** Text no token rule matched: an unclosed string, or stray characters. */
  private badCharacters(where: Range): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (unclosedLabel(st.diagnostics, text, line, where)) throw STOP;
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    let why = '';
    if (text === ';') why = '; `;` does not end a statement in a radar chart: start a new line';
    else if (text === '-' && /[0-9]/.test(this.src.charAt(where.end))) {
      why = '; a radar chart has no negative values';
    } else if (/^[0-9.]/.test(text)) {
      why = '; a value is a number such as `42` or `3.5`, with digits on both sides of a `.`';
    } else if (text.charCodeAt(0) > ASCII_MAX) {
      why = '; a name is ASCII letters, digits, `_` and `-`';
    }
    st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why}.`, where);
    throw STOP;
  }

  /**
   * `accDescr` or `accTitle` read as a name: no `:` after it, or a `{` with no `}` (v12's
   * lexer then has no accessibility token).
   */
  private accessibilityName(where: Range): void {
    const word = this.raw();
    if (word !== 'accDescr' && word !== 'accTitle') return;
    let j = this.i + 1;
    while (this.kind(j) === Kind.Newline) j++;
    const line = this.lineOf(where.start);
    accessibilityAsName(this.st.diagnostics, word, this.kind(j) === T.LBrace, line, where);
    throw STOP;
  }

  private explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    const prev = this.kind(this.i - 1);
    if (want.includes(T.Id) && KEYWORD_PREFIX[k] === 1) return this.keywordName(this.i);
    if (k === T.Id && KEYWORD_PREFIX[prev] === 1 && this.glued(this.i - 1)) {
      return this.keywordName(this.i - 1);
    }
    if (k === Kind.Newline && prev === T.Comma && !this.inBraces) {
      return 'a list goes on after its `,` on the same line';
    }
    if (k === Kind.Newline && (want.includes(T.LBrace) || want.includes(T.RBracket))) {
      return "a curve's label and `{` go on the line of its name";
    }
    if (k === T.Id && want.includes(T.Number) && /^[0-9]/.test(this.raw())) {
      return 'a value is a number such as `42` or `3.5`, with digits on both sides of a `.`';
    }
    if (this.inBraces) return this.explainEntries(want);
    if (k === T.RadarBeta || k === T.RadarBetaColon) {
      return 'a chart has one `radar-beta`, at its start';
    }
    return undefined;
  }

  /** {@link explain} inside a curve's `{ … }`. */
  private explainEntries(want: readonly number[]): string | undefined {
    const k = this.kind();
    const prev = this.kind(this.i - 1);
    if (STARTS_SET[k] === 1 && prev === Kind.Newline) return "the curve's `{` has no `}`";
    if (k === T.Comma && prev === Kind.Newline) {
      return 'a line break inside `{ }` may follow a `,`, not come before it';
    }
    if ((k === T.Number && want.includes(T.Id)) || (k === T.Id && want.includes(T.Number))) {
      return 'a curve has all positional values (`{1, 2}`) or all `axis: value` pairs (`{A: 1, B: 2}`)';
    }
    if (k === T.Number || k === T.Id) return 'separate the values with `,`';
    if (k === T.RBrace) return 'a curve has at least one value';
    return undefined;
  }

  /** Whether the token at `j` ends where the next one starts. */
  private glued(j: number): boolean {
    return (this.t.end[j] ?? 0) === (this.t.start[j + 1] ?? -1);
  }

  /** D357: v12 reads `circle`, `polygon`, `true`, `false` and `title` before a name. */
  private keywordName(j: number): string {
    const word = this.raw(j).trim();
    const whole = this.glued(j) && this.kind(j + 1) === T.Id ? word + this.raw(j + 1) : word;
    const head =
      whole === word
        ? `\`${word}\` is a keyword`
        : `\`${whole}\` starts with the keyword \`${word}\``;
    return `${head}, and a name cannot be or start with ${KEYWORD_NAMES}: rename it`;
  }

  /**
   * Skip to the next line break after an error (R-PARSE-4). Inside or at a curve's `{ … }`,
   * skip to its `}` first, unless a line that starts a statement comes before it (the `{` is
   * unclosed); after an error at a line end, skip the next line too unless it starts one.
   */
  protected override recover(): void {
    this.probe?.freeze();
    let depth = this.inBraces ? 1 : 0;
    // A statement cut short at its line end (`axis A,`, `curve c`): the next line, unless it
    // starts a statement, is its rest.
    let continued = !this.inBraces && this.kind() === Kind.Newline;
    this.inBraces = false;
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) return;
      // An unclosed `{` before a line that starts a statement: the statement is not skipped.
      if (depth > 0 && STARTS_SET[k] === 1 && this.kind(this.i - 1) === Kind.Newline) return;
      if (k === T.LBrace) depth++;
      else if (k === T.RBrace) depth = Math.max(0, depth - 1);
      else if (k === Kind.Newline) {
        let j = this.i;
        while (this.kind(j) === Kind.Newline) j++;
        const starts = STARTS_SET[this.kind(j)] === 1;
        if (depth === 0 && !continued) return;
        if (starts) return;
        continued = false;
        this.i = j;
        continue;
      }
      this.i++;
    }
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* ("radar-beta" | "radar-beta:" | "radar-beta" ":")` */
  private header(): void {
    this.newlines(HEAD);
    const k = this.kind();
    if (k !== T.RadarBeta && k !== T.RadarBetaColon) {
      this.fail([T.RadarBeta], 'a radar chart starts with `radar-beta`');
    }
    const range = this.range(this.i++);
    if (k === T.RadarBeta) {
      this.tested([T.Colon]);
      if (this.kind() === T.Colon) range.end = this.range(this.i++).end;
    }
    this.st.statement('header', range);
    this.children.push({ id: 'radar', type: 'Header', range });
  }

  /** `(TitleAndAccessibilities | "axis" … | "curve" … | Option … | NEWLINE)* EOF` */
  private document(): void {
    for (;;) {
      this.tested(DOC);
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      this.statement(() => {
        if (TEXT.includes(k)) this.text(k);
        else if (k === T.Axis) this.list('axis', () => this.axis(), true);
        else if (k === T.Curve) this.list('curve', () => this.curve(), true);
        else if (OPTIONS.includes(k)) this.list('option', () => this.option(), false);
        else this.fail(DOC);
      });
    }
  }

  /** `keyword item ("," item)*`, or `item ("," item)*` for options (no `keyword`). */
  private list(kind: string, item: () => Range, keyword: boolean): void {
    const start = this.range().start;
    if (keyword) this.i++;
    let end = item().end;
    for (;;) {
      this.tested([T.Comma]);
      if (this.kind() !== T.Comma) break;
      this.i++;
      end = item().end;
    }
    this.st.statement(kind, { start, end });
  }

  /** `EOL: NEWLINE+ | EOF` (the loop takes the line breaks after the first). */
  private eol(): void {
    this.tested(LINE_END);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) {
      this.fail(LINE_END, '`title`, `accTitle` and `accDescr` end their line');
    }
    this.i++;
  }

  /** `("[" STRING "]")?`: the label, or undefined. */
  private label(): string | undefined {
    this.tested([T.LBracket]);
    if (this.kind() !== T.LBracket) return undefined;
    this.i++;
    const s = this.expect(T.String);
    this.expect(T.RBracket);
    return labelValue(this.raw(s));
  }

  /** One more axis or curve, against the node cap. */
  private counted(range: Range): void {
    const count = this.axes.length + this.curves.length;
    checkLimit(
      this.st.diagnostics,
      'maxNodes',
      count,
      this.opts.maxNodes,
      'axes and curves',
      range
    );
  }

  /** `Axis: ID ("[" STRING "]")?` */
  private axis(): Range {
    const n = this.expect(T.Id);
    const nameRange = this.range(n);
    const name = this.raw(n);
    const label = this.label();
    const range = { start: nameRange.start, end: this.range(this.i - 1).end };
    const base = `axis:${name}`;
    const id = this.id(base);
    const node: RadarAxisNode = { id, type: 'Axis', range, name, nameRange };
    if (label !== undefined) node.label = label;
    this.children.push(node);
    this.axes.push(node);
    this.counted(range);
    // D358: each axis name is an `axis` symbol; a repeat refers to the first.
    this.st.symbol(name, 'axis', nameRange, id === base ? 'def' : 'ref');
    return range;
  }

  /** `Curve: ID ("[" STRING "]")? "{" Entries "}"` */
  private curve(): Range {
    const n = this.expect(T.Id);
    const nameRange = this.range(n);
    const name = this.raw(n);
    const label = this.label();
    this.expect(T.LBrace);
    this.inBraces = true;
    const id = this.id(`curve:${name}`);
    const children = this.entries(id);
    this.expect(T.RBrace);
    this.inBraces = false;
    const range = { start: nameRange.start, end: this.range(this.i - 1).end };
    const node: RadarCurveNode = { id, type: 'Curve', range, name, nameRange, children };
    if (label !== undefined) node.label = label;
    this.children.push(node);
    this.curves.push(node);
    this.counted(range);
    // D358: curve names are definitions only, in their own namespace.
    this.st.symbol(name, 'curve', nameRange, 'def');
    return range;
  }

  /**
   * `Entries`: `NEWLINE* E ("," NEWLINE* E)* NEWLINE*`, all `NumberEntry` or all
   * `DetailedEntry`, chosen by the first.
   */
  private entries(curve: AstId): RadarEntryNode[] {
    this.newlines(BEFORE_ENTRIES);
    this.tested([T.Number, T.Id]);
    const first = this.kind();
    if (first !== T.Number && first !== T.Id) this.fail([T.Number, T.Id]);
    const detailed = first === T.Id;
    const out: RadarEntryNode[] = [];
    const mentions = new Map<string, number>();
    for (;;) {
      out.push(
        detailed ? this.detailedEntry(curve, mentions) : this.numberEntry(curve, out.length)
      );
      this.tested([T.Comma, Kind.Newline, T.RBrace]);
      if (this.kind() !== T.Comma) break;
      this.i++;
      this.newlines(detailed ? BEFORE_DETAILED : BEFORE_NUMBER);
    }
    this.newlines(BEFORE_RBRACE);
    return out;
  }

  /** `NumberEntry: NUMBER` */
  private numberEntry(curve: AstId, k: number): RadarEntryNode {
    const v = this.expect(T.Number);
    const valueRange = this.range(v);
    return {
      id: `${curve}#${k}`,
      type: 'Entry',
      range: { ...valueRange },
      value: Number(this.raw(v)),
      valueRange,
    };
  }

  /** `DetailedEntry: ID ":"? NUMBER` */
  private detailedEntry(curve: AstId, mentions: Map<string, number>): RadarEntryNode {
    const a = this.expect(T.Id);
    const axisRange = this.range(a);
    const axis = this.raw(a);
    this.tested([T.Colon, T.Number]);
    if (this.kind() === T.Colon) this.i++;
    const v = this.expect(T.Number);
    const valueRange = this.range(v);
    const n = (mentions.get(axis) ?? 0) + 1;
    mentions.set(axis, n);
    // D358: an entry's name refers to its axis; one naming no axis is dropped once the axes
    // are known ({@link unresolved}).
    this.st.symbol(axis, 'axis', axisRange, 'ref');
    return {
      id: `${curve}>${axis}${n === 1 ? '' : `@${n}`}`,
      type: 'Entry',
      range: { start: axisRange.start, end: valueRange.end },
      axis,
      axisRange,
      value: Number(this.raw(v)),
      valueRange,
    };
  }

  /** `Option: "showLegend" BOOLEAN | "ticks" NUMBER | … | "graticule" GRATICULE` */
  private option(): Range {
    this.tested(OPTIONS);
    const of = OPTION_OF[this.kind()];
    if (!of) this.fail(OPTIONS);
    const { name, value: valueKind } = of;
    const start = this.range(this.i++).start;
    const v = this.expect(valueKind);
    const valueRange = this.range(v);
    const image = this.raw(v);
    let value: RadarOptionNode['value'] = image;
    if (valueKind === T.Number) value = Number(image);
    else if (valueKind === T.Boolean) value = image === 'true';
    const range = { start, end: valueRange.end };
    const id = this.id(`opt:${name}`);
    const node: RadarOptionNode = { id, type: 'Option', range, name, value, valueRange };
    this.children.push(node);
    this.options.set(name, node);
    return range;
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE) EOL` */
  private text(k: number): void {
    const j = this.i++;
    const { type, word: kind } = TEXT_STATEMENTS[k] ?? TITLE_STATEMENT;
    const range = withoutIndent(this.src, this.range(j));
    const text = (this.texts[kind] = textValue(type, this.raw(j)));
    const id = this.id(kind);
    if (type === 'Title') this.titleAstId = id;
    this.children.push({ id, type, range, text });
    this.st.statement(kind, range);
    this.eol();
  }

  /**
   * D358: an entry naming no axis is an unresolved reference. The service has no role for one,
   * so it gets no symbol (no definition, references or rename; `RADAR_UNKNOWN_AXIS` says why).
   * Run after the parse: axes declared after a curve still resolve its entries.
   */
  private unresolved(): void {
    const names = new Set(this.axes.map((a) => a.name));
    const { symbols } = this.st;
    let k = 0;
    for (const s of symbols) if (s.kind !== 'axis' || names.has(s.name)) symbols[k++] = s;
    symbols.length = k;
  }

  // ---- the model ----------------------------------------------------------------------

  private model(): RadarModel {
    const { diagnostics } = this.st;
    const resolved = normalise(
      {
        src: this.src,
        axes: this.axes,
        curves: this.curves,
        options: this.options,
        title: this.texts.title,
        titleAstId: this.titleAstId,
        accTitle: this.texts.accTitle,
        accDescr: this.texts.accDescr,
        frontMatterTitle: this.pre.frontMatter?.title,
      },
      diagnostics
    );
    // The model's diagnostics are found after the parse: keep the list in source order.
    diagnostics.list.sort((x, y) => x.range.start - y.range.start);
    const warnings = diagnostics.list.filter((d) => d.severity === 'warning');
    return Object.freeze({ ...resolved, warnings: Object.freeze(warnings) });
  }
}
