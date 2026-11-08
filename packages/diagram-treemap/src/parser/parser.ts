// cspell:words accdescr treemapx
/**
 * Treemap parser: recursive descent over the significant {@link lex} tokens (gated against v12's
 * Langium lexer, #483), producing a {@link TreemapModel}, the typed AST, symbols, statement
 * spans and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `treemap.langium`, ported rule for rule; `grammar/treemap.ebnf` is the
 * normative form:
 *
 *     Treemap: TREEMAP_KEYWORD (TITLE | ACC_TITLE | ACC_DESCR | Row)* EOF
 *     Row: INDENTATION? (Item | CLASS_DEF)
 *     Item: Leaf | Section
 *     Section: STRING2 (":::" ID2)?
 *     Leaf: STRING2 INDENTATION? (":" | ",") INDENTATION? NUMBER2 (":::" ID2)?
 *
 * Line breaks are skipped there (v12's `NL` is a skipped token), so they end nothing: rows on
 * one line are rows, and a row may run over lines. The lexer still writes them, and the parser
 * reads them only for its messages and warnings (D401): a blank at the end of a line is the
 * indent of the next row, a second row on a line gets `TREEMAP_ROWS_ON_ONE_LINE`, a `classDef`
 * with no styles that takes the next line gets `TREEMAP_CLASSDEF_NEXT_LINE`. Each syntax trap
 * gets a message that names its cause. Unlike v12 the parser does not stop at the first error:
 * it reports it, skips to the next token that starts a line, and carries on (R-PARSE-4).
 */
