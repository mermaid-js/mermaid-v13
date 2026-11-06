// cspell:words LALR
/**
 * Mindmap parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #383), producing a {@link MindmapModel}, the typed AST, statement spans and diagnostics
 * (DESIGN §4.3).
 *
 * Symbols (D289): each node id is a `node` definition of its own (ids repeat and nothing refers
 * to one), recorded with the range of the id without the blanks around it; each word of a
 * `:::` line is a `class` reference. With a probe (R-LANG-7, D95) the parser records what it
 * would accept at the probed token: the header, a statement start, a shape after an id, a
 * shape's text and closer.
 *
 * The grammar is v12's `mindmap.jison` (LALR), ported rule for rule; `grammar/mindmap.ebnf` is
 * the normative form:
 *
 *     start     = [ SPACELINE ( SPACELINE | NL )* ] MINDMAP [ NL ] ( statement stop )+
 *     stop      = ( NL | EOF | SPACELINE ) ( NL | EOF )*
 *     statement = SPACELIST [ node | ICON | CLASS ] | SPACELINE | node | ICON | CLASS
 *     node      = NODE_ID [ shape ] | shape ;   shape = NODE_DSTART NODE_DESCR NODE_DEND
 *
 * So a blank or comment line is a statement where one may start, and a separator after one: a
 * node right after two of them in a row (or one right after `mindmap`) is a syntax error, as in
 * v12. The parser reads the tokens jison returned; `:::`, `::icon(`, the `)` after an icon and
 * the quotes of a string, for which jison returns none, are skipped like comments (they still
 * give the ranges).
 *
 * v12's DB (`mindmapDb.ts`) adds two errors, kept here as diagnostics after which the parse goes
 * on (R-PARSE-4): a second root (a node with no parent: an indent no deeper than the first
 * node's), and a decoration before any node (a `TypeError` in v12). Parents come from a stack of
 * open nodes, which finds the same parent as v12's backward scan in linear time (pitfall 19).
 * Unlike jison the parser does not stop at the first error: it reports it, skips to the next
 * line and carries on.
 */
import {
  cook,
  CR,
  inKindSet,
  isSpace,
  Kind,
  kindSet,
  LF,
  LineIndex,
  ParseState,
  Probe,
  ProbeCursor,
  sourceView,
  SPACE,
  TAB,
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
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { mindmapSections } from '../model.ts';
import type {
  MindmapColorBy,
  MindmapIcon,
  MindmapModel,
  MindmapNode,
  MindmapShape,
} from '../model.ts';
import type { MindmapDecoration, MindmapDocument, MindmapNodeNode } from './ast.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

export interface MindmapParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** How sections are assigned (`mindmap.colorBy`); `'branch'` when absent. */
  colorBy?: MindmapColorBy;
  /** Node cap (core `DEFAULT_LIMITS.maxNodes`, R-SEC-5). */
  maxNodes?: number;
  /** Tree depth cap: how deep a node may sit under the root (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
}

export type MindmapParseResult = ParseResult<MindmapModel, MindmapDocument>;

/**
 * Comments, and the text jison matched without returning a token: `:::`, `::icon(`, the `)`
 * closing an icon, the line break after a bare `:::`, and the quotes of a string.
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
  T.MdStringEnd
);

// What the parser accepts at its decision points, for the probe (R-LANG-7, D95). Constants,
// so a parse without a probe allocates nothing for them.
/** What may start a statement (an indent, a node, a decoration, a blank line). */
const STATEMENT_KINDS = [T.SpaceList, T.NodeId, T.NodeDStart, T.Icon, T.Class, T.SpaceLine];
/** What may follow an indent. */
const AFTER_INDENT = [T.NodeId, T.NodeDStart, T.Icon, T.Class];
/** What ends a statement. */
const STOP_KINDS = [Kind.Newline, T.Eof, T.SpaceLine];
/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset: blanks
 * and blank lines (the indent before a node), the shape delimiters, and a shape's text (after
 * it comes the closer).
 */
