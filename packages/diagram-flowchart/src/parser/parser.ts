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
 *
 * The rules flowchart shares with the grammars cut from it (tokens, errors and recovery,
 * vertices, links, chains, the one-line statements, the header) are the flow family's
 * (`@mermaid-js/shared/parser/flow`); here are flowchart's own: its tables, `subgraph … end`,
 * how it reads `@{ … }`, and the parse.
 */
// cspell:words kepano LALR
import { Kind } from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  ParseState,
  Range,
} from '@mermaid-js/core/parser-kit';
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import { isYamlMap } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { flowBuilderLimits, FlowParser, flowTables } from '@mermaid-js/shared/parser/flow';
import type { FlowDocItem, FlowParserDialect, FlowShapeData } from '@mermaid-js/shared/parser/flow';
import type {
  FlowDocument,
  FlowEmbedStmt,
  FlowLabelNode,
  FlowOwnStmt,
  FlowStatementNode,
  FlowSubgraph,
} from './ast.ts';
import { flowSourceView, lex } from './lexer.ts';
import { destructLink, FlowBuilder } from './model.ts';
import type { FlowModel } from './model.ts';
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

const TABLES = /* @__PURE__ */ flowTables(T, {
  keywords: [T.Subgraph],
  separators: [],
  starts: [T.Embed],
  expected: [
    ['`{` at the end of the line', [T.EmbedOpen]],
    ['`}` on its own line, closing the block', [T.EmbedEnd]],
  ],
  names: {
    separator: 'a line break or `;`',
    header: '`graph` or `flowchart`',
    statement: 'a statement such as `style`, `classDef`, `class`, `click` or `subgraph`',
    data: 'shape data',
  },
  hints: {},
  linkHint: 'links are written like `-->`, `---`, `-.->`, `==>` or `~~~`',
});
const { LINE_END } = TABLES;
const SUBGRAPH_TITLE = [T.SQS, ...LINE_END];
const SPACE = [T.Space];
const SQS_ONLY = [T.SQS];
const EMBED_END = [T.EmbedEnd];

/**
 * What the parser reads past besides spaces: comments, directives and the `click` keyword
 * (jison has no token for it, so `click` heads no statement: the node id after it does). The
 * completion facet reads a statement's head past the same kinds.
 */
export const READ_PAST = TABLES.READ_PAST;

/** What the flow family's parser needs of flowchart. */
const DIALECT: FlowParserDialect<FlowBuilder, FlowParseOptions> = {
  kinds: T,
  tables: TABLES,
  view: (src, pre) =>
    flowSourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    ),
  lex,
  builder: (options, diagnostics) =>
    new FlowBuilder({
      ...flowBuilderLimits(options),
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
      warn: (code, message, range) => {
        diagnostics.warning(code, message, range);
      },
    }),
  destructLink,
  // v12 12.3.0's `node shapeData spaceList` (D621); swimlane-beta shares it.
  blanksAfterData: true,
};

interface Frame {
  id: FlowLabelNode | undefined;
  title: FlowLabelNode | undefined;
  list: FlowDocItem[];
  collect: boolean;
  start: number;
  opener: Range;
  span: ReturnType<ParseState['beginStatement']>;
  children: FlowStatementNode[];
  outer: FlowStatementNode[];
}

/** Parse a flowchart. Never throws: problems are error diagnostics. */
export function parseFlowchart(src: string, options: FlowParseOptions = {}): FlowParseResult {
  return new FlowchartParser(src, options).parse();
}

/** One parse: flowchart's own rules. */
class FlowchartParser extends FlowParser<FlowBuilder, FlowParseOptions, FlowOwnStmt, Frame> {
  constructor(src: string, options: FlowParseOptions) {
    super(src, options, DIALECT);
  }

  parse(): FlowParseResult {
    const { st, db } = this;
    this.header('a flowchart starts with `flowchart` or `graph` and a direction');
    this.document();
    db.finish();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const result = this.result(db.model(warnings));
    if (db.embeds.length > 0) result.embeds = db.embeds;
    result.edgeCount = result.model.edges.length;
    return result;
  }

  /** `end` takes the blanks and line breaks after it: its range is the word. */
  protected override tokEnd(j: number): number {
    if (this.kind(j) === T.End) return this.start(j) + 3;
    return super.tokEnd(j);
  }

  /** Shape data: a block that is no map, or does not parse, gives the node no data. */
  protected shapeData(): FlowShapeData {
    const block = this.dataBlock();
    const { whole } = block;
    const result = this.readData(block, block.opener.start + 1);
    this.reportData(result.diagnostics, block.inPlace, whole);
    if (result.diagnostics.some((d) => d.severity === 'error'))
      return { value: null, range: whole };
    const value = result.value;
    return { value: isYamlMap(value) ? value : null, range: whole };
  }

  // ---- embedded blocks ----------------------------------------------------------------

  protected override ownStatement(t: number, out: FlowStatementNode[]): FlowDocItem | undefined {
    return t === T.Embed ? this.embedStatement(out) : undefined;
  }

  /**
   * `mermaid id["Title"] {` body `}` (ADR-15): a vertex with the block's id, and the block in
   * the parse result. The body is one token; the host never reads it.
   */
  private embedStatement(out: FlowStatementNode[]): FlowDocItem {
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
      // The block is a mention of its node (D69), as state's is: `n:<id>`, or `@2` after one.
      id: this.ids.node(name),
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

  // ---- subgraphs ----------------------------------------------------------------------

  protected block(t: number): boolean {
    if (t !== T.Subgraph) return false;
    this.hint = 'write a subgraph as `subgraph id`, or `subgraph id [title]`, on its own line';
    this.subgraphHeader();
    return true;
  }

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
      this.tested(TABLES.BLOCK_HEADER);
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

  protected closeOpenBlocks(): void {
    const { frames, st, src } = this;
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
  protected closeEnd(): void {
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
}
