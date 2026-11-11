/**
 * Agentflow parser: recursive descent over the lexer's tokens (`lexer.ts`), producing an
 * {@link AgentflowModel}, the typed AST, symbols, statement spans and diagnostics (DESIGN §4.3).
 *
 * Written from a copy of v13 flowchart's parser (D467), cut down by the diff between v12's
 * `agentflow.jison` and `flow.jison`: `flow … end` (named, titled, with `@{ … }`, or
 * anonymous), `global … end` and `connector` replace `subgraph`; a `%%` comment is a token that
 * ends a statement (jison's `COMMENT` is a `separator` and a `line`); links are `-->`, `--x`,
 * `-.-` and `-- text -->`. It accepts and rejects what jison does, but does not stop at the
 * first error: it reports it, skips to the next statement boundary and carries on (R-PARSE-4).
 * An unclosed label or string, which swallows the rest of the text, is reported at its opener
 * and lexing restarts on the following line.
 *
 * Flowchart's parser is ported from Pele's `src/diagrams/flowchart/parser.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano). Changed: the block rules are
 * agentflow's (`flow`, `global`, `connector`), as above; the rules agentflow shares with
 * flowchart (tokens, errors and recovery, vertices, links, chains, the one-line statements, the
 * header) are the flow family's (`@mermaid-js/shared/parser/flow`). Here are agentflow's own:
 * the `maxTextSize` source view (`source.ts`), its ranges over directives and blanks, v12's
 * `@{ … }` reading (its trailing commas, D464), AST ids for every mention (D468) and the
 * reserved `connectors` id (D464).
 * cspell:ignore kepano
 */
import {
  inKindSet,
  isSpace,
  LBRACE,
  localOffset,
  SourceOffsets,
  STOP,
} from '@mermaid-js/core/parser-kit';
import type { AstId, ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import { isYamlMap, parseYaml } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { flowBuilderLimits, FlowParser } from '@mermaid-js/shared/parser/flow';
import type {
  FlowDocItem,
  FlowNodeStmt,
  FlowParserDialect,
  FlowShapeData,
} from '@mermaid-js/shared/parser/flow';
import { AFTER_FLOW_ID, AFTER_TITLE, CONNECTOR_SPACE, TABLES } from './tables.ts';
import type { Frame } from './tables.ts';
import type {
  AgentflowConnectorStmt,
  AgentflowDocument,
  AgentflowFlow,
  AgentflowGlobal,
  AgentflowLabelNode,
  AgentflowStatementNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import { AgentflowBuilder, destructLink } from './model.ts';
import type { AgentflowModel, VertexParts } from './model.ts';
import { RESERVED_ID } from './shapes.ts';
import { agentflowSourceView } from './source.ts';
import { stripLineTrailingCommas } from './trailing-commas.ts';
import { T } from './tokens.ts';

export interface AgentflowParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /**
   * v12's `maxTextSize` (the site config's): past it v12 parsed the text without its comments
   * (`agentflowSourceView`).
   */
  maxTextSize?: number;
  /** Edge cap (core `DEFAULT_LIMITS.maxEdges`; v12's `maxEdges` was 500). */
  maxEdges?: number;
  /** Vertex cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number;
  /** Flow nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
  /** v12 `flowchart.inheritDir`, which agentflow reads (D466). */
  inheritDir?: boolean;
  /** Features claimed by extension plugins; `callbacks` silences `CALLBACK_IGNORED`. */
  claims?: readonly string[];
}

export type AgentflowParseResult = ParseResult<AgentflowModel, AgentflowDocument>;

const { LINE_END, LINE_END_SET } = TABLES;

/** What the flow family's parser needs of agentflow. */
const DIALECT: FlowParserDialect<AgentflowBuilder, AgentflowParseOptions> = {
  kinds: T,
  tables: TABLES,
  view: (src, pre, options) =>
    agentflowSourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range),
      options.maxTextSize
    ),
  lex,
  builder: (options, diagnostics) =>
    new AgentflowBuilder({
      ...flowBuilderLimits(options),
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
      warn: (code, message, range, extra) => {
        const { related, astIds } = extra ?? {};
        const d = diagnostics.warning(code, message, range, related ? { related } : undefined);
        // Core's render `Warning` keeps `astIds` (and drops `related`): `AgentflowParseWarning`.
        if (astIds) Object.assign(d, { astIds });
      },
    }),
  destructLink,
};

