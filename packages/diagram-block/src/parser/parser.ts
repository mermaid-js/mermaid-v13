// cspell:words LALR
/**
 * Block parser: recursive descent over the {@link lex} tokens (gated against v12's jison lexer,
 * #553), producing a {@link BlockModel}, the typed AST, symbols, statement spans and
 * diagnostics (DESIGN §4.3). The model is built by {@link ModelBuilder} (`builder.ts`).
 *
 * The grammar is v12's `block.jison` (LALR), ported rule for rule; `grammar/block.ebnf` is the
 * normative form:
 *
 * ```
 * start         = BLOCK statement+ EOF
 * statement     = nodeStatement | COLUMNS | SPACE_BLOCK | composite | classDef | class | style
 * nodeStatement = node SIZE? (link node)*
 * composite     = "block:" nodeStatement statement+ "end" | BLOCK statement+ "end"
 * node          = NODE_ID (NODE_DSTART STR NODE_DEND | BLOCK_ARROW_START STR DIR+ BLOCK_ARROW_END)?
 * link          = LINK | START_LINK LINK_LABEL STR LINK
 * ```
 *
 * Line breaks mean nothing (v12's `[\s]+` takes them), so statements need no separator. The
 * parser reads the tokens jison returned; the quotes of strings and markdown strings, the
 * bracket and parenthesis before a block arrow's directions, and `accDescr` with its braces,
 * for which jison returns none, are skipped like comments.
 *
 * Nesting is an explicit stack of open composites, not recursion, so depth costs nothing but
 * the stack (R-PARSE-7). The model is built in source order as statements are read (v12 walked
 * its tree in the same order); `style` statements apply at the end (D443). Every scan is linear
 * in the text it reads: an id list or a class line is walked once, with a moving offset.
 *
 * Unlike jison the parser does not stop at the first error (R-PARSE-4): it reports it, skips to
 * the next statement that starts on a later line, and carries on. A failed composite header
 * still opens the composite, so its `end` closes it (pitfall 8).
 *
 * With a probe (R-LANG-7, D95) the parser records the kinds it tests at the probed token at each
 * decision point (`expected.ts`); its mode is the lexer's start condition. Recovery stops it.
 */
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import {
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  ProbeCursor,
  sourceView,
  TokenCursor,
  STOP,
} from '@mermaid-js/core/parser-kit';
import type {
  Hole,
  ParseOptions,
  ParseResult,
  Range,
  StatementSpan,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { BlockModel } from '../model.ts';
import type {
  BlockCompositeNode,
  BlockDocument,
  BlockEdgeNode,
  BlockLeafNode,
  BlockStatementNode,
  BlockTarget,
} from './ast.ts';
import { ModelBuilder } from './builder.ts';
import type { LinkText, Mention, OpenBlock } from './builder.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import {
  A_LINE_BREAK,
  BLANKS,
  BLOCK,
  CLASS_NAME,
  CLASS_STYLES,
  closerFor,
  COMPOSITE_ID,
  DEFAULT_HINT,
  DIRECTION,
  DIRECTION_OR_CLOSE,
  EDGE_END,
  EDGE_LABEL,
  EMPTY_COMPOSITE_HINT,
  EMPTY_DIAGRAM_HINT,
  END_NONE_OPEN_HINT,
  END_OF_TEXT,
  END_WORD,
  HEADER,
  HEADER_HINT,
  hintFor,
  IDS,
  LABEL,
  depthLimitMessage,
  MARKDOWN_HINT,
  OPEN_ARROW,
  OPEN_MD_STRING,
  OPEN_STRING,
  openShape,
  quoted,
  STATEMENT,
  STATEMENT_OR_END,
  STYLES,
  unclosedBlockMessage,
  unclosedMessage,
  UNQUOTED_HINT,
  unfinishedEdgeMessage,
  withHint,
} from './messages.ts';
import type { Unclosed } from './messages.ts';
import * as EXPECTED from './expected.ts';
import { esc, shapeType } from './text.ts';
import { T } from './tokens.ts';

