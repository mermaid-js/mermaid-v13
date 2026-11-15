/**
 * Flowchart parser: recursive descent over the {@link lex} tokens, producing a
 * {@link FlowModel}, the typed AST, symbols, statement spans and diagnostics (DESIGN §4.3).
 *
 * The grammar is v12's `flow.jison` (LALR); the descent follows Pele's port of it
 * (`src/diagrams/flowchart/parser.ts` @ 3a2f075, https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano), so it accepts and rejects what jison does. Unlike jison it does not stop
 * at the first error: it reports it, skips to the next statement boundary and carries on
 * (R-PARSE-4). An unclosed label or string, which swallows the rest of the text, is reported
 * at its opener and lexing restarts on the following line.
 */
// cspell:words kepano LALR yytexts
import {
  cook,
  ExpectedTable,
  inKindSet,
  isSpace,
  LBRACE,
  RBRACE,
  Kind,
  kindSet,
  LineIndex,
  NO_AST_ID,
  nodeId,
  ParseState,
  Probe,
  significantTokens,
  skipTo,
  STOP,
} from '@mermaid-js/core/parser-kit';
import type {
  AstCallback,
  AstId,
  KindSet,
  LeanParseOptions,
  LeanParseResult,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { isYamlMap, parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult, YamlMap } from '@mermaid-js/core/preprocess';
import type {
  FlowDocument,
  FlowEdge,
  FlowHeader,
  FlowLabelNode,
  FlowNodeStmt,
  FlowSimpleKind,
  FlowEmbedStmt,
  FlowSimpleStmt,
  FlowStatementNode,
  FlowSubgraph,
} from './ast.ts';
import { flowSourceView, lex } from './lexer.ts';
import { destructLink, FlowBuilder } from './model.ts';
import type { DocItem, FlowModel, LabelType, LinkInfo, VertexParts } from './model.ts';
import { T } from './tokens.ts';

export interface FlowParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Edge cap (core `DEFAULT_LIMITS.maxEdges`, 5,000; v12's `maxEdges` was 500). */
  maxEdges?: number;
  /** Vertex cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number;
  /** Subgraph nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
  /** v12 `flowchart.inheritDir`. */
  inheritDir?: boolean;
  /** Features claimed by extension plugins; `callbacks` silences `CALLBACK_IGNORED`. */
  claims?: readonly string[];
}

export type FlowParseResult = ParseResult<FlowModel, FlowDocument>;

/** The options of a lean parse (`LeanParseOptions`): no token stream, no probe. */
export type FlowLeanOptions = Omit<FlowParseOptions, keyof ParseOptions> & LeanParseOptions;

/** A lean parse's result: the model and the diagnostics, for drawing only. */
export type LeanFlowParseResult = LeanParseResult<FlowModel>;

/** What the parser reads of either kind of options. */
type AnyFlowOptions = Omit<FlowParseOptions, 'lean'> & {
  readonly lean?: boolean;
  readonly astIds?: boolean;
};

const ID_KINDS = [
  T.Num,
  T.NodeString,
  T.Down,
  T.Minus,
  T.Default,
  T.Comma,
  T.Colon,
  T.Amp,
  T.Brkt,
  T.Mult,
  T.UnicodeText,
];
const ID = kindSet(...ID_KINDS);
const ALPHANUM = kindSet(
  T.Num,
  T.UnicodeText,
  T.NodeString,
  T.Dir,
  T.Down,
  T.Minus,
  T.Comma,
  T.Colon,
  T.Amp,
  T.Brkt,
  T.Mult
);
const NO_TAGS = kindSet(
  T.Num,
  T.NodeString,
  T.Space,
  T.Minus,
  T.Amp,
  T.UnicodeText,
  T.Colon,
  T.Mult,
  T.Brkt,
  T.Style,
  T.LinkStyle,
  T.ClassDef,
  T.Class,
  T.Click,
  T.Graph,
  T.Dir,
  T.Subgraph,
  T.End,
  T.Down,
  T.Up,
  T.StartLink
);
const STYLE_PART = kindSet(T.Num, T.NodeString, T.Colon, T.Space, T.Brkt, T.Style);
const TEXT_PART = kindSet(T.Text, T.TagStart, T.TagEnd, T.UnicodeText);
const EDGE_PART = kindSet(T.EdgeText, T.UnicodeText);
const NONE = kindSet();
const LEXER_MODE = kindSet(
  T.Text,
  T.EdgeText,
  T.Str,
  T.MdStr,
  T.ShapeData,
  T.Click,
  T.CallbackName,
  T.CallbackArgs
);

const SHAPES: Record<number, [shape: string, close: number, what: string, closeText: string]> = {
  [T.SQS]: ['square', T.SQE, 'node label', '`]`'],
  [T.DoubleCircleStart]: ['doublecircle', T.DoubleCircleEnd, 'node label', '`)))`'],
  [T.EllipseStart]: ['ellipse', T.EllipseEnd, 'node label', '`-)`'],
  [T.StadiumStart]: ['stadium', T.StadiumEnd, 'node label', '`])`'],
  [T.SubroutineStart]: ['subroutine', T.SubroutineEnd, 'node label', '`]]`'],
  [T.CylinderStart]: ['cylinder', T.CylinderEnd, 'node label', '`)]`'],
  [T.TagEnd]: ['odd', T.SQE, 'node label', '`]`'],
};
const DIRECTIONS = ['TB', 'BT', 'RL', 'LR', 'TD'];

const LINE_END = [Kind.Newline, T.Semi, T.Eof];
/**
 * What the parser reads past besides spaces: comments, directives and the `click` keyword
 * (jison has no token for it, so `click` heads no statement: the node id after it does). The
 * completion facet reads a statement's head past the same kinds.
 */
const READ_PAST_KINDS = [Kind.Comment, Kind.Directive, T.ClickKeyword] as const;
export const READ_PAST = kindSet(...READ_PAST_KINDS);
/** What the parser skips: {@link READ_PAST} and spaces. */
const PARSER_TRIVIA = kindSet(...READ_PAST_KINDS, Kind.Space);
/** Where recovery resumes (R-PARSE-4). */
const BOUNDARY = kindSet(Kind.EOF, T.Eof, Kind.Newline, T.Semi);
const STATEMENT_START = [
  T.Embed,
  T.Style,
  T.LinkStyle,
  T.ClassDef,
  T.Class,
  T.Click,
  T.Subgraph,
  T.AccTitle,
  T.AccDescr,
  T.NodeString,
];

// What the parser would accept at its decision points, for the probe (R-LANG-7, D95). Each
// list is a constant so a parse without a probe allocates nothing for them.
const STATEMENT_KINDS = [
  ...STATEMENT_START,
  T.AccDescrMultilineValue,
  T.DirectionTB,
  T.DirectionBT,
  T.DirectionRL,
  T.DirectionLR,
  T.DirectionTD,
];
const DOC_KINDS = [...STATEMENT_KINDS, T.Semi, Kind.Newline, T.Space, T.Eof, Kind.EOF];
const SUBGRAPH_DOC_KINDS = [...DOC_KINDS, T.End];
const BLANKS = [T.Space, Kind.Newline];
/** Blanks before the header are optional: where one may stand, so may the header keyword. */
const HEADER_START = [...BLANKS, T.Graph];
const DIR_KINDS = [T.NoDir, T.Dir];
const AFTER_DIR = [T.Space, ...LINE_END];
const SHAPE_KINDS = [
  T.SQS,
  T.PS,
  T.DiamondStart,
  T.StadiumStart,
  T.SubroutineStart,
  T.CylinderStart,
  T.DoubleCircleStart,
  T.EllipseStart,
  T.TrapStart,
  T.InvTrapStart,
  T.TagEnd,
  T.VertexWithPropsStart,
];
const GRAPH = [T.Graph];
const PS_ONLY = [T.PS];
const DIAMOND_ONLY = [T.DiamondStart];
const TRAP_ENDS = [T.TrapEnd, T.InvTrapEnd];
const STYLE_SEPARATOR = [T.StyleSeparator];
const SHAPE_DATA = [T.ShapeData];
const SHAPE_DATA_PARTS = [T.ShapeData, T.ShapeDataEnd];
const SPACE = [T.Space];
const SQS_ONLY = [T.SQS];
const EMBED_END = [T.EmbedEnd];
const AMP = [T.Amp];
const LINK_KINDS = [T.Link, T.StartLink, T.LinkId];
const LINK_AFTER_ID = [T.Link, T.StartLink];
/** After an edge label: an optional blank, then the node. */
const AFTER_EDGE_LABEL = [T.Space, T.NodeString];
const PIPE = [T.Pipe];
const COMMA = [T.Comma];
const STYLE_WANT = [T.NodeString];
const LINK_STYLE_INDEX = [T.Default, T.Num];
const INTERPOLATE_OR_STYLE = [T.Interpolate, T.NodeString];
const CLICK_ACTION = [T.CallbackName, T.Href, T.Str, T.NodeString];
const CALLBACK_ARGS = [T.CallbackArgs];
const LINK_TARGET_OR_TOOLTIP = [T.LinkTarget, T.Str];
const SUBGRAPH_HEADER = [T.Space, ...LINE_END];
const SUBGRAPH_TITLE = [T.SQS, ...LINE_END];

/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * links, separators and brackets. Id and text kinds are absent, so `my-` or a label is a word.
 */
const PROBE_FOLLOWS = kindSet(
  ...SHAPE_KINDS,
  ...LINK_KINDS,
  T.StyleSeparator,
  T.Semi,
  T.Space,
  T.NoDir,
  T.Pipe,
  T.SQE,
  T.PE,
  T.DiamondStop,
  T.StadiumEnd,
  T.SubroutineEnd,
  T.CylinderEnd,
  T.DoubleCircleEnd,
  T.EllipseEnd,
  T.TrapEnd,
  T.InvTrapEnd,
  T.TagStart,
  T.ShapeDataEnd,
  T.Sep
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`&`', [T.Amp]],
  ['a link number such as `0`', [T.Num]],
  ['a node id', ID_KINDS],
  ['a link such as `-->`', [T.Link, T.StartLink, T.LinkId]],
  [
    'a node shape such as `[text]`',
    [
      T.SQS,
      T.PS,
      T.DiamondStart,
      T.StadiumStart,
      T.SubroutineStart,
      T.CylinderStart,
      T.DoubleCircleStart,
      T.EllipseStart,
      T.TrapStart,
      T.InvTrapStart,
      T.TagEnd,
      T.VertexWithPropsStart,
    ],
  ],
  ['label text', [T.Text, T.TagStart, T.EdgeText]],
  ['a quoted string', [T.Str, T.MdStr]],
  ['`]`', [T.SQE]],
  ['`)`', [T.PE]],
  ['`}`', [T.DiamondStop]],
  ['`|`', [T.Pipe]],
  ['`])`', [T.StadiumEnd]],
  ['`]]`', [T.SubroutineEnd]],
  ['`)]`', [T.CylinderEnd]],
  ['`)))`', [T.DoubleCircleEnd]],
  ['`-)`', [T.EllipseEnd]],
  ['`\\]`', [T.TrapEnd]],
  ['`/]`', [T.InvTrapEnd]],
  ['`:::`', [T.StyleSeparator]],
  ['a line break or `;`', [Kind.Newline, T.Semi]],
  ['a space', [T.Space]],
  ['a direction such as `TD` or `LR`', [T.Dir, T.NoDir]],
  ['`graph` or `flowchart`', [T.Graph]],
  ['`end`', [T.End]],
  [
    'a statement such as `style`, `classDef`, `class`, `click` or `subgraph`',
    [
      T.Style,
      T.LinkStyle,
      T.ClassDef,
      T.Class,
      T.Click,
      T.Subgraph,
      T.AccTitle,
      T.AccDescr,
      T.AccDescrMultilineValue,
      T.DirectionTB,
      T.DirectionBT,
      T.DirectionLR,
      T.DirectionRL,
      T.DirectionTD,
    ],
  ],
  ['`default`', [T.Default]],
  ['`interpolate`', [T.Interpolate]],
  ['`href`', [T.Href]],
  ['a link target such as `_blank`', [T.LinkTarget]],
  ['shape data `@{ … }`', [T.ShapeData]],
  ['`{` at the end of the line', [T.EmbedOpen]],
  ['`}` on its own line, closing the block', [T.EmbedEnd]],
  ['`}`', [T.ShapeDataEnd]],
  ['the end of the text', [Kind.EOF, T.Eof]],
]);