/** The nodes agentflow adds to the family's statements. */
type OwnNode = AgentflowFlow | AgentflowGlobal | AgentflowConnectorStmt;

/** Parse an agentflow. Never throws: problems are error diagnostics. */
export function parseAgentflow(
  src: string,
  options: AgentflowParseOptions = {}
): AgentflowParseResult {
  return new AgentflowParser(src, options).parse();
}

/** One parse: agentflow's own rules. */
class AgentflowParser extends FlowParser<AgentflowBuilder, AgentflowParseOptions, OwnNode, Frame> {
  /** Text offsets to source offsets, for {@link keywordBefore}; made on first use. */
  private offsets: SourceOffsets | undefined;
  /** Directive starts by their end, for ranges over the blanks around them. */
  private directiveAt: Map<number, number> | undefined;

  constructor(src: string, options: AgentflowParseOptions) {
    super(src, options, DIALECT);
  }

  parse(): AgentflowParseResult {
    const { st, db } = this;
    this.header('an agentflow starts with `agentflow-beta` and an optional direction');
    this.document();
    db.finish((at) => this.lineOf(at));
    this.dropUnclaimedReserved();
    // In source order (blocks left open are reported at the end, innermost first).
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    return this.result(db.model(warnings, this.pre.frontMatter?.title));
  }

  // ---- tokens -------------------------------------------------------------------------

  /**
   * The source start of `word`, then blanks (with `{` and more blanks when `brace`), that end
   * at `at` in the text v12 lexed (a directive may stand anywhere in them), if they are there.
   */
  protected override keywordBefore(at: number, word: string, brace: boolean): number | undefined {
    const { view } = this;
    const t = view.text;
    let b = localOffset(view, at);
    while (b > 0 && isSpace(t.charCodeAt(b - 1))) b--;
    if (brace) {
      if (t.charCodeAt(b - 1) !== LBRACE) return undefined;
      b--;
      while (b > 0 && isSpace(t.charCodeAt(b - 1))) b--;
    }
    const i = b - word.length;
    if (i < 0 || !t.startsWith(word, i)) return undefined;
    if (!view.runs) return i;
    // One cursor per parse: the tokens come in source order, so its walks add up to one pass.
    this.offsets ??= new SourceOffsets(view.runs);
    return this.offsets.source(i);
  }

  /** The end of the text before the blanks (and directives) that end at `at`. */
  private blanksAfter(from: number, at: number): number {
    const { src } = this;
    let e = at;
    for (;;) {
      while (e > from && (src[e - 1] === ' ' || src[e - 1] === '\t')) e--;
      const d = (this.directiveAt ??= new Map(
        this.pre.directives.map((x) => [x.range.end, x.range.start])
      )).get(e);
      if (d === undefined || d < from) return e;
      e = d;
    }
  }

  protected override tokEnd(j: number): number {
    const k = this.kind(j);
    // `end` and `global` take the blanks after them (`[ \t]*`).
    if (k === T.End || k === T.Global) return this.blanksAfter(this.start(j), this.end(j));
    return super.tokEnd(j);
  }

  protected override found(j = this.i): string {
    return this.kind(j) === T.Comment ? 'a comment' : super.found(j);
  }

  // ---- metadata -----------------------------------------------------------------------