import {
  APOSTROPHE,
  ASCII_MAX,
  cook,
  DQUOTE,
  ExpectedTable,
  formatExpected,
  isSpace,
  Kind,
  kindSet,
  LineIndex,
  localOffset,
  ParseState,
  PERCENT,
  Probe,
  SEMI,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  Diagnostic,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  StatementSpan,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { TreemapModel } from '../model.ts';
import type {
  TreemapClassDefNode,
  TreemapDocument,
  TreemapLeafNode,
  TreemapRowNode,
  TreemapSectionNode,
  TreemapStatementNode,
} from './ast.ts';
import {
  accDescrValue,
  accTitleValue,
  classDefParts,
  decodeEntities,
  nameValue,
  numberValue,
  splitStyles,
  titleValue,
} from './convert.ts';
import { lex } from './lexer.ts';
import { normalise } from './normalise.ts';
import type { ClassDefRead } from './normalise.ts';
import { T } from './tokens.ts';

export interface TreemapParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type TreemapParseResult = ParseResult<TreemapModel, TreemapDocument>;

/** D401: a row starts on the line of the row before it (v12 reads it as a row of its own). */
export const TREEMAP_ROWS_ON_ONE_LINE = 'TREEMAP_ROWS_ON_ONE_LINE';
/** D401: the blank at the end of a line is the indent of the row on the next line. */
export const TREEMAP_TRAILING_BLANK = 'TREEMAP_TRAILING_BLANK';
/** D401: a `classDef` with no styles on its line takes the next line as its styles. */
export const TREEMAP_CLASSDEF_NEXT_LINE = 'TREEMAP_CLASSDEF_NEXT_LINE';

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
/** What starts a row after its indent. */
const ITEM = [T.String, T.ClassDef];
/** What may come next in the document: a text statement, a row (its indent first), the end. */
const DOC_NEXT = [...TEXT, T.Indentation, T.String, T.ClassDef, Kind.EOF];
/**
 * What may follow a blank (probe lists): a row's name or `classDef`, and the text statements,
 * whose tokens take the blanks before them when the line goes on as one.
 */
const AFTER_BLANK = [...ITEM, ...TEXT];
/** What may follow a row's name: its blank, the `:` or `,` of a leaf, its class. */
const AFTER_NAME = [T.Indentation, T.Separator, T.Comma, T.StyleSeparator];
const SEPARATORS = [T.Separator, T.Comma];
const BEFORE_VALUE = [T.Indentation, T.Number];
const CLASS = [T.StyleSeparator];

/**
 * Kinds a probe's cursor follows rather than extends: punctuation, a blank (the indent or the
 * blank before `:`), and a name, which its closing quote ends.
 */
const PROBE_FOLLOWS = kindSet(T.StyleSeparator, T.Separator, T.Comma, T.Indentation, T.String);

/** Trivia of the parser's view: the lexer's trivia and the line breaks. */
const isTrivia = (k: number) =>
  k === Kind.Comment || k === Kind.Directive || k === Kind.Space || k === Kind.Newline;

/** Each text statement's AST type and keyword. */
const TEXT_STATEMENTS: Readonly<
  Record<number, { type: 'Title' | 'AccTitle' | 'AccDescr'; word: string }>
> = {
  [T.Title]: { type: 'Title', word: 'title' },
  [T.AccTitle]: { type: 'AccTitle', word: 'accTitle' },
  [T.AccDescr]: { type: 'AccDescr', word: 'accDescr' },
};

/**
 * The probe's mode at `o` (R-LANG-7). The lexer has no modes (Langium's has none), so the
 * mode names what the offset is in: `string` inside a name (closed or not), `title`,
 * `accTitle` or `accDescr` past the keyword of that statement, `classDef` past the keyword of
 * a `classDef` (its name and styles), else `INITIAL` (code).
 */
function probeMode(src: string, tokens: TokenStream, o: number): string {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    if (end < o) continue;
    const kind = tokens.kind[j] ?? Kind.EOF;
    const c = src.charCodeAt(start);
    if (kind === T.String && o < end) return 'string';
    // An unclosed name is an error token from its quote on.
    if (kind === Kind.Error && (c === DQUOTE || c === APOSTROPHE)) return 'string';
    if (kind === T.ClassDef) {
      const closed = src.charCodeAt(end - 1) === SEMI;
      if (o > start + 'classDef'.length && (o < end || !closed)) return 'classDef';
      continue;
    }
    const word = TEXT_STATEMENTS[kind]?.word;
    if (!word) continue;
    let k = start;
    while (/[\t ]/.test(src.charAt(k))) k++;
    k += word.length;
    // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
    const block = kind === T.AccDescr && /^\s*\{/.test(src.slice(k, end));
    if (o > k && (o < end || !block)) return word;
  }
  return 'INITIAL';
}

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`treemap`', [T.TreemapKeyword]],
  ['a name in quotes (`"Root"`)', [T.String]],
  ['`classDef`', [T.ClassDef]],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['`:` and a value', [T.Separator, T.Comma]],
  ['a value such as `42` or `3.5`', [T.Number]],
  ['`:::` and a class name', [T.StyleSeparator]],
  ['a class name such as `important`', [T.Id]],
  ['the end of the text', [Kind.EOF]],
]);

/** The longest text an error message quotes. */
const EXCERPT = 24;

/** The first line of `text`, at most {@link EXCERPT} characters, with `…` when anything is cut. */
function excerpt(text: string): string {
  const line = text.split('\n', 1)[0] ?? '';
  return line.length > EXCERPT || line !== text ? `${line.slice(0, EXCERPT)}…` : line;
}

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a treemap. Never throws: problems are error diagnostics. */
export function parseTreemap(src: string, options: TreemapParseOptions = {}): TreemapParseResult {
  return new TreemapParser(src, options).parse();
}

/** The parser's tokens: the significant ones, and whether a line break comes before each. */
interface LineView {
  readonly kind: Uint16Array;
  readonly start: Uint32Array;
  readonly end: Uint32Array;
  /** 1 when a line break comes between the token and the significant one before it. */
  readonly lineStart: Uint8Array;
  readonly length: number;
}

