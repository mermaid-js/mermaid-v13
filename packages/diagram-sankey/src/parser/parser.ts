// cspell:words LALR acctitle accdescr
/**
 * Sankey parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #494), producing a {@link SankeyModel}, the typed AST, statement spans and diagnostics
 * (DESIGN §4.3). Symbols and the probe are the language facet's (T6).
 *
 * The grammar is v12's `sankey.jison` (LALR), ported rule for rule; `grammar/sankey.ebnf` is
 * the normative form:
 *
 *     start  = SANKEY NEWLINE record ( NEWLINE record )* [ EOF ]
 *     record = field COMMA field COMMA field
 *     field  = DQUOTE ESCAPED_TEXT DQUOTE | NON_ESCAPED_TEXT
 *
 * The record action is v12's: each name is its field trimmed, `""` read as `"`; the value is
 * `parseFloat` of the trimmed value field. Then, as decided for v13:
 *
 * - a cycle (a self-link included) is an error (D393), one per group of nodes that reach each
 *   other, at the first link on it; v12 threw `circular link` at render;
 * - a value that is NaN, negative or infinite counts as 0 (D394), with one warning listing
 *   every such row; a value with text after its number gets a warning of its own.
 *
 * Unlike jison the parser does not stop at the first syntax error: it reports it, skips to
 * the next line and carries on (R-PARSE-4). A row with an error adds nothing to the model.
 */