  /**
   * `@{ … }`, read as v12 read it: blocks back to back are one, a newline in a string is
   * `<br/>`, one line is read as `{ … }`, several as block YAML, retried once without the
   * commas that end a line when that fails (v12's trailing-comma retry, D464).
   */
  protected shapeData(): FlowShapeData {
    const block = this.dataBlock();
    const { built, whole } = block;
    // One line is read from the opener's `{` (a directive may stand between `@` and `{`).
    let result = this.readData(block, block.opener.end - 1);
    let ranged = block.inPlace;
    const failed = (r: typeof result) => r.diagnostics.some((d) => d.severity === 'error');
    if (failed(result) && block.multiline) {
      const stripped = stripLineTrailingCommas(built);
      if (stripped !== built) {
        const retry = parseYaml(stripped + '\n');
        if (!failed(retry)) {
          result = retry;
          ranged = false;
        }
      }
    }
    this.reportData(result.diagnostics, ranged, whole);
    // The element keeps no data.
    if (failed(result)) return { value: null, range: whole };
    const value = result.value;
    // v12 read an empty document as `{}`.
    return { value: isYamlMap(value) ? value : {}, range: whole };
  }

  // ---- vertices -----------------------------------------------------------------------

  /** A flow's id and the reserved `connectors` id make no vertex. */
  protected override creates(name: string): boolean {
    return super.creates(name) && !this.db.flow(name) && name !== RESERVED_ID;
  }

  /** Every mention has its own AST id (D468), and a bracket shape the range it is written at. */
  protected override mentionParts(
    node: FlowNodeStmt,
    parts: VertexParts,
    shapeFrom?: number
  ): VertexParts {
    if (shapeFrom !== undefined && parts.type !== undefined) parts.shapeAt = this.span(shapeFrom);
    return { ...parts, mention: node.id };
  }

  /**
   * Once the text is read: the mentions of the reserved `connectors` id leave the symbols when
   * no `connector connectors` or `flow connectors` takes it (also one written after them). v12
   * makes no node of it, so it is no symbol: renaming it would make one.
   */
  private dropUnclaimedReserved(): void {
    const { symbols } = this.st;
    if (this.db.reservedClaimed() || !symbols.some((s) => s.name === RESERVED_ID)) return;
    const kept = symbols.filter(
      (s) => s.name !== RESERVED_ID || (s.kind !== 'node' && s.kind !== 'subgraph')
    );
    symbols.length = 0;
    symbols.push(...kept);
  }

  // ---- connectors ---------------------------------------------------------------------

  protected override ownStatement(
    t: number,
    out: AgentflowStatementNode[]
  ): FlowDocItem | undefined {
    return t === T.Connector ? this.connectorStatement(out) : undefined;
  }

  /** `connector id`, `connector id[title]`, each with optional metadata: its id. */
  private connectorStatement(out: AgentflowStatementNode[]): FlowDocItem {
    const { db, st } = this;
    const from = this.i;
    this.i++;
    this.tested(CONNECTOR_SPACE);
    this.expect(T.Space);
    const id = this.textNoTags();
    let title: AgentflowLabelNode | undefined;
    this.tested(AFTER_FLOW_ID);
    if (this.kind() === T.SQS) {
      this.open('connector title', '`]`');
      title = this.text();
      this.closer(T.SQE);
    }
    this.tested(AFTER_TITLE);
    const data = this.kind() === T.ShapeData ? this.shapeData() : undefined;
    this.tested(LINE_END);
    if (!inKindSet(LINE_END_SET, this.kind()))
      this.fail(data || title ? LINE_END : [...LINE_END, T.SQS, T.ShapeData]);
    const name = id.text.trim();
    const nameRange = this.trimmed(id.range);
    const replacing = name !== '' && db.vertices.has(name) && !db.isConnector(name);
    const ast = this.ids.node(name);
    if (name !== '')
      st.symbol(name, 'node', nameRange, db.vertices.has(name) && !replacing ? 'ref' : 'def');
    const sid = db.addConnector(name, title?.text ?? '', ast, nameRange);
    if (data !== undefined && sid !== '') db.addVertex(sid, ast, data.range, { data: data.value });
    const r = this.span(from);
    st.statement('connector', r);
    const node: AgentflowConnectorStmt = { id: ast, type: 'Connector', range: r, name, nameRange };
    if (title) node.title = title;
    if (data) node.dataRange = data.range;
    out.push(node);
    this.separator();
    return sid;
  }

