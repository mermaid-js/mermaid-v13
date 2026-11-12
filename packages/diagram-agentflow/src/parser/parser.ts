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
 * agentflow's (`flow`, `global`, the header), as above; vertex and statement rules moved to
 * `statements.ts`, the token helpers to `base.ts`.
 * cspell:ignore kepano
 */
import { inKindSet, Kind, STOP } from '@mermaid-js/core/parser-kit';
import type { AstId, Range } from '@mermaid-js/core/parser-kit';
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import {
  AFTER_DIR,
  AFTER_FLOW_ID,
  AFTER_TITLE,
  BLANKS,
  BLOCK_DOC_KINDS,
  DIR_KINDS,
  DOC_KINDS,
  EXPECTED,
  FLOW_HEADER,
  GRAPH,
  HEADER_START,
  LINE_END,
  LINE_END_SET,
} from './tables.ts';
import type { Frame, ShapeData } from './tables.ts';
import { StatementParser } from './statements.ts';
import type { AgentflowParseOptions, AgentflowParseResult } from './base.ts';
import type {
  AgentflowDocument,
  AgentflowFlow,
  AgentflowGlobal,
  AgentflowHeader,
  AgentflowLabelNode,
} from './ast.ts';
import { T } from './tokens.ts';

export type { AgentflowParseOptions, AgentflowParseResult } from './base.ts';
export { READ_PAST } from './tables.ts';

/** Parse an agentflow. Never throws: problems are error diagnostics. */
export function parseAgentflow(
  src: string,
  options: AgentflowParseOptions = {}
): AgentflowParseResult {
  return new AgentflowParser(src, options).parse();
}

/** The block rules, the document and the header. */
class AgentflowParser extends StatementParser {
  parse(): AgentflowParseResult {
    const { st, db, src, options } = this;
    this.header();
    this.document();
    db.finish((at) => this.lineOf(at));
    this.dropUnclaimedReserved();
    // In source order (blocks left open are reported at the end, innermost first).
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = db.model(warnings, this.pre.frontMatter?.title);
    if (model.callbacks.length > 0 && !options.claims?.includes('callbacks')) {
      const first = model.callbacks[0];
      const d = st.diagnostics.warning(
        'CALLBACK_IGNORED',
        '`click … callback` and `call` are ignored: install the interactions plugin to run callbacks.',
        first?.range ?? { start: 0, end: 0 }
      );
      model.warnings.push(d);
    }
    const ast: AgentflowDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.fullTokens, options, this.probe);
  }

  // ---- flows, globals and the document ------------------------------------------------

  /**
   * `flow`, `flow id`, `flow id[title]`, each of the named ones with optional metadata, then a
   * separator. A header error still opens the flow, so its `end` closes it (R-PARSE-4: one
   * error, one diagnostic) and the body stays inside it.
   */
  protected flowHeader(): void {
    const from = this.i;
    const opener = this.range(from);
    this.i++;
    let id: AgentflowLabelNode | undefined;
    let title: AgentflowLabelNode | undefined;
    let data: ShapeData | undefined;
    let failed = false;
    try {
      this.tested(FLOW_HEADER);
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
  protected globalHeader(): void {
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

  protected openFrame(
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

  protected closeFrame(frame: Frame, end: number): void {
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

  protected closeFlow(frame: Frame, end: number): string {
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

  protected document(): void {
    const { frames, st, src } = this;
    for (;;) {
      this.tested(frames.length > 0 ? BLOCK_DOC_KINDS : DOC_KINDS);
      const t = this.kind();
      if (t === Kind.EOF) break;
      try {
        if (t === T.End) this.closeEnd();
        else if (t === T.Semi || t === Kind.Newline || t === T.Space || t === T.Eof) {
          if (this.collect) this.list.push(this.raw());
          this.i++;
        } else if (t === T.Comment) this.i++;
        else if (t === T.Flow) {
          this.hint =
            'write a flow as `flow`, `flow id` or `flow id[title]`, with optional metadata `@{ … }`, on its own line';
          this.flowHeader();
        } else if (t === T.Global) {
          this.hint =
            'write `global` on its own line, and the nodes it holds on the lines after it';
          this.globalHeader();
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

  protected header(): void {
    const { db, st } = this;
    for (;;) {
      this.tested(HEADER_START);
      const k = this.kind();
      if (k !== T.Space && k !== Kind.Newline && k !== T.Comment) break;
      this.i++;
    }
    const from = this.i;
    try {
      this.tested(GRAPH);
      if (this.kind() !== T.Graph)
        this.fail([T.Graph], 'an agentflow starts with `agentflow-beta` and an optional direction');
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
        } else if (!inKindSet(LINE_END_SET, t) || t === T.Eof)
          this.fail([T.Semi, Kind.Newline, T.Comment]);
        this.i++;
        db.setDirection(dir);
      }
      const r = { start: this.start(from), end: this.end(from + 1) };
      if (this.kind(from + 1) === T.NoDir) r.end = this.end(from);
      st.statement('header', r);
      const h: AgentflowHeader = {
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

  /** The word after `agentflow-beta` that is no direction. */
  protected unknownDirection(): never {
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
    if (src.startsWith('%%', w)) {
      // v12's direction state has no comment rule: `agentflow-beta %% …` is a lexical error.
      this.st.diagnostics.error(
        'HEADER_COMMENT',
        'A comment cannot follow `agentflow-beta` on its line unless a direction comes first: put the comment on its own line, or write `agentflow-beta TB %% …`.',
        { start: w, end: this.lineBreakAfter(w) },
        { expected: EXPECTED.names([T.Dir, T.NoDir]) }
      );
      throw STOP;
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