import { Kind, LineIndex, ParseState, sourceView, TokenCursor } from '@mermaid-js/core/parser-kit';
import type {
  Diagnostic,
  ParseOptions,
  ParseResult,
  Range,
  RelatedInfo,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { SANKEY_CYCLE, SANKEY_INVALID_VALUE, SANKEY_VALUE_TRAILING_TEXT } from '../codes.ts';
import type { SankeyLink, SankeyModel, SankeyNode } from '../model.ts';
import type { SankeyDocument, SankeyField, SankeyLinkNode, SankeyNodeNode } from './ast.ts';
import { cycleLinks } from './cycles.ts';
import { LinkIds, nodeAstId } from './ids.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import { SankeyKind as T } from './tokens.ts';
import { drawable, numberEnd } from './values.ts';

export interface SankeyParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type SankeyParseResult = ParseResult<SankeyModel, SankeyDocument>;

const HEADER = ['`sankey`'];
const ROW = ['a row such as `Coal,Electricity,12.5`'];
const TARGET = ['a target name'];
const VALUE = ['a value such as `12.5`'];
const COMMA = ['a comma'];
const LINE_BREAK = ['a line break'];
const QUOTED_TEXT = ['the text of the quoted field'];
const CLOSE_QUOTE = ['the closing `"`'];

const HEADER_HINT = 'a sankey diagram starts with `sankey` on a line of its own';
const ROWS_HINT = 'rows such as `Coal,Electricity,12.5` follow `sankey`, one per line';
const HEADER_BLANKS_HINT = 'remove the blanks after `sankey`';
const THREE_FIELDS_HINT = 'a row has three fields: source, target and value';
const ONE_HEADER_HINT = '`sankey` comes only once, on the first line';
const NO_TITLE_HINT =
  'sankey has no `title`, `accTitle` or `accDescr` statements: set `title` in the front matter';
const BLANK_LINE_HINT =
  'a line of blanks may not come between rows: remove the blanks, or the line';
const AFTER_QUOTE_HINT =
  'only a comma or a line break may follow the closing `"` of a quoted field';
const QUOTE_HINT = 'a `"` may only start a field; inside a quoted field write it as `""`';
const EMPTY_FIELD_HINT = 'a field may not be empty';
const EMPTY_QUOTES_HINT = 'a quoted field may not be empty';
const ASCII_HINT = 'sankey text takes printable ASCII characters only';
const ENTITY_HINT = 'sankey text takes printable ASCII characters only, and no `#…;` entities';

/** The first line of a text, for messages. */
const FIRST_LINE = /^[^\n]*/;
/** An entity as v12 encoded it: `#name;` or `#123;`. */
const ENTITY = /^#\w+;/;
/** The keywords of other diagrams' title statements, as a field's first word. */
const TITLE_WORD = /^(?:title|acctitle|accdescr)\b/i;
/** The sankey header keyword, as a field. */
const KEYWORD = /^sankey(?:-beta)?$/i;

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at row level. One instance,
 * so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a sankey diagram. Never throws: problems are error diagnostics. */
export function parseSankey(src: string, options: SankeyParseOptions = {}): SankeyParseResult {
  return new SankeyParser(src, options).parse();
}

/** A field read. */
interface ReadField extends SankeyField {
  /** The field's text as v12's lexer matched it (`$field` before the record action's `trim`). */
  raw: string;
  /** The field's tokens, blanks and quotes included. */
  whole: Range;
}

/** A link while the model is built, with its ends as node indexes. */
interface OpenLink extends SankeyLink {
  from: number;
  to: number;
  /** The value field. */
  valueField: SankeyField;
}

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the row loop recovers.
 */
class SankeyParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: Lexed;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly ids = new LinkIds();
  private readonly nodes: SankeyNode[] = [];
  private readonly byName = new Map<string, number>();
  private readonly links: OpenLink[] = [];
  private readonly children: SankeyLinkNode[] = [];
  /** `sankey` was read; a missing one was reported once, so a later one is the header. */
  private headerSeen = false;
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: SankeyParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.lexed = lex(src, pre.bodyStart, view);
    this.c = new TokenCursor(this.lexed.tokens);
  }

  parse(): SankeyParseResult {
    this.start();
    this.rows();
    this.cycles();
    this.values();
    const { st, pre, src } = this;
    // Cycles are found after the rows are read: keep source order.
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const title = pre.frontMatter?.title;
    const model: SankeyModel = {
      nodes: this.nodes,
      links: this.links.map(
        ({ source, target, value, flow, ast, range }): SankeyLink => ({
          source,
          target,
          value,
          flow,
          ast,
          range,
        })
      ),
      ...(title !== undefined ? { title } : {}),
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: SankeyDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.c.tokens, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's lexer matched it (`Lexed.text`). */
  private raw(j: number): string {
    return this.lexed.text(j);
  }

  private range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /**
   * `[from, to)` of token `j`'s v12 text `text`, when the source there reads as `text`; else
   * the token's range (a comment or directive cut out of it, a CRLF, a collapsed run).
   */
  private exact(j: number, text: string, from: number, to: number): Range {
    const r = this.range(j);
    if (this.src.slice(r.start, r.end) !== text) return r;
    return { start: r.start + from, end: r.start + to };
  }

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** Whether the row ends at the cursor: a line break or the end of the text. */
  private atRowEnd(): boolean {
    const k = this.c.kind;
    return k === Kind.Newline || k === T.Eof || k === Kind.EOF;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** How an error message names the token at the cursor. */
  private found(): string {
    const { c } = this;
    const k = c.kind;
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === Kind.Error) return foundCharacters(this.src.slice(c.start, c.end));
    const t = this.raw(c.pos).trim();
    if (t === '') return this.raw(c.pos) === '' ? 'the end of the text' : 'blanks';
    const line = FIRST_LINE.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${cut}\``;
  }

  /** The hint for the token at the cursor, else `fallback`. */
  private hint(fallback?: string): string | undefined {
    const { c } = this;
    if (c.kind === Kind.Error) {
      return ENTITY.test(this.src.slice(c.start, c.end)) ? ENTITY_HINT : ASCII_HINT;
    }
    if (c.kind === T.OpenQuote) return QUOTE_HINT;
    return fallback;
  }

  /**
   * Report what was found where `names` were expected, then stop the row. The range and what
   * the message names are the token at the cursor, unless `at` is given with what it is.
   */
  private fail(names: string[], hint?: string, at?: { range: Range; found: string }): never {
    const { c } = this;
    const here =
      c.kind === Kind.EOF || c.kind === T.Eof ? { start: c.start, end: c.start } : c.range;
    const d = this.st.diagnostics.unexpected(
      'UNEXPECTED',
      at?.range ?? here,
      names,
      at?.found ?? this.found()
    );
    const h = this.hint(hint);
    if (h) d.message = `${d.message.slice(0, -1)}; ${h}.`;
    throw STOP;
  }

  /** Skip to the next line after an error (R-PARSE-4), and past its line break. */
  private recover(): void {
    const { c } = this;
    c.recovering();
    while (c.kind !== Kind.EOF && c.kind !== Kind.Newline) c.next();
    c.eat(Kind.Newline);
  }

  /** Run one rule; on failure, skip to the next line. */
  private guarded(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  private unclosed(open: number): never {
    const at = this.range(open);
    this.st.diagnostics.error(
      'UNCLOSED_STRING',
      `Unclosed quote: the \`"\` at line ${this.lineOf(at.start)} has no closing \`"\`. Add \`"\` after the field's text.`,
      at
    );
    throw STOP;
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `SANKEY NEWLINE`. Without it the rows are still read, and a later `sankey` is taken as it. */
  private start(): void {
    this.guarded(() => {
      if (this.c.kind !== T.Sankey) this.fail(HEADER, HEADER_HINT);
      this.header();
    });
  }

  private header(): void {
    const { c } = this;
    this.headerSeen = true;
    this.st.statement('header', c.range);
    c.next();
    if (c.eat(Kind.Newline)) return;
    const blanks = c.kind === T.Text && this.raw(c.pos).trim() === '';
    this.fail(LINE_BREAK, blanks ? HEADER_BLANKS_HINT : ROWS_HINT);
  }

  /** `record { NEWLINE record } [ EOF ]`. */
  private rows(): void {
    const { c } = this;
    while (c.kind !== Kind.EOF) {
      // The `EOF` after the last row (jison's `opt_eof`); once rows were read, it is the end.
      if (c.kind === T.Eof && this.children.length > 0) {
        c.next();
        continue;
      }
      // The missing header was reported; one error, one diagnostic.
      if (!this.headerSeen && c.kind === T.Sankey) {
        this.guarded(() => this.header());
        continue;
      }
      this.guarded(() => {
        this.row();
        if (c.kind === Kind.Newline) c.next();
        else if (c.kind !== T.Eof && c.kind !== Kind.EOF) {
          this.fail(LINE_BREAK, this.afterValueHint());
        }
      });
    }
  }

  /** `field COMMA field COMMA field`. */
  private row(): void {
    const source = this.field(ROW, true);
    this.comma(source);
    const target = this.field(TARGET, true);
    this.comma(target);
    const value = this.field(VALUE, false);
    this.addLink(source, target, value);
  }

  /** The `,` after a source or target field. */
  private comma(after: ReadField): void {
    const { c } = this;
    if (c.eat(T.Comma)) return;
    let hint: string | undefined;
    if (after.quoted && c.kind === T.Text) hint = AFTER_QUOTE_HINT;
    else if (this.atRowEnd()) {
      // A line of blanks: the error is at the blanks.
      if (!after.quoted && after.raw.trim() === '') {
        this.fail(ROW, BLANK_LINE_HINT, { range: after.whole, found: 'a line of blanks' });
      }
      if (KEYWORD.test(after.text)) hint = ONE_HEADER_HINT;
      else if (TITLE_WORD.test(after.text)) hint = NO_TITLE_HINT;
      else hint = THREE_FIELDS_HINT;
    }
    this.fail(COMMA, hint);
  }

  /** The hint after a complete row that does not end there. */
  private afterValueHint(): string | undefined {
    const k = this.c.kind;
    if (k === T.Comma) return THREE_FIELDS_HINT;
    if (k === T.Text) return AFTER_QUOTE_HINT;
    return undefined;
  }

  /** `DQUOTE ESCAPED_TEXT DQUOTE | NON_ESCAPED_TEXT`. A name is read as v12's DB got it. */
  private field(names: string[], isName: boolean): ReadField {
    const { c } = this;
    if (c.kind === T.Text) {
      const j = c.next();
      const raw = this.raw(j);
      const trimmed = raw.trim();
      const from = raw.length - raw.trimStart().length;
      return {
        raw,
        text: isName ? trimmed.replaceAll('""', '"') : trimmed,
        quoted: false,
        range: this.exact(j, raw, from, from + trimmed.length),
        whole: this.range(j),
      };
    }
    if (c.kind !== T.OpenQuote) {
      let hint: string | undefined;
      if (c.kind === T.Comma) hint = EMPTY_FIELD_HINT;
      else if (names !== ROW && this.atRowEnd()) hint = THREE_FIELDS_HINT;
      this.fail(names, hint);
    }
    const open = c.next();
    if (c.kind === T.CloseQuote) this.fail(QUOTED_TEXT, EMPTY_QUOTES_HINT);
    if (c.kind !== T.EscapedText) this.fail(QUOTED_TEXT);
    const j = c.next();
    if (c.kind === T.CloseQuote) {
      const close = c.next();
      const raw = this.raw(j);
      const trimmed = raw.trim();
      const whole = { start: this.range(open).start, end: this.range(close).end };
      return {
        raw,
        text: isName ? trimmed.replaceAll('""', '"') : trimmed,
        quoted: true,
        range: whole,
        whole,
      };
    }
    // The text ended inside the quotes: jison's empty `ESCAPED_TEXT` at the end, then nothing.
    if (c.kind === T.EscapedText || c.kind === Kind.EOF) this.unclosed(open);
    this.fail(CLOSE_QUOTE);
  }

  // ---- model --------------------------------------------------------------------------

  /** v12's `findOrCreateNode`: the node's index, added at its first occurrence. */
  private node(field: ReadField, into: SankeyNodeNode[]): number {
    const name = field.text;
    const known = this.byName.get(name);
    if (known !== undefined) return known;
    const ast = nodeAstId(name);
    this.byName.set(name, this.nodes.length);
    this.nodes.push({ id: name, ast, range: field.range });
    into.push({ id: ast, type: 'Node', range: field.range, name });
    return this.nodes.length - 1;
  }

  /** v12's record action: both nodes, then the link with `parseFloat` of the value. */
  private addLink(source: ReadField, target: ReadField, value: ReadField): void {
    const firsts: SankeyNodeNode[] = [];
    const from = this.node(source, firsts);
    const to = this.node(target, firsts);
    const number = parseFloat(value.text);
    const range = { start: source.range.start, end: value.range.end };
    const ast = this.ids.next(source.text, target.text);
    this.links.push({
      source: source.text,
      target: target.text,
      value: number,
      flow: drawable(number) ? number : 0,
      ast,
      range,
      from,
      to,
      valueField: value,
    });
    const link: SankeyLinkNode = {
      id: ast,
      type: 'Link',
      range,
      source: field(source),
      target: field(target),
      value: field(value),
    };
    if (firsts.length > 0) link.children = firsts;
    this.children.push(link);
    this.st.statement('link', range);
    this.trailingText(value, number);
  }

  /** `1;`, `1 2`: v12's `parseFloat` read the number and dropped the rest (D394). */
  private trailingText(value: ReadField, number: number): void {
    const { text } = value;
    const end = numberEnd(text);
    if (end === 0 || end === text.length) return;
    const rest = text.slice(end).trimStart();
    this.st.diagnostics.warning(
      SANKEY_VALUE_TRAILING_TEXT,
      `Only the number at the start of the value "${text}" is read (${String(number)}): the text "${rest}" after it is ignored.`,
      this.restRange(value, rest)
    );
  }

  /** The source range of a value's last `rest.length` characters, else the whole field. */
  private restRange(value: ReadField, rest: string): Range {
    const r = value.range;
    const inSource = this.src.slice(r.start, r.end);
    const at = value.quoted ? inSource.indexOf(value.text) : 0;
    if (at < 0 || inSource.slice(at, at + value.text.length) !== value.text) return r;
    const end = r.start + at + value.text.length;
    return { start: end - rest.length, end };
  }

  /** D393: one error per group of nodes on a cycle, at its first link in row order. */
  private cycles(): void {
    for (const k of cycleLinks(this.nodes.length, this.links)) {
      const link = this.links[k];
      if (!link) continue;
      this.st.diagnostics.error(
        SANKEY_CYCLE,
        `Sankey diagrams cannot have circular links, and "${link.source}" is part of one.`,
        link.range
      );
    }
  }

  /**
   * D394: one warning for every value that is NaN, negative or infinite, at the first, listing
   * each row in `related` and, for the render warning, its link's AST id in `astIds`.
   */
  private values(): void {
    const bad = this.links.filter((l) => !drawable(l.value));
    const first = bad[0];
    if (!first) return;
    const message =
      bad.length === 1
        ? `${upper(describe(first))} is not a number of 0 or more, so the link counts as 0.`
        : `${bad.length} links have a value that is not a number of 0 or more (the first is ${describe(first)}), so each counts as 0.`;
    const related: RelatedInfo[] = bad.map((l) => ({
      message: `${upper(describe(l))} counts as 0.`,
      range: l.valueField.range,
    }));
    const d: Diagnostic & { astIds?: readonly string[] } = this.st.diagnostics.warning(
      SANKEY_INVALID_VALUE,
      message,
      first.valueField.range,
      { related }
    );
    // Core's render `Warning` keeps `astIds`, not `related` (D394's "listing every such row").
    d.astIds = bad.map((l) => l.ast);
  }
}

/** A field as the AST keeps it. */
const field = ({ text, quoted, range }: ReadField): SankeyField => ({ text, quoted, range });

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const describe = (l: OpenLink) =>
  `the value "${l.valueField.text}" of the link from "${l.source}" to "${l.target}"`;

/** The characters of a run no rule reads, for messages. */
function foundCharacters(run: string): string {
  const entity = ENTITY.exec(run);
  if (entity) return `\`${entity[0]}\``;
  const ch = String.fromCodePoint(run.codePointAt(0) ?? 0);
  if (ch === '\t') return 'a tab';
  if (/\s/.test(ch)) return 'a blank other than a space';
  if (/\p{Cc}|\p{Cf}/u.test(ch)) return 'a control character';
  return `\`${ch}\``;
}