  /** `range` without the blanks around its text. */
  private trimmed(r: Range): Range {
    const written = this.src.slice(r.start, r.end);
    const start = r.start + (written.length - written.trimStart().length);
    return { start, end: start + written.trim().length };
  }

  // ---- flows and globals --------------------------------------------------------------

  protected block(t: number): boolean {
    if (t === T.Comment) this.i++;
    else if (t === T.Flow) {
      this.hint =
        'write a flow as `flow`, `flow id` or `flow id[title]`, with optional metadata `@{ … }`, on its own line';
      this.flowHeader();
    } else if (t === T.Global) {
      this.hint = 'write `global` on its own line, and the nodes it holds on the lines after it';
      this.globalHeader();
    } else return false;
    return true;
  }

  /**
   * `flow`, `flow id`, `flow id[title]`, each of the named ones with optional metadata, then a
   * separator. A header error still opens the flow, so its `end` closes it (R-PARSE-4: one
   * error, one diagnostic) and the body stays inside it.
   */
  private flowHeader(): void {
    const from = this.i;
    const opener = this.range(from);
    this.i++;
    let id: AgentflowLabelNode | undefined;
    let title: AgentflowLabelNode | undefined;
    let data: FlowShapeData | undefined;
    let failed = false;
    try {
      this.tested(TABLES.BLOCK_HEADER);
      if (!inKindSet(LINE_END_SET, this.kind())) {
        this.expect(T.Space, ...LINE_END);
        id = this.textNoTags();
        this.tested(AFTER_FLOW_ID);
        if (this.kind() === T.SQS) {
          this.open('flow title', '`]`');
          title = this.text();
          this.closer(T.SQE);
        }
        this.tested(AFTER_TITLE);
        if (this.kind() === T.ShapeData) data = this.shapeData();
        this.tested(LINE_END);
        if (!inKindSet(LINE_END_SET, this.kind()))
          this.fail(data || title ? LINE_END : [...LINE_END, T.SQS, T.ShapeData]);
      }
      this.i++;
    } catch (e) {
      if (e !== STOP) throw e;
      failed = true;
    }
    this.openFrame('flow', from, opener, { id, title, data, failed });
    if (failed) throw STOP;
  }

  /** `global`, then a separator. */
  private globalHeader(): void {
    const from = this.i;
    const opener = this.range(from);
    this.i++;
    let failed = false;
    try {
      this.separator();
    } catch (e) {
      if (e !== STOP) throw e;
      failed = true;
    }
    this.openFrame('global', from, opener, { failed });
    if (failed) throw STOP;
  }

