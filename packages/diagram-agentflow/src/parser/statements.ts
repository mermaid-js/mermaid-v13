/** The agentflow parser's rules for vertices, links, chains and the one-line statements. */
import { inKindSet, nodeId } from '@mermaid-js/core/parser-kit';
import type { AstCallback, AstId, Range } from '@mermaid-js/core/parser-kit';
import {
  AFTER_EDGE_LABEL,
  AFTER_FLOW_ID,
  AFTER_TITLE,
  AMP,
  byName,
  CALLBACK_ARGS,
  CLICK_ACTION,
  COMMA,
  CONNECTOR_SPACE,
  DIAMOND_ONLY,
  DIRECTIONS,
  ID,
  INTERPOLATE_OR_STYLE,
  LINE_END,
  LINE_END_SET,
  LINK_AFTER_ID,
  LINK_KINDS,
  LINK_STYLE_INDEX,
  LINK_TARGET_OR_TOOLTIP,
  NO_ITEMS,
  NONE,
  PIPE,
  PS_ONLY,
  SHAPE_DATA,
  SHAPE_KINDS,
  SHAPES,
  SPACE,
  STATEMENT_HINTS,
  STATEMENT_KINDS,
  STATEMENT_START,
  STYLE_PART,
  STYLE_SEPARATOR,
  STYLE_WANT,
  TRAP_ENDS,
} from './tables.ts';
import type { ShapeData } from './tables.ts';
import { ParserBase } from './base.ts';
import type {
  AgentflowConnectorStmt,
  AgentflowEdge,
  AgentflowLabelNode,
  AgentflowNodeStmt,
  AgentflowSimpleKind,
  AgentflowSimpleStmt,
  AgentflowStatementNode,
} from './ast.ts';
import { destructLink } from './model.ts';
import type { DocItem, LinkInfo, VertexParts } from './model.ts';
import { RESERVED_ID } from './shapes.ts';
import { T } from './tokens.ts';

/** Vertices, chains and the statements other than blocks. */
export abstract class StatementParser extends ParserBase {
  // ---- vertices and chains ------------------------------------------------------------

  /** A vertex's AST id is its record's: `n:<name>`. */
  protected nodeAst(name: string): AstId {
    return this.db.vertices.get(name)?.ast ?? nodeId(name);
  }

  /** A mention that may create the vertex: its definition when it does. */
  protected nodeSymbol(name: string, r: Range): void {
    const { db } = this;
    // An edge id (`e1@{ … }`) names the edge: v12 never makes it a vertex.
    if (this.namesEdge(name)) return this.edgeSymbol(name, r);
    const creates =
      !db.vertices.has(name) && !db.flow(name) && name.trim() !== '' && name !== RESERVED_ID;
    this.st.symbol(name, 'node', r, creates ? 'def' : 'ref');
  }

  /**
   * Once the text is read: the mentions of the reserved `connectors` id leave the symbols when
   * no `connector connectors` or `flow connectors` takes it (also one written after them). v12
   * makes no node of it, so it is no symbol: renaming it would make one.
   */
  protected dropUnclaimedReserved(): void {
    const { symbols } = this.st;
    if (this.db.reservedClaimed() || !symbols.some((s) => s.name === RESERVED_ID)) return;
    const kept = symbols.filter(
      (s) => s.name !== RESERVED_ID || (s.kind !== 'node' && s.kind !== 'subgraph')
    );
    symbols.length = 0;
    symbols.push(...kept);
  }

  /** Whether `name` is an edge id and no vertex's (`e1` after `A e1@--> B`). */
  protected namesEdge(name: string): boolean {
    return !this.db.vertices.has(name) && this.db.hasEdge(name);
  }

  /** A `class` statement target: an edge mention when it names an edge (v12 `setClass`). */
  protected classTarget(name: string, r: Range): void {
    if (this.namesEdge(name)) this.edgeSymbol(name, r);
    else this.st.symbol(name, 'node', r, 'ref');
  }