const PROBE_FOLLOWS = kindSet(T.SpaceList, T.SpaceLine, T.NodeDStart, T.NodeDescr, T.NodeDEnd);

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

/** A word of a `:::` line: the model splits it at these blanks (HTML class-attribute words). */
const CLASS_WORD = /[^\t\n\f\r ]+/g;
const CLASS_BLANK = /[\t\n\f\r ]/;

const HEADER = ['`mindmap`'];
const STATEMENT = ['a node such as `root` or `id[text]`', 'a `::icon(…)` or `:::class` line'];
const LINE_BREAK = ['a line break'];
const TEXT = ['the text of the node'];
const HEADER_HINT = 'a mindmap starts with `mindmap`';
const ONE_HEADER = '`mindmap` starts the diagram and comes only once';
const BRACE_HINT = 'a hexagon is written `{{text}}`';
const DECORATION_HINT = 'an `::icon(…)` or `:::class` goes on a line of its own, after its node';
const ONE_NODE_HINT = 'each node goes on a line of its own';
const BARE_CLASS_HINT = 'a bare `:::` takes the line break after it';
const AFTER_BLANK_HINT =
  'remove a blank or comment line above it: a line may not follow two of them in a row, or one right after `mindmap`';

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a mindmap diagram. Never throws: problems are error diagnostics. */
export function parseMindmap(src: string, options: MindmapParseOptions = {}): MindmapParseResult {
  return new MindmapParser(src, options).parse();
}

/** A model node while the tree is built. */
interface OpenNode {
  ast: string;
  id: string;
  label: string;
  shape: MindmapShape;
  level: number;
  depth: number;
  parent?: number;
  children: number[];
  classes: string[];
  icon?: MindmapIcon;
  section?: number;
}