  private openFrame(
    kind: Frame['kind'],
    from: number,
    opener: Range,
    head: Pick<Frame, 'failed'> & Partial<Pick<Frame, 'id' | 'title' | 'data'>>
  ): void {
    const { id, title, data, failed } = head;
    const { frames, maxDepth } = this;
    const start = this.start(from);
    const frame: Frame = {
      kind,
      failed,
      id,
      title,
      data,
      list: this.list,
      collect: this.collect,
      start,
      opener: { start: opener.start, end: this.i > from ? this.tokEnd(this.i - 1) : opener.end },
      span: this.st.beginStatement(kind, start),
      children: [],
      outer: this.body,
    };
    // The opener a diagnostic points at: the header up to its separator.
    if (kind === 'flow') {
      const k = this.kind(this.i - 1);
      if (inKindSet(LINE_END_SET, k) && this.i - 1 > from)
        frame.opener.end = this.tokEnd(this.i - 2);
    } else frame.opener = opener;
    frames.push(frame);
    this.list = [];
    this.collect = true;
    this.body = frame.children;
    if (frames.length === maxDepth + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Flows are nested ${frames.length} deep here, over the limit of ${maxDepth}. The limit is set by the page or app that renders the diagram.`,
        frame.opener
      );
    }
  }

  private closeFrame(frame: Frame, end: number): void {
    const { db, st, ids } = this;
    st.endStatement(frame.span, end);
    let item: string | undefined;
    if (frame.kind === 'global') {
      db.addGlobal(this.list);
      const node: AgentflowGlobal = {
        id: ids.statement('global'),
        type: 'Global',
        range: { start: frame.start, end },
        children: frame.children,
      };
      frame.outer.push(node);
    } else item = this.closeFlow(frame, end);
    this.body = frame.outer;
    this.list = frame.list;
    this.collect = frame.collect;
    if (this.collect && item !== undefined) this.list.push(item);
  }

  private closeFlow(frame: Frame, end: number): string {
    const { db, st, ids } = this;
    // Each opening gets its own AST id (`s:A`, then `s:A@2`); the model keeps the first.
    let opening: AstId | undefined;
    // `flow id` has an empty title; `flow id[title]` the bracketed one.
    const title =
      frame.id === undefined
        ? undefined
        : (frame.title ?? { text: '', type: 'text' as const, range: frame.opener });
    const fid = db.addFlow({
      id: frame.id,
      list: this.list,
      title,
      opener: frame.opener,
      astFor: (name) => (opening = ids.subgraph(name)),
    });
    if (frame.id) st.symbol(fid, 'subgraph', this.trimmed(frame.id.range), 'def');
    // v12 applied the header's metadata once the flow existed, at its `end`.
    if (frame.data)
      db.addVertex(fid, opening ?? ids.subgraph(fid), frame.data.range, { data: frame.data.value });
    const flow = db.flow(fid);
    const node: AgentflowFlow = {
      id: opening ?? flow?.ast ?? ids.subgraph(fid),
      type: 'Flow',
      range: { start: frame.start, end },
      name: fid,
      openerRange: frame.opener,
      children: frame.children,
    };
    if (frame.title) node.title = frame.title;
    if (frame.data) node.dataRange = frame.data.range;
    frame.outer.push(node);
    return fid;
  }

  protected closeOpenBlocks(): void {
    const { frames, st, src } = this;
    while (frames.length > 0) {
      const frame = frames[frames.length - 1] as Frame;
      if (!frame.failed)
        st.diagnostics.error(
          'UNCLOSED_BLOCK',
          `Unclosed ${frame.kind}: the \`${frame.kind}\` opened at line ${this.lineOf(frame.opener.start)} has no \`end\`. Add \`end\` to close it.`,
          frame.opener,
          {
            related: [
              { message: 'The text ends here.', range: { start: src.length, end: src.length } },
            ],
          }
        );
      frames.pop();
      this.closeFrame(frame, src.length);
    }
  }

  /** `end`: closes the innermost flow or global block. */
  protected closeEnd(): void {
    const frame = this.frames.pop();
    if (frame !== undefined) {
      this.i++;
      this.closeFrame(frame, this.tokEnd(this.i - 1));
      return;
    }
    const at = this.start(this.i);
    this.st.diagnostics.error(
      'UNEXPECTED_END',
      'Unexpected `end`: there is no open `flow` or `global` to close. Remove it, or add a `flow` above.',
      { start: at, end: at + 3 }
    );
    this.i++;
    // The rest of the statement (`end --> a`) is part of the same mistake.
    throw STOP;
  }

  /** v12's direction state has no comment rule: `agentflow-beta %% …` is a lexical error. */
  protected override notDirection(w: number): void {
    if (!this.src.startsWith('%%', w)) return;
    this.st.diagnostics.error(
      'HEADER_COMMENT',
      'A comment cannot follow `agentflow-beta` on its line unless a direction comes first: put the comment on its own line, or write `agentflow-beta TB %% …`.',
      { start: w, end: this.lineBreakAfter(w) },
      { expected: TABLES.EXPECTED.names([T.Dir, T.NoDir]) }
    );
    throw STOP;
  }
}
