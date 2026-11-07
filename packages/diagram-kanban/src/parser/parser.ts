// cspell:words LALR
/**
 * Kanban parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #451), producing a {@link KanbanModel}, the typed AST, statement spans and diagnostics
 * (DESIGN §4.3). Symbols are the language facet's (T6).
 *
 * The grammar is v12's `kanban.jison` (LALR), ported rule for rule; `grammar/kanban.ebnf` is
 * the normative form:
 *
 *     start     = [ SPACELINE ( SPACELINE | NL )* ] KANBAN [ NL ] ( statement stop )+
 *     stop      = ( NL | EOF | SPACELINE ) ( NL | EOF )*
 *     statement = SPACELIST [ item | ICON | CLASS ] | SPACELINE | item | ICON | CLASS
 *     item      = node [ SHAPE_DATA+ ]
 *     node      = NODE_ID [ shape ] | shape ;   shape = NODE_DSTART NODE_DESCR NODE_DEND
 *
 * So a blank or comment line is a statement where one may start, and a separator after one: an
 * item right after two of them in a row (or one right after `kanban`) is a syntax error, as in
 * v12. The parser reads the tokens jison returned; `:::`, `::icon(`, the `)` after an icon, the
 * quotes of a string and the `}` closing shape data, for which jison returns none, are skipped
 * like comments (they still give the ranges).
 *
 * v12's DB (`kanbanDb.ts`) adds errors, kept here as diagnostics after which the parse goes on
 * (R-PARSE-4): an item indented less than the first, once another item follows it; a
 * decoration before any item (a `TypeError` in v12); shape data that is not YAML, is empty
 * (`null`), or names a `shape` that is not a lower-case string. Unlike jison the parser does
 * not stop at the first error: it reports it, skips to the next line and carries on.
 */