interface Frame {
  id: FlowLabelNode | undefined;
  title: FlowLabelNode | undefined;
  list: DocItem[];
  collect: boolean;
  start: number;
  opener: Range;
  span: ReturnType<ParseState['beginStatement']>;
  children: FlowStatementNode[];
  outer: FlowStatementNode[];
}

interface Opener {
  range: Range;
  what: string;
  closer: string;
}

const NO_ITEMS: string[] = [];

/** How each statement is written, for errors inside it. */
const STATEMENT_HINTS: Record<number, string> = {
  [T.Style]: 'write it as `style <node id> <styles>`, e.g. `style A fill:#f9f,stroke:#333`',
  [T.ClassDef]: 'write it as `classDef <name> <styles>`, e.g. `classDef hot fill:#f96`',
  [T.Class]: 'write it as `class <node ids> <class name>`, e.g. `class A,B hot`',
  [T.LinkStyle]:
    'write it as `linkStyle <link numbers or default> <styles>`, e.g. `linkStyle 0,1 stroke:red`',
  [T.Click]:
    'write it as `click <node id> <callback>` or `click <node id> "<url>"`, e.g. `click A "https://example.com"`',
};

/**
 * The first node statement of `list` with a name: a scan for short lists, a map for the long
 * ones of `A & B & …` fan-out (each edge looks up both its ends).
 */
function byName(list: readonly FlowNodeStmt[]): (name: string) => FlowNodeStmt | undefined {
  if (list.length < 8) return (name) => list.find((n) => n.name === name);
  const map = new Map<string, FlowNodeStmt>();
  for (const n of list) if (!map.has(n.name)) map.set(n.name, n);
  return (name) => map.get(name);
}

/**
 * Parse a flowchart. Never throws: problems are error diagnostics. Lean options (DESIGN §4.2)
 * give a lean result: it accepts and rejects as the full parse and has its warnings.
 */
export function parseFlowchart(src: string, options: FlowLeanOptions): LeanFlowParseResult;
export function parseFlowchart(src: string, options?: FlowParseOptions): FlowParseResult;
export function parseFlowchart(
  src: string,
  options: FlowParseOptions | FlowLeanOptions = {}
): FlowParseResult | LeanFlowParseResult {
  return new FlowParser(src, options).parse();
}

interface ShapeData {
  value: YamlMap | null;
  range: Range;
}

/**
 * One parse. Each grammar rule is a method; `i` indexes the significant tokens. A rule that
 * fails records a diagnostic and throws {@link STOP}; the statement loop catches it and
 * recovers.
 */
class FlowParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly st: ParseState;
  private readonly ids: ParseState['ids'];
  /** An edge's AST id, for the model: `NO_AST_ID` in a lean parse without ids. */
  private readonly edgeAst: (start: string, end: string) => AstId;
  private readonly db: FlowBuilder;
  private readonly fullTokens: TokenStream;
  private tokens: TokenView;
  private i = 0;
  /** Probe mode only (R-LANG-7). */
  private readonly probe: Probe | undefined;
  /** Source offset {@link tokens} was lexed from (after a restart, mid-document). */
  private viewFrom: number;
  /** Line numbers, built for error messages only. */
  private lines: LineIndex | undefined;
  /** Brackets and labels open around the current token, innermost last. */
  private readonly opens: Opener[] = [];
  /** How the current statement is written, for errors inside it. */
  private hint: string | undefined;
  // Lexing restarts in the initial state after an error inside a label or other lexer mode,
  // which would otherwise swallow the following lines.
  private restartFrom = -1;
  private lastRestart = -1;
  private restarts = 0;
  // The document, and the subgraphs open around the current statement.
  private readonly children: FlowStatementNode[] = [];
  private readonly frames: Frame[] = [];
  private readonly maxDepth: number;
  /** What v12's grammar collects into the innermost open subgraph. */
  private list: DocItem[] = [];
  private collect = false;
  private body: FlowStatementNode[];

  constructor(
    private readonly src: string,
    private readonly options: AnyFlowOptions
  ) {
    this.st = new ParseState(options);
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    this.view = flowSourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const ids = (this.ids = this.st.ids);
    this.edgeAst = this.st.astIds ? (a, b) => ids.edge(a, b) : () => NO_AST_ID;
    const diagnostics = this.st.diagnostics;
    this.db = new FlowBuilder({
      maxEdges: options.maxEdges ?? DEFAULT_LIMITS.maxEdges,
      maxNodes: options.maxNodes ?? DEFAULT_LIMITS.maxNodes,
      inheritDir: options.inheritDir ?? false,
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
      warn: (code, message, range) => {
        diagnostics.warning(code, message, range);
      },
    });
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.body = this.children;
    const probe =
      options.probe === undefined ? undefined : new Probe(src, options.probe, PROBE_FOLLOWS);
    this.viewFrom = pre.bodyStart;
    this.probe = probe;
    this.fullTokens = lex(src, pre.bodyStart, this.view, true, probe);
    this.tokens = significantTokens(this.fullTokens, PARSER_TRIVIA);
    if (probe) {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.fullTokens);
    }
  }

  parse(): FlowParseResult | LeanFlowParseResult {
    const { st, db, options } = this;
    this.header();
    this.document();
    db.finish();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = db.model(warnings);
    if (model.callbacks.length > 0 && !options.claims?.includes('callbacks')) {
      const first = model.callbacks[0];
      const d = st.diagnostics.warning(
        'CALLBACK_IGNORED',
        '`click … callback` and `call` are ignored: install the interactions plugin to run callbacks.',
        first?.range ?? { start: 0, end: 0 }
      );
      model.warnings.push(d);
    }
    const result = st.lean
      ? st.leanResult(model)
      : st.result(model, this.documentNode(), this.fullTokens, options, this.probe);
    if (db.embeds.length > 0) result.embeds = db.embeds;
    result.edgeCount = model.edges.length;
    return result;
  }

  private documentNode(): FlowDocument {
    const range = { start: this.pre.bodyStart, end: this.src.length };
    return { id: 'doc', type: 'Document', range, children: this.children };
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.tokens.kind[j] ?? Kind.EOF;
  }

  private start(j: number): number {
    return this.tokens.start[j] ?? 0;
  }

  private end(j: number): number {
    return this.tokens.end[j] ?? 0;
  }

  /** A token's text as v12 saw it (removed spans dropped, entities decoded). */
  private raw(j = this.i): string {
    return cook(this.src, this.start(j), this.end(j), this.view);
  }

  /**
   * Probe hook: the parser tests the current token for `kinds` (a constant list), or would
   * accept them there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.tokens, this.i, this.viewFrom)) p.tested(kinds, this.start(this.i));
  }

  /** Source start of a token, with the quotes around a string (the lexer drops them). */
  private tokStart(j: number): number {
    const { src } = this;
    const s = this.start(j);
    const k = this.kind(j);
    if (k === T.Str && src[s - 1] === '"') return s - 1;
    if (k === T.MdStr && src.startsWith('"`', s - 2)) return s - 2;
    if (k === T.Click) {
      // `click` and its blanks are consumed without a token.
      let b = s;
      while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
      if (src.startsWith('click', b - 5)) return b - 5;
    }
    if (k === T.AccDescrMultilineValue) {
      // `accDescr {` and the blanks around `{` are consumed without a token (RE_ACC_DESCR_ML).
      let b = s;
      while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
      if (src.charCodeAt(b - 1) === LBRACE) {
        b--;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        if (src.startsWith('accDescr', b - 8)) return b - 8;
      }
    }
    return s;
  }

  private tokEnd(j: number): number {
    const e = this.end(j);
    const k = this.kind(j);
    if (k === T.Str && this.src[e] === '"') return e + 1;
    if (k === T.MdStr && this.src.startsWith('`"', e)) return e + 2;
    if (k === T.End) return this.start(j) + 3;
    // The closing `}` of `accDescr { … }` is consumed without a token.
    if (k === T.AccDescrMultilineValue && this.src.charCodeAt(e) === RBRACE) return e + 1;
    return e;
  }

  private range(a: number, b = a): Range {
    return { start: this.tokStart(a), end: this.tokEnd(b) };
  }

  /** From token `from` to the last one consumed. */
  private span(from: number): Range {
    const start = this.tokStart(from);
    return { start, end: this.i > from ? this.tokEnd(this.i - 1) : start };
  }

  /** Concatenated token text of a run (ids, styles), as v12 joined yytexts. */
  private runText(from: number, to: number): string {
    let s = '';
    for (let j = from; j < to; j++) s += this.raw(j);
    return s;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  private found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === T.Space) return 'a space';
    if (k === Kind.Error) return `the character \`${this.raw(j)}\``;
    const { src } = this;
    const quoted = k === T.Str || k === T.MdStr;
    const t = (
      quoted
        ? src.slice(this.tokStart(j), this.start(j)) +
          this.raw(j) +
          src.slice(this.end(j), this.tokEnd(j))
        : this.raw(j)
    ).trim();
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Offset of the line break ending the line that holds `at`. */
  private lineBreakAfter(at: number): number {
    const { src } = this;
    let e = at;
    while (e < src.length && src[e] !== '\n' && src[e] !== '\r') e++;
    return e;
  }

  /** The next statement boundary (`;` or line break) at or after `at`. */
  private boundaryAfter(at: number): number {
    const { src } = this;
    let e = at;
    while (e < src.length && src[e] !== '\n' && src[e] !== '\r' && src[e] !== ';') e++;
    return e;
  }

  private restartAt(at: number): void {
    if (at > this.lastRestart && at <= this.src.length && this.restarts < 64) {
      this.restartFrom = at;
    }
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string): never {
    this.tested(want);
    const { st, src, opens, i } = this;
    const k = this.kind();
    const where = this.range(i);
    const open = opens[opens.length - 1];
    const prev = i - 1;
    const prevKind = this.kind(prev);
    if (
      k === Kind.EOF &&
      (prevKind === T.Str || prevKind === T.MdStr) &&
      this.end(prev) >= src.length
    ) {
      // A string ran to the end of the text.
      const q = { start: this.tokStart(prev), end: this.start(prev) };
      st.diagnostics.error(
        'UNCLOSED_STRING',
        prevKind === T.MdStr
          ? `Unclosed markdown string: the string opened at line ${this.lineOf(q.start)} has no closing backtick and quote.`
          : `Unclosed string: the string opened at line ${this.lineOf(q.start)} has no closing quote.`,
        q,
        { related: [{ message: 'The text ends here.', range: where }] }
      );
      this.restartAt(this.lineBreakAfter(q.end));
      throw STOP;
    }
    if (open && (k === Kind.EOF || this.lineOf(where.start) > this.lineOf(open.range.start))) {
      const got =
        k === Kind.EOF ? '' : ` before ${this.found()} at line ${this.lineOf(where.start)}`;
      st.diagnostics.error(
        'UNCLOSED',
        `Unclosed ${open.what}: the \`${src.slice(open.range.start, open.range.end)}\` at line ${this.lineOf(open.range.start)} has no closing ${open.closer}${got}. Add ${open.closer} to close it.`,
        open.range,
        {
          expected: EXPECTED.names(want),
          related: [
            { message: k === Kind.EOF ? 'The text ends here.' : 'Found here.', range: where },
          ],
        }
      );
      // The label swallowed the lines after it: carry on from the line after its opener.
      this.restartAt(this.lineBreakAfter(open.range.end));
      throw STOP;
    }
    // The tokens after an error may come from a lexer mode the bad text opened (`>` starts a
    // label, for one): lex again from the next statement boundary.
    this.restartAt(
      opens.length > 0 || inKindSet(LEXER_MODE, k) || (k === Kind.Error && this.raw() === '#')
        ? this.lineBreakAfter(where.start)
        : this.boundaryAfter(where.start)
    );
    if (
      k === Kind.Error &&
      this.raw() === '#' &&
      /^#\w+;/.test(src.slice(where.start, where.start + 40))
    ) {
      st.diagnostics.error(
        'ENTITY_OUTSIDE_LABEL',
        'Entities such as `#quot;` work only inside labels: put the text in a label, e.g. `A["#quot;"]`.',
        where
      );
      throw STOP;
    }
    if (k === Kind.Error) {
      const why = hint ?? hintFor(this.raw());
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${this.raw()}\`${why ? `; ${why}` : ''}.`,
        where,
        { expected: EXPECTED.names(want) }
      );
      throw STOP;
    }
    const d = st.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), this.found());
    const why = hint ?? this.explain(want, open !== undefined);
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  /** A fix for an unexpected token, from what it is and where. */
  private explain(want: readonly number[], inLabel: boolean): string | undefined {
    const k = this.kind();
    const text = this.raw();
    if (inLabel && /^[[\](){}|]/.test(text)) {
      return 'to use brackets in a label, put it in quotes, e.g. `A["a (b)"]`';
    }
    if (inLabel && (k === T.Str || k === T.MdStr)) {
      return 'to use quotes in a label, quote it all and write them as `#quot;`, e.g. `A["say #quot;hi#quot;"]`';
    }
    const general = hintFor(text);
    if (general) return general;
    if (k === T.End || k === T.Graph || k === T.Subgraph) {
      const word = text.trim();
      return `\`${word}\` is a keyword: use another node id, and \`${word}\` as its label if needed, e.g. \`X[${word}]\``;
    }
    if (want === LINE_END && inKindSet(ID, k)) {
      return 'put each statement on its own line, or separate them with `;`';
    }
    return this.hint;
  }

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  private recover(): void {
    this.opens.length = 0;
    const { probe } = this;
    if (this.restartFrom < 0) {
      probe?.freeze();
      this.i = skipTo(this.tokens, this.i, BOUNDARY);
      return;
    }
    const from = this.restartFrom;
    this.restartFrom = -1;
    this.lastRestart = from;
    this.restarts++;
    // Text lexed again before the probe offset replaces what the probe saw there. A restart at
    // or after it skipped the probed token: the probe is done.
    const lexedAgain = probe !== undefined && from < probe.offset ? probe : undefined;
    if (lexedAgain) lexedAgain.reset();
    else probe?.freeze(true);
    this.tokens = significantTokens(
      lex(this.src, from, this.view, false, lexedAgain),
      PARSER_TRIVIA
    );
    this.viewFrom = from;
    this.i = 0;
  }

  // ---- token rules --------------------------------------------------------------------

  private expect(k: number, ...also: number[]): number {
    if (this.probe !== undefined) this.tested([k, ...also]);
    if (this.kind() !== k) this.fail([k, ...also]);
    return this.i++;
  }

  private separator(): void {
    this.tested(LINE_END);
    const k = this.kind();
    if (k !== Kind.Newline && k !== T.Semi && k !== T.Eof) this.fail(LINE_END);
    this.i++;
  }

  private run(table: KindSet, want: readonly number[]): [string, Range] {
    this.tested(want);
    if (!inKindSet(table, this.kind())) this.fail(want);
    const from = this.i++;
    for (;;) {
      this.tested(want);
      if (!inKindSet(table, this.kind())) break;
      this.i++;
    }
    return [this.runText(from, this.i), this.span(from)];
  }

  private idString(): [string, Range] {
    return this.run(ID, [T.NodeString]);
  }

  private alphaNum(): [string, Range] {
    return this.run(ALPHANUM, [T.NodeString]);
  }

  /**
   * A label: a string (one Str/MdStr token) or a first text token, then more text tokens of
   * `part` (jison's left-recursive `text`).
   */
  private labelRun(
    part: KindSet,
    first: KindSet,
    want: readonly number[],
    strType: LabelType
  ): FlowLabelNode {
    const from = this.i;
    this.tested(want);
    const k = this.kind();
    let type: LabelType;
    if (k === T.Str || k === T.MdStr) type = k === T.Str ? strType : 'markdown';
    else if (inKindSet(first, k)) type = 'text';
    else return this.fail(want);
    this.i++;
    for (;;) {
      this.tested(want);
      if (!inKindSet(part, this.kind())) break;
      this.i++;
    }
    return { text: this.runText(from, this.i), type, range: this.span(from) };
  }

  private text(): FlowLabelNode {
    return this.labelRun(TEXT_PART, TEXT_PART, [T.Text, T.Str], 'string');
  }

  private edgeText(): FlowLabelNode {
    return this.labelRun(EDGE_PART, EDGE_PART, [T.EdgeText, T.Str], 'string');
  }

  private textNoTags(): FlowLabelNode {
    return this.labelRun(NO_TAGS, NO_TAGS, [T.NodeString, T.Str], 'text');
  }

  /** Consume an opener, remembered for errors until {@link closer}. */
  private open(what: string, close: string): void {
    this.opens.push({ range: this.range(this.i), what, closer: close });
    this.i++;
  }

  private closer(k: number): void {
    this.expect(k, T.Text);
    this.opens.pop();
  }

  // ---- shape data ---------------------------------------------------------------------

  private shapeData(): ShapeData {
    const { st, src } = this;
    const opener = this.range(this.i);
    this.i++;
    let built = '';
    let inString = false;
    let close: number;
    let blockOpener = opener;
    for (;;) {
      for (;;) {
        this.tested(SHAPE_DATA_PARTS);
        if (this.kind() !== T.ShapeData) break;
        const piece = this.raw();
        if (piece === '"' && this.end(this.i) === this.start(this.i) + 1) {
          inString = !inString;
          built += piece;
        } else built += inString ? piece.replace(/\n\s*/g, '<br/>') : piece;
        this.i++;
      }
      if (this.kind() !== T.ShapeDataEnd) {
        this.opens.push({ range: blockOpener, what: 'shape data', closer: '`}`' });
        this.fail([T.ShapeDataEnd]);
      }
      close = this.start(this.i);
      this.i++;
      // Blocks back to back (`A@{…}@{…}`) are one: v12's `shapeData` rule joins their texts.
      this.tested(SHAPE_DATA);
      if (this.kind() !== T.ShapeData) break;
      blockOpener = this.range(this.i);
      this.i++;
    }
    const whole: Range = { start: opener.start, end: close + 1 };
    const inner = { start: opener.end, end: close };
    // v12 parsed `{\n<data>\n}`; a `#` comment reads differently without those newlines.
    const inPlace = src.slice(inner.start, inner.end) === built && !built.includes('#');
    const multiline = built.includes('\n');
    const result = inPlace
      ? parseYaml(src, multiline ? inner : { start: opener.start + 1, end: whole.end })
      : parseYaml(multiline ? built + '\n' : `{\n${built}\n}`);
    for (const d of result.diagnostics) {
      const r = inPlace ? d.range : whole;
      if (d.severity === 'error') {
        st.diagnostics.error('SHAPE_DATA', d.message, r);
      } else st.diagnostics.warning(d.code, d.message, r);
    }
    // A semantic error: the tokens are fine, so parse on and report later errors in the same
    // statement too (R-PARSE-4). The node keeps no data.
    if (result.diagnostics.some((d) => d.severity === 'error'))
      return { value: null, range: whole };
    const value = result.value;
    return { value: isYamlMap(value) ? value : null, range: whole };
  }

  // ---- vertices and chains ------------------------------------------------------------

  /** A vertex's AST id is its first mention's: `n:<name>`. */
  private nodeAst(name: string): AstId {
    if (!this.st.astIds) return NO_AST_ID;
    return this.db.vertices.get(name)?.ast ?? nodeId(name);
  }

  /** A mention that may create the vertex: its definition when it does. */
  private nodeSymbol(name: string, r: Range): void {
    if (this.st.lean) return;
    const { db } = this;
    // An edge id (`e1@{ … }`) names the edge: v12 never makes it a vertex.
    if (this.namesEdge(name)) return this.edgeSymbol(name, r);
    const creates = !db.vertices.has(name) && name.trim() !== '';
    this.st.symbol(name, 'node', r, creates ? 'def' : 'ref');
  }

  /** Whether `name` is an edge id and no vertex's (`e1` after `A e1@--> B`). */
  private namesEdge(name: string): boolean {
    return !this.db.vertices.has(name) && this.db.hasEdge(name);
  }

  /** A `class` statement target: an edge mention when it names an edge (v12 `setClass`). */
  private classTarget(name: string, r: Range): void {
    if (this.st.lean) return;
    if (this.namesEdge(name)) this.edgeSymbol(name, r);
    else this.st.symbol(name, 'node', r, 'ref');
  }

  /**
   * A mention of the edge id `name` at `r`. A generated id (`L_B_D_0`) is made of its ends'
   * names, so each end also gets a node mention inside it: renaming the node then renames the
   * id with it, and the written id keeps naming the same edge (#170).
   */
  private edgeSymbol(name: string, r: Range): void {
    this.st.symbol(name, 'edge', r, 'ref');
    const edge = this.db.edgeNamed(name);
    if (!edge || edge.isUserDefinedId || this.src.slice(r.start, r.end) !== name) return;
    const { start, end } = edge;
    if (!name.startsWith(`L_${start}_${end}_`)) return;
    const from = r.start + 2;
    const to = from + start.length + 1;
    this.st.symbol(start, 'node', { start: from, end: from + start.length }, 'ref');
    this.st.symbol(end, 'node', { start: to, end: to + end.length }, 'ref');
  }

  private vertex(): FlowNodeStmt {
    const startTok = this.i;
    const [name, nameRange] = this.idString();
    this.nodeSymbol(name, nameRange);
    const node: FlowNodeStmt = {
      id: this.st.lean ? NO_AST_ID : this.ids.node(name),
      type: 'Node',
      range: nameRange,
      name,
      nameRange,
    };
    const parts = this.shape();
    this.db.addVertex(name, this.nodeAst(name), nameRange, parts);
    if (parts.type !== undefined) node.shape = parts.type;
    if (parts.label) node.label = parts.label;
    node.range = this.span(startTok);
    return node;
  }

  /** The bracketed shape and label after a node id, if any. */
  private shape(): VertexParts & { label?: FlowLabelNode } {
    this.tested(SHAPE_KINDS);
    const k = this.kind();
    const simple = SHAPES[k];
    if (simple) {
      this.open(simple[2], simple[3]);
      const label = this.text();
      this.closer(simple[1]);
      return { label, type: simple[0] };
    }
    if (k === T.PS || k === T.DiamondStart) {
      const round = k === T.PS;
      const close = round ? T.PE : T.DiamondStop;
      this.open('node label', round ? '`)`' : '`}`');
      this.tested(round ? PS_ONLY : DIAMOND_ONLY);
      if (this.kind() !== k) {
        const label = this.text();
        this.closer(close);
        return { label, type: round ? 'round' : 'diamond' };
      }
      this.open('node label', round ? '`)`' : '`}`');
      const label = this.text();
      this.closer(close);
      this.closer(close);
      return { label, type: round ? 'circle' : 'hexagon' };
    }
    if (k === T.VertexWithPropsStart) {
      this.open('node label', '`]`');
      const field = this.raw(this.expect(T.NodeString));
      this.expect(T.Colon);
      const value = this.raw(this.expect(T.NodeString));
      this.expect(T.Pipe);
      const label = this.text();
      this.closer(T.SQE);
      const props = Object.fromEntries([[field, value]]) as Record<string, string>;
      return { label, type: 'rect', props };
    }
    if (k === T.TrapStart || k === T.InvTrapStart) {
      const trap = k === T.TrapStart;
      this.open('node label', trap ? '`\\]` or `/]`' : '`/]` or `\\]`');
      const label = this.text();
      this.tested(TRAP_ENDS);
      if (this.kind() === (trap ? T.InvTrapEnd : T.TrapEnd)) {
        this.i++;
        this.opens.pop();
        return { label, type: trap ? 'lean_right' : 'lean_left' };
      }
      this.closer(trap ? T.TrapEnd : T.InvTrapEnd);
      return { label, type: trap ? 'trapezoid' : 'inv_trapezoid' };
    }
    return {};
  }

  private styledVertex(): FlowNodeStmt {
    const node = this.vertex();
    this.tested(STYLE_SEPARATOR);
    if (this.kind() === T.StyleSeparator) {
      this.i++;
      const [cls, r] = this.idString();
      this.st.symbol(cls, 'class', r, 'ref');
      this.db.setClass(node.name, cls);
      node.className = cls;
      node.range = { start: node.range.start, end: r.end };
    }
    return node;
  }

  private applyData(node: FlowNodeStmt, data: ShapeData): void {
    this.db.addVertex(node.name, this.nodeAst(node.name), data.range, { data: data.value });
    node.dataRange = data.range;
    node.range = { start: node.range.start, end: data.range.end };
  }

  /** `A`, `A@{…}`, `A & B & …`: the nodes, each also pushed to `chain`. */
  private node(chain: (FlowNodeStmt | FlowEdge)[]): FlowNodeStmt[] {
    const nodes = [this.styledVertex()];
    chain.push(nodes[0] as FlowNodeStmt);
    while (true) {
      const last = nodes[nodes.length - 1] as FlowNodeStmt;
      this.tested(SHAPE_DATA);
      const data = this.kind() === T.ShapeData ? this.shapeData() : undefined;
      this.tested(SPACE);
      if (this.kind() !== T.Space) {
        if (data !== undefined) this.applyData(last, data);
        return nodes;
      }
      do {
        this.i++;
        this.tested(SPACE);
      } while (this.kind() === T.Space);
      this.tested(AMP);
      if (this.kind() !== T.Amp) {
        // Blanks after shape data must lead to `&` (v12 drops them before a line break).
        if (data !== undefined)
          this.fail(
            [T.Amp],
            'after shape data `@{ … }` only `&` and another node may follow on the line'
          );
        return nodes;
      }
      this.i++;
      this.tested(SPACE);
      if (this.kind() !== T.Space) this.fail([T.Space]);
      do this.i++;
      while (this.kind() === T.Space);
      const next = this.styledVertex();
      if (data !== undefined) this.applyData(last, data);
      nodes.push(next);
      chain.push(next);
    }
  }

  private link(): [LinkInfo, Range, FlowLabelNode | undefined] {
    const from = this.i;
    let id: string | undefined;
    this.tested(LINK_KINDS);
    if (this.kind() === T.LinkId) {
      id = this.raw();
      const r = { start: this.start(this.i), end: this.end(this.i) - 1 };
      this.st.symbol(id.slice(0, -1), 'edge', r, 'def');
      this.i++;
    }
    this.tested(LINK_AFTER_ID);
    if (this.kind() === T.Link) {
      const info = destructLink(this.raw(this.i++));
      if (id !== undefined) info.id = id;
      let label: FlowLabelNode | undefined;
      this.tested(PIPE);
      if (this.kind() === T.Pipe) {
        this.open('edge label', '`|`');
        label = this.text();
        info.text = { text: label.text, type: label.type };
        this.closer(T.Pipe);
        this.tested(AFTER_EDGE_LABEL);
        if (this.kind() === T.Space) this.i++;
      }
      return [info, this.span(from), label];
    }
    if (this.kind() === T.StartLink) {
      const startText = this.raw();
      this.opens.push({
        range: this.range(this.i),
        what: 'edge label',
        closer: 'arrow such as `-->`',
      });
      this.i++;
      const label = this.edgeText();
      const end = this.raw(this.expect(T.Link, T.EdgeText));
      this.opens.pop();
      const info = destructLink(end, startText);
      info.text = { text: label.text, type: label.type };
      if (id !== undefined) info.id = id;
      return [info, this.span(from), label];
    }
    return this.fail([T.Link, T.StartLink]);
  }

  /**
   * Nodes joined by links, pushed to `chain` with an edge node per edge. Returns what v12
   * collected into an enclosing subgraph.
   */
  private vertexStatement(collect: boolean, chain: (FlowNodeStmt | FlowEdge)[]): string[] {
    const { db } = this;
    let stmt = this.node(chain);
    let names = stmt.map((n) => n.name);
    const first = names;
    // v12 collected `$3.concat($1)` per link, newest first: kept as parts, joined once.
    const later: string[][] = [];
    while (true) {
      this.tested(LINK_KINDS);
      const t = this.kind();
      if (t !== T.Link && t !== T.StartLink && t !== T.LinkId) {
        return later.length === 0 ? first : later.reverse().flat().concat(first);
      }
      const [info, linkRange, label] = this.link();
      const next = this.node(chain);
      const nextNames = next.map((n) => n.name);
      const before = db.edges.length;
      db.addLink(names, nextNames, info, this.edgeAst, linkRange);
      if (!this.st.lean) this.edgeNodes(chain, [stmt, next], before, linkRange, label);
      if (collect) later.push(nextNames);
      stmt = next;
      names = nextNames;
    }
  }

  /** The AST edge of each model edge from `before` on, between the nodes of `ends`. */
  private edgeNodes(
    chain: (FlowNodeStmt | FlowEdge)[],
    [stmt, next]: [FlowNodeStmt[], FlowNodeStmt[]],
    before: number,
    linkRange: Range,
    label: FlowLabelNode | undefined
  ): void {
    const { edges } = this.db;
    const fromOf = byName(stmt);
    const toOf = byName(next);
    for (let k = before; k < edges.length; k++) {
      const edge = edges[k] as (typeof edges)[number];
      const from = fromOf(edge.start);
      const to = toOf(edge.end);
      const ast: FlowEdge = {
        id: edge.ast,
        type: 'Edge',
        range: {
          start: from?.range.start ?? linkRange.start,
          end: to?.range.end ?? linkRange.end,
        },
        from: edge.start,
        to: edge.end,
        edgeId: edge.id,
        linkRange,
      };
      if (label) ast.label = label;
      chain.push(ast);
    }
  }

  // ---- other statements ---------------------------------------------------------------

  private style(): string {
    this.tested(STYLE_WANT);
    if (!inKindSet(STYLE_PART, this.kind())) this.fail([T.NodeString]);
    const from = this.i++;
    for (;;) {
      this.tested(STYLE_WANT);
      if (!inKindSet(STYLE_PART, this.kind())) break;
      this.i++;
    }
    return this.runText(from, this.i);
  }

  private stylesOpt(): string[] {
    const out = [this.style()];
    for (;;) {
      this.tested(COMMA);
      if (this.kind() !== T.Comma) break;
      this.i++;
      out.push(this.style());
    }
    return out;
  }

  /**
   * Each id of a comma list written at `r`, with its own range when the list is written as is
   * (else `r`): passed to `mention` and pushed to `out`.
   */
  private refs(
    list: string,
    r: Range,
    out: string[],
    mention: (part: string, r: Range) => void
  ): void {
    if (this.st.lean) return;
    let at = r.start;
    const exact = this.src.slice(r.start, r.end) === list;
    for (const part of list.split(',')) {
      mention(part, exact ? { start: at, end: at + part.length } : r);
      out.push(part);
      at += part.length + 1;
    }
  }

  private linkStyleStatement(): void {
    const { db } = this;
    const at = this.i;
    this.i++;
    this.expect(T.Space);
    const positions: string[] = [];
    this.tested(LINK_STYLE_INDEX);
    if (this.kind() === T.Default) positions.push(this.raw(this.i++));
    else {
      positions.push(this.raw(this.expect(T.Num, T.Default)));
      while (this.kind() === T.Comma) {
        this.i++;
        positions.push(this.raw(this.expect(T.Num)));
      }
    }
    this.expect(T.Space);
    this.tested(INTERPOLATE_OR_STYLE);
    if (this.kind() !== T.Interpolate) {
      const styles = this.stylesOpt();
      // An index error is semantic: the statement parses on (R-PARSE-4).
      db.updateLink(positions, styles, this.span(at));
      return;
    }
    this.i++;
    this.expect(T.Space);
    const [interpolate] = this.alphaNum();
    if (this.kind() === T.Space) {
      this.i++;
      const styles = this.stylesOpt();
      if (db.updateLinkInterpolate(positions, interpolate, this.span(at)))
        db.updateLink(positions, styles, this.span(at));
    } else db.updateLinkInterpolate(positions, interpolate, this.span(at));
  }

  /** A `"…"` value in a click statement (one Str token, as jison requires). */
  private expectStr(...also: number[]): string {
    if (this.probe !== undefined) this.tested([T.Str, ...also]);
    if (this.kind() !== T.Str) return this.fail([T.Str, ...also]);
    return this.labelRun(NONE, NONE, [T.Str], 'string').text;
  }

  /** `click …` and `call …`; returns the callback, for the AST. */
  private clickStatement(out: string[]): AstCallback | undefined {
    const { db } = this;
    const at = this.i;
    const id = this.raw(this.i++);
    // The token's own range: `range` would widen it over `click`.
    this.refs(id, { start: this.start(at), end: this.end(at) }, out, (part, pr) =>
      this.st.symbol(part, 'node', pr, 'ref')
    );
    this.tested(CLICK_ACTION);
    const k = this.kind();
    if (k === T.CallbackName) {
      const name = this.raw(this.i++);
      this.tested(CALLBACK_ARGS);
      const args = this.kind() === T.CallbackArgs ? this.raw(this.i++) : undefined;
      const tooltip = this.tooltip();
      db.setClickEvent(id, name, this.span(at), args);
      if (tooltip !== undefined) db.setTooltip(id, tooltip);
      return args === undefined
        ? { targets: id.split(','), name }
        : { targets: id.split(','), name, args };
    }
    let url: string;
    if (k === T.Href) {
      this.i++;
      url = this.expectStr();
    } else if (k === T.Str) url = this.expectStr();
    else {
      const [name] = this.alphaNum();
      const tooltip = this.tooltip();
      db.setClickEvent(id, name, this.span(at));
      if (tooltip !== undefined) db.setTooltip(id, tooltip);
      return { targets: id.split(','), name };
    }
    this.tested(SPACE);
    if (this.kind() !== T.Space) {
      db.setLink(id, url, this.span(at));
      return;
    }
    this.i++;
    this.tested(LINK_TARGET_OR_TOOLTIP);
    if (this.kind() === T.LinkTarget) {
      db.setLink(id, url, this.span(at), this.raw(this.i++));
      return;
    }
    const tooltip = this.expectStr(T.LinkTarget);
    if (this.kind() === T.Space) {
      this.i++;
      const target = this.raw(this.expect(T.LinkTarget));
      db.setLink(id, url, this.span(at), target);
    } else db.setLink(id, url, this.span(at));
    db.setTooltip(id, tooltip);
  }

  /** An optional ` "tooltip"` after a callback. */
  private tooltip(): string | undefined {
    this.tested(SPACE);
    if (this.kind() !== T.Space) return undefined;
    this.i++;
    return this.expectStr();
  }

  /** A statement with no name of its own, as an AST node in `out`; nothing in a lean parse. */
  private simple(
    k: FlowSimpleKind,
    from: number,
    refsOut: string[],
    out: FlowStatementNode[],
    callback?: AstCallback
  ): void {
    if (this.st.lean) return;
    const r = this.span(from);
    const name = k.charAt(0).toLowerCase() + k.slice(1);
    this.st.statement(name, r);
    const stmt: FlowSimpleStmt = { id: this.ids.statement(name), type: k, range: r, refs: refsOut };
    if (callback !== undefined) stmt.callback = callback;
    out.push(stmt);
  }

  /** A chain of nodes and links, as an AST node in `out`; nothing in a lean parse. */
  private chainNode(from: number, chain: (FlowNodeStmt | FlowEdge)[], out: FlowStatementNode[]) {
    if (this.st.lean) return;
    const r = this.span(from);
    this.st.statement('chain', r);
    out.push({ id: this.ids.statement('chain'), type: 'Chain', range: r, children: chain });
  }

  /** One statement. Returns what v12's grammar adds to an enclosing subgraph's list. */
  private statement(collect: boolean, out: FlowStatementNode[]): DocItem {
    const { db, st } = this;
    this.tested(STATEMENT_KINDS);
    const t = this.kind();
    this.hint = STATEMENT_HINTS[t];
    const from = this.i;
    const refList: string[] = [];
    switch (t) {
      case T.Embed:
        return this.embedStatement(out);
      case T.Style: {
        this.i++;
        this.expect(T.Space);
        const [id, r] = this.idString();
        this.nodeSymbol(id, r);
        refList.push(id);
        this.expect(T.Space);
        const styles = this.stylesOpt();
        db.addVertex(id, this.nodeAst(id), r, { styles });
        this.simple('Style', from, refList, out);
        this.separator();
        return NO_ITEMS;
      }
      case T.LinkStyle:
        this.linkStyleStatement();
        this.simple('LinkStyle', from, refList, out);
        this.separator();
        return NO_ITEMS;
      case T.ClassDef: {
        this.i++;
        this.expect(T.Space);
        const [id, r] = this.idString();
        this.expect(T.Space);
        const styles = this.stylesOpt();
        this.refs(id, r, refList, (part, pr) => st.symbol(part, 'class', pr, 'def'));
        db.addClass(id, styles);
        this.simple('ClassDef', from, refList, out);
        this.separator();
        return NO_ITEMS;
      }
      case T.Class: {
        this.i++;
        this.expect(T.Space);
        const [targets, r] = this.idString();
        this.expect(T.Space);
        const [cls, cr] = this.idString();
        this.refs(targets, r, refList, (part, pr) => this.classTarget(part, pr));
        st.symbol(cls, 'class', cr, 'ref');
        refList.push(cls);
        db.setClass(targets, cls);
        this.simple('Class', from, refList, out);
        this.separator();
        return NO_ITEMS;
      }
      case T.Click: {
        this.simple('Click', from, refList, out, this.clickStatement(refList));
        this.separator();
        return NO_ITEMS;
      }
      case T.DirectionTB:
      case T.DirectionBT:
      case T.DirectionRL:
      case T.DirectionLR:
      case T.DirectionTD:
        this.i++;
        this.simple('Direction', from, refList, out);
        return { stmt: 'dir', value: DIRECTIONS[t - T.DirectionTB] ?? 'TB' };
      case T.AccTitle: {
        this.i++;
        const value = this.raw(this.expect(T.AccTitleValue)).trim();
        db.setAccTitle(value);
        this.simple('AccTitle', from, refList, out);
        return value;
      }
      case T.AccDescr: {
        this.i++;
        const value = this.raw(this.expect(T.AccDescrValue)).trim();
        db.setAccDescription(value);
        this.simple('AccDescr', from, refList, out);
        return value;
      }
      case T.AccDescrMultilineValue: {
        const value = this.raw(this.i++).trim();
        db.setAccDescription(value);
        this.simple('AccDescr', from, refList, out);
        return value;
      }
      default: {
        if (!inKindSet(ID, t)) this.fail(STATEMENT_START);
        const chain: (FlowNodeStmt | FlowEdge)[] = [];
        const nodes = this.vertexStatement(collect, chain);
        this.chainNode(from, chain, out);
        this.separator();
        return nodes;
      }
    }
  }

  /**
   * `mermaid id["Title"] {` body `}` (ADR-15): a vertex with the block's id, and the block in
   * the parse result. The body is one token; the host never reads it.
   */
  private embedStatement(out: FlowStatementNode[]): DocItem {
    const { db, st } = this;
    const from = this.i;
    this.hint = 'write it as `mermaid <id>["Title"] {`, then the diagram, then `}` on its own line';
    this.i++;
    this.expect(T.Space);
    const [name, nameRange] = this.idString();
    this.nodeSymbol(name, nameRange);
    let title: FlowLabelNode | undefined;
    this.tested(SQS_ONLY);
    if (this.kind() === T.SQS) {
      this.open('block title', '`]`');
      title = this.text();
      this.closer(T.SQE);
    }
    this.tested(SPACE);
    while (this.kind() === T.Space) this.i++;
    const opener = this.range(from, this.i);
    this.expect(T.EmbedOpen);
    const body = this.expect(T.EmbedBody);
    const bodyRange = { start: this.start(body), end: this.end(body) };
    this.tested(EMBED_END);
    if (this.kind() !== T.EmbedEnd) {
      st.diagnostics.error(
        'UNCLOSED',
        `Unclosed block: the \`mermaid ${name}\` block at line ${this.lineOf(opener.start)} has no closing \`}\`. Add \`}\` on its own line to close it.`,
        opener
      );
      throw STOP;
    }
    this.i++;
    const label = title && { text: title.text, type: title.type };
    db.addVertex(name, this.nodeAst(name), nameRange, {
      type: 'embed',
      label: label ?? { text: '', type: 'text' },
    });
    const text = title ? (db.vertices.get(name)?.text ?? '') : undefined;
    db.addEmbed(
      {
        id: name,
        ...(text ? { title: text } : {}),
        text: this.src.slice(bodyRange.start, bodyRange.end),
        offset: bodyRange.start,
      },
      nameRange
    );
    const r = this.span(from);
    st.statement('embed', r);
    const stmt: FlowEmbedStmt = {
      id: this.ids.statement('embed'),
      type: 'Embed',
      range: r,
      name,
      nameRange,
      bodyRange,
    };
    if (title) stmt.title = title;
    out.push(stmt);
    this.separator();
    return [name];
  }

  // ---- subgraphs and the document -----------------------------------------------------

  private subgraphHeader(): void {
    const from = this.i;
    const opener = this.range(from);
    this.i++;
    let id: FlowLabelNode | undefined;
    let title: FlowLabelNode | undefined;
    // A header error still opens the subgraph, so its `end` closes it (R-PARSE-4: one error,
    // one diagnostic) and the body stays inside it.
    let failed = false;
    try {
      this.tested(SUBGRAPH_HEADER);
      const t = this.kind();
      if (t === Kind.Newline || t === T.Semi || t === T.Eof) {
        this.i++;
      } else {
        this.expect(T.Space, ...LINE_END);
        id = this.textNoTags();
        title = id;
        this.tested(SUBGRAPH_TITLE);
        if (this.kind() === T.SQS) {
          this.open('subgraph title', '`]`');
          title = this.text();
          this.closer(T.SQE);
        }
        this.tested(LINE_END);
        const k = this.kind();
        if (k !== Kind.Newline && k !== T.Semi && k !== T.Eof) this.fail([...LINE_END, T.SQS]);
        this.i++;
      }
    } catch (e) {
      if (e !== STOP) throw e;
      failed = true;
    }
    const { frames, maxDepth } = this;
    const start = this.start(from);
    const frame: Frame = {
      id,
      title,
      list: this.list,
      collect: this.collect,
      start,
      opener,
      span: this.st.beginStatement('subgraph', start),
      children: [],
      outer: this.body,
    };
    frames.push(frame);
    this.list = [];
    this.collect = true;
    this.body = frame.children;
    if (frames.length === maxDepth + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Subgraphs are nested ${frames.length} deep here, over the limit of ${maxDepth}. The limit is set by the page or app that renders the diagram.`,
        opener
      );
    }
    if (failed) throw STOP;
  }

  private closeSubgraph(frame: Frame, end: number): void {
    const { db, st, ids } = this;
    // Each opening gets its own AST id (`s:A`, then `s:A@2`); the model keeps the first.
    let opening: AstId | undefined;
    const sgId = db.addSubGraph(
      frame.id,
      this.list,
      frame.title,
      (name) => (opening = ids.subgraph(name))
    );
    if (frame.id) {
      const named = frame.id === frame.title && /\s/.test(frame.title.text) ? undefined : frame.id;
      if (named) {
        const written = this.src.slice(named.range.start, named.range.end);
        const start = named.range.start + (written.length - written.trimStart().length);
        st.symbol(sgId, 'subgraph', { start, end: start + written.trim().length }, 'def');
      }
    }
    st.endStatement(frame.span, end);
    const sg = db.subgraph(sgId);
    const node: FlowSubgraph = {
      id: opening ?? sg?.ast ?? ids.subgraph(sgId),
      type: 'Subgraph',
      range: { start: frame.start, end },
      name: sgId,
      children: frame.children,
    };
    if (frame.title) node.title = frame.title;
    frame.outer.push(node);
    this.body = frame.outer;
    this.list = frame.list;
    this.collect = frame.collect;
    if (this.collect) this.list.push(sgId);
  }

  private document(): void {
    const { frames, st, src } = this;
    while (true) {
      this.tested(frames.length > 0 ? SUBGRAPH_DOC_KINDS : DOC_KINDS);
      const t = this.kind();
      if (t === Kind.EOF) break;
      try {
        if (t === T.End) this.closeEnd();
        else if (t === T.Semi || t === Kind.Newline || t === T.Space || t === T.Eof) {
          if (this.collect) this.list.push(this.raw());
          this.i++;
        } else if (t === T.Subgraph) {
          this.hint =
            'write a subgraph as `subgraph id`, or `subgraph id [title]`, on its own line';
          this.subgraphHeader();
        } else {
          const item = this.statement(this.collect, this.body);
          if (this.collect && (!Array.isArray(item) || item.length > 0)) this.list.push(item);
        }
      } catch (e) {
        if (e !== STOP) throw e;
        this.recover();
      }
    }
    while (frames.length > 0) {
      const frame = frames[frames.length - 1] as Frame;
      st.diagnostics.error(
        'UNCLOSED_SUBGRAPH',
        `Unclosed subgraph: the subgraph opened at line ${this.lineOf(frame.opener.start)} has no \`end\`. Add \`end\` to close it.`,
        frame.opener,
        {
          related: [
            { message: 'The text ends here.', range: { start: src.length, end: src.length } },
          ],
        }
      );
      frames.pop();
      this.closeSubgraph(frame, src.length);
    }
  }

  /** `end`: closes the innermost subgraph. */
  private closeEnd(): void {
    const frame = this.frames.pop();
    if (frame !== undefined) {
      this.i++;
      this.closeSubgraph(frame, this.tokEnd(this.i - 1));
      return;
    }
    const at = this.start(this.i);
    this.st.diagnostics.error(
      'UNEXPECTED_END',
      'Unexpected `end`: there is no open subgraph to close. Remove it, or add a `subgraph` above.',
      { start: at, end: at + 3 }
    );
    this.i++;
  }

  private header(): void {
    const { db, st } = this;
    for (;;) {
      this.tested(HEADER_START);
      const k = this.kind();
      if (k !== T.Space && k !== Kind.Newline) break;
      this.i++;
    }
    const from = this.i;
    try {
      this.tested(GRAPH);
      if (this.kind() !== T.Graph)
        this.fail([T.Graph], 'a flowchart starts with `flowchart` or `graph` and a direction');
      this.i++;
      this.tested(DIR_KINDS);
      if (this.kind() === T.NoDir) {
        this.i++;
        db.setDirection('TB');
      } else {
        if (this.kind() === Kind.Error) this.unknownDirection();
        const dir = this.raw(this.expect(T.Dir, T.NoDir));
        this.tested(AFTER_DIR);
        let t = this.kind();
        if (t === T.Space) {
          do {
            this.i++;
            this.tested(BLANKS);
          } while (this.kind() === T.Space);
          t = this.kind();
          if (t !== Kind.Newline) this.fail([Kind.Newline]);
        } else if (t !== T.Semi && t !== Kind.Newline) this.fail(LINE_END);
        this.i++;
        db.setDirection(dir);
      }
      const r = { start: this.start(from), end: this.end(from + 1) };
      if (this.kind(from + 1) === T.NoDir) r.end = this.end(from);
      st.statement('header', r);
      const h: FlowHeader = {
        id: this.ids.statement('header'),
        type: 'Header',
        range: r,
        keyword: this.raw(from),
        direction: db.direction,
      };
      this.children.push(h);
    } catch (e) {
      if (e !== STOP) throw e;
      this.recover();
    }
  }

  /** The word after `graph` that is no direction. */
  private unknownDirection(): never {
    const { src } = this;
    let w = this.start(this.i);
    while (w < src.length && /\s/.test(src[w] ?? '')) w++;
    let e = w;
    while (e < src.length && !/\s/.test(src[e] ?? '')) e++;
    // A direction was expected across the word, which may lex as several tokens.
    const { probe, tokens } = this;
    if (probe !== undefined) {
      for (let j = this.i; j < tokens.length && this.start(j) < e; j++) {
        if (probe.isAt(tokens, j, this.viewFrom)) probe.tested(DIR_KINDS, this.start(j));
      }
    }
    this.st.diagnostics.error(
      'UNKNOWN_DIRECTION',
      `Unknown direction \`${src.slice(w, e)}\`: use TB, TD, BT, LR or RL (or \`>\`, \`<\`, \`^\`, \`v\`).`,
      { start: w, end: e },
      { expected: EXPECTED.names([T.Dir]) }
    );
    throw STOP;
  }
}

/** A fix hint for common slips, from the text found where the error is. */
function hintFor(text: string): string | undefined {
  if (/^\s*[-=.<>ox~]+\s*$/.test(text) && /[-=.~]/.test(text)) {
    return 'links are written like `-->`, `---`, `-.->`, `==>` or `~~~`';
  }
  return undefined;
}

export type { SourceView };
