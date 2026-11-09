// cspell:words LALR
/**
 * Block parser: recursive descent over the {@link lex} tokens (gated against v12's jison lexer,
 * #553), producing a {@link BlockModel}, the typed AST, symbols, statement spans and
 * diagnostics (DESIGN §4.3).
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
 * its tree in the same order); `style` statements apply at the end (D443).
 *
 * Unlike jison the parser does not stop at the first error (R-PARSE-4): it reports it, skips to
 * the next statement that starts on a later line, and carries on. A failed composite header
 * still opens the composite, so its `end` closes it (pitfall 8).
 */
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import {
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  sourceView,
  TokenCursor,
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
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import { ModelBuilder } from './builder.ts';
import {
  BLOCK,
  CLASS_NAME,
  CLOSERS,
  DEFAULT_HINT,
  DIRECTION,
  DIRECTION_OR_CLOSE,
  EDGE_END,
  EDGE_LABEL,
  EMPTY_HINT,
  HEADER,
  HEADER_HINT,
  IDS,
  LABEL,
  MARKDOWN_HINT,
  STATEMENT,
  STATEMENT_OR_END,
  UNQUOTED_HINT,
  hintFor,
} from './messages.ts';
import type { LinkText, OpenBlock } from './builder.ts';
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

/** Thrown inside the parser after a diagnostic is recorded; caught at statement level. */
class Stop extends Error {}
const STOP = new Stop();

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

/** A block mention as read. */
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

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class BlockParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: Lexed;
  /** What v12's preprocessing removed (comments, directives, a dropped `;`), in source order. */
  private readonly holes: readonly Hole[];
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly maxDepth: number;
  private readonly b: ModelBuilder;
  private readonly doc: BlockStatementNode[] = [];
  private readonly frames: Frame[];
  /** Mentions of each block id, for AST ids. */
  private readonly mentions = new Map<string, number>();
  /** Edges between each `start->end` pair, for AST ids. */
  private readonly edgeMentions = new Map<string, number>();
  private readonly classDefMentions = new Map<string, number>();
  private depthReported = false;
  private sawEof = false;
  private lines: LineIndex | undefined;

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
    this.lexed = lex(src, pre.bodyStart, view);
    this.c = new TokenCursor(this.lexed.tokens, SKIPPED);
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.b = new ModelBuilder(this.st, {
      maxNodes: options.maxNodes ?? DEFAULT_LIMITS.maxNodes,
      maxEdges: options.maxEdges ?? DEFAULT_LIMITS.maxEdges,
    });
    this.frames = [{ block: undefined, into: this.b.top, ast: this.doc, statements: 0 }];
  }

  parse(): BlockParseResult {
    this.start();
    this.document();
    this.b.finish();
    const { st, pre, src } = this;
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const model = this.b.model(st.diagnostics.list.filter((d) => d.severity === 'warning'));
    const ast: BlockDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.doc,
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

  /** The source range of `text` inside token `j` at `from`, when the source there reads as it. */
  private inside(j: number, text: string, from: number, length: number): Range {
    const r = this.range(j);
    if (this.src.slice(r.start, r.end) !== text) return r;
    return { start: r.start + from, end: r.start + from + length };
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
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    const r = this.range(j);
    const t = this.src.slice(r.start, r.end).trim();
    if (t === '')
      return /[\n\r\u2028\u2029]/.test(this.src.slice(r.start, r.end)) ? 'a line break' : 'blanks';
    const line = /^[^\n\r\u2028\u2029]*/.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${t}\``;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], hint?: string): never {
    const { c } = this;
    if (this.endedInside(c.pos)) this.endsOpen(names);
    const d = this.st.diagnostics.unexpected('UNEXPECTED', c.range, names, this.found(c.pos));
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
    throw STOP;
  }

  /**
   * Whether the text ends inside a shape, string, block arrow or edge label from token `j` on:
   * nothing follows but what the lexer read in there (errors, text, directions, quotes), and no
   * `EOF` (jison's lexer returns none outside INITIAL).
   */
  private endedInside(j: number): boolean {
    const t = this.c.tokens;
    for (let i = j; i < t.length; i++) {
      const k = t.kind[i] ?? Kind.EOF;
      if (k === Kind.EOF) return true;
      if (!INSIDE[k]) return false;
    }
    return true;
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
        const md = k === T.MdStringStart;
        return this.unclosed('UNCLOSED_STRING', 'string', md ? '"`' : '"', md ? '`"' : '"', j);
      }
      if (k === T.NodeDStart) {
        const open = this.raw(j);
        return this.unclosed('UNCLOSED_SHAPE', 'shape', open, CLOSERS[open] ?? ']', j);
      }
      if (k === T.BlockArrowStart)
        return this.unclosed('UNCLOSED_SHAPE', 'block arrow', '<[', ']>(…)', j);
      if (k === T.StartLink) {
        const at = this.range(j);
        this.st.diagnostics.error(
          'UNCLOSED_LABEL',
          `Unfinished edge: the \`${this.raw(j).trim()}\` at line ${this.lineOf(at.start)} takes a quoted label and a closing link, as in \`a -- "text" --> b\`.`,
          at
        );
        throw STOP;
      }
      if (!INSIDE[k]) break;
    }
    const at = { start: this.src.length, end: this.src.length };
    this.st.diagnostics.unexpected('UNEXPECTED', at, names, 'the end of the text');
    throw STOP;
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

  /**
   * Skip to the next statement after an error (R-PARSE-4): the first statement start, `end` or
   * end of the text on a later line than the error (line breaks separate nothing in block, but
   * an author writes one statement a line).
   */
  private recover(from: number): void {
    const { c, src } = this;
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
      this.guarded(() => this.fail(STATEMENT, 'write at least one block in the diagram'));
    while (frames.length > 1) {
      const f = frames.pop() as Frame;
      const opener = f.opener ?? c.range;
      this.st.diagnostics.error(
        'UNCLOSED_BLOCK',
        `Unclosed composite: the \`block\` at line ${this.lineOf(opener.start)} has no \`end\`. Add \`end\` after its last statement.`,
        opener
      );
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
      const d = this.st.diagnostics.unexpected('UNEXPECTED', r, STATEMENT, '`end`');
      d.message = `${d.message.slice(0, -1)}; an \`end\` closes a \`block\`, and none is open.`;
      return;
    }
    if (f.statements === 0) {
      const d = this.st.diagnostics.unexpected('UNEXPECTED', r, STATEMENT, '`end`');
      d.message = `${d.message.slice(0, -1)}; a composite holds at least one statement: ${EMPTY_HINT}.`;
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
    const start = this.c.start;
    const frame = this.frame;
    const chain = this.chain((partial) => this.applyChain(partial, frame));
    this.applyChain(chain, frame);
    this.st.statement('node', { start, end: this.lastEnd() });
  }

  /** The end of the last token read. */
  private lastEnd(): number {
    const t = this.c.tokens;
    let j = this.c.pos - 1;
    while (j > 0 && SKIPPED[t.kind[j] ?? 0] === 1) j--;
    return t.end[j] ?? 0;
  }

  /**
   * `node [ SIZE ] { link node }`, at an id. A failure inside it hands the parts read so far to
   * `failed` before the statement stops, so the blocks before the error still reach the model.
   */
  private chain(failed: (partial: Chain) => void): Chain {
    const { c } = this;
    const chain: Chain = { first: this.nodeId(), span: undefined, links: [] };
    try {
      this.nodeShape(chain.first);
      if (c.kind === T.Size) {
        const j = c.next();
        const range = this.range(j);
        chain.span = { value: parseInt(this.raw(j), 10), range };
        chain.first.range = { start: chain.first.range.start, end: range.end };
      }
      while (c.kind === T.Link || c.kind === T.StartLink) {
        const link = this.link();
        if (c.kind !== T.NodeId) this.fail(BLOCK);
        const next = this.nodeId();
        chain.links.push([link, next]);
        this.nodeShape(next);
      }
    } catch (error) {
      if (error === STOP) failed(chain);
      throw error;
    }
    return chain;
  }

  /** The id of a `node`. */
  private nodeId(): NodeParts {
    const j = this.c.next();
    return { name: this.raw(j), nameAt: j, range: this.range(j) };
  }

  /** The rest of a `node`: an optional shape or block arrow. */
  private nodeShape(parts: NodeParts): void {
    const { c } = this;
    if (c.kind === T.NodeDStart) this.shape(parts);
    else if (c.kind === T.BlockArrowStart) this.blockArrow(parts);
  }

  /** `NODE_DSTART STR NODE_DEND`. */
  private shape(parts: NodeParts): void {
    const { c } = this;
    const open = this.raw(c.next());
    if (c.kind !== T.Str) this.fail(LABEL, c.kind === T.MdStr ? MARKDOWN_HINT : UNQUOTED_HINT);
    parts.label = this.raw(c.next());
    if (c.kind !== T.NodeDEnd) this.fail([`\`${CLOSERS[open] ?? ']'}\``]);
    const close = c.next();
    parts.typeStr = open + this.raw(close);
    parts.range = { start: parts.range.start, end: this.range(close).end };
  }

  /** `BLOCK_ARROW_START STR DIR+ BLOCK_ARROW_END`. */
  private blockArrow(parts: NodeParts): void {
    const { c } = this;
    c.next();
    if (c.kind !== T.Str) this.fail(LABEL, c.kind === T.MdStr ? MARKDOWN_HINT : UNQUOTED_HINT);
    parts.label = this.raw(c.next());
    if (c.kind !== T.Dir) this.fail(DIRECTION);
    const directions: string[] = [];
    while (c.kind === T.Dir) directions.push(this.raw(c.next()));
    if (c.kind !== T.BlockArrowEnd) this.fail(DIRECTION_OR_CLOSE);
    const close = c.next();
    parts.typeStr = '<[' + this.raw(close);
    parts.directions = directions;
    parts.range = { start: parts.range.start, end: this.tightEnd(close) };
  }

  /** `link`: `LINK`, or `START_LINK LINK_LABEL STR LINK`. */
  private link(): LinkParts {
    const { c } = this;
    const j = c.next();
    const start = this.range(j).start;
    if (this.c.tokens.kind[j] === T.Link)
      return { link: this.raw(j), range: { start, end: this.tightEnd(j) } };
    if (c.kind !== T.LinkLabel) this.fail(EDGE_LABEL);
    c.next();
    if (c.kind !== T.Str) this.fail(EDGE_LABEL, c.kind === T.MdStr ? MARKDOWN_HINT : undefined);
    const label = this.raw(c.next());
    if (c.kind !== T.Link) this.fail(EDGE_END);
    const close = c.next();
    return { link: this.raw(close), label, range: { start, end: this.tightEnd(close) } };
  }

  /**
   * v12's three-element chain result, fixed (D442): every node is a block, every link an edge.
   * As in v12, a span after the first node only counts when no link follows.
   */
  private applyChain({ first, span, links }: Chain, frame: Frame): void {
    const width = span === undefined ? undefined : this.b.span(span.value, span.range);
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

  /** The AST id of the next mention of block `name`. */
  private blockAst(name: string): string {
    const n = (this.mentions.get(name) ?? 0) + 1;
    this.mentions.set(name, n);
    const id = `block:${esc(name)}`;
    return n === 1 ? id : `${id}@${n}`;
  }

  /** A block mention: its AST node and symbol, and the block it declares or merges into. */
  private mention(
    parts: NodeParts,
    frame: Frame,
    span: number | undefined,
    written: number | undefined
  ): void {
    const { name } = parts;
    this.st.symbol(name, 'block', this.range(parts.nameAt), this.b.has(name) ? 'ref' : 'def');
    const node: BlockLeafNode = {
      id: this.blockAst(name),
      type: 'Block',
      range: parts.range,
      name,
      nameRange: this.range(parts.nameAt),
    };
    if (parts.typeStr !== undefined) node.shape = parts.typeStr;
    if (parts.label !== undefined) node.label = parts.label;
    if (written !== undefined) node.span = written;
    if (parts.directions) node.directions = parts.directions;
    frame.ast.push(node);
    this.b.mention(this.asMention(node.id, parts, span), frame.into, parts.range);
  }

  private asMention(ast: string, parts: NodeParts, span: number | undefined) {
    return {
      ast,
      id: parts.name,
      type: shapeType(parts.typeStr),
      label: parts.label,
      span,
      directions: parts.directions,
    };
  }

  /** An edge from `start` to `end`: its AST node and the model's edge. */
  private edge(start: string, end: string, link: LinkParts, frame: Frame): void {
    const astKey = `${esc(start)}->${esc(end)}`;
    const n = (this.edgeMentions.get(astKey) ?? 0) + 1;
    this.edgeMentions.set(astKey, n);
    const ast = n === 1 ? `edge:${astKey}` : `edge:${astKey}@${n}`;
    const node: BlockEdgeNode = {
      id: ast,
      type: 'Edge',
      range: link.range,
      start,
      end,
      link: link.link.trim(),
    };
    if (link.label !== undefined) node.label = link.label;
    frame.ast.push(node);
    this.b.edge(ast, start, end, link, link.range);
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
    this.b.setColumns(written, range, frame.block, this.frames.length === 1);
    this.st.statement('columns', range);
  }

  /** `SPACE_BLOCK`: `space` or `space:n`, n cells (D445: at most {@link MAX_SPACE_CELLS}). */
  private spaceStatement(): void {
    const { c } = this;
    const j = c.next();
    const range = this.range(j);
    const written = parseInt(this.raw(j), 10);
    const id = this.b.nextId();
    const frame = this.frame;
    const ast = `block:${id}`;
    frame.ast.push({ id: ast, type: 'Space', range, cells: written });
    this.b.space(ast, id, written, frame.into, range);
    this.st.statement('space', range);
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
      const id = this.b.nextId();
      const node: BlockCompositeNode = {
        id: `block:${id}`,
        type: 'Composite',
        range: { start: opener.start, end: opener.end },
        children: [],
      };
      parent.ast.push(node);
      const block = this.b.anonymous(node.id, id, parent.into, opener);
      this.open({
        block,
        into: block.children,
        ast: node.children,
        node,
        span,
        opener,
        statements: 0,
      });
      return;
    }
    if (c.kind !== T.NodeId) {
      this.open({
        block: undefined,
        into: parent.into,
        ast: parent.ast,
        span,
        opener,
        statements: 1,
      });
      this.fail(["the composite's id, as in `block:id`"]);
    }
    const chain = this.chain((partial) => this.header(partial, parent, opener, span));
    this.header(chain, parent, opener, span);
  }

  /**
   * A composite's header: the composite is the header's first block (v12 merged a composite
   * into the block of its id); the rest of a chain (`block:a --> b`) goes to the level around
   * it (v12 lost it, GAPS #554).
   */
  private header(parts: Chain, parent: Frame, opener: Range, span: StatementSpan): void {
    const { first, links } = parts;
    const { name } = first;
    this.st.symbol(name, 'block', this.range(first.nameAt), this.b.has(name) ? 'ref' : 'def');
    const node: BlockCompositeNode = {
      id: this.blockAst(name),
      type: 'Composite',
      range: { start: opener.start, end: first.range.end },
      name,
      nameRange: this.range(first.nameAt),
      children: [],
    };
    if (first.typeStr !== undefined) node.shape = first.typeStr;
    if (first.label !== undefined) node.label = first.label;
    if (parts.span) node.span = parts.span.value;
    parent.ast.push(node);
    const width =
      parts.span && !this.b.has(name) ? this.b.span(parts.span.value, parts.span.range) : undefined;
    const mention = this.asMention(node.id, first, links.length === 0 ? width : undefined);
    const block = this.b.composite(mention, parent.into, first.range);
    // The chain's edges and later blocks are statements of the level around the composite, as
    // written before its body; their AST nodes are the composite's first children.
    this.links(first, links, { ...parent, ast: node.children });
    this.open({
      block,
      into: block.children,
      ast: node.children,
      node,
      span,
      opener,
      statements: 0,
    });
  }

  private open(frame: Frame): void {
    this.frames.push(frame);
    if (this.frames.length - 1 > this.maxDepth && !this.depthReported) {
      this.depthReported = true;
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Composites nest more than ${this.maxDepth} deep, the limit. The limit is set by the page or app that renders the diagram.`,
        frame.opener ?? this.c.range
      );
    }
  }

  /** `classDef CLASSDEF_ID CLASSDEF_STYLEOPTS`: v12 `addStyleClass`. */
  private classDef(): void {
    const { c } = this;
    const start = c.next();
    if (c.kind === T.DefaultClassDefId) this.fail(CLASS_NAME, DEFAULT_HINT);
    if (c.kind !== T.ClassDefId) this.fail(CLASS_NAME);
    const idTok = c.next();
    const [name, at] = BlockParser.trimmed(this.raw(idTok));
    if (c.kind !== T.ClassDefStyleOpts) this.fail(["the class's styles"]);
    const cssTok = c.next();
    const css = this.raw(cssTok).trim();
    const nameRange = this.inside(idTok, this.raw(idTok), at, name.length);
    const n = (this.classDefMentions.get(name) ?? 0) + 1;
    this.classDefMentions.set(name, n);
    this.st.symbol(name, 'class', nameRange, n === 1 ? 'def' : 'ref');
    const range = { start: this.range(start).start, end: this.range(cssTok).end };
    this.frame.ast.push({
      id: n === 1 ? `classDef:${esc(name)}` : `classDef:${esc(name)}@${n}`,
      type: 'ClassDef',
      range,
      name,
      nameRange,
      css,
    });
    this.b.classDef(name, css);
    this.st.statement('classDef', range);
  }

  /** The ids of a `class` or `style` line (`a, b`), trimmed (D442), with their ranges. */
  private targets(j: number): BlockTarget[] {
    const text = this.raw(j);
    const out: BlockTarget[] = [];
    let at = 0;
    for (const part of text.split(',')) {
      const [name, from] = BlockParser.trimmed(part);
      if (name !== '') out.push({ name, range: this.inside(j, text, at + from, name.length) });
      at += part.length + 1;
    }
    return out;
  }

  /** `class CLASSENTITY_IDS STYLECLASS`: v12 `setCssClass`, on later ids too (D442). */
  private classStatement(): void {
    const { c } = this;
    const start = c.next();
    if (c.kind !== T.ClassEntityIds) this.fail(IDS);
    const idsTok = c.next();
    if (c.kind !== T.StyleClass) this.fail(CLASS_NAME);
    const nameTok = c.next();
    const text = this.raw(nameTok);
    const className = text.trim();
    const targets = this.targets(idsTok);
    const range = { start: this.range(start).start, end: this.range(nameTok).end };
    this.frame.ast.push({
      id: this.st.ids.statement('class'),
      type: 'Class',
      range,
      targets,
      className,
    });
    for (const t of targets) this.st.symbol(t.name, 'block', t.range, 'ref');
    for (const m of text.matchAll(/\S+/g)) {
      const at = m.index;
      this.st.symbol(m[0], 'class', this.inside(nameTok, text, at, m[0].length), 'ref');
    }
    this.b.classes(targets, className);
    this.st.statement('class', range);
  }

  /** `style STYLE_ENTITY_IDS STYLE_DEFINITION_DATA`: applied after every statement (D443). */
  private styleStatement(): void {
    const { c } = this;
    const start = c.next();
    if (c.kind !== T.StyleEntityIds) this.fail(IDS);
    const idsTok = c.next();
    if (c.kind !== T.StyleDefinitionData) this.fail(['the styles']);
    const dataTok = c.next();
    const styles = this.raw(dataTok).trim();
    const targets = this.targets(idsTok);
    const range = { start: this.range(start).start, end: this.range(dataTok).end };
    this.frame.ast.push({
      id: this.st.ids.statement('style'),
      type: 'Style',
      range,
      targets,
      styles,
    });
    for (const t of targets) this.st.symbol(t.name, 'block', t.range, 'ref');
    this.b.style(targets, styles);
    this.st.statement('style', range);
  }
}
