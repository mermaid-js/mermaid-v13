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
  ASCII_MAX,
  cook,
  ExpectedTable,
  formatExpected,
  isSpace,
  Kind,
  LineIndex,
  localOffset,
  ParseState,
  PERCENT,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  Diagnostic,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
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
  private readonly children: TreemapStatementNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`classDef:a`, `title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  private readonly rows: TreemapRowNode[] = [];
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
  }

  parse(): TreemapParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const model = this.model();
    const ast: TreemapDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.opts);
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

  /** Consume a token of `kind` and return its index, or fail. */
  private expect(kind: number, hint?: string): number {
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
    if (k === T.Id && this.raw() === 'classDef') return this.classDefName();
    if (k === T.Id) return `a name is written in quotes: \`"${this.raw()}"\``;
    if (k === T.Number) return 'a value follows a name and `:`, such as `"Apples": 10`';
    if (k === T.Separator || k === T.Comma)
      return 'a leaf is a name, `:` and a value, such as `"Apples": 10`';
    return undefined;
  }

  /** `classDef` read as a name: its class name is missing or one character long (D401). */
  private classDefName(): string {
    let j = this.i + 1;
    if (this.kind(j) === T.Indentation) j++;
    const name = this.kind(j) === T.Id ? this.raw(j) : '';
    if (name.length === 1) {
      return `class names need two characters or more, and \`${name}\` has one: rename the class`;
    }
    return '`classDef` takes a class name of two characters or more, then its styles';
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
    }
    const k = this.kind();
    if (k !== T.String && k !== T.ClassDef) {
      if (blank >= 0 && this.startsLine()) this.strayBlank(blank);
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
    if (this.kind(j) === T.Indentation) j++;
    const leaf = this.kind(j) === T.Separator || this.kind(j) === T.Comma;
    let node: TreemapRowNode;
    if (leaf) {
      this.i = j + 1;
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
    this.st.statement(leaf ? 'leaf' : 'section', node.range);
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