export interface BlockParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Block cap: blocks, spaces and composites (core `DEFAULT_LIMITS.maxNodes`, R-SEC-5). */
  maxNodes?: number;
  /** Edge cap (core `DEFAULT_LIMITS.maxEdges`). */
  maxEdges?: number;
  /** How deep composites may nest (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
}

export type BlockParseResult = ParseResult<BlockModel, BlockDocument>;

/**
 * Comments, and the text jison matched without returning a token: the quotes around strings,
 * a markdown string's quote and backtick pairs, `]>(` before a block arrow's directions, and
 * `accDescr {` with its `}`.
 */
const SKIPPED = kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd,
  T.ArrowDirStart,
  T.AccDescrMultiline,
  T.AccDescrMultilineEnd
);

/** Where recovery may resume: a statement start, `end`, or the end of the text. */
const RESUME = kindSet(
  T.NodeId,
  T.Columns,
  T.SpaceBlock,
  T.IdBlock,
  T.Block,
  T.ClassDef,
  T.Class,
  T.Style,
  T.End,
  T.Eof
);

/**
 * What the lexer reads inside a shape, string, block arrow or edge label: text, directions,
 * quotes, errors (the lexer lexes on in the same state after one).
 */
const INSIDE = kindSet(
  Kind.Error,
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.Str,
  T.MdStr,
  T.Dir,
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd,
  T.ArrowDirStart,
  T.LinkLabel
);

/** Parse a block diagram. Never throws: problems are error diagnostics. */
export function parseBlock(src: string, options: BlockParseOptions = {}): BlockParseResult {
  return new BlockParser(src, options).parse();
}

/** One open level: the top level or a composite's body. */
interface Frame {
  /** The composite whose body this is; undefined for the top level and a failed header. */
  block: OpenBlock | undefined;
  /** Where new blocks of this level go. */
  into: OpenBlock[];
  /** Where this level's AST nodes go. */
  ast: BlockStatementNode[];
  /** The composite's AST node and statement span. */
  node?: BlockCompositeNode;
  span?: StatementSpan;
  /** The opener's range (`block:` or `block`). */
  opener?: Range;
  /** Statements read in it, failed ones included. */
  statements: number;
}

/** A shape or block arrow as read. */
interface Shape {
  /** The opener and closer (`[]`, `<[]>`). */
  typeStr: string;
  label: string;
  directions?: string[];
  /** Where it ends. */
  end: number;
}

/** A node as read: its id, then its shape. */
interface NodeParts {
  name: string;
  nameAt: number;
  typeStr?: string;
  label?: string;
  directions?: string[];
  range: Range;
}

/** A link as read. */
interface LinkParts extends LinkText {
  range: Range;
}

/** A `nodeStatement` as read. */
interface Chain {
  first: NodeParts;
  span: { value: number; range: Range } | undefined;
  links: [LinkParts, NodeParts][];
}

/** Token `j`'s source range, and whether the source there reads as its text. */
interface TokenSource {
  range: Range;
  exact: boolean;
}

/** `prefix:key`, then `prefix:key@2`, `@3`, … (D448, pitfall 9): each mention's AST id. */
class MentionIds {
  private readonly seen = new Map<string, number>();

  next(prefix: string, key: string): { id: string; n: number } {
    const id = `${prefix}:${key}`;
    const n = (this.seen.get(id) ?? 0) + 1;
    this.seen.set(id, n);
    return { id: n === 1 ? id : `${id}@${n}`, n };
  }
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails records
 * a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class BlockParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: Lexed;
  /** What v12's preprocessing removed (comments, directives, a dropped `;`), in source order. */
  private readonly holes: readonly Hole[];
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  /** Probe mode only (R-LANG-7). */
  private readonly probe: Probe | undefined;
  private readonly maxDepth: number;
  private readonly builder: ModelBuilder;
  private readonly doc: BlockStatementNode[] = [];
  private readonly frames: Frame[];
  private readonly ids = new MentionIds();
  private depthReported = false;
  private sawEof = false;
  private lines: LineIndex | undefined;
  /** From this token on, the stream holds only what the lexer reads inside a construct. */
  private insideFrom: number | undefined;