function lineView(stream: TokenStream): LineView {
  let n = 0;
  for (let j = 0; j < stream.length; j++) if (!isTrivia(stream.kind[j] ?? Kind.EOF)) n++;
  const kind = new Uint16Array(n);
  const start = new Uint32Array(n);
  const end = new Uint32Array(n);
  const lineStart = new Uint8Array(n);
  let o = 0;
  let line = 1;
  for (let j = 0; j < stream.length; j++) {
    const k = stream.kind[j] ?? Kind.EOF;
    if (k === Kind.Newline) line = 1;
    if (isTrivia(k)) continue;
    kind[o] = k;
    start[o] = stream.start[j] ?? 0;
    end[o] = stream.end[j] ?? 0;
    lineStart[o] = line;
    line = 0;
    o++;
  }
  return { kind, start, end, lineStart, length: n };
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class TreemapParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly full: TokenStream;
  private readonly t: LineView;
  private i = 0;
  /** Where the statement that failed stopped. */
  private failedAt = 0;
  private readonly st = new ParseState();
  private readonly probe: Probe | undefined;
  private readonly children: TreemapStatementNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`classDef:a`, `title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  private readonly rows: TreemapRowNode[] = [];
  /** The statement span of each of {@link rows}. */
  private readonly rowSpans: StatementSpan[] = [];
  private readonly classDefs: ClassDefRead[] = [];
  /** Whether the statement before is a row (a section, leaf or `classDef`). */
  private afterRow = false;
  /** The `TREEMAP_ROWS_ON_ONE_LINE` warning of the current line, if any. */
  private oneLine: Diagnostic | undefined;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private title = '';
  private titleAstId: AstId | undefined;
  private accTitle = '';
  private accDescr = '';

  constructor(
    private readonly src: string,
    private readonly opts: TreemapParseOptions
  ) {
    const pre = (this.pre = opts.preprocessed ?? preprocess(src));
    if (!opts.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = lex(src, pre.bodyStart, this.view);
    this.t = lineView(this.full);
    if (opts.probe !== undefined) {
      const probe = (this.probe = new Probe(src, opts.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      // Ignored when the offset is outside code.
      probe.lexed(probe.offset, probe.offset, probeMode(src, this.full, probe.offset));
    }
  }

  parse(): TreemapParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const model = this.model();
    this.foldSections();
    const ast: TreemapDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.opts, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  /** Whether a line break comes before the token at `j`. */
  private startsLine(j = this.i): boolean {
    return this.t.lineStart[j] === 1;
  }

  /** A token's text as v12's lexer read it (removed spans dropped, entities decoded). */
  private raw(j = this.i): string {
    const { start, end } = this.range(j);
    return cook(this.src, start, end, this.view);
  }

  /**
   * A token's text as v12's lexer read it with its entity placeholders still in: `#name;` not
   * yet read as `&name;` (removed spans dropped, CRLF and CR as LF).
   */
  private v12Text(j: number): string {
    const { start, end } = this.range(j);
    const { view } = this;
    return view.text
      .slice(localOffset(view, start), localOffset(view, end))
      .replace(/\r\n?/g, '\n');
  }

  /**
   * Probe hook: the parser tests the token at `j` for `kinds` (a constant list), or would accept
   * them there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[], j = this.i): void {
    const p = this.probe;
    if (p === undefined) return;
    if (p.isAt(this.t, j, this.pre.bodyStart)) p.tested(kinds, this.t.start[j] ?? 0);
  }

  /** Consume a token of `kind` and return its index, or fail. */
  private expect(kind: number, hint?: string): number {
    // A plain parse builds no probe list.
    if (this.probe !== undefined) this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** `id`, then `id@2`, `id@3`, … */
  private id(base: string): AstId {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  private found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF) return 'the end of the text';
    if (k === T.Indentation) return 'a blank';
    return `\`${excerpt(this.raw(j).trim())}\``;
  }

  /** Record an error at `where` and stop the statement. */
  private stop(code: string, message: string, where: Range, expected?: string[]): never {
    this.st.diagnostics.error(code, message, where, expected ? { expected } : undefined);
    this.failedAt = this.i;
    throw STOP;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string): never {
    const where = this.range();
    const k = this.kind();
    if (k === Kind.Error) this.badCharacters(where);
    if (k === T.Id) this.accessibilityName(where);
    const names = EXPECTED.names(want);
    const why = hint ?? this.explain(want);
    const message = `Expected ${formatExpected(names)}, got ${this.found()}${why ? `; ${why}` : ''}.`;
    this.stop('UNEXPECTED', message, where, names);
  }

  /** Text no token rule matched: an unclosed string, or stray characters. */
  private badCharacters(where: Range): never {
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (text.startsWith('"') || text.startsWith("'")) {
      const q = text[0] ?? '"';
      this.stop(
        'UNCLOSED_STRING',
        `Unclosed name: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the name.`,
        where,
        [`\`${q}\``]
      );
    }
    const shown = excerpt(text);
    let why = '';
    const next = this.src.charAt(where.end);
    if (text === '-' && /[0-9.]/.test(next)) why = '; a treemap has no negative values';
    else if (text.startsWith(';'))
      why = '; `;` ends only a `classDef`: start a new line for each row';
    else if (text.startsWith('{')) why = '; `{` opens only `accDescr { … }`';
    else if (text.charCodeAt(0) > ASCII_MAX && this.kind(this.i - 1) === T.StyleSeparator) {
      why = '; a class name is ASCII letters, digits and `_`';
    }
    this.stop('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why}.`, where);
  }

  /**
   * `accDescr` or `accTitle` read as a name: no `:` after it, or a `{` with no `}` (v12's
   * lexer then has no accessibility token).
   */
  private accessibilityName(where: Range): void {
    const word = this.raw();
    if (word !== 'accDescr' && word !== 'accTitle') return;
    let j = this.i + 1;
    if (this.kind(j) === T.Indentation) j++;
    if (word === 'accDescr' && this.kind(j) === Kind.Error && this.raw(j).startsWith('{')) {
      this.stop(
        'UNCLOSED_ACC_DESCR',
        `Unclosed accessible description: the \`accDescr {\` at line ${this.lineOf(where.start)} has no closing \`}\`. Write \`accDescr { … }\` or \`accDescr: …\`.`,
        where
      );
    }
    this.stop(
      'UNEXPECTED',
      `Expected \`:\` after \`${word}\`; write it as \`${word}: …\`${word === 'accDescr' ? ' or `accDescr { … }`' : ''}.`,
      where,
      ['`:`']
    );
  }

  /** A hint for the token at the cursor, where one of `want` was expected. */
  private explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    const prev = this.kind(this.i - 1);
    const glued = this.glued(this.i - 1);
    if (k === T.StyleSeparator && prev === T.Indentation) {
      return '`:::` and the class name go right after the name or the value, with no blank before them';
    }
    if (k === T.Indentation && prev === T.StyleSeparator) {
      return 'the class name goes right after `:::`, with no blank';
    }
    if (k === T.Id && prev === T.Number && glued) {
      return 'a value is digits, with `.` before the decimals, and has no exponent or unit';
    }
    if (k === T.Id && prev === T.TreemapKeyword && glued) {
      return `\`${this.raw(this.i - 1)}${this.raw()}\` is not a diagram type: write \`treemap\` or \`treemap-beta\``;
    }
    if (k === T.TreemapKeyword) return 'a treemap has one `treemap` header, at its start';
    if (!want.includes(T.String)) return undefined;
    if (k === T.Id) return `a name is written in quotes: \`"${this.raw()}"\``;
    if (k === T.Number) return 'a value follows a name and `:`, such as `"Apples": 10`';
    if (k === T.Separator || k === T.Comma)
      return 'a leaf is a name, `:` and a value, such as `"Apples": 10`';
    return undefined;
  }

  /**
   * `classDef` read as a name: its class name is missing or one character long (D401). The
   * error is where the name should be: the token after `classDef` on its line, else the end of
   * that line, so a `classDef ` still being typed has its error after what was typed.
   */
  private classDefName(): never {
    let j = this.i + 1;
    if (this.kind(j) === T.Indentation && !this.startsLine(j)) j++;
    const names = EXPECTED.names([T.Id]);
    if (this.kind(j) !== Kind.EOF && !this.startsLine(j)) {
      const name = this.kind(j) === T.Id ? this.raw(j) : '';
      const why =
        name.length === 1
          ? `class names need two characters or more, and \`${name}\` has one: rename the class`
          : 'a class name is ASCII letters, digits and `_`, two characters or more';
      this.stop(
        'UNEXPECTED',
        `Expected a class name after \`classDef\`, got ${this.found(j)}; ${why}.`,
        this.range(j),
        names
      );
    }
    const { src } = this;
    let at = this.range(j - 1).end;
    while (at < src.length && src[at] !== '\n' && src[at] !== '\r') at++;
    const brk = src.startsWith('\r\n', at) ? 2 : Number(at < src.length);
    this.stop(
      'UNEXPECTED',
      `Expected a class name after \`classDef\`, got the end of the line; \`classDef\` takes a class name of two characters or more, then its styles.`,
      { start: at, end: at + brk },
      names
    );
  }

  /** Whether the token at `j` ends where the next one starts. */
  private glued(j: number): boolean {
    return j >= 0 && (this.t.end[j] ?? 0) === (this.t.start[j + 1] ?? -1);
  }

  /**
   * After an error, skip to the next token that starts a line (R-PARSE-4): the token that
   * failed (or the indent before it) when it starts one and the statement read something before
   * it, else the first after it.
   */
  private recover(from: number): void {
    this.probe?.freeze();
    let j = this.failedAt > from ? this.failedAt : from + 1;
    // The indent of a row on the next line, which the failed statement took as its own blank.
    const blank = j - 1;
    if (blank > from && this.kind(blank) === T.Indentation && this.startsLine(blank)) j = blank;
    while (j < this.t.length && this.kind(j) !== Kind.EOF && !this.startsLine(j)) j++;
    this.i = Math.min(j, Math.max(this.t.length - 1, 0));
    this.afterRow = false;
    this.oneLine = undefined;
  }

  /** Run one statement rule; on failure, recover. */
  private statement(rule: () => void): void {
    const from = this.i;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover(from);
    }
  }

  // ---- rules --------------------------------------------------------------------------

  /** `TREEMAP_KEYWORD` */
  private header(): void {
    this.expect(T.TreemapKeyword, 'a treemap starts with `treemap` or `treemap-beta`');
    const range = this.range(this.i - 1);
    this.st.statement('header', range);
    this.children.push({ id: 'treemap', type: 'Header', range });
  }

  /** `(TITLE | ACC_TITLE | ACC_DESCR | Row)* EOF` */
  private document(): void {
    for (;;) {
      this.tested(DOC_NEXT);
      const k = this.kind();
      if (k === Kind.EOF) return;
      this.statement(() => {
        if (TEXT.includes(k)) this.text(k);
        else this.row();
      });
    }
  }

  /** `(TITLE | ACC_TITLE | ACC_DESCR)`: the last of each wins. */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const { type, word } = TEXT_STATEMENTS[k] ?? { type: 'Title', word: 'title' };
    const range = this.range(j);
    while (range.start < range.end && /[\t ]/.test(this.src[range.start] ?? '')) range.start++;
    let text: string;
    if (type === 'Title') text = this.title = titleValue(image);
    else if (type === 'AccTitle') text = this.accTitle = accTitleValue(image);
    else text = this.accDescr = accDescrValue(image);
    const id = this.id(word);
    if (type === 'Title') this.titleAstId = id;
    this.children.push({ id, type, range, text });
    this.st.statement(word, range);
    this.afterRow = false;
    this.oneLine = undefined;
  }

  /** `Row: INDENTATION? (Item | CLASS_DEF)` */
  private row(): void {
    let indent = 0;
    const blank = this.kind() === T.Indentation ? this.i : -1;
    if (blank >= 0) {
      indent = this.raw(blank).length;
      this.i++;
      this.tested(AFTER_BLANK);
    }
    const k = this.kind();
    if (k !== T.String && k !== T.ClassDef) {
      if (blank >= 0 && this.startsLine()) this.strayBlank(blank);
      if (k === T.Id && this.raw() === 'classDef') this.classDefName();
      this.fail(ITEM);
    }
    this.lineWarnings(blank, this.i);
    if (k === T.ClassDef) this.classDef();
    else this.item(indent);
    this.afterRow = true;
  }

  /**
   * A blank run with no row after it on its line (D401's first trap): at the end of a line, or
   * before an inline comment, or on a line of its own. v12 read it as the indent of the next
   * row, and the token after it is no name.
   */
  private strayBlank(blank: number): never {
    const where = this.range(blank);
    const line = this.lineOf(where.start);
    const comment = this.src.charCodeAt(where.end) === PERCENT;
    const own = this.startsLine(blank);
    let at = `there is a blank at the end of line ${line}`;
    if (own) at = `line ${line} holds only blanks`;
    else if (comment) at = `there is a blank before the \`%%\` comment on line ${line}`;
    const next =
      this.kind() === Kind.EOF
        ? 'and no row follows it'
        : `and ${this.kind() === T.Indentation ? 'this row has an indent of its own' : `${this.found()} is not a row`}`;
    this.stop(
      'STRAY_BLANK',
      `Unexpected blank: ${at}, which a treemap reads as the indent of the next row, ${next}. Remove ${own ? 'the blanks' : 'it'}.`,
      where,
      EXPECTED.names(ITEM)
    );
  }

  /**
   * D401's warnings at a row's start: a second row on a line, and an indent that is a blank at
   * the end of the line before.
   */
  private lineWarnings(blank: number, head: number): void {
    const { diagnostics } = this.st;
    const sameLine = !this.startsLine(head) && (blank < 0 || !this.startsLine(blank));
    if (!sameLine) this.oneLine = undefined;
    if (sameLine && this.afterRow) {
      const range = this.range(head);
      const shown = this.found(head);
      if (this.oneLine) {
        (this.oneLine.related ??= []).push({ message: `${shown} starts another row`, range });
      } else {
        this.oneLine = diagnostics.warning(
          TREEMAP_ROWS_ON_ONE_LINE,
          `${shown} starts a second row on this line. It is read as a row of its own, indented by the blanks before it, so it may nest under the row before it. Put each row on its own line.`,
          range
        );
      }
    }
    if (blank >= 0 && !this.startsLine(blank) && this.startsLine(head)) {
      const where = this.range(blank);
      const line = this.lineOf(where.start);
      const cause =
        this.src.charCodeAt(where.end) === PERCENT
          ? `the blank before the \`%%\` comment on line ${line}`
          : `the blank at the end of line ${line}`;
      diagnostics.warning(
        TREEMAP_TRAILING_BLANK,
        `This row is indented by ${cause}: a treemap reads the blanks before a name as its indent, wherever they are. Remove the blank.`,
        where,
        { related: [{ message: 'the row it indents', range: this.range(head) }] }
      );
    }
  }

  /** `Item: Leaf | Section`, after the indent. */
  private item(indent: number): void {
    const s = this.i++;
    const nameRange = this.range(s);
    const name = nameValue(this.raw(s));
    let j = this.i;
    this.tested(AFTER_NAME);
    if (this.kind(j) === T.Indentation) this.tested(SEPARATORS, ++j);
    const leaf = this.kind(j) === T.Separator || this.kind(j) === T.Comma;
    let node: TreemapRowNode;
    if (leaf) {
      this.i = j + 1;
      this.tested(BEFORE_VALUE);
      if (this.kind() === T.Indentation) this.i++;
      const v = this.expect(T.Number, this.valueHint());
      const valueText = this.raw(v);
      const valueRange = this.range(v);
      node = {
        id: '',
        type: 'Leaf',
        range: { start: nameRange.start, end: valueRange.end },
        name,
        nameRange,
        indent,
        depth: 0,
        value: numberValue(valueText),
        valueText,
        valueRange,
      } satisfies TreemapLeafNode;
    } else {
      node = {
        id: '',
        type: 'Section',
        range: { ...nameRange },
        name,
        nameRange,
        indent,
        depth: 0,
      } satisfies TreemapSectionNode;
    }
    this.tested(CLASS);
    if (this.kind() === T.StyleSeparator) {
      this.i++;
      const c = this.expect(T.Id);
      const classRange = this.range(c);
      node.classSelector = this.raw(c);
      node.classRange = classRange;
      node.range.end = classRange.end;
      this.st.symbol(node.classSelector, 'class', classRange, 'ref');
    }
    this.rows.push(node);
    this.children.push(node);
    this.rowSpans.push(this.st.statement(leaf ? 'leaf' : 'section', { ...node.range }));
    // D408: every name is a `node` symbol of its own.
    this.st.symbol(name, 'node', nameRange, 'def');
  }

  /** The hint where a leaf's value is missing. */
  private valueHint(): string | undefined {
    const k = this.kind();
    if (k === Kind.Error && this.raw() === '-') return undefined;
    if (k === T.String || k === Kind.EOF || this.startsLine()) {
      return 'a leaf has a value after its `:` or `,`, such as `"Apples": 10`';
    }
    if (k === T.Id) return 'a value is digits, such as `42` or `3.5`';
    return undefined;
  }

  /** `CLASS_DEF`: `classDef name styles;` */
  private classDef(): void {
    const j = this.i++;
    const range = this.range(j);
    const image = this.v12Text(j);
    const parts = classDefParts(image);
    const nameRange = this.classNameRange(range.start, parts.name.length);
    const id = this.id(`classDef:${parts.name}`);
    const node: TreemapClassDefNode = { id, type: 'ClassDef', range, name: parts.name, nameRange };
    if (parts.styleText !== undefined) node.styleText = decodeEntities(parts.styleText);
    this.classDefs.push({ node, ...splitStyles(parts.styleText ?? '') });
    this.children.push(node);
    this.st.statement('classDef', range);
    // D408: the first `classDef` of a name defines its class; a repeat adds to it.
    this.st.symbol(parts.name, 'class', nameRange, id.includes('@') ? 'ref' : 'def');
    const gap = image.slice(parts.nameAt + parts.name.length, parts.stylesAt ?? 0);
    if (parts.styleText !== undefined && /[\n\r]/.test(gap)) {
      const shown = excerpt(node.styleText ?? '');
      this.st.diagnostics.warning(
        TREEMAP_CLASSDEF_NEXT_LINE,
        `\`classDef ${parts.name}\` has no styles on its line, so it takes the next line (\`${shown}\`) as its styles. Write the styles after the class name, on its line.`,
        range
      );
    }
  }

  /** The source range of a `classDef`'s name: after `classDef`, its blanks and comment lines. */
  private classNameRange(start: number, length: number): Range {
    const { src } = this;
    let p = start + 'classDef'.length;
    for (;;) {
      if (isSpace(src.charCodeAt(p))) p++;
      else if (src.startsWith('%%', p)) {
        while (p < src.length && src[p] !== '\n' && src[p] !== '\r') p++;
      } else break;
    }
    return { start: p, end: p + length };
  }

  // ---- folding ------------------------------------------------------------------------

  /**
   * Folding (#511): each section's statement span runs to the end of its last row, the rows
   * under it (v12's tree: a section holds the rows after it up to the first one indented no more
   * than it) and whatever is written between them nesting under it. Linear: a section's end is
   * set when it is popped.
   */
  private foldSections(): void {
    const open: { indent: number; span: StatementSpan }[] = [];
    let last = 0;
    this.rows.forEach((row, n) => {
      while ((open[open.length - 1]?.indent ?? -1) >= row.indent) {
        const top = open.pop();
        if (top) top.span.range.end = last;
      }
      const span = this.rowSpans[n];
      if (span && row.type === 'Section') open.push({ indent: row.indent, span });
      last = row.range.end;
    });
    for (const o of open) o.span.range.end = last;
    const { statements } = this.st;
    const flat = statements.splice(0);
    const stack: StatementSpan[] = [];
    for (const s of flat) {
      while (stack.length > 0 && s.range.start >= (stack[stack.length - 1]?.range.end ?? 0))
        stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) (parent.children ??= []).push(s);
      else statements.push(s);
      if (s.kind === 'section') stack.push(s);
    }
  }

  // ---- the model ----------------------------------------------------------------------

  private model(): TreemapModel {
    const { diagnostics } = this.st;
    const resolved = normalise(
      {
        rows: this.rows,
        classDefs: this.classDefs,
        title: this.title,
        titleAstId: this.titleAstId,
        accTitle: this.accTitle,
        accDescr: this.accDescr,
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
