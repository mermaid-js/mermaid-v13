/**
 * The flow family parser's grammar rules: vertices, links, chains, the one-line statements,
 * the header and the document loop. A diagram's parser extends {@link FlowParser} with its
 * block rules (flowchart's `subgraph`; agentflow's `flow`, `global` and `connector`), how it
 * reads `@{ … }`, and its `parse()`.
 *
 * The descent follows Pele's port of v12's `flow.jison` (`src/diagrams/flowchart/parser.ts` at
 * 3a2f075, https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano). Changes from Pele are
 * listed in `flow-parser-base.ts`.
 */
// cspell:words kepano
import { inKindSet, Kind, nodeId } from '@mermaid-js/core/parser-kit';
import { STOP } from './support.ts';
import type {
  AstCallback,
  AstId,
  AstNode,
  Diagnostic,
  LeanParseResult,
  ParseResult,
  Range,
} from '@mermaid-js/core/parser-kit';
import type {
  FlowChainStmt,
  FlowEdge,
  FlowHeader,
  FlowLabelNode,
  FlowNodeStmt,
  FlowSimpleKind,
  FlowSimpleStmt,
  FlowStatement,
} from './flow-ast.ts';
import { FlowParserBase } from './flow-parser-base.ts';
import type {
  FlowDocItem,
  FlowLinkInfo,
  FlowParseOptionsBase,
  FlowParserBuilder,
  FlowShapeData,
  FlowVertexParts,
} from './flow-parser-base.ts';
import { FLOW_DIRECTIONS, NO_ITEMS } from './flow-tables.ts';

/** `NO_AST_ID`: the id a lean parse without ids gives where only `data-ast` reads one. */
const NO_ID: AstId = '';

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

/** A vertex's bracketed shape and label. */
type FlowShapeParts = FlowVertexParts & { label?: FlowLabelNode };

/** What the family's `parse()` tail needs of a model. */
interface FlowModelLike {
  readonly callbacks: readonly { readonly range?: Range }[];
  readonly warnings: Diagnostic[];
}

/** The rules every dialect has. */
export abstract class FlowParser<
  B extends FlowParserBuilder,
  O extends FlowParseOptionsBase,
  X extends AstNode<string>,
  F,