  constructor(
    private readonly src: string,
    private readonly options: BlockParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.holes = view.holes;
    if (options.probe === undefined) {
      this.lexed = lex(src, pre.bodyStart, view);
      this.c = new TokenCursor(this.lexed.tokens, SKIPPED);
    } else {
      const probe = (this.probe = new Probe(src, options.probe, EXPECTED.PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      this.lexed = lex(src, pre.bodyStart, view, probe);
      // The cursor marks an offset inside a comment or directive as outside code.
      this.c = new ProbeCursor(this.lexed.tokens, probe, SKIPPED);
    }
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.builder = new ModelBuilder(this.st, {
      maxNodes: options.maxNodes ?? DEFAULT_LIMITS.maxNodes,
      maxEdges: options.maxEdges ?? DEFAULT_LIMITS.maxEdges,
    });
    this.frames = [{ block: undefined, into: this.builder.top, ast: this.doc, statements: 0 }];
  }

  parse(): BlockParseResult {
    this.start();
    this.document();
    this.builder.finish();
    const { st, pre, src } = this;
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const model = this.builder.model(st.diagnostics.list.filter((d) => d.severity === 'warning'));
    const ast: BlockDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.doc,
    };
    return st.result(model, ast, this.c.tokens, this.options, this.probe);
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

  /** Token `j`'s range, and whether the source there is `text` (so offsets into it map 1:1). */
  private sourceOf(j: number, text: string): TokenSource {
    const range = this.range(j);
    return { range, exact: this.src.slice(range.start, range.end) === text };
  }

  /** The source range of `length` characters at `from` in a token's text, else the token's. */
  private static rangeIn(s: TokenSource, from: number, length: number): Range {
    if (!s.exact) return s.range;
    return { start: s.range.start + from, end: s.range.start + from + length };
  }

  /**
   * Where token `j` ends without the blanks, comments and directives at its end (`end`, a link
   * and a block arrow's `)` take the blanks after them, line breaks too).
   */
  private tightEnd(j: number): number {
    const { start, end } = this.range(j);
    let e = end;
    while (e > start) {
      if (/\s/.test(this.src.charAt(e - 1))) {
        e--;
        continue;
      }
      const hole = this.holeAt(e - 1);
      if (!hole || hole.kind === 'drop') break;
      e = hole.start;
    }
    return e;
  }

  /** The removed span holding source offset `at`, if any (binary search). */
  private holeAt(at: number): Hole | undefined {
    const hs = this.holes;
    let lo = 0;
    let hi = hs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const h = hs[mid] as Hole;
      if (at < h.start) hi = mid - 1;
      else if (at >= h.end) lo = mid + 1;
      else return h;
    }
    return undefined;
  }

  private get frame(): Frame {
    return this.frames[this.frames.length - 1] as Frame;
  }

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** `text` trimmed, and where it starts in `text`. */
  private static trimmed(text: string): [value: string, at: number] {
    const value = text.trim();
    return [value, value === '' ? 0 : text.indexOf(value)];
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** How an error message names token `j`. */
  private found(j: number): string {
    const k = this.c.tokens.kind[j] ?? Kind.EOF;
    if (k === Kind.EOF || k === T.Eof) return END_OF_TEXT;
    const r = this.range(j);
    const text = this.src.slice(r.start, r.end);
    const t = text.trim();
    if (t === '') return /[\n\r\u2028\u2029]/.test(text) ? A_LINE_BREAK : BLANKS;
    return quoted(t);
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], hint?: string): never {
    const { c } = this;
    if (this.endedInside(c.pos)) this.endsOpen(names);
    const d = this.st.diagnostics.unexpected('UNEXPECTED', c.range, names, this.found(c.pos));
    if (hint) d.message = withHint(d.message, hint);
    throw STOP;
  }

  /**
   * Whether the text ends inside a shape, string, block arrow or edge label from token `j` on:
   * nothing follows but what the lexer read in there (errors, text, directions, quotes), and no
   * `EOF` (jison's lexer returns none outside INITIAL). The tail is found once.
   */
  private endedInside(j: number): boolean {
    if (this.insideFrom === undefined) {
      const t = this.c.tokens;
      let i = t.length - 1;
      while (i > 0 && INSIDE[t.kind[i - 1] ?? 0] === 1) i--;
      this.insideFrom = i;
    }
    return j >= this.insideFrom;
  }

  /**
   * The text ended inside a shape, a string, a block arrow, an edge label or a `classDef`,
   * `class` or `style` line (jison's lexer returned no `EOF` there): report what was left open,
   * the innermost opener without its closer; else that `names` were expected at the end.
   */
  private endsOpen(names: string[]): never {
    const t = this.c.tokens;
    let closed = 0;
    // The last token is the stream's end.
    for (let j = t.length - 2; j >= 0; j--) {
      const k = t.kind[j] ?? 0;
      if (k === T.StringEnd || k === T.MdStringEnd) {
        closed++;
        continue;
      }
      if (k === T.StringStart || k === T.MdStringStart || k === T.LinkLabel) {
        if (closed > 0) {
          closed--;
          continue;
        }
        return this.unclosed(k === T.MdStringStart ? OPEN_MD_STRING : OPEN_STRING, j);
      }
      if (k === T.NodeDStart) return this.unclosed(openShape(this.raw(j)), j);
      if (k === T.BlockArrowStart) return this.unclosed(OPEN_ARROW, j);
      if (k === T.StartLink) {
        const at = this.range(j);
        const message = unfinishedEdgeMessage(this.raw(j).trim(), this.lineOf(at.start));
        this.st.diagnostics.error('UNCLOSED_LABEL', message, at);
        throw STOP;
      }
      if (!INSIDE[k]) break;
    }
    const at = { start: this.src.length, end: this.src.length };
    this.st.diagnostics.unexpected('UNEXPECTED', at, names, END_OF_TEXT);
    throw STOP;
  }

  private unclosed(what: Unclosed, j: number): never {
    const at = this.range(j);
    this.st.diagnostics.error(what.code, unclosedMessage(what, this.lineOf(at.start)), at);
    throw STOP;
  }

  /**
   * Skip to the next statement after an error (R-PARSE-4): the first statement start, `end` or
   * end of the text on a later line than the error (line breaks separate nothing in block, but
   * an author writes one statement a line).
   */
  private recover(from: number): void {
    const { c, src } = this;
    c.recovering();
    const nl = /[\n\r\u2028\u2029]/g;
    nl.lastIndex = from;
    const lineEnd = nl.exec(src)?.index ?? src.length;
    while (c.kind !== Kind.EOF) {
      if (c.kind === T.Eof || (c.start > lineEnd && RESUME[c.kind] === 1)) return;
      c.next();
    }
  }

  /** Run one rule; on failure, skip to the next statement. */
  private guarded(rule: () => void): void {
    const from = this.c.start;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover(Math.max(from, this.lastError()));
    }
  }