/** A node of the open-node stack: its model index and its statement span. */
interface Open {
  index: number;
  level: number;
  span: StatementSpan;
}

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class MindmapParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  /** Probe mode only (R-LANG-7). */
  private readonly probe: Probe | undefined;
  private readonly children: MindmapNodeNode[] = [];
  private readonly nodes: OpenNode[] = [];
  /** The chain of open nodes: the root, …, the last node added. */
  private readonly open: Open[] = [];
  /** The first node's indent; v12's `baseLevel`. */
  private base = 0;
  /** The model node the next decoration applies to: the last node added. */
  private last: OpenNode | undefined;
  /** The AST node of the last node statement, added or not. */
  private lastAst: MindmapNodeNode | undefined;
  /** The end of the last statement read, where an open node's span ends. */
  private lastEnd = 0;
  /** The last statement was a blank or comment line (for the message after it). */
  private afterBlank = false;
  /** The statement reported a missing separator already: the next one starts here. */
  private lineEnded = false;
  /** `mindmap` was read; a missing one was reported once, so a later one is the header. */
  private headerSeen = false;
  private lines: LineIndex | undefined;
  private readonly maxNodes: number;
  private readonly maxDepth: number;
  /** The depth limit was reported (once per parse, as the node limit). */
  private tooDeep = false;

  constructor(
    private readonly src: string,
    private readonly options: MindmapParseOptions
  ) {
    this.maxNodes = options.maxNodes ?? DEFAULT_LIMITS.maxNodes;
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    if (options.probe === undefined) {
      this.c = new TokenCursor(lex(src, pre.bodyStart, this.view), SKIPPED);
      return;
    }
    const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
    if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
    // The cursor marks an offset inside a comment or directive as outside code.
    this.c = new ProbeCursor(lex(src, pre.bodyStart, this.view, probe), probe, SKIPPED);
  }

  parse(): MindmapParseResult {
    this.start();
    this.document();
    this.closeOpen(0, this.lastEnd);
    const { st, pre, src } = this;
    const colorBy = this.options.colorBy ?? 'branch';
    const sections = mindmapSections(this.nodes, colorBy);
    this.nodes.forEach((n, k) => {
      const s = sections[k];
      if (s !== undefined) n.section = s;
    });
    const model: MindmapModel = {
      nodes: this.nodes as MindmapNode[],
      colorBy,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: MindmapDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.c.tokens, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (removed spans cut, entities decoded). */
  private raw(j = this.c.pos): string {
    const t = this.c.tokens;
    return cook(this.src, t.start[j] ?? 0, t.end[j] ?? 0, this.view);
  }

  private range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /**
   * `[start, end)` of token `j` without the blanks around `text` (its v12 text), when the
   * source there reads as `text`; else the token's range (the service then drops the symbol).
   */
  private exact(j: number, text: string, from = 0, to = text.length): Range {
    const r = this.range(j);
    if (this.src.slice(r.start, r.end) !== text) return r;
    return { start: r.start + from, end: r.start + to };
  }

  /** A node id: a definition of its own (D289), without the blanks around it. */
  private idSymbol(id: string, j: number): void {
    const name = id.trim();
    if (name === '') return;
    const from = id.length - id.trimStart().length;
    this.st.symbol(name, 'node', this.exact(j, id, from, from + name.length), 'def');
  }

  /**
   * Each word of a `:::` line: a class reference; the words rename together (D289). The words
   * of v12's text are paired in order with the words of the source (blank-separated, removed
   * spans skipped): a word whose source differs from it (an encoded entity such as `#35;`, or a
   * word cut by a directive) keeps the token's range, which the service drops, and the others
   * keep their own. When the counts differ (an entity read as a blank), every word keeps it.
   */
  private classSymbols(text: string, j: number): void {
    const r = this.range(j);
    const spots = this.sourceWords(r);
    const words = [...text.matchAll(CLASS_WORD)];
    const paired = spots.length === words.length;
    words.forEach((m, k) => {
      const name = m[0];
      const spot = paired ? spots[k] : undefined;
      const exact = spot !== undefined && this.src.slice(spot.start, spot.end) === name;
      this.st.symbol(name, 'class', exact ? spot : r, 'ref');
    });
  }

  /**
   * The blank-separated words of the source in `r`, in order, with the removed spans skipped
   * (a word a removed span cuts in two is one, its range over the cut). Linear in `r`.
   */
  private sourceWords(r: Range): Range[] {
    const { src } = this;
    const holes = this.holesIn(r);
    const out: Range[] = [];
    let h = 0;
    let start = -1;
    let end = -1;
    for (let i = r.start; i < r.end; ) {
      const hole = holes[h];
      if (hole && i >= hole.start) {
        i = Math.max(i, hole.end);
        h++;
        continue;
      }
      if (CLASS_BLANK.test(src.charAt(i))) {
        if (start >= 0) out.push({ start, end });
        start = -1;
      } else {
        if (start < 0) start = i;
        end = i + 1;
      }
      i++;
    }
    if (start >= 0) out.push({ start, end });
    return out;
  }

  /** The removed spans that overlap `r`, found by binary search (they are in source order). */
  private holesIn(r: Range): readonly Range[] {
    const { holes } = this.view;
    let lo = 0;
    let hi = holes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((holes[mid]?.end ?? 0) <= r.start) lo = mid + 1;
      else hi = mid;
    }
    let end = lo;
    while (end < holes.length && (holes[end]?.start ?? 0) < r.end) end++;
    return holes.slice(lo, end);
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
    }
    if (k === T.SpaceLine) return t.includes('%%') ? 'a comment' : 'a blank line';
    if (t === '') return 'blanks';
    const line = /^[^\n\r\u2028\u2029]*/.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${t}\``;
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

  // ---- grammar ------------------------------------------------------------------------

  /**
   * `start`: blank and comment lines, then `mindmap` and an optional line break. Without the
   * header the rest is still read, and a later `mindmap` is taken as it.
   */
  private start(): void {
    const { c } = this;
    if (c.kind === T.SpaceLine) {
      // `spaceLines`.
      c.next();
      while (c.kind === T.SpaceLine || c.kind === Kind.Newline) c.next();
    }
    c.tested(T.Mindmap);
    if (c.kind === T.Mindmap) this.header();
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
    for (;;) {
      if (this.headerSeen) c.tested(STATEMENT_KINDS);
      if (c.kind === Kind.EOF) break;
      // The missing header was reported; one error, one diagnostic.
      if (!this.headerSeen && c.kind === T.Mindmap) {
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
    c.tested(STOP_KINDS);
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
      // What the next line starts with is an error here: not an expectation.
      this.probePassed();
      return;
    }
    let hint: string | undefined;
    const after = this.afterIndent();
    if (after === T.Icon || after === T.Class) hint = DECORATION_HINT;
    else if (this.isNodeStart(after)) hint = ONE_NODE_HINT;
    else if (k === T.Mindmap) hint = ONE_HEADER;
    else if (k === Kind.Error) hint = BRACE_HINT;
    this.fail(LINE_BREAK, hint);
  }

  /** The separator tokens at the cursor: one of `stop`'s, then line breaks and the end. */
  private separator(): void {
    const { c } = this;
    if (c.kind === Kind.EOF) return;
    c.next();
    // A statement may start after each of them.
    while (c.kind === Kind.Newline || c.kind === T.Eof) {
      if (this.headerSeen) c.tested(STATEMENT_KINDS);
      c.next();
    }
  }

  /**
   * Stop recording when the probed token is on the line at the cursor, or before it: an error
   * was reported for that line, so the parser's later tests there are recovery, not
   * expectations.
   */
  private probePassed(): void {
    const { probe, c } = this;
    if (!probe) return;
    let end = c.pos;
    while (end < c.tokens.length - 1 && !this.isStop(c.tokens.kind[end] ?? Kind.EOF)) end++;
    if (probe.targetIn(c.tokens, 0, SKIPPED) <= end) probe.freeze(true);
  }

  /**
   * The text ended inside an icon, a shape or a string (jison's lexer returned no `EOF` there):
   * report what was left open.
   */
  private endsOpen(): never {
    const t = this.c.tokens;
    for (let j = t.length - 1; j >= 0; j--) {
      const k = t.kind[j] ?? 0;
      if (k === T.IconStart) return this.unclosed('UNCLOSED_ICON', 'icon', '::icon(', ')', j);
      if (k === T.StringStart) return this.unclosed('UNCLOSED_STRING', 'string', '"', '"', j);
      if (k === T.MdStringStart) return this.unclosed('UNCLOSED_STRING', 'string', '"`', '`"', j);
      if (k === T.NodeDStart) {
        const open = this.raw(j);
        return this.unclosed('UNCLOSED_SHAPE', 'shape', open, CLOSERS[open] ?? ')', j);
      }
      if (k === T.IconEnd || k === T.StringEnd || k === T.MdStringEnd || k === T.NodeDEnd) break;
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
    c.tested(STATEMENT_KINDS);
    const k = c.kind;
    this.afterBlank = false;
    if (k === T.SpaceList) {
      const j = c.next();
      const indent = this.raw(j).length;
      c.tested(AFTER_INDENT);
      const n = c.kind;
      if (this.isNodeStart(n)) this.node(indent);
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
    if (this.isNodeStart(k)) this.node(0);
    else if (k === T.Icon || k === T.Class) this.decoration();
    else this.badStatement();
  }

  private badStatement(): never {
    const k = this.c.kind;
    let hint: string | undefined;
    if (k === T.Mindmap) hint = ONE_HEADER;
    else if (k === Kind.Error) hint = BRACE_HINT;
    this.fail(STATEMENT, hint);
  }

  /** `node`: `nodeWithId` (an id, then an optional shape) or `nodeWithoutId` (a shape). */
  private node(indent: number): void {
    const { c } = this;
    let nodeId: string | undefined;
    const first = c.pos;
    if (c.kind === T.NodeId) {
      const j = c.next();
      nodeId = this.raw(j);
      this.idSymbol(nodeId, j);
      c.tested(T.NodeDStart);
    }
    const parts: NodeParts = {
      nodeId,
      label: nodeId ?? '',
      shape: 'default',
      indent,
      range: this.range(first),
    };
    // A node that fails inside its shape is still added, with the text read so far, so that
    // the decorations, children and roots after it see it: one error, one diagnostic.
    let failed = false;
    if (c.kind === T.NodeDStart) {
      try {
        this.shape(parts);
      } catch (error) {
        if (error !== STOP) throw error;
        failed = true;
      }
    }
    this.addNode(parts);
    if (failed) throw STOP;
  }

  /** `NODE_DSTART NODE_DESCR NODE_DEND`, into `parts` as far as it gets. */
  private shape(parts: NodeParts): void {
    const { c } = this;
    const open = c.next();
    const opener = this.raw(open);
    parts.shape = shapeOf(opener, '');
    parts.range = { start: parts.range.start, end: this.range(open).end };
    c.tested(T.NodeDescr);
    if (c.kind !== T.NodeDescr) {
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail(TEXT);
    }
    const text = c.next();
    parts.label = this.raw(text);
    parts.range = { start: parts.range.start, end: this.range(text).end };
    c.tested(T.NodeDEnd);
    if (c.kind !== T.NodeDEnd) {
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail([`\`${CLOSERS[opener] ?? ')'}\``]);
    }
    const close = c.next();
    parts.shape = shapeOf(opener, this.raw(close));
    parts.range = { start: parts.range.start, end: this.range(close).end };
  }

  /** v12 `addNode`: the node's place in the tree, or the second-root error. */
  private addNode(parts: NodeParts): void {
    const { nodeId, label, shape, indent, range } = parts;
    const id = nodeId ?? label;
    const node: MindmapNodeNode = {
      id: this.st.ids.node(id.trim()),
      type: 'Node',
      range,
      label,
      shape,
      indent,
      decorations: [],
    };
    if (nodeId !== undefined) node.nodeId = nodeId;
    this.children.push(node);
    this.lastAst = node;
    const first = this.nodes.length === 0;
    if (first) this.base = indent;
    const level = first ? 0 : indent - this.base;
    if (!first && level <= 0) {
      // v12: no earlier node has a smaller level, and only the first node is the root.
      // Not in the tree, so no statement span either: it would nest in an unrelated node's.
      this.last = undefined;
      this.st.diagnostics.error(
        'MINDMAP_SECOND_ROOT',
        `There can be only one root. No parent could be found for ("${label}"). Indent it deeper than the first node, the root.`,
        range
      );
      return;
    }
    const before = this.lastEnd;
    this.lastEnd = range.end;
    // The nearest open node with a smaller level: v12's backward scan finds the same one.
    const { open } = this;
    let top = open.length;
    while (top > 0 && (open[top - 1]?.level ?? 0) >= level) top--;
    const parentOpen = open[top - 1];
    this.closeOpen(top, before);
    const index = this.nodes.length;
    const parent = parentOpen ? this.nodes[parentOpen.index] : undefined;
    const model: OpenNode = {
      ast: node.id,
      id,
      label,
      shape,
      level,
      depth: parent ? parent.depth + 1 : 0,
      children: [],
      classes: [],
    };
    if (parent && parentOpen) {
      model.parent = parentOpen.index;
      parent.children.push(index);
    }
    this.nodes.push(model);
    this.last = model;
    const span = this.st.beginStatement('node', range.start);
    span.range.end = range.end;
    open.push({ index, level, span });
    this.checkLimits(model, range);
  }

  /** The integrator's node and depth caps (R-SEC-5): each reported once, at the first breach. */
  private checkLimits(node: OpenNode, range: Range): void {
    const { maxNodes, maxDepth } = this;
    if (this.nodes.length === maxNodes + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxNodes,
        `The diagram has more than ${maxNodes} nodes, the limit. The limit is set by the page or app that renders the diagram.`,
        range
      );
    }
    if (node.depth > maxDepth && !this.tooDeep) {
      this.tooDeep = true;
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Nodes are nested ${node.depth} deep here, over the limit of ${maxDepth}. The limit is set by the page or app that renders the diagram.`,
        range
      );
    }
  }

  /**
   * End the spans of the open nodes from `from` on at `at`, innermost first, and drop them:
   * each also takes the comment lines right after `at` that are indented deeper than its node
   * (its subtree's trailing comments; blank lines between them stay out of the end), as a
   * timeline section keeps its trailing comment lines (D259). One scan of those lines for all.
   */
  private closeOpen(from: number, at: number): void {
    const { open } = this;
    if (from >= open.length) return;
    const comments = this.commentsAfter(at);
    let k = 0;
    let end = at;
    for (let i = open.length - 1; i >= from; i--) {
      const node = open[i]!;
      for (let c = comments[k]; c && c.level > node.level; c = comments[++k]) end = c.end;
      this.st.endStatement(node.span, end);
    }
    open.length = from;
  }

  /**
   * The `%%` comment lines after the line holding `at`, up to the first line that is neither
   * blank nor one: each with its indent less the root's and the end of its text.
   */
  private commentsAfter(at: number): { level: number; end: number }[] {
    const { src } = this;
    const n = src.length;
    const lineEnd = (i: number) => {
      let e = i;
      while (e < n && src.charCodeAt(e) !== LF && src.charCodeAt(e) !== CR) e++;
      return e;
    };
    const out: { level: number; end: number }[] = [];
    for (let i = lineEnd(at); i < n; ) {
      i += src.charCodeAt(i) === CR && src.charCodeAt(i + 1) === LF ? 2 : 1;
      let s = i;
      while (s < n && (src.charCodeAt(s) === SPACE || src.charCodeAt(s) === TAB)) s++;
      const e = lineEnd(s);
      if (s < e && src.startsWith('%%', s) && !src.startsWith('%%{', s)) {
        let t = e;
        while (t > s && isSpace(src.charCodeAt(t - 1))) t--;
        out.push({ level: s - i - this.base, end: t });
      } else if (s < e) break;
      i = e;
    }
    return out;
  }

  /** `ICON` or `CLASS`: v12 `decorateNode`, on the last node in source order. */
  private decoration(): void {
    const { c } = this;
    const icon = c.kind === T.Icon;
    const j = c.next();
    const text = this.raw(j);
    const inner = this.range(j);
    const range = this.decorationRange(j);
    const { end } = range;
    if (!icon) this.classSymbols(text, j);
    const target = this.lastAst;
    if (!target) {
      this.st.diagnostics.error(
        'MINDMAP_DECORATION_BEFORE_NODE',
        `${icon ? 'An `::icon(…)`' : 'A `:::class`'} line decorates the node before it, and there is none here. Write it on the line after its node.`,
        range
      );
      return;
    }
    const decoration: MindmapDecoration = { type: icon ? 'Icon' : 'Class', text, range };
    target.decorations.push(decoration);
    const node = this.last;
    // On a rejected second root: its AST node only, with no span (it has none either).
    if (!node) return;
    this.st.statement(icon ? 'icon' : 'class', range);
    this.lastEnd = end;
    if (icon) node.icon = { text, range: inner };
    else node.classes = text.split(/[\t\n\f\r ]+/).filter((w) => w !== '');
  }
}

/** The parts of a node statement (pitfall 10). */
interface NodeParts {
  nodeId: string | undefined;
  label: string;
  shape: MindmapShape;
  /** The indent width as written. */
  indent: number;
  range: Range;
}

/** v12 `getType`: the shape from the opener, `(` by its closer too. */
function shapeOf(open: string, close: string): MindmapShape {
  switch (open) {
    case '[':
      return 'rect';
    case '(':
      return close === ')' ? 'rounded' : 'cloud';
    case '((':
      return 'circle';
    case ')':
      return 'cloud';
    case '))':
      return 'bang';
    case '{{':
      return 'hexagon';
    default:
      return 'default';
  }
}