  /**
   * A mention of the edge id `name` at `r`. A generated id (`L_B_D_0`) is made of its ends'
   * names, so each end also gets a node mention inside it: renaming the node then renames the
   * id with it, and the written id keeps naming the same edge (#170).
   */
  protected edgeSymbol(name: string, r: Range): void {
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

  protected vertex(): AgentflowNodeStmt {
    const startTok = this.i;
    const [name, nameRange] = this.idString();
    this.nodeSymbol(name, nameRange);
    const node: AgentflowNodeStmt = {
      id: this.ids.node(name),
      type: 'Node',
      range: nameRange,
      name,
      nameRange,
    };
    const shapeFrom = this.i;
    const parts: VertexParts & { label?: AgentflowLabelNode } = this.shape();
    if (parts.type !== undefined) parts.shapeAt = this.span(shapeFrom);
    this.db.addVertex(name, this.nodeAst(name), nameRange, parts);
    if (parts.type !== undefined) node.shape = parts.type;
    if (parts.label) node.label = parts.label;
    node.range = this.span(startTok);
    return node;
  }

  /** The bracketed shape and label after a node id, if any. */
  protected shape(): VertexParts & { label?: AgentflowLabelNode } {
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

  protected styledVertex(): AgentflowNodeStmt {
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

  protected applyData(node: AgentflowNodeStmt, data: ShapeData): void {
    this.db.addVertex(node.name, this.nodeAst(node.name), data.range, { data: data.value });
    node.dataRange = data.range;
    node.range = { start: node.range.start, end: data.range.end };
  }

  /** `A`, `A@{…}`, `A & B & …`: the nodes, each also pushed to `chain`. */
  protected node(chain: (AgentflowNodeStmt | AgentflowEdge)[]): AgentflowNodeStmt[] {
    const nodes = [this.styledVertex()];
    chain.push(nodes[0] as AgentflowNodeStmt);
    for (;;) {
      const last = nodes[nodes.length - 1] as AgentflowNodeStmt;
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
        // Blanks after metadata must lead to `&` (v12 drops them before a line break).
        if (data !== undefined)
          this.fail(
            [T.Amp],
            'after metadata `@{ … }` only `&` and another node may follow on the line'
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

  protected link(): [LinkInfo, Range, AgentflowLabelNode | undefined] {
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
      let label: AgentflowLabelNode | undefined;
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
   * collected into an enclosing block.
   */
  protected vertexStatement(
    collect: boolean,
    chain: (AgentflowNodeStmt | AgentflowEdge)[]
  ): string[] {
    const { db, ids } = this;
    let stmt = this.node(chain);
    let names = stmt.map((n) => n.name);
    const first = names;
    // v12 collected `$3.concat($1)` per link, newest first: kept as parts, joined once.
    const later: string[][] = [];
    for (;;) {
      this.tested(LINK_KINDS);
      const t = this.kind();
      if (t !== T.Link && t !== T.StartLink && t !== T.LinkId) {
        return later.length === 0 ? first : [...later.reverse().flat(), ...first];
      }
      const [info, linkRange, label] = this.link();
      const next = this.node(chain);
      const nextNames = next.map((n) => n.name);
      const before = db.edges.length;
      db.addLink({
        starts: names,
        ends: nextNames,
        info,
        astFor: (a, b) => ids.edge(a, b),
        at: linkRange,
      });
      const fromOf = byName(stmt);
      const toOf = byName(next);
      for (let k = before; k < db.edges.length; k++) {
        const edge = db.edges[k] as (typeof db.edges)[number];
        const from = fromOf(edge.start);
        const to = toOf(edge.end);
        const ast: AgentflowEdge = {
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
      if (collect) later.push(nextNames);
      stmt = next;
      names = nextNames;
    }
  }

  // ---- other statements ---------------------------------------------------------------

  protected style(): string {
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

  protected stylesOpt(): string[] {
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
  protected refs(
    list: string,
    r: Range,
    out: string[],
    mention: (part: string, r: Range) => void
  ): void {
    let at = r.start;
    const exact = this.src.slice(r.start, r.end) === list;
    for (const part of list.split(',')) {
      mention(part, exact ? { start: at, end: at + part.length } : r);
      out.push(part);
      at += part.length + 1;
    }
  }

  protected linkStyleStatement(): void {
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
  protected expectStr(...also: number[]): string {
    if (this.probe !== undefined) this.tested([T.Str, ...also]);
    if (this.kind() !== T.Str) return this.fail([T.Str, ...also]);
    return this.labelRun(NONE, NONE, [T.Str], 'string').text;
  }

  /** `click …` and `call …`; returns the callback, for the AST. */
  protected clickStatement(out: string[]): AstCallback | undefined {
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
      return this.callback(id, at, name, args);
    }
    let url: string;
    if (k === T.Href) {
      this.i++;
      url = this.expectStr();
    } else if (k === T.Str) url = this.expectStr();
    else return this.callback(id, at, this.alphaNum()[0]);
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

  /** `click id name(args) "tooltip"`, from the name on: the callback, for the AST. */
  protected callback(id: string, at: number, name: string, args?: string): AstCallback {
    const { db } = this;
    const tooltip = this.tooltip();
    db.setClickEvent(id, name, this.span(at), args);
    if (tooltip !== undefined) db.setTooltip(id, tooltip);
    return args === undefined
      ? { targets: id.split(','), name }
      : { targets: id.split(','), name, args };
  }

  /** An optional ` "tooltip"` after a callback. */
  protected tooltip(): string | undefined {
    this.tested(SPACE);
    if (this.kind() !== T.Space) return undefined;
    this.i++;
    return this.expectStr();
  }

  /** `connector id`, `connector id[title]`, each with optional metadata: its id. */
  protected connectorStatement(out: AgentflowStatementNode[]): DocItem {
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
  protected trimmed(r: Range): Range {
    const written = this.src.slice(r.start, r.end);
    const start = r.start + (written.length - written.trimStart().length);
    return { start, end: start + written.trim().length };
  }

  protected simple(k: AgentflowSimpleKind, from: number, refsOut: string[]): AgentflowSimpleStmt {
    const r = this.span(from);
    const name = k.charAt(0).toLowerCase() + k.slice(1);
    this.st.statement(name, r);
    return { id: this.ids.statement(name), type: k, range: r, refs: refsOut };
  }

  /** One statement. Returns what v12's grammar adds to an enclosing block's list. */
  protected statement(collect: boolean, out: AgentflowStatementNode[]): DocItem {
    const { db, st } = this;
    this.tested(STATEMENT_KINDS);
    const t = this.kind();
    this.hint = STATEMENT_HINTS[t];
    const from = this.i;
    const refList: string[] = [];
    switch (t) {
      case T.Style: {
        this.i++;
        this.expect(T.Space);
        const [id, r] = this.idString();
        this.nodeSymbol(id, r);
        refList.push(id);
        this.expect(T.Space);
        const styles = this.stylesOpt();
        db.addVertex(id, this.nodeAst(id), r, { styles });
        out.push(this.simple('Style', from, refList));
        this.separator();
        return NO_ITEMS;
      }
      case T.LinkStyle:
        this.linkStyleStatement();
        out.push(this.simple('LinkStyle', from, refList));
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
        out.push(this.simple('ClassDef', from, refList));
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
        out.push(this.simple('Class', from, refList));
        this.separator();
        return NO_ITEMS;
      }
      case T.Click: {
        const callback = this.clickStatement(refList);
        const stmt = this.simple('Click', from, refList);
        if (callback !== undefined) stmt.callback = callback;
        out.push(stmt);
        this.separator();
        return NO_ITEMS;
      }
      case T.Connector:
        return this.connectorStatement(out);
      case T.DirectionTB:
      case T.DirectionBT:
      case T.DirectionRL:
      case T.DirectionLR:
      case T.DirectionTD:
        // The token runs to the line end, a `%%` before `direction` included (jison's
        // `.*direction` rules run before the comment rule).
        this.i++;
        out.push(this.simple('Direction', from, refList));
        return { stmt: 'dir', value: DIRECTIONS[t - T.DirectionTB] ?? 'TB' };
      case T.AccTitle: {
        this.i++;
        const value = this.raw(this.expect(T.AccTitleValue)).trim();
        db.setAccTitle(value);
        out.push(this.simple('AccTitle', from, refList));
        return value;
      }
      case T.AccDescr: {
        this.i++;
        const value = this.raw(this.expect(T.AccDescrValue)).trim();
        db.setAccDescription(value);
        out.push(this.simple('AccDescr', from, refList));
        return value;
      }
      case T.AccDescrMultilineValue: {
        const value = this.raw(this.i++).trim();
        db.setAccDescription(value);
        out.push(this.simple('AccDescr', from, refList));
        return value;
      }
      default: {
        if (!inKindSet(ID, t)) this.fail(STATEMENT_START);
        const chain: (AgentflowNodeStmt | AgentflowEdge)[] = [];
        const nodes = this.vertexStatement(collect, chain);
        const r = this.span(from);
        st.statement('chain', r);
        out.push({ id: this.ids.statement('chain'), type: 'Chain', range: r, children: chain });
        this.separator();
        return nodes;
      }
    }
  }
}