  /** Where the last error starts (recovery skips its line). */
  private lastError(): number {
    const list = this.st.diagnostics.list;
    for (let k = list.length - 1; k >= 0; k--) {
      const d = list[k];
      if (d?.severity === 'error') return d.range.start;
    }
    return 0;
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `start`: the header. Without it the rest is still read. */
  private start(): void {
    const { c } = this;
    c.tested(T.Block);
    if (c.kind === T.Block) {
      this.st.statement('header', c.range);
      c.next();
      return;
    }
    this.guarded(() => this.fail(HEADER, HEADER_HINT));
  }

  /** `document`: statements to the end, `end` closing the innermost composite. */
  private document(): void {
    const { c } = this;
    for (;;) {
      // `end` closes a composite that holds a statement (an empty one is an error).
      c.tested(
        this.frames.length > 1 && this.frame.statements > 0
          ? EXPECTED.BODY_KINDS
          : EXPECTED.STATEMENT_KINDS
      );
      const k = c.kind;
      if (k === Kind.EOF) {
        if (!this.sawEof && !this.st.diagnostics.hasErrors)
          this.guarded(() => this.endsOpen(STATEMENT));
        return;
      }
      if (k === T.Eof) {
        this.sawEof = true;
        this.atEnd();
        c.next();
        continue;
      }
      if (k === T.End) {
        this.close();
        continue;
      }
      this.frame.statements++;
      this.guarded(() => this.statement());
    }
  }

  /** The end of the text: every composite still open is missing its `end`. */
  private atEnd(): void {
    const { c, frames } = this;
    if (frames.length === 1 && frames[0]?.statements === 0)
      this.guarded(() => this.fail(STATEMENT, EMPTY_DIAGRAM_HINT));
    while (frames.length > 1) {
      const f = frames.pop() as Frame;
      const opener = f.opener ?? c.range;
      const message = unclosedBlockMessage(this.lineOf(opener.start));
      this.st.diagnostics.error('UNCLOSED_BLOCK', message, opener);
      if (f.span) this.st.endStatement(f.span, c.start);
      if (f.node) f.node.range = { start: f.node.range.start, end: c.start };
    }
  }

  /** `end`: close the innermost composite. */
  private close(): void {
    const { c, frames } = this;
    const j = c.next();
    const r = this.range(j);
    const f = this.frame;
    if (frames.length === 1) {
      const d = this.st.diagnostics.unexpected('UNEXPECTED', r, STATEMENT, END_WORD);
      d.message = withHint(d.message, END_NONE_OPEN_HINT);
      return;
    }
    if (f.statements === 0) {
      const d = this.st.diagnostics.unexpected('UNEXPECTED', r, STATEMENT, END_WORD);
      d.message = withHint(d.message, EMPTY_COMPOSITE_HINT);
    }
    frames.pop();
    const end = this.tightEnd(j);
    if (f.span) this.st.endStatement(f.span, end);
    if (f.node) f.node.range = { start: f.node.range.start, end };
  }

  /** `statement`. */
  private statement(): void {
    const { c } = this;
    switch (c.kind) {
      case T.NodeId:
        this.nodeStatement();
        return;
      case T.Columns:
        this.columnsStatement();
        return;
      case T.SpaceBlock:
        this.spaceStatement();
        return;
      case T.IdBlock:
        this.composite(true);
        return;
      case T.Block:
        this.composite(false);
        return;
      case T.ClassDef:
        this.classDef();
        return;
      case T.Class:
        this.classStatement();
        return;
      case T.Style:
        this.styleStatement();
        return;
      default:
        this.fail(this.frames.length > 1 ? STATEMENT_OR_END : STATEMENT, hintFor(c.kind));
    }
  }

  /** `nodeStatement`, built into the current level as far as it got. */
  private nodeStatement(): void {
    const frame = this.frame;
    const { chain, failed } = this.chain();
    this.applyChain(chain, frame);
    if (failed) throw STOP;
  }

  /**
   * `node [ SIZE ] { link node }`, at an id: the parts read, and whether it failed (the error is
   * recorded), so the blocks before an error still reach the model.
   */
  private chain(): { chain: Chain; failed: boolean } {
    const { c } = this;
    const chain: Chain = { first: this.nodeId(), span: undefined, links: [] };
    try {
      chain.first = this.withShape(chain.first);
      c.tested(EXPECTED.SIZE_KINDS);
      if (c.kind === T.Size) {
        const j = c.next();
        const range = this.range(j);
        chain.span = { value: parseInt(this.raw(j), 10), range };
        chain.first = { ...chain.first, range: { start: chain.first.range.start, end: range.end } };
      }
      for (;;) {
        c.tested(EXPECTED.LINK_KINDS);
        if (c.kind !== T.Link && c.kind !== T.StartLink) break;
        const link = this.link();
        c.tested(T.NodeId);
        if (c.kind !== T.NodeId) this.fail(BLOCK);
        const k = chain.links.push([link, this.nodeId()]) - 1;
        const next = chain.links[k] as [LinkParts, NodeParts];
        next[1] = this.withShape(next[1]);
      }
    } catch (error) {
      if (error !== STOP) throw error;
      return { chain, failed: true };
    }
    return { chain, failed: false };
  }

  /** The id of a `node`. */
  private nodeId(): NodeParts {
    const j = this.c.next();
    return { name: this.raw(j), nameAt: j, range: this.range(j) };
  }

  /** `id` with the shape or block arrow after it, if any. */
  private withShape(id: NodeParts): NodeParts {
    const shape = this.nodeShape();
    if (!shape) return id;
    const { end, ...rest } = shape;
    return { ...id, ...rest, range: { start: id.range.start, end } };
  }

  /** The rest of a `node`: an optional shape or block arrow. */
  private nodeShape(): Shape | undefined {
    const { c } = this;
    c.tested(EXPECTED.SHAPE_KINDS);
    if (c.kind === T.NodeDStart) return this.shape();
    if (c.kind === T.BlockArrowStart) return this.blockArrow();
    return undefined;
  }

  /** `NODE_DSTART STR NODE_DEND`. */
  private shape(): Shape {
    const { c } = this;
    const open = this.raw(c.next());
    c.tested(T.Str);
    if (c.kind !== T.Str) this.fail(LABEL, c.kind === T.MdStr ? MARKDOWN_HINT : UNQUOTED_HINT);
    const label = this.raw(c.next());
    c.tested(T.NodeDEnd);
    if (c.kind !== T.NodeDEnd) this.fail(closerFor(open));
    const close = c.next();
    return { typeStr: open + this.raw(close), label, end: this.range(close).end };
  }

  /** `BLOCK_ARROW_START STR DIR+ BLOCK_ARROW_END`. */
  private blockArrow(): Shape {
    const { c } = this;
    c.next();
    c.tested(T.Str);
    if (c.kind !== T.Str) this.fail(LABEL, c.kind === T.MdStr ? MARKDOWN_HINT : UNQUOTED_HINT);
    const label = this.raw(c.next());
    c.tested(EXPECTED.DIR_KINDS);
    if (c.kind !== T.Dir) this.fail(DIRECTION);
    const directions: string[] = [];
    for (;;) {
      directions.push(this.raw(c.next()));
      c.tested(EXPECTED.DIR_OR_CLOSE_KINDS);
      if (c.kind !== T.Dir) break;
    }
    if (c.kind !== T.BlockArrowEnd) this.fail(DIRECTION_OR_CLOSE);
    const close = c.next();
    return { typeStr: '<[' + this.raw(close), label, directions, end: this.tightEnd(close) };
  }

  /** `link`: `LINK`, or `START_LINK LINK_LABEL STR LINK`. */
  private link(): LinkParts {
    const { c } = this;
    const j = c.next();
    const start = this.range(j).start;
    if (this.c.tokens.kind[j] === T.Link)
      return { link: this.raw(j), range: { start, end: this.tightEnd(j) } };
    c.tested(T.LinkLabel);
    if (c.kind !== T.LinkLabel) this.fail(EDGE_LABEL);
    c.next();
    c.tested(T.Str);
    if (c.kind !== T.Str) this.fail(EDGE_LABEL, c.kind === T.MdStr ? MARKDOWN_HINT : undefined);
    const label = this.raw(c.next());
    c.tested(T.Link);
    if (c.kind !== T.Link) this.fail(EDGE_END);
    const close = c.next();
    return { link: this.raw(close), label, range: { start, end: this.tightEnd(close) } };
  }

  /**
   * v12's three-element chain result, fixed (D442): every node is a block, every link an edge.
   * As in v12, a span after the first node only counts when no link follows.
   */
  private applyChain({ first, span, links }: Chain, frame: Frame): void {
    const width = span === undefined ? undefined : this.builder.span(span.value, span.range);
    this.mention(first, frame, links.length === 0 ? width : undefined, span?.value);
    this.links(first, links, frame);
  }

  /** The edges and later blocks of a chain after `first`. */
  private links(first: NodeParts, links: readonly [LinkParts, NodeParts][], frame: Frame): void {
    let prev = first;
    for (const [link, next] of links) {
      this.edge(prev.name, next.name, link, frame);
      this.mention(next, frame, undefined, undefined);
      prev = next;
    }
  }

  /** A block mention: its AST node and symbol, and the block it declares or merges into. */
  private mention(
    parts: NodeParts,
    frame: Frame,
    span: number | undefined,
    written: number | undefined
  ): void {
    const { name } = parts;
    const nameRange = this.range(parts.nameAt);
    this.st.symbol(name, 'block', nameRange, this.builder.has(name) ? 'ref' : 'def');
    const id = this.ids.next('block', esc(name)).id;
    const node: BlockLeafNode = { id, type: 'Block', range: parts.range, name, nameRange };
    if (parts.typeStr !== undefined) node.shape = parts.typeStr;
    if (parts.label !== undefined) node.label = parts.label;
    if (written !== undefined) node.span = written;
    if (parts.directions) node.directions = parts.directions;
    frame.ast.push(node);
    const place = { into: frame.into, range: parts.range };
    this.builder.mention(BlockParser.asMention(id, parts, span), place);
  }

  private static asMention(ast: string, parts: NodeParts, span: number | undefined): Mention {
    return {
      ast,
      id: parts.name,
      type: shapeType(parts.typeStr),
      label: parts.label,
      span,
      directions: parts.directions,
    };
  }

  /** An edge from `start` to `end`: its AST node and the model's edge (one count for both). */
  private edge(start: string, end: string, link: LinkParts, frame: Frame): void {
    const { id, n } = this.ids.next('edge', `${esc(start)}->${esc(end)}`);
    const node: BlockEdgeNode = {
      id,
      type: 'Edge',
      range: link.range,
      start,
      end,
      link: link.link.trim(),
    };
    if (link.label !== undefined) node.label = link.label;
    frame.ast.push(node);
    this.builder.edge({ ...link, ast: id, count: n, start, end });
  }

  /** `COLUMNS`: the level's column count, the last one winning (D445: `columns 0` is auto). */
  private columnsStatement(): void {
    const { c } = this;
    const j = c.next();
    const range = this.range(j);
    const written = parseInt(this.raw(j), 10);
    const frame = this.frame;
    frame.ast.push({
      id: this.st.ids.statement('columns'),
      type: 'Columns',
      range,
      columns: written,
    });
    this.builder.setColumns(written, range, frame.block, this.frames.length === 1);
  }

  /** `SPACE_BLOCK`: `space` or `space:n`, n cells (D445: capped). */
  private spaceStatement(): void {
    const { c } = this;
    const j = c.next();
    const range = this.range(j);
    const written = parseInt(this.raw(j), 10);
    const id = this.builder.nextId();
    const frame = this.frame;
    const ast = `block:${id}`;
    frame.ast.push({ id: ast, type: 'Space', range, cells: written });
    this.builder.space(ast, id, written, { into: frame.into, range });
  }

  /**
   * `"block:" nodeStatement statement+ "end"` or `BLOCK statement+ "end"`: opens the body. A
   * header that fails still opens it, so its `end` closes it (pitfall 8).
   */
  private composite(withId: boolean): void {
    const { c } = this;
    const parent = this.frame;
    const j = c.next();
    const opener = this.range(j);
    const span = this.st.beginStatement('composite', opener.start);
    if (!withId) {
      const id = this.builder.nextId();
      const node: BlockCompositeNode = {
        id: `block:${id}`,
        type: 'Composite',
        range: { start: opener.start, end: opener.end },
        children: [],
      };
      parent.ast.push(node);
      const block = this.builder.anonymous(node.id, id, { into: parent.into, range: opener });
      const body = { block, into: block.children, ast: node.children, node };
      this.open({ ...body, span, opener, statements: 0 });
      return;
    }
    c.tested(T.NodeId);
    if (c.kind !== T.NodeId) {
      const body = { block: undefined, into: parent.into, ast: parent.ast };
      this.open({ ...body, span, opener, statements: 1 });
      this.fail(COMPOSITE_ID);
    }
    const { chain, failed } = this.chain();
    this.header(chain, parent, opener, span);
    if (failed) throw STOP;
  }

  /**
   * A composite's header: the composite is the header's first block (v12 merged a composite
   * into the block of its id). The rest of a chain (`block:a --> b`) stands at the level around
   * it, in the model and in the AST alike (v12 lost it; GAPS #554, pending a D-id).
   */
  private header(parts: Chain, parent: Frame, opener: Range, span: StatementSpan): void {
    const { first, links } = parts;
    const { name } = first;
    const nameRange = this.range(first.nameAt);
    const isNew = !this.builder.has(name);
    this.st.symbol(name, 'block', nameRange, isNew ? 'def' : 'ref');
    const node: BlockCompositeNode = {
      id: this.ids.next('block', esc(name)).id,
      type: 'Composite',
      range: { start: opener.start, end: first.range.end },
      name,
      nameRange,
      children: [],
    };
    if (first.typeStr !== undefined) node.shape = first.typeStr;
    if (first.label !== undefined) node.label = first.label;
    if (parts.span) node.span = parts.span.value;
    parent.ast.push(node);
    const width =
      parts.span && isNew ? this.builder.span(parts.span.value, parts.span.range) : undefined;
    const mention = BlockParser.asMention(node.id, first, links.length === 0 ? width : undefined);
    const block = this.builder.composite(mention, { into: parent.into, range: first.range });
    this.links(first, links, parent);
    const body = { block, into: block.children, ast: node.children, node };
    this.open({ ...body, span, opener, statements: 0 });
  }

  private open(frame: Frame): void {
    this.frames.push(frame);
    if (this.frames.length - 1 > this.maxDepth && !this.depthReported) {
      this.depthReported = true;
      const message = depthLimitMessage(this.maxDepth);
      this.st.diagnostics.error(LIMIT_CODES.maxDepth, message, frame.opener ?? this.c.range);
    }
  }

  /** `classDef CLASSDEF_ID CLASSDEF_STYLEOPTS`: v12 `addStyleClass`. */
  private classDef(): void {
    const { c } = this;
    const start = c.next();
    c.tested(T.ClassDefId);
    if (c.kind === T.DefaultClassDefId) this.fail(CLASS_NAME, DEFAULT_HINT);
    if (c.kind !== T.ClassDefId) this.fail(CLASS_NAME);
    const idTok = c.next();
    const idText = this.raw(idTok);
    const [name, at] = BlockParser.trimmed(idText);
    c.tested(T.ClassDefStyleOpts);
    if (c.kind !== T.ClassDefStyleOpts) this.fail(CLASS_STYLES);
    const cssTok = c.next();
    const css = this.raw(cssTok).trim();
    const nameRange = BlockParser.rangeIn(this.sourceOf(idTok, idText), at, name.length);
    const { id, n } = this.ids.next('classDef', esc(name));
    this.st.symbol(name, 'class', nameRange, n === 1 ? 'def' : 'ref');
    const range = { start: this.range(start).start, end: this.range(cssTok).end };
    this.frame.ast.push({ id, type: 'ClassDef', range, name, nameRange, css });
    this.builder.classDef(name, css);
  }

  /**
   * The ids of a `class` or `style` line (`a, b`), trimmed (D442), with their ranges: one walk
   * of the list with a moving offset.
   */
  private targets(j: number): BlockTarget[] {
    const text = this.raw(j);
    const source = this.sourceOf(j, text);
    const out: BlockTarget[] = [];
    let at = 0;
    for (const part of text.split(',')) {
      const [name, from] = BlockParser.trimmed(part);
      if (name !== '')
        out.push({ name, range: BlockParser.rangeIn(source, at + from, name.length) });
      at += part.length + 1;
    }
    return out;
  }

  /** `class CLASSENTITY_IDS STYLECLASS`: v12 `setCssClass`, on later ids too (D442). */
  private classStatement(): void {
    const { c } = this;
    const start = c.next();
    c.tested(T.ClassEntityIds);
    if (c.kind !== T.ClassEntityIds) this.fail(IDS);
    const idsTok = c.next();
    c.tested(T.StyleClass);
    if (c.kind !== T.StyleClass) this.fail(CLASS_NAME);
    const nameTok = c.next();
    const text = this.raw(nameTok);
    const className = text.trim();
    const targets = this.targets(idsTok);
    const range = { start: this.range(start).start, end: this.range(nameTok).end };
    const id = this.st.ids.statement('class');
    this.frame.ast.push({ id, type: 'Class', range, targets, className });
    for (const t of targets) this.st.symbol(t.name, 'block', t.range, 'ref');
    const source = this.sourceOf(nameTok, text);
    for (const m of text.matchAll(/\S+/g))
      this.st.symbol(m[0], 'class', BlockParser.rangeIn(source, m.index, m[0].length), 'ref');
    this.builder.classes(targets, className);
  }

  /** `style STYLE_ENTITY_IDS STYLE_DEFINITION_DATA`: applied after every statement (D443). */
  private styleStatement(): void {
    const { c } = this;
    const start = c.next();
    c.tested(T.StyleEntityIds);
    if (c.kind !== T.StyleEntityIds) this.fail(IDS);
    const idsTok = c.next();
    c.tested(T.StyleDefinitionData);
    if (c.kind !== T.StyleDefinitionData) this.fail(STYLES);
    const dataTok = c.next();
    const styles = this.raw(dataTok).trim();
    const targets = this.targets(idsTok);
    const range = { start: this.range(start).start, end: this.range(dataTok).end };
    const id = this.st.ids.statement('style');
    this.frame.ast.push({ id, type: 'Style', range, targets, styles });
    for (const t of targets) this.st.symbol(t.name, 'block', t.range, 'ref');
    this.builder.style(targets, styles);
  }
}