> extends FlowParserBase<B, O, X, F> {
  // ---- what a dialect writes ----------------------------------------------------------

  /**
   * The dialect's own block or line at the cursor, whose first token has the kind `t`: whether
   * it read one. A block header pushes a frame; a line that is no statement is skipped.
   */
  protected abstract block(t: number): boolean;

  /** `end` at the cursor: close the innermost block, or report that none is open. */
  protected abstract closeEnd(): void;

  /** The text ended: close the blocks still open, each with its diagnostic. */
  protected abstract closeOpenBlocks(): void;

  /**
   * A statement of the dialect's own that starts with the kind `t` (the cursor is on it): what
   * v12's grammar adds to an enclosing block's list for it, or `undefined` when `t` starts
   * none.
   */
  protected ownStatement(_t: number, _out: FlowStatement<X>[]): FlowDocItem | undefined {
    return undefined;
  }

  /** Whether a mention of the unknown `name` makes a vertex: not a blank one. */
  protected creates(name: string): boolean {
    return name.trim() !== '';
  }

  /**
   * What a mention `node` hands the builder: `parts`, to which a dialect may add where they
   * were written (`shapeFrom` is the first token of the shape, when the mention may have one).
   */
  protected mentionParts(
    _node: FlowNodeStmt,
    parts: FlowVertexParts,
    _shapeFrom?: number
  ): FlowVertexParts {
    return parts;
  }

  /** The word at the source offset `at`, after the header keyword, is no direction. */
  protected notDirection(_at: number): void {
    // Nothing more to say than `UNKNOWN_DIRECTION`.
  }

  // ---- vertices and chains ------------------------------------------------------------

  /** A vertex's AST id is its first mention's: `n:<name>`. */
  protected nodeAst(name: string): AstId {
    if (!this.st.astIds) return NO_ID;
    return this.db.vertices.get(name)?.ast ?? nodeId(name);
  }

  /** A mention that may create the vertex: its definition when it does. */
  protected nodeSymbol(name: string, r: Range): void {
    if (this.st.lean) return;
    // An edge id (`e1@{ … }`) names the edge: v12 never makes it a vertex.
    if (this.namesEdge(name)) return this.edgeSymbol(name, r);
    const creates = !this.db.vertices.has(name) && this.creates(name);
    this.st.symbol(name, 'node', r, creates ? 'def' : 'ref');
  }

  /** Whether `name` is an edge id and no vertex's (`e1` after `A e1@--> B`). */
  private namesEdge(name: string): boolean {
    return !this.db.vertices.has(name) && this.db.hasEdge(name);
  }

  /** A `class` statement target: an edge mention when it names an edge (v12 `setClass`). */
  private classTarget(name: string, r: Range): void {
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
      id: this.st.lean ? NO_ID : this.ids.node(name),
      type: 'Node',
      range: nameRange,
      name,
      nameRange,
    };
    const shapeFrom = this.i;
    const parts = this.shape();
    this.db.addVertex(
      name,
      this.nodeAst(name),
      nameRange,
      this.mentionParts(node, parts, shapeFrom)
    );
    if (parts.type !== undefined) node.shape = parts.type;
    if (parts.label) node.label = parts.label;
    node.range = this.span(startTok);
    return node;
  }

  /** The bracketed shape and label after a node id, if any. */
  private shape(): FlowShapeParts {
    const { T, tb } = this;
    this.tested(tb.SHAPE_KINDS);
    const k = this.kind();
    const simple = tb.SHAPES[k];
    if (simple) {
      this.open(simple[2], simple[3]);
      const label = this.text();
      this.closer(simple[1]);
      return { label, type: simple[0] };
    }
    if (k === T.PS || k === T.DiamondStart) return this.nestedShape(k);
    if (k === T.VertexWithPropsStart) return this.propsShape();
    if (k === T.TrapStart || k === T.InvTrapStart) return this.trapShape(k);
    return {};
  }

  /** `(…)` and `{…}`, or doubled: `((…))` and `{{…}}`. The cursor is on the opener `k`. */
  private nestedShape(k: number): FlowShapeParts {
    const { T, tb } = this;
    const round = k === T.PS;
    const close = round ? T.PE : T.DiamondStop;
    const closeText = round ? '`)`' : '`}`';
    this.open('node label', closeText);
    this.tested(round ? tb.PS_ONLY : tb.DIAMOND_ONLY);
    if (this.kind() !== k) {
      const label = this.text();
      this.closer(close);
      return { label, type: round ? 'round' : 'diamond' };
    }
    this.open('node label', closeText);
    const label = this.text();
    this.closer(close);
    this.closer(close);
    return { label, type: round ? 'circle' : 'hexagon' };
  }

  /** `[field:value|label]`; the cursor is on its opener. */
  private propsShape(): FlowShapeParts {
    const { T } = this;
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

  /** `[/…\]`, `[\…/]`, `[/…/]` and `[\…\]`; the cursor is on the opener `k`. */
  private trapShape(k: number): FlowShapeParts {
    const { T, tb } = this;
    const trap = k === T.TrapStart;
    this.open('node label', trap ? '`\\]` or `/]`' : '`/]` or `\\]`');
    const label = this.text();
    this.tested(tb.TRAP_ENDS);
    if (this.kind() !== (trap ? T.InvTrapEnd : T.TrapEnd)) {
      this.closer(trap ? T.TrapEnd : T.InvTrapEnd);
      return { label, type: trap ? 'trapezoid' : 'inv_trapezoid' };
    }
    this.i++;
    this.opens.pop();
    return { label, type: trap ? 'lean_right' : 'lean_left' };
  }

  private styledVertex(): FlowNodeStmt {
    const node = this.vertex();
    this.tested(this.tb.STYLE_SEPARATOR);
    if (this.kind() === this.T.StyleSeparator) {
      this.i++;
      const [cls, r] = this.idString();
      this.st.symbol(cls, 'class', r, 'ref');
      this.db.setClass(node.name, cls);
      node.className = cls;
      node.range = { start: node.range.start, end: r.end };
    }
    return node;
  }

  private applyData(node: FlowNodeStmt, data: FlowShapeData): void {
    this.db.addVertex(
      node.name,
      this.nodeAst(node.name),
      data.range,
      this.mentionParts(node, { data: data.value })
    );
    node.dataRange = data.range;
    node.range = { start: node.range.start, end: data.range.end };
  }

  /** `A`, `A@{…}`, `A & B & …`: the nodes, each also pushed to `chain`. */
  private node(chain: (FlowNodeStmt | FlowEdge)[]): FlowNodeStmt[] {
    const { T, tb } = this;
    const nodes = [this.styledVertex()];
    chain.push(nodes[0] as FlowNodeStmt);
    for (;;) {
      const last = nodes[nodes.length - 1] as FlowNodeStmt;
      const data = this.shapeDataOpt();
      this.tested(tb.SPACE);
      const more = this.kind() === T.Space && this.ampersand(data !== undefined);
      const next = more ? this.styledVertex() : undefined;
      if (data !== undefined) this.applyData(last, data);
      if (next === undefined) return nodes;
      nodes.push(next);
      chain.push(next);
    }
  }

  private shapeDataOpt(): FlowShapeData | undefined {
    this.tested(this.tb.SHAPE_DATA);
    return this.kind() === this.T.ShapeData ? this.shapeData() : undefined;
  }

  /**
   * The blanks at the cursor and a ` & ` after them: whether another node follows. `afterData`
   * is whether the node before had `@{ … }`, which only `&` may follow on its line.
   */
  private ampersand(afterData: boolean): boolean {
    const { T, tb } = this;
    do {
      this.i++;
      this.tested(tb.SPACE);
    } while (this.kind() === T.Space);
    this.tested(tb.AMP);
    if (this.kind() !== T.Amp) {
      // Blanks after `@{ … }` must lead to `&` (v12 drops them before a line break).
      if (afterData)
        this.fail(
          [T.Amp],
          `after ${tb.dataName} \`@{ … }\` only \`&\` and another node may follow on the line`
        );
      return false;
    }
    this.i++;
    this.tested(tb.SPACE);
    if (this.kind() !== T.Space) this.fail([T.Space]);
    do this.i++;
    while (this.kind() === T.Space);
    return true;
  }

  private link(): [FlowLinkInfo, Range, FlowLabelNode | undefined] {
    const { T, tb } = this;
    const from = this.i;
    let id: string | undefined;
    this.tested(tb.LINK_KINDS);
    if (this.kind() === T.LinkId) {
      id = this.raw();
      const r = { start: this.start(this.i), end: this.end(this.i) - 1 };
      this.st.symbol(id.slice(0, -1), 'edge', r, 'def');
      this.i++;
    }
    this.tested(tb.LINK_AFTER_ID);
    if (this.kind() === T.Link) {
      const info = this.dialect.destructLink(this.raw(this.i++));
      if (id !== undefined) info.id = id;
      let label: FlowLabelNode | undefined;
      this.tested(tb.PIPE);
      if (this.kind() === T.Pipe) {
        this.open('edge label', '`|`');
        label = this.text();
        info.text = { text: label.text, type: label.type };
        this.closer(T.Pipe);
        this.tested(tb.AFTER_EDGE_LABEL);
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
      const info = this.dialect.destructLink(end, startText);
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
  private vertexStatement(collect: boolean, chain: (FlowNodeStmt | FlowEdge)[]): string[] {
    const { db, ids, T, tb } = this;
    let stmt = this.node(chain);
    let names = stmt.map((n) => n.name);
    const first = names;
    // v12 collected `$3.concat($1)` per link, newest first: kept as parts, joined once.
    const later: string[][] = [];
    for (;;) {
      this.tested(tb.LINK_KINDS);
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
        astFor: this.st.astIds ? (a, b) => ids.edge(a, b) : () => NO_ID,
        at: linkRange,
      });
      if (!this.st.lean) this.edgeNodes(before, stmt, next, linkRange, label, chain);
      if (collect) later.push(nextNames);
      stmt = next;
      names = nextNames;
    }
  }

  /** An edge node on `chain` for each edge the model has from index `before` on. */
  private edgeNodes(
    before: number,
    starts: readonly FlowNodeStmt[],
    ends: readonly FlowNodeStmt[],
    linkRange: Range,
    label: FlowLabelNode | undefined,
    chain: (FlowNodeStmt | FlowEdge)[]
  ): void {
    const { db } = this;
    const fromOf = byName(starts);
    const toOf = byName(ends);
    for (let k = before; k < db.edges.length; k++) {
      const edge = db.edges[k] as (typeof db.edges)[number];
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
    const { tb } = this;
    this.tested(tb.STYLE_WANT);
    if (!inKindSet(tb.STYLE_PART, this.kind())) this.fail([this.T.NodeString]);
    const from = this.i++;
    for (;;) {
      this.tested(tb.STYLE_WANT);
      if (!inKindSet(tb.STYLE_PART, this.kind())) break;
      this.i++;
    }
    return this.runText(from, this.i);
  }

  private stylesOpt(): string[] {
    const out = [this.style()];
    for (;;) {
      this.tested(this.tb.COMMA);
      if (this.kind() !== this.T.Comma) break;
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
    let at = r.start;
    const exact = this.src.slice(r.start, r.end) === list;
    for (const part of list.split(',')) {
      mention(part, exact ? { start: at, end: at + part.length } : r);
      out.push(part);
      at += part.length + 1;
    }
  }

  private linkStyleStatement(): void {
    const { db, T, tb } = this;
    const at = this.i;
    this.i++;
    this.expect(T.Space);
    const positions: string[] = [];
    this.tested(tb.LINK_STYLE_INDEX);
    if (this.kind() === T.Default) positions.push(this.raw(this.i++));
    else {
      positions.push(this.raw(this.expect(T.Num, T.Default)));
      while (this.kind() === T.Comma) {
        this.i++;
        positions.push(this.raw(this.expect(T.Num)));
      }
    }
    this.expect(T.Space);
    this.tested(tb.INTERPOLATE_OR_STYLE);
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
    const { T, tb } = this;
    if (this.probe !== undefined) this.tested([T.Str, ...also]);
    if (this.kind() !== T.Str) return this.fail([T.Str, ...also]);
    return this.labelRun(tb.NONE, tb.STR_WANT, 'string').text;
  }

  /** `click …` and `call …`; returns the callback, for the AST. */
  private clickStatement(out: string[]): AstCallback | undefined {
    const { db, T, tb } = this;
    const at = this.i;
    const id = this.raw(this.i++);
    // The token's own range: `range` would widen it over `click`.
    this.refs(id, { start: this.start(at), end: this.end(at) }, out, (part, pr) =>
      this.st.symbol(part, 'node', pr, 'ref')
    );
    this.tested(tb.CLICK_ACTION);
    const k = this.kind();
    if (k === T.CallbackName) {
      const name = this.raw(this.i++);
      this.tested(tb.CALLBACK_ARGS);
      const args = this.kind() === T.CallbackArgs ? this.raw(this.i++) : undefined;
      return this.callback(id, at, name, args);
    }
    let url: string;
    if (k === T.Href) {
      this.i++;
      url = this.expectStr();
    } else if (k === T.Str) url = this.expectStr();
    else return this.callback(id, at, this.alphaNum()[0]);
    this.tested(tb.SPACE);
    if (this.kind() !== T.Space) {
      db.setLink(id, url, this.span(at));
      return;
    }
    this.i++;
    this.tested(tb.LINK_TARGET_OR_TOOLTIP);
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
  private callback(id: string, at: number, name: string, args?: string): AstCallback {
    const { db } = this;
    const tooltip = this.tooltip();
    db.setClickEvent(id, name, this.span(at), args);
    if (tooltip !== undefined) db.setTooltip(id, tooltip);
    return args === undefined
      ? { targets: id.split(','), name }
      : { targets: id.split(','), name, args };
  }

  /** An optional ` "tooltip"` after a callback. */
  private tooltip(): string | undefined {
    this.tested(this.tb.SPACE);
    if (this.kind() !== this.T.Space) return undefined;
    this.i++;
    return this.expectStr();
  }

  /** A statement with no name of its own, as an AST node in `out`; nothing in a lean parse. */
  private simple(
    k: FlowSimpleKind,
    from: number,
    refsOut: string[],
    out: FlowStatement<X>[],
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

  /** One statement. Returns what v12's grammar adds to an enclosing block's list. */
  protected statement(collect: boolean, out: FlowStatement<X>[]): FlowDocItem {
    const { db, st, T, tb } = this;
    this.tested(tb.STATEMENT_KINDS);
    const t = this.kind();
    this.hint = tb.STATEMENT_HINTS[t];
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
        // The token runs to the line end.
        this.i++;
        this.simple('Direction', from, refList, out);
        return { stmt: 'dir', value: FLOW_DIRECTIONS[t - T.DirectionTB] ?? 'TB' };
      default:
        // An id starts a chain; the kinds below are none of an id's.
        if (inKindSet(tb.ID, t)) return this.chain(collect, out);
        return (
          this.accStatement(t, out) ?? this.ownStatement(t, out) ?? this.fail(tb.STATEMENT_START)
        );
    }
  }

  /** `accTitle`, `accDescr` and `accDescr { … }`: the value, or `undefined` for another kind. */
  private accStatement(t: number, out: FlowStatement<X>[]): string | undefined {
    const { db, T } = this;
    const from = this.i;
    let value: string;
    if (t === T.AccTitle) {
      this.i++;
      value = this.raw(this.expect(T.AccTitleValue)).trim();
      db.setAccTitle(value);
    } else if (t === T.AccDescr) {
      this.i++;
      value = this.raw(this.expect(T.AccDescrValue)).trim();
      db.setAccDescription(value);
    } else if (t === T.AccDescrMultilineValue) {
      value = this.raw(this.i++).trim();
      db.setAccDescription(value);
    } else return undefined;
    this.simple(t === T.AccTitle ? 'AccTitle' : 'AccDescr', from, [], out);
    return value;
  }

  /** A chain statement; the cursor is on an id. */
  private chain(collect: boolean, out: FlowStatement<X>[]): string[] {
    const from = this.i;
    const children: FlowChainStmt['children'] = [];
    const nodes = this.vertexStatement(collect, children);
    if (!this.st.lean) {
      const r = this.span(from);
      this.st.statement('chain', r);
      out.push({ id: this.ids.statement('chain'), type: 'Chain', range: r, children });
    }
    this.separator();
    return nodes;
  }

  // ---- the document and the header ----------------------------------------------------

  protected document(): void {
    const { frames, tb } = this;
    for (;;) {
      this.tested(frames.length > 0 ? tb.BLOCK_DOC_KINDS : tb.DOC_KINDS);
      const t = this.kind();
      if (t === Kind.EOF) break;
      try {
        this.documentItem(t);
      } catch (e) {
        if (e !== STOP) throw e;
        this.recover();
      }
    }
    this.closeOpenBlocks();
  }

  /** What starts with the token kind `t` at the cursor: an `end`, a blank, a block or a statement. */
  private documentItem(t: number): void {
    if (t === this.T.End) {
      this.closeEnd();
      return;
    }
    if (this.blankItem(t) || this.block(t)) return;
    const item = this.statement(this.collect, this.body);
    if (this.collect && (typeof item !== 'object' || 'stmt' in item || item.length > 0))
      this.list.push(item);
  }

  /** Consume a separator or blank of kind `t` between statements; false for another kind. */
  private blankItem(t: number): boolean {
    const { T } = this;
    if (t !== T.Semi && t !== Kind.Newline && t !== T.Space && t !== T.Eof) return false;
    if (this.collect) this.list.push(this.raw());
    this.i++;
    return true;
  }

  /**
   * The header: blanks, the keyword and a direction. `noKeyword` is the hint for a text that
   * starts with something else.
   */
  protected header(noKeyword: string): void {
    const { db, st, T, tb } = this;
    for (;;) {
      this.tested(tb.HEADER_START);
      if (!inKindSet(tb.HEADER_SKIP, this.kind())) break;
      this.i++;
    }
    const from = this.i;
    try {
      this.tested(tb.GRAPH);
      if (this.kind() !== T.Graph) this.fail([T.Graph], noKeyword);
      this.i++;
      this.tested(tb.DIR_KINDS);
      if (this.kind() === T.NoDir) {
        this.i++;
        db.setDirection('TB');
      } else db.setDirection(this.headerDirection());
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

  /** The header's direction and the end of its line. */
  private headerDirection(): string {
    const { T, tb } = this;
    if (this.kind() === Kind.Error) this.unknownDirection();
    const dir = this.raw(this.expect(T.Dir, T.NoDir));
    this.tested(tb.AFTER_DIR);
    let t = this.kind();
    if (t === T.Space) {
      do {
        this.i++;
        this.tested(tb.BLANKS);
      } while (this.kind() === T.Space);
      t = this.kind();
      if (t !== Kind.Newline) this.fail([Kind.Newline]);
    } else if (!inKindSet(tb.AFTER_DIR_END, t)) this.fail(tb.AFTER_DIR_WANT);
    this.i++;
    return dir;
  }

  /** The word after the header keyword that is no direction. */
  private unknownDirection(): never {
    const { src, tb } = this;
    let w = this.start(this.i);
    while (w < src.length && /\s/.test(src[w] ?? '')) w++;
    let e = w;
    while (e < src.length && !/\s/.test(src[e] ?? '')) e++;
    // A direction was expected across the word, which may lex as several tokens.
    const { probe, tokens } = this;
    if (probe !== undefined) {
      for (let j = this.i; j < tokens.length && this.start(j) < e; j++) {
        if (probe.isAt(tokens, j, this.viewFrom)) probe.tested(tb.DIR_KINDS, this.start(j));
      }
    }
    this.notDirection(w);
    this.st.diagnostics.error(
      'UNKNOWN_DIRECTION',
      `Unknown direction \`${src.slice(w, e)}\`: use TB, TD, BT, LR or RL (or \`>\`, \`<\`, \`^\`, \`v\`).`,
      { start: w, end: e },
      { expected: tb.EXPECTED.names([this.T.Dir]) }
    );
    throw STOP;
  }

  // ---- the result ---------------------------------------------------------------------

  /**
   * The parse result for `model`: `CALLBACK_IGNORED` when it has callbacks nothing claims,
   * and the document node.
   */
  protected result<M extends FlowModelLike>(model: M): ParseResult<M, FlowDocumentNode<X>> {
    const { st, src, options } = this;
    this.warnCallbacks(model);
    const ast: FlowDocumentNode<X> = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.fullTokens, options, this.probe);
  }

  /**
   * The parse result for `model` in either mode (DESIGN §4.2): {@link result}, or in a lean
   * parse the model and the diagnostics, `CALLBACK_IGNORED` included.
   */
  protected outcome<M extends FlowModelLike>(
    model: M
  ): ParseResult<M, FlowDocumentNode<X>> | LeanParseResult<M> {
    if (!this.st.lean) return this.result(model);
    this.warnCallbacks(model);
    return this.st.leanResult(model);
  }

  /** `CALLBACK_IGNORED` when `model` has callbacks nothing claims. */
  private warnCallbacks(model: FlowModelLike): void {
    const { st, options } = this;
    if (model.callbacks.length > 0 && !options.claims?.includes('callbacks')) {
      const first = model.callbacks[0];
      const d = st.diagnostics.warning(
        'CALLBACK_IGNORED',
        '`click … callback` and `call` are ignored: install the interactions plugin to run callbacks.',
        first?.range ?? { start: 0, end: 0 }
      );
      model.warnings.push(d);
    }
  }
}

/** The document node of a dialect whose own statement nodes are `X`. */
export interface FlowDocumentNode<X extends AstNode<string>> extends AstNode<'Document'> {
  children: FlowStatement<X>[];
}