import {
  inKindSet,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  sourceView,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import type {
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  StatementSpan,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { isYamlMap, parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type {
  PreprocessResult,
  YamlMap,
  YamlOptions,
  YamlResult,
  YamlValue,
} from '@mermaid-js/core/preprocess';
import type { KanbanItem, KanbanModel } from '../model.ts';
import type { KanbanData, KanbanDecoration, KanbanDocument, KanbanItemNode } from './ast.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import { T } from './tokens.ts';

export interface KanbanParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Item cap, columns and cards together (core `DEFAULT_LIMITS.maxNodes`, R-SEC-5). */
  maxNodes?: number;
}

export type KanbanParseResult = ParseResult<KanbanModel, KanbanDocument>;

/**
 * Comments, and the text jison matched without returning a token: `:::`, `::icon(`, the `)`
 * closing an icon, the line break after a bare `:::`, the quotes of a string and the `}`
 * closing shape data.
 */
const SKIPPED = kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.IconStart,
  T.IconEnd,
  T.ClassStart,
  T.ClassEnd,
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd,
  T.ShapeDataEnd
);

/** The kinds jison names `SHAPE_DATA`. */
const SHAPE_DATA = kindSet(T.ShapeDataStart, T.ShapeData, T.ShapeDataQuote, T.ShapeDataStr);

/** What a closer the opener reads best with is, for messages (any closer parses, as in v12). */
const CLOSERS: Readonly<Record<string, string>> = {
  '[': ']',
  '(': ')',
  '((': '))',
  ')': '(',
  '))': '((',
  '{{': '}}',
  '-)': '(-',
  '(-': '-)',
};

const HEADER = ['`kanban`'];
const STATEMENT = ['an item such as `todo` or `id[text]`', 'a `::icon(…)` or `:::class` line'];
const LINE_BREAK = ['a line break'];
const TEXT = ['the text of the item'];
const HEADER_HINT = 'a kanban board starts with `kanban`';
const ONE_HEADER = '`kanban` starts the diagram and comes only once';
const BRACE_HINT = 'a `{` starts a shape only as `{{text}}`, and shape data as `@{ … }`';
const AT_HINT = 'an `@` starts shape data only as `@{ … }`';
const DECORATION_HINT = 'an `::icon(…)` or `:::class` goes on a line of its own, after its item';
const ONE_ITEM_HINT = 'each item goes on a line of its own';
const DATA_HINT = 'shape data goes right after an item, as in `id@{ ticket: T-1 }`';
const BARE_CLASS_HINT = 'a bare `:::` takes the line break after it';
const AFTER_BLANK_HINT =
  'remove a blank or comment line above it: a line may not follow two of them in a row, or one right after `kanban`';

/** v12 `encodeEntities` placeholders, kept in YAML text so `#35;` reads as text, not a comment. */
const ENTITY = /&(#?)(\w+);/g;
const PLACEHOLDER = /ﬂ°°|ﬂ°|¶ß/g;
const PLACEHOLDER_TEXT: Readonly<Record<string, string>> = { 'ﬂ°°': '&#', 'ﬂ°': '&', '¶ß': ';' };

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a kanban diagram. Never throws: problems are error diagnostics. */
export function parseKanban(src: string, options: KanbanParseOptions = {}): KanbanParseResult {
  return new KanbanParser(src, options).parse();
}

/** A model item while the board is built: the same fields, writable. */
type OpenItem = { -readonly [K in keyof KanbanItem]: KanbanItem[K] };

/** How an item's data is read as YAML, and what the ranges of the read point into. */
interface YamlRead {
  /** The text `parseYaml` reads: the source (in place), or v12's wrapped data text. */
  text: string;
  options: YamlOptions;
  /** The read is of the source, so its ranges are source ranges. */
  inPlace: boolean;
  /** Entities were read as v12's placeholders, to be turned back into `&…;`. */
  placed: boolean;
}

/** Data read as a mapping, with the read it came from (for the `priority` text). */
interface ItemData {
  value: YamlMap;
  read: YamlRead;
}

/** The parts of an item statement (pitfall 10). */
interface ItemParts {
  nodeId: string | undefined;
  text: string;
  /** The indent width as written. */
  indent: number;
  range: Range;
  data?: KanbanData;
  /** The data's mapping, when it was read and is one. */
  value?: ItemData;
}

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class KanbanParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly lexed: Lexed;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly children: KanbanItemNode[] = [];
  private readonly items: OpenItem[] = [];
  private readonly columns: { item: number; cards: number[] }[] = [];
  /** The open column's statement span. */
  private columnSpan: StatementSpan | undefined;
  /** Items indented less than the first, not reported yet: v12 throws at the next item. */
  private readonly shallow: { label: string; range: Range }[] = [];
  /** The first item's indent; v12's section level. */
  private base = 0;
  /** The model item the next decoration applies to: the last item added. */
  private last: OpenItem | undefined;
  /** The AST node of the last item statement. */
  private lastAst: KanbanItemNode | undefined;
  /** The end of the last statement read, where an open column's span ends. */
  private lastEnd = 0;
  /** The last statement was a blank or comment line (for the message after it). */
  private afterBlank = false;
  /** The statement reported a missing separator already: the next one starts here. */
  private lineEnded = false;
  /** `kanban` was read; a missing one was reported once, so a later one is the header. */
  private headerSeen = false;
  /** The item cap was reported. */
  private tooMany = false;
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: KanbanParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.lexed = lex(src, pre.bodyStart, this.view);
    this.c = new TokenCursor(this.lexed.tokens, SKIPPED);
  }

  parse(): KanbanParseResult {
    this.start();
    this.document();
    if (this.columnSpan) this.st.endStatement(this.columnSpan, this.lastEnd);
    const { st, pre, src } = this;
    // A misplaced indent is reported when the item after it is read: keep source order.
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const model: KanbanModel = {
      items: this.items,
      columns: this.columns,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: KanbanDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.c.tokens, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (`Lexed.text`). */
  private raw(j = this.c.pos): string {
    return this.lexed.text(j);
  }

  private range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /**
   * The index of the token of `kind` next to `j` in direction `step` (±1), past comments and
   * directives; -1 when the next other token is not of `kind`.
   */
  private beside(j: number, step: number, kind: number): number {
    const t = this.c.tokens;
    for (let i = j + step; i >= 0 && i < t.length; i += step) {
      const k = t.kind[i];
      if (k === kind) return i;
      if (k !== Kind.Comment && k !== Kind.Directive) return -1;
    }
    return -1;
  }

  /** The whole decoration whose text is token `j`: `::icon(` or `:::` and an icon's `)` too. */
  private decorationRange(j: number): Range {
    const icon = this.c.tokens.kind[j] === T.Icon;
    const inner = this.range(j);
    const opener = this.beside(j, -1, icon ? T.IconStart : T.ClassStart);
    const closer = icon ? this.beside(j, 1, T.IconEnd) : -1;
    return {
      start: opener < 0 ? inner.start : this.range(opener).start,
      end: closer < 0 ? inner.end : this.range(closer).end,
    };
  }

  /** The kind of the significant token after an indent at the cursor (else the cursor's). */
  private afterIndent(): number {
    const { c } = this;
    if (c.kind !== T.SpaceList) return c.kind;
    return this.c.tokens.kind[this.nextSignificant(c.pos)] ?? Kind.EOF;
  }

  private nextSignificant(j: number): number {
    const t = this.c.tokens;
    let next = j + 1;
    while (next < t.length - 1 && inKindSet(SKIPPED, t.kind[next] ?? 0)) next++;
    return next;
  }

  /** Whether nothing but line breaks and blank lines follows from token `j` on. */
  private onlySeparatorsFrom(j: number): boolean {
    const t = this.c.tokens;
    for (let i = j; i < t.length; i = this.nextSignificant(i)) {
      const k = t.kind[i] ?? Kind.EOF;
      if (k === Kind.EOF) return true;
      if (k !== Kind.Newline && k !== T.Eof && !(k === T.SpaceLine && !this.raw(i).includes('%%')))
        return false;
      if (i === t.length - 1) return true;
    }
    return true;
  }

  private isStop(k: number): boolean {
    return k === Kind.Newline || k === T.Eof || k === T.SpaceLine;
  }

  private isNodeStart(k: number): boolean {
    return k === T.NodeId || k === T.NodeDStart;
  }

  private isData(k: number): boolean {
    return inKindSet(SHAPE_DATA, k);
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token (the one after it, for an indent). */
  private found(): string {
    const { c } = this;
    let j = c.pos;
    if (c.kind === T.SpaceList) {
      const next = this.nextSignificant(j);
      const after = c.tokens.kind[next] ?? Kind.EOF;
      if (!this.isStop(after) && after !== Kind.EOF) j = next;
    }
    const k = c.tokens.kind[j] ?? Kind.EOF;
    if (k === Kind.EOF || k === T.Eof || this.onlySeparatorsFrom(j)) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    let t = this.raw(j).trim();
    if (k === T.Icon || k === T.Class) {
      const r = this.decorationRange(j);
      t = this.src.slice(r.start, r.end).trim();
    } else if (this.isData(k)) {
      t = this.src.slice(this.range(j).start, this.dataEnd(j)).trim();
    }
    if (k === T.SpaceLine) return t.includes('%%') ? 'a comment' : 'a blank line';
    if (t === '') return 'blanks';
    const line = /^[^\n\r\u2028\u2029]*/.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${t}\``;
  }

  /** The end of the shape data run from token `j`, past its closing `}`. */
  private dataEnd(j: number): number {
    const t = this.c.tokens;
    let end = this.range(j).end;
    for (let i = j; i < t.length; i++) {
      const k = t.kind[i] ?? Kind.EOF;
      if (!this.isData(k) && k !== T.ShapeDataEnd && k !== Kind.Comment && k !== Kind.Directive)
        break;
      end = t.end[i] ?? end;
    }
    return end;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], hint?: string, at: Range = this.c.range): never {
    this.report(names, hint, at);
    throw STOP;
  }

  /** Report what was found where `names` were expected, and go on. */
  private report(names: string[], hint?: string, at: Range = this.c.range): void {
    const d = this.st.diagnostics.unexpected('UNEXPECTED', at, names, this.found());
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
  }

  /** Skip to the next separator after an error (R-PARSE-4), and past it. */
  private recover(): void {
    const { c } = this;
    c.recovering();
    while (c.kind !== Kind.EOF && !this.isStop(c.kind)) c.next();
    this.separator();
  }

  /** Run one rule; on failure, skip to the next statement. */
  private guarded(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  /** The hint for an unexpected token of kind `k` where a statement or line break was due. */
  private hintFor(k: number): string | undefined {
    if (k === T.Kanban) return ONE_HEADER;
    if (this.isData(k)) return DATA_HINT;
    if (k === Kind.Error) return this.src.charAt(this.c.start) === '@' ? AT_HINT : BRACE_HINT;
    return undefined;
  }

  // ---- grammar ------------------------------------------------------------------------

  /**
   * `start`: blank and comment lines, then `kanban` and an optional line break. Without the
   * header the rest is still read, and a later `kanban` is taken as it.
   */
  private start(): void {
    const { c } = this;
    if (c.kind === T.SpaceLine) {
      // `spaceLines`.
      c.next();
      while (c.kind === T.SpaceLine || c.kind === Kind.Newline) c.next();
    }
    if (c.kind === T.Kanban) this.header();
    else this.report(HEADER, HEADER_HINT);
  }

  private header(): void {
    const { c } = this;
    this.headerSeen = true;
    this.st.statement('header', c.range);
    c.next();
    c.eat(Kind.Newline);
  }

  /** `document`: statements, each followed by a separator, to the end. */
  private document(): void {
    const { c } = this;
    while (c.kind !== Kind.EOF) {
      // The missing header was reported; one error, one diagnostic.
      if (!this.headerSeen && c.kind === T.Kanban) {
        this.header();
        continue;
      }
      // Blank lines and the end after a missing header: it was reported, nothing else is wrong.
      if (!this.headerSeen && this.isStop(c.kind)) {
        this.separator();
        continue;
      }
      this.guarded(() => {
        this.statement();
        this.stop();
      });
    }
  }

  /** `stop`: a line break, the end, or a blank or comment line; then line breaks. */
  private stop(): void {
    const { c } = this;
    if (this.lineEnded) {
      this.lineEnded = false;
      return;
    }
    if (this.isStop(c.kind)) {
      this.separator();
      return;
    }
    if (c.kind === Kind.EOF) this.endsOpen();
    const k = c.kind;
    // The line ended (inside a blank run or after a bare `:::`) where jison wanted a separator:
    // one error, and the line after it is still read.
    const bareClass = this.beside(c.pos, -1, T.ClassEnd) >= 0;
    if (this.afterBlank || bareClass) {
      this.report(LINE_BREAK, this.afterBlank ? AFTER_BLANK_HINT : BARE_CLASS_HINT);
      return;
    }
    let hint = this.hintFor(k);
    const after = this.afterIndent();
    if (after === T.Icon || after === T.Class) hint = DECORATION_HINT;
    else if (this.isNodeStart(after)) hint = ONE_ITEM_HINT;
    this.fail(LINE_BREAK, hint);
  }

  /** The separator tokens at the cursor: one of `stop`'s, then line breaks and the end. */
  private separator(): void {
    const { c } = this;
    if (c.kind === Kind.EOF) return;
    c.next();
    while (c.kind === Kind.Newline || c.kind === T.Eof) c.next();
  }

  /**
   * The text ended inside an icon, a shape, a string or shape data (jison's lexer returned no
   * `EOF` there): report what was left open.
   */
  private endsOpen(): never {
    const t = this.c.tokens;
    for (let j = t.length - 1; j >= 0; j--) {
      const k = t.kind[j] ?? 0;
      if (k === T.IconStart) return this.unclosed('UNCLOSED_ICON', 'icon', '::icon(', ')', j);
      if (k === T.StringStart) return this.unclosed('UNCLOSED_STRING', 'string', '"', '"', j);
      if (k === T.MdStringStart) return this.unclosed('UNCLOSED_STRING', 'string', '"`', '`"', j);
      if (k === T.ShapeDataStart)
        return this.unclosed('UNCLOSED_SHAPE_DATA', 'shape data', '@{', '}', j);
      if (k === T.NodeDStart) {
        const open = this.raw(j);
        return this.unclosed('UNCLOSED_SHAPE', 'shape', open, CLOSERS[open] ?? ')', j);
      }
      if (
        k === T.IconEnd ||
        k === T.StringEnd ||
        k === T.MdStringEnd ||
        k === T.NodeDEnd ||
        k === T.ShapeDataEnd
      )
        break;
    }
    this.fail(LINE_BREAK);
  }

  private unclosed(code: string, what: string, open: string, close: string, j: number): never {
    const at = this.range(j);
    this.st.diagnostics.error(
      code,
      `Unclosed ${what}: the \`${open}\` at line ${this.lineOf(at.start)} has no closing \`${close}\`. Add \`${close}\` after its text.`,
      at
    );
    throw STOP;
  }

  /** `statement`. */
  private statement(): void {
    const { c } = this;
    const k = c.kind;
    this.afterBlank = false;
    if (k === T.SpaceList) {
      const j = c.next();
      const indent = this.raw(j).length;
      const n = c.kind;
      if (this.isNodeStart(n)) this.item(indent);
      else if (n === T.Icon || n === T.Class) this.decoration();
      else if (n === T.SpaceList && this.beside(c.pos, -1, T.ClassEnd) >= 0) {
        // A bare `:::` took the line break: one error, and the next line is still read.
        this.report(LINE_BREAK, BARE_CLASS_HINT);
        this.lineEnded = true;
      } else if (!this.isStop(n) && n !== Kind.EOF) this.badStatement();
      return;
    }
    if (k === T.SpaceLine) {
      c.next();
      this.afterBlank = true;
      return;
    }
    if (this.isNodeStart(k)) this.item(0);
    else if (k === T.Icon || k === T.Class) this.decoration();
    else this.badStatement();
  }

  private badStatement(): never {
    this.fail(STATEMENT, this.hintFor(this.c.kind));
  }

  /** `node [ shapeData ]`: `nodeWithId` (an id, then an optional shape) or `nodeWithoutId`. */
  private item(indent: number): void {
    const { c } = this;
    let nodeId: string | undefined;
    const first = c.pos;
    if (c.kind === T.NodeId) {
      nodeId = this.raw(c.next());
    }
    const parts: ItemParts = {
      nodeId,
      text: nodeId ?? '',
      indent,
      range: this.range(first),
    };
    // An item that fails inside its shape is still added, with the text read so far, so that
    // the decorations and cards after it see it: one error, one diagnostic.
    let failed = false;
    try {
      if (c.kind === T.NodeDStart) this.shape(parts);
      if (this.isData(c.kind)) this.shapeData(parts);
    } catch (error) {
      if (error !== STOP) throw error;
      failed = true;
    }
    this.addItem(parts);
    if (failed) throw STOP;
  }

  /** `NODE_DSTART NODE_DESCR NODE_DEND`, into `parts` as far as it gets. */
  private shape(parts: ItemParts): void {
    const { c } = this;
    const open = c.next();
    const opener = this.raw(open);
    parts.range = { start: parts.range.start, end: this.range(open).end };
    if (c.kind !== T.NodeDescr) {
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail(TEXT);
    }
    const text = c.next();
    parts.text = this.raw(text);
    parts.range = { start: parts.range.start, end: this.range(text).end };
    if (c.kind !== T.NodeDEnd) {
      const closer = `\`${CLOSERS[opener] ?? ')'}\``;
      // v12's `<NODE>.+` at a `}`: the rest of the line is text, and so is all after it up to a
      // closer, maybe the rest of the board.
      if (this.raw(text).startsWith('}')) this.swallowed(closer, text);
      if (c.kind === T.NodeDescr && this.raw(c.pos).startsWith('}')) this.swallowed(closer, c.pos);
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail([closer]);
    }
    const close = c.next();
    parts.range = { start: parts.range.start, end: this.range(close).end };
  }

  /**
   * A `}` in a shape's text at token `from` took the rest of its line, and the text ran on past
   * it (v12's tokens): report the shape as not closed, over all the text read into it, so the
   * author sees why the items there are missing.
   */
  private swallowed(closer: string, from: number): never {
    const t = this.c.tokens;
    let last = from;
    for (let j = this.nextSignificant(from); t.kind[j] === T.NodeDescr; j = this.nextSignificant(j))
      last = j;
    const range = { start: this.range(from).start, end: this.range(last).end };
    const lines = this.lineOf(range.end) - this.lineOf(range.start);
    const next = t.kind[this.nextSignificant(last)];
    let reach = 'the end of its line';
    if (lines > 0)
      reach =
        next === T.NodeDEnd
          ? `the closer on line ${this.lineOf(range.end)}, taking in the items before it`
          : 'the end of the board, taking in every item after it';
    const head = /^[^\n\r\u2028\u2029]*/.exec(this.src.slice(range.start, range.end))?.[0] ?? '';
    const shown = head.length > 24 ? `${head.slice(0, 24)}…` : head;
    this.st.diagnostics.error(
      'UNEXPECTED',
      `Expected ${closer}, got \`${shown}\`: a \`}\` in an item's text takes the rest of its line into the text, as in mermaid@12, so the shape is not closed and its text runs on to ${reach}. Write the text in quotes, as \`["a}b"]\`, or close the shape before the \`}\`.`,
      range,
      { expected: [closer] }
    );
    throw STOP;
  }

  /**
   * `shapeData`: the `SHAPE_DATA` tokens joined, as v12's rule did (so back-to-back blocks are
   * one), then read as YAML the way `addNode` did. Bad YAML, empty data and a bad `shape` are
   * semantic errors: they are reported, the item keeps no data, and the statement goes on.
   */
  private shapeData(parts: ItemParts): void {
    const { c } = this;
    const opener = this.range(c.pos);
    let text = '';
    let end = opener.end;
    let closed = false;
    while (this.isData(c.kind)) {
      text += this.raw(c.pos);
      end = c.end;
      c.next();
      // The `}` jison returned no token for (skipped by the cursor), if the block was closed.
      const close = this.beside(c.pos, -1, T.ShapeDataEnd);
      closed = close >= 0;
      if (closed) end = this.range(close).end;
    }
    const range = { start: opener.start, end };
    parts.data = { text, range };
    parts.range = { start: parts.range.start, end };
    if (!closed) {
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail(['`}`']);
    }
    parts.value = this.readData(text, range);
  }

  /** v12 `addNode`'s YAML read of `text`, the data at `range`: the mapping, or undefined. */
  private readData(text: string, range: Range): ItemData | undefined {
    const read = this.yamlInput(text, range);
    const result = parseYaml(read.text, read.options);
    if (this.yamlErrors(result, read, range)) return undefined;
    const value = read.placed ? fromPlaceholders(result.value) : result.value;
    if (value === null) {
      this.st.diagnostics.error(
        'KANBAN_DATA_EMPTY',
        'The `@{ … }` data is empty or `null`. Write `key: value` pairs in it, such as `ticket: T-1`, or remove it.',
        range
      );
      return undefined;
    }
    // v12 ignored a scalar or a list (only `null` made it throw).
    if (!isYamlMap(value) || !this.shapeOk(value.shape, range)) return undefined;
    return { value, read };
  }

  /**
   * What `parseYaml` reads for the data `text` at `range`: the source in place when the text is
   * the source's, so diagnostic ranges are exact; else v12's wrapping of it (`{\n<data>\n}` on
   * one line, `<data>\n` over several), with `#name;` entities as v12's placeholders.
   */
  private yamlInput(text: string, range: Range): YamlRead {
    const { src } = this;
    const inner = { start: range.start + 2, end: range.end - 1 };
    const multiline = text.includes('\n');
    // v12 parsed `{\n<data>\n}`; a `#` comment reads differently without those newlines.
    if (src.slice(inner.start, inner.end) === text && !text.includes('#')) {
      const options = multiline ? inner : { start: range.start + 1, end: range.end };
      return { text: src, options, inPlace: true, placed: false };
    }
    // `#name;` entities read `&name;` (`cook`); v12 read its placeholders, which YAML takes as
    // plain text (no `#` comment, no `&` anchor).
    const placed = /#\w+;/.test(src.slice(range.start, range.end));
    const data = placed
      ? text.replace(ENTITY, (_m, num: string, name: string) =>
          num ? `ﬂ°°${name}¶ß` : `ﬂ°${name}¶ß`
        )
      : text;
    const wrapped = multiline ? data + '\n' : `{\n${data}\n}`;
    return { text: wrapped, options: {}, inPlace: false, placed };
  }

  /**
   * Record the YAML diagnostics of `result`: errors as `SHAPE_DATA` (over the whole block when
   * the read was not in place). Whether there was an error.
   */
  private yamlErrors(result: YamlResult, read: YamlRead, range: Range): boolean {
    let failed = false;
    for (const d of result.diagnostics) {
      const r = read.inPlace ? d.range : range;
      if (d.severity === 'error') {
        this.st.diagnostics.error('SHAPE_DATA', d.message, r);
        failed = true;
      } else this.st.diagnostics.warning(d.code, d.message, r);
    }
    return failed;
  }

  /** v12's shape check: a set `shape` must be a lower-case string with no `_`; else an error. */
  private shapeOk(shape: YamlValue | undefined, range: Range): boolean {
    if (shape === undefined || !truthy(shape)) return true;
    if (typeof shape === 'string' && shape === shape.toLowerCase() && !shape.includes('_'))
      return true;
    this.st.diagnostics.error(
      'KANBAN_SHAPE',
      `No such shape: ${jsString(shape)}. Shape names are lower case, with no \`_\`; a card's shape is ignored, so the \`shape\` key can be removed.`,
      range
    );
    return false;
  }

  /** The source text of the `priority` value in `read`, as the author wrote it. */
  private priorityText(read: YamlRead): string {
    const tree = parseYaml(read.text, { ...read.options, tree: true });
    const root = tree.root;
    const pair = root?.kind === 'map' ? root.pairs.find((p) => p.key === 'priority') : undefined;
    const r = pair?.value?.range;
    if (!r) return '';
    const text = valueText(read.text, r.start, r.end);
    return read.placed ? entitiesBack(text) : text;
  }

  /** v12 `addNode`: the item's column, its data, and the misplaced-indent error. */
  private addItem(parts: ItemParts): void {
    const { nodeId, text, indent, range, data, value } = parts;
    const id = nodeId ?? text;
    const node: KanbanItemNode = {
      id: this.st.ids.node(id.trim()),
      type: 'Item',
      range,
      text,
      indent,
      decorations: [],
    };
    if (nodeId !== undefined) node.nodeId = nodeId;
    if (data) node.data = data;
    this.children.push(node);
    this.lastAst = node;
    const first = this.items.length === 0;
    if (first) this.base = indent;
    // v12's `getSection` throws at any item after one indented less than the first.
    for (const s of this.shallow.splice(0)) {
      this.st.diagnostics.error(
        'KANBAN_ITEM_WITHOUT_COLUMN',
        `Items without section detected, found section ("${s.label}"): it is indented less than the first column. Indent it as deep as the columns, or deeper for a card.`,
        s.range,
        { related: [{ message: 'mermaid@12 rejects the board from this item on', range }] }
      );
    }
    const isColumn = first || indent === this.base;
    const item: OpenItem = {
      ast: node.id,
      id,
      label: text,
      level: indent,
      isColumn,
      column: isColumn ? this.columns.length : this.columns.length - 1,
      classes: [],
    };
    if (value) applyData(item, value.value, () => this.priorityText(value.read));
    if (indent < this.base) this.shallow.push({ label: item.label, range });
    const index = this.items.length;
    this.items.push(item);
    this.last = item;
    this.checkLimit(range);
    const before = this.lastEnd;
    this.lastEnd = range.end;
    if (isColumn) {
      if (this.columnSpan) this.st.endStatement(this.columnSpan, before);
      this.columns.push({ item: index, cards: [] });
      const span = (this.columnSpan = this.st.beginStatement('column', range.start));
      span.range.end = range.end;
      return;
    }
    const column = this.columns[item.column];
    if (column) {
      item.parentId = this.items[column.item]?.id;
      column.cards.push(index);
    }
    this.st.statement('card', range);
  }

  /** The integrator's item cap (R-SEC-5): reported once, at the first item over it. */
  private checkLimit(range: Range): void {
    const max = this.options.maxNodes ?? DEFAULT_LIMITS.maxNodes;
    if (this.items.length <= max || this.tooMany) return;
    this.tooMany = true;
    this.st.diagnostics.error(
      LIMIT_CODES.maxNodes,
      `The board has more than ${max} items (columns and cards), the limit. The limit is set by the page or app that renders the diagram.`,
      range
    );
  }

  /** `ICON` or `CLASS`: v12 `decorateNode`, on the last item in source order. */
  private decoration(): void {
    const { c } = this;
    const icon = c.kind === T.Icon;
    const j = c.next();
    const text = this.raw(j);
    const range = this.decorationRange(j);
    const target = this.lastAst;
    const item = this.last;
    if (!target || !item) {
      this.st.diagnostics.error(
        'KANBAN_DECORATION_BEFORE_ITEM',
        `${icon ? 'An `::icon(…)`' : 'A `:::class`'} line decorates the item before it, and there is none here. Write it on the line after its item.`,
        range
      );
      return;
    }
    const decoration: KanbanDecoration = { type: icon ? 'Icon' : 'Class', text, range };
    target.decorations.push(decoration);
    this.st.statement(icon ? 'icon' : 'class', range);
    this.lastEnd = range.end;
    if (icon) item.icon = text;
    else item.classes = text.split(/[\t\n\f\r ]+/).filter((w) => w !== '');
  }
}

/** JavaScript truthiness of a YAML value, as v12's `if (doc?.x)` tested it. */
const truthy = (v: YamlValue | undefined): boolean =>
  v !== undefined && v !== null && v !== false && v !== 0 && v !== '' && !Number.isNaN(v);

/** A YAML value as JavaScript's `String()` and `toString()` write it (`[x, y]` is `x,y`). */
function jsString(v: YamlValue): string {
  if (Array.isArray(v)) return v.map((x) => (x === null ? '' : jsString(x))).join(',');
  if (typeof v === 'object' && v !== null) return '[object Object]';
  return String(v);
}

/**
 * `addNode`'s reading of the data `doc` onto `item`. A priority that is not a string keeps its
 * source text, from `priorityText`.
 */
function applyData(item: OpenItem, doc: YamlMap, priorityText: () => string): void {
  if (truthy(doc.label)) item.label = jsString(doc.label ?? '');
  if (truthy(doc.icon)) item.icon = jsString(doc.icon ?? '');
  if (truthy(doc.assigned)) item.assigned = jsString(doc.assigned ?? '');
  if (truthy(doc.ticket)) item.ticket = jsString(doc.ticket ?? '');
  const priority = doc.priority;
  if (priority === undefined || !truthy(priority)) return;
  const text = typeof priority === 'string';
  item.priority = text ? priority : priorityText();
  item.priorityKind = text ? 'text' : 'other';
}

/**
 * The YAML text `src[start, end)` of one value, standing on its own: lines after the first
 * lose the indent they share with it.
 */
function valueText(src: string, start: number, end: number): string {
  const column = start - (src.lastIndexOf('\n', start - 1) + 1);
  const lines = (' '.repeat(column) + src.slice(start, end)).split('\n');
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length);
  const cut = Math.min(...indents);
  return lines.map((l) => l.slice(cut)).join('\n');
}

/** `s` with v12's entity placeholders turned back into `&…;`. */
const entitiesBack = (s: string): string => s.replace(PLACEHOLDER, (m) => PLACEHOLDER_TEXT[m] ?? m);

/** `value` with v12's entity placeholders in its strings and keys turned back into `&…;`. */
function fromPlaceholders(value: YamlValue): YamlValue {
  if (typeof value === 'string') return entitiesBack(value);
  if (Array.isArray(value)) return value.map(fromPlaceholders);
  if (typeof value !== 'object' || value === null) return value;
  const out: YamlMap = {};
  for (const [k, v] of Object.entries(value)) out[entitiesBack(k)] = fromPlaceholders(v);
  return out;
}
