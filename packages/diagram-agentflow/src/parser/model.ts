/**
 * AgentflowModel: the plain-data result of an agentflow parse (DESIGN §4.3), and the builder
 * the parser drives. The builder does what v12's `AgentFlowDB` (`fa796a943`) did with each
 * parsed statement, on the flow family's model builder, which agentflow shares with flowchart
 * (D595, amending D467's copy), and it reports at
 * parse what v12 reported from `getData()` (D461): shapes that are drawn as the default, and
 * the containment that would close a cycle, which it cuts.
 *
 * Kept from v12 (D464), each with one warning per kind: metadata before its `flow` is lost
 * (`AGENTFLOW_METADATA_DROPPED`), the `connectors` id is dropped (`AGENTFLOW_RESERVED_ID`),
 * `view` on a vertex is ignored (`AGENTFLOW_VIEW_IGNORED`) and `connector` replaces a vertex
 * (`AGENTFLOW_CONNECTOR_REPLACED`).
 *
 * Differences from v12's DB: text is kept as written (no sanitising: that happens when SVG is
 * written), links keep the URL as written, callbacks are recorded instead of bound, and
 * errors are diagnostics instead of exceptions.
 *
 * Changed from the flow family's builder: agentflow's records (flows, connectors, `global`, kinds
 * from shapes) and the D461 and D464 diagnostics, as above.
 */
import type { AstId, Diagnostic, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import type { YamlMap } from '@mermaid-js/core/preprocess';
import {
  countChar,
  FlowBuilderBase,
  flowLabelType,
  unquoteLabel,
} from '@mermaid-js/shared/parser/flow';
import type {
  FlowBuilderOptions,
  FlowCallbackRecord,
  FlowClassRecord,
  FlowDocItem,
  FlowEdgeRecord,
  FlowLabelText,
  FlowLabelType,
  FlowLinkInfo,
  FlowLinkRecord,
  FlowVertexParts,
} from '@mermaid-js/shared/parser/flow';
import { collapsedInto, containment, FlowOpenings, type Mark } from './containment.ts';
import { drawnShape, isValidShape, RESERVED_ID, resolveShape, vertexKind } from './shapes.ts';
import type { AgentflowShape, VertexKind } from './shapes.ts';

export type LabelType = FlowLabelType;

/** An edge's meaning: `-->` sequence, `--x` failure, `-.-` reference. */
export type EdgeSemantic = 'sequence' | 'failure' | 'reference';

export type AgentflowLabel = FlowLabelText;

export interface AgentflowVertex {
  id: string;
  /** AST id of the mention that made the record, e.g. `n:A` (a connector's statement). */
  ast: AstId;
  text: string;
  labelType: LabelType;
  /**
   * v12's vertex type: a bracket shape (`square`, `round`, `diamond`, …) or a `@{ shape }`
   * name after alias resolution (`task` is `roundedRect`). Undefined for a bare id.
   */
  type?: string;
  /** From the type (v12 `deriveVertexKind`), or `connector`. */
  kind: VertexKind;
  /** The shape it is drawn with (a removed or unsupported one is drawn `rounded`). */
  shape: AgentflowShape;
  /** Declared with `connector`. */
  connector: boolean;
  styles: string[];
  classes: string[];
  /** `[|field:value|…]` properties. */
  props: Record<string, string>;
  /** Every `@{ … }` key as written (merged over the mentions; `shape` resolved). */
  metadata?: YamlMap;
  /** The flow that holds it (after the containment cut), if any. */
  parent?: string;
  /** The outermost collapsed flow it is hidden in, if any. */
  collapsedInto?: string;
  /** `click` URL as written (trimmed). Checked against `securityLevel` when SVG is written. */
  link?: string;
  linkTarget?: string;
}

export interface AgentflowModelEdge extends FlowEdgeRecord {
  /** `arrow_point`, `arrow_cross` or `arrow_open`. */
  type: string;
  /** `normal` or `dotted`. */
  stroke: string;
  semantic?: EdgeSemantic;
  /** Every `@{ … }` key as written. */
  metadata?: YamlMap;
}

export type AgentflowClass = FlowClassRecord;

/** A `flow … end` container. */
export interface AgentflowFlowModel {
  id: string;
  /** AST id of its first opening. */
  ast: AstId;
  title: string;
  labelType: LabelType;
  /** Member ids in the order v12 lists them (vertices, connectors and flows). */
  nodes: string[];
  classes: string[];
  styles: string[];
  /** `direction …` in the flow, as v12 kept it (`TD` too): `layoutDir` (`tables.ts`) reads it. */
  dir?: string;
  metadata?: YamlMap;
  /** `view: collapsed` in its metadata. */
  collapsed: boolean;
  /** The flow that holds it (after the containment cut), if any. */
  parent?: string;
  /** The outermost collapsed flow it is hidden in, if any. */
  collapsedInto?: string;
}

/** A `click … href`/URL statement. */
export type AgentflowLink = FlowLinkRecord;
/** A `click … callback` or `call` statement. */
export type AgentflowCallback = FlowCallbackRecord;

/** One of the diagnostics v12 emitted, with the node it named (for `semanticModel`). */
export interface AgentflowFinding {
  id: 'SHAPE_REMOVED' | 'SHAPE_UNSUPPORTED' | 'CONTAINMENT_VIOLATION';
  severity: 'warning';
  message: string;
  nodeId: string;
  /** Where it is reported (the shape's bracket or block, or the inner flow's opener). */
  range: Range;
}

export interface AgentflowModel {
  /**
   * `TB`, `BT`, `LR` or `RL` (v12 maps `TD`, `v`, `<`, `>`, `^`), or v12's unmapped `BR`; kept
   * as v12's model has it (parity, D465): `layoutDir` (`tables.ts`) reads it.
   */
  direction: string;
  /** Vertices and connectors in v12's order (a connector keeps a replaced vertex's place). */
  vertices: AgentflowVertex[];
  edges: AgentflowModelEdge[];
  /** Flows in v12's order: each when its `end` closes it, so inner flows first. */
  flows: AgentflowFlowModel[];
  /** Connector ids in declaration order. */
  connectors: string[];
  /** Ids written in a `global … end` block, which belong to no flow. */
  globals: string[];
  /** `linkStyle default interpolate …`. */
  defaultInterpolate?: string;
  /** `linkStyle default …`. */
  defaultStyle?: string[];
  classes: AgentflowClass[];
  /** `[id, tooltip]` in the order the ids first got one. */
  tooltips: [string, string][];
  links: AgentflowLink[];
  /** `click … callback` / `call` statements. Ignored unless a plugin claims `callbacks`. */
  callbacks: AgentflowCallback[];
  /** The front matter's `title` (D218). */
  title?: string;
  accTitle: string;
  accDescr: string;
  /** v12's shape and containment diagnostics, with their node (D461). */
  findings: AgentflowFinding[];
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  warnings: Diagnostic[];
}

export interface LinkInfo extends FlowLinkInfo {
  semantic?: EdgeSemantic;
}

/** Item of a block body as v12's grammar collects it. */
export type DocItem = FlowDocItem;

/**
 * What a warning names besides its range: the other places (`related`) and, for the render
 * warning, the AST ids of the elements it is about, every repeat included (core's `Warning`
 * keeps `astIds` and drops `related`).
 */
export interface WarningExtra {
  related?: RelatedInfo[];
  astIds?: readonly AstId[];
}

/**
 * A warning of the parse. D461's codes and D464's warnings list the elements they are about in
 * `astIds`, which core's render `Warning` keeps (sankey's `SankeyWarning`, #496).
 */
export interface AgentflowParseWarning extends Diagnostic {
  readonly astIds?: readonly AstId[];
}

export interface BuilderOptions extends FlowBuilderOptions {
  warn(code: string, message: string, range: Range, extra?: WarningExtra): void;
}

/** A YAML value as JavaScript's `toString` writes it, which v12's sanitiser used. */
function v12Text(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => (v === null ? '' : v12Text(v))).join(',');
  if (typeof value === 'object' && value !== null) return '[object Object]';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** v12 `computeEdgeSemantic`. */
function semanticOf(type: string, stroke: string): EdgeSemantic | undefined {
  if (type === 'arrow_point' && stroke === 'normal') return 'sequence';
  if (type === 'arrow_cross' && stroke === 'normal') return 'failure';
  if (type === 'arrow_open' && stroke === 'dotted') return 'reference';
  return undefined;
}

/** v12 agentflow's `destructLink`: `--+[x>]` and `-.+-`, or `-- text --+[x>]`. */
export function destructLink(end: string, start?: string): LinkInfo {
  const str = end.trim();
  let line = str.slice(0, -1);
  let type = 'arrow_open';
  const last = str.slice(-1);
  if (last === 'x') type = 'arrow_cross';
  else if (last === '>') type = 'arrow_point';
  else line = str;
  let stroke = 'normal';
  let length = line.length - 1;
  const dots = countChar('.', line);
  if (dots > 0) {
    stroke = 'dotted';
    length = dots;
  }
  // `-- text -->`: the start (always `--`) gives the stroke, the end the type.
  if (start !== undefined && start.trim().includes('.') !== (stroke === 'dotted')) {
    return { type: 'INVALID', stroke: 'INVALID' };
  }
  const info: LinkInfo = { type, stroke, length };
  const semantic = semanticOf(type, stroke);
  if (semantic !== undefined) info.semantic = semantic;
  return info;
}

/** What one mention of a vertex sets, and where. */
export interface VertexParts extends FlowVertexParts {
  /** Where the bracket shape is written. */
  shapeAt?: Range;
  /** The AST id of the statement that wrote these parts (`n:A@2`); the vertex's when absent. */
  mention?: AstId;
}

/** One closed `flow … end`, as v12's `addSubGraph` received it. */
export interface FlowParts {
  /** The id as written; none for an anonymous flow. */
  id: AgentflowLabel | undefined;
  /** What v12's grammar collected from the body. */
  list: DocItem[];
  /** The bracketed title (an empty text for `flow id`); none for an anonymous flow. */
  title: AgentflowLabel | undefined;
  /** The header, for `CONTAINMENT_VIOLATION`. */
  opener: Range;
  /** The AST id of this opening (`s:A`, `s:A@2`). */
  astFor: (id: string) => AstId;
}

/** Where a vertex's mentions set something the diagnostics point at. */
interface VertexMarks {
  /** The bracket or `@{ … }` block that set the type last. */
  shape?: Mark;
  /** The `@{ … }` blocks that wrote metadata. */
  data: Mark[];
  /** The `@{ … }` block that wrote `view`. */
  view?: Mark;
}

const NO_RANGE: Range = { start: 0, end: 0 };

/**
 * Occurrences of one D464 warning: the first is the diagnostic's range, the rest related; every
 * one's AST id is in `astIds`.
 */
type Occurrences = (Mark & { message: string })[];

/** Collects one parse's model, in v12 AgentFlowDB order. Create one per parse. */
export class AgentflowBuilder extends FlowBuilderBase<
  AgentflowVertex,
  AgentflowModelEdge,
  LinkInfo,
  BuilderOptions
> {
  readonly flows: AgentflowFlowModel[] = [];
  private readonly flowById = new Map<string, AgentflowFlowModel>();
  /** Where each flow is opened and lists its members, for `CONTAINMENT_VIOLATION`. */
  private readonly openings = new FlowOpenings();
  private readonly connectorIds: string[] = [];
  private readonly globalNodes = new Set<string>();
  /** Ids some flow lists (v12's `makeUniq` scan, as a set). */
  private readonly members = new Set<string>();
  private readonly marks = new Map<string, VertexMarks>();
  /** First mention of each vertex. */
  private readonly firstAt = new Map<string, Range>();
  private subCount = 0;
  private readonly reservedAt: Mark[] = [];
  private readonly replaced: (Mark & { id: string; first: Range })[] = [];
  private readonly findings: AgentflowFinding[] = [];

  /** An edge has the meaning its link has (`destructLink`). */
  protected edgeOf(record: FlowEdgeRecord, info: LinkInfo): AgentflowModelEdge {
    const edge: AgentflowModelEdge = record;
    if (info.semantic !== undefined) edge.semantic = info.semantic;
    return edge;
  }

  protected container(id: string): AgentflowFlowModel | undefined {
    return this.flowById.get(id);
  }

  /** v12 threw a TypeError for an index with no edge; v13 reports its bounds message (D461). */
  protected noEdgeAt(pos: string): string {
    return `The index ${pos} for linkStyle is out of bounds. Valid indices for linkStyle are between 0 and ${this.edges.length - 1}. (Help: Ensure that the index is within the range of existing edges.)`;
  }

  /** Whether `id` is a connector. */
  isConnector(id: string): boolean {
    return this.vertices.get(id)?.connector === true;
  }

  private marksOf(id: string): VertexMarks {
    let m = this.marks.get(id);
    if (!m) this.marks.set(id, (m = { data: [] }));
    return m;
  }

  /** v12 `addVertex`: route `parts` to a flow, connector or edge, else to the vertex `id`. */
  addVertex(id: string, ast: AstId, at: Range, parts: VertexParts = {}): void {
    if (!id || id.trim().length === 0) return;
    const { label, type, styles, props, data } = parts;
    const mention = parts.mention ?? ast;
    // v12 resolved the alias in the metadata itself before routing it anywhere.
    // A block that did not parse (`data` null) is reported already, and sets nothing.
    let doc: YamlMap | undefined;
    let authored: unknown;
    if (data !== undefined && data !== null) {
      doc = { ...data };
      authored = doc.shape;
      if (typeof authored === 'string') {
        const resolved = resolveShape(authored);
        if (resolved !== undefined) doc.shape = resolved;
      }
    }

    if (this.routed(id, doc, { at, ast: mention })) return;
    let vertex = this.vertices.get(id);
    if (vertex === undefined) {
      if (this.atNodeLimit(at)) return;
      // `props` keys are the author's: no prototype, so `__proto__` is a key like any other.
      const own = Object.create(null) as Record<string, string>;
      vertex = {
        id,
        ast,
        text: id,
        labelType: 'text',
        kind: 'task',
        shape: 'rounded',
        connector: false,
        styles: [],
        classes: [],
        props: own,
      };
      this.vertices.set(id, vertex);
      this.firstAt.set(id, at);
    }
    if (label !== undefined) {
      vertex.labelType = label.type;
      vertex.text = unquoteLabel(label.text.trim());
    }
    if (type !== undefined) {
      vertex.type = type;
      this.marksOf(id).shape = { at: parts.shapeAt ?? at, ast: mention };
    }
    if (styles) vertex.styles.push(...styles);
    if (props) for (const [k, v] of Object.entries(props)) vertex.props[k] = v;
    if (doc === undefined) return;

    vertex.metadata = { ...vertex.metadata, ...doc };
    const marks = this.marksOf(id);
    const mark = { at, ast: mention };
    marks.data.push(mark);
    if ('view' in doc) marks.view = mark;
    if (doc.shape) this.dataShape(vertex, authored, doc.shape, mark);
    if (doc.label) this.dataLabel(vertex, doc, at);
  }

  /**
   * `label` and `labelType` from `@{ … }`, as v12 read them: a label that is not text becomes
   * its JavaScript text (`5`, `1,2`, `[object Object]`, as v12's sanitiser made it), a
   * `labelType` other than `text`, `string` or `markdown` becomes `markdown`. Each such value is
   * kept and reported (`NODE_DATA_COERCED`), as an edge's are (pitfall 10).
   */
  private dataLabel(vertex: AgentflowVertex, doc: YamlMap, at: Range): void {
    const { label, labelType: type } = doc;
    const warn = (key: string, value: unknown, read: string) =>
      this.options.warn(
        'NODE_DATA_COERCED',
        `Node ${JSON.stringify(vertex.id)}: ${key} ${JSON.stringify(value)} is read as ${read} (as in v12); write it as ${key === 'label' ? 'a quoted string' : '`text`, `string` or `markdown`'}.`,
        at
      );
    vertex.text = v12Text(label);
    if (typeof label !== 'string') warn('label', label, JSON.stringify(vertex.text));
    vertex.labelType = flowLabelType(type);
    if (type !== undefined && type !== vertex.labelType) warn('labelType', type, '`markdown`');
  }

  /** Whether a `connector connectors` or `flow connectors` takes the reserved id. */
  reservedClaimed(): boolean {
    return this.flowById.has(RESERVED_ID) || this.vertices.get(RESERVED_ID)?.connector === true;
  }

  /**
   * v12's routing of a mention, first match wins: metadata of a flow or a connector goes to it,
   * the reserved `connectors` id and an edge id make no vertex. Whether it was routed.
   */
  private routed(id: string, doc: YamlMap | undefined, mark: Mark): boolean {
    const flow = this.flowById.get(id);
    if (flow && doc) {
      flow.metadata = { ...flow.metadata, ...doc };
      flow.collapsed = flow.metadata.view === 'collapsed';
      return true;
    }
    const existing = this.vertices.get(id);
    if (existing?.connector && doc) {
      existing.metadata = { ...existing.metadata, ...doc };
      return true;
    }
    if (id === RESERVED_ID) {
      this.reservedAt.push(mark);
      return true;
    }
    const edge = this.edgeNamed(id);
    if (!edge) return false;
    if (doc) this.edgeData(edge, doc, mark.at);
    return true;
  }

  /** v12's `@{ shape }` checks, which threw: unknown shapes are errors. */
  private dataShape(vertex: AgentflowVertex, authored: unknown, shape: unknown, mark: Mark): void {
    const { options } = this;
    const { at } = mark;
    if (typeof authored !== 'string') {
      options.error('UNKNOWN_SHAPE', `No such shape: ${JSON.stringify(authored)}.`, at);
      return;
    }
    if (authored !== authored.toLowerCase() || authored.includes('_')) {
      options.error(
        'UNKNOWN_SHAPE',
        `No such shape: ${authored}. Shape names should be lowercase.`,
        at
      );
      return;
    }
    const resolved = String(shape);
    if (!isValidShape(resolved)) {
      // v12 kept a plain scalar's trailing comma (`shape: tool,`) in the name (D464).
      let end = authored.length;
      while (end > 0 && /[\s,]/.test(authored.charAt(end - 1))) end--;
      const bare = authored.slice(0, end);
      const comma =
        bare !== authored && isValidShape(resolveShape(bare) ?? bare)
          ? ` The comma is part of the name: remove it (\`shape: ${bare}\`), or quote the name (\`shape: "${bare}",\`).`
          : '';
      options.error('UNKNOWN_SHAPE', `No such shape: ${resolved}.${comma}`, at);
      return;
    }
    vertex.type = resolved;
    this.marksOf(vertex.id).shape = mark;
  }

  // An edge's `@{…}` keys: all kept as metadata; the presentation ones typed, anything else
  // in them dropped with a warning rather than reaching the model as the wrong type.
  protected override edgeData(edge: AgentflowModelEdge, doc: YamlMap, at: Range): void {
    edge.metadata = { ...edge.metadata, ...doc };
    super.edgeData(edge, doc, at);
  }

  /**
   * v12 `addSubGraph` for `flow`: `idText` is the id as written (none for an anonymous flow),
   * `titleText` the bracketed title. Returns the flow id.
   */
  addFlow(parts: FlowParts): string {
    const { id: idText, list, title: titleText, opener, astFor } = parts;
    const { nodeList, dir } = this.listed(list);

    const id = idText?.text.trim() ?? 'subGraph' + this.subCount;
    this.subCount++;
    const { members, globalNodes } = this;
    // A node belongs to the first flow that lists it; a flow never contains itself, nor a
    // node written in a `global` block.
    const nodes = nodeList.filter((n) => n !== id && !globalNodes.has(n) && !members.has(n));
    for (const n of nodes) members.add(n);
    const ast = astFor(id);
    this.openings.closed(id, { at: opener, ast }, nodes);
    const title = (titleText?.text ?? '').trim();
    const existing = this.flowById.get(id);
    if (existing) {
      // An id opened again merges into the first; its last title and direction win.
      existing.nodes.push(...nodes);
      if (title) existing.title = title;
      if (dir !== undefined) existing.dir = dir;
      return id;
    }
    const flow: AgentflowFlowModel = {
      id,
      ast,
      title,
      labelType: flowLabelType(titleText?.type),
      nodes,
      classes: [],
      styles: [],
      collapsed: false,
    };
    if (dir !== undefined) flow.dir = dir;
    this.flows.push(flow);
    this.flowById.set(id, flow);
    return id;
  }

  /** The flow with this id. */
  flow(id: string): AgentflowFlowModel | undefined {
    return this.flowById.get(id);
  }

  /**
   * v12 `addGlobal`: the ids written in the block belong to no flow, whichever flow lists them
   * before or after. v12 released them from the flows before it at once; here they leave those
   * flows in {@link finish} (once, not once per block), which reads the same.
   */
  addGlobal(list: DocItem[]): void {
    const { globalNodes } = this;
    for (const item of list.flat()) {
      if (typeof item !== 'string') continue;
      const id = item.trim();
      if (id !== '') globalNodes.add(id);
    }
  }

  /**
   * v12 `addConnector`: a connector record, which replaces a vertex of the same id (in its
   * place); its title is the id unless one is given. Returns the id.
   */
  addConnector(name: string, title: string, ast: AstId, at: Range): string {
    const id = name.trim();
    if (!id) return '';
    const t = title.trim();
    const existing = this.vertices.get(id);
    if (existing?.connector) {
      if (t.length > 0) existing.text = t;
      return id;
    }
    if (existing) {
      this.replaced.push({ at, ast, id, first: this.firstAt.get(id) ?? at });
      this.marks.delete(id);
    }
    const connector: AgentflowVertex = {
      id,
      ast,
      text: t.length > 0 ? t : id,
      labelType: 'text',
      kind: 'connector',
      shape: 'rounded',
      connector: true,
      styles: [],
      classes: [],
      props: Object.create(null) as Record<string, string>,
    };
    this.vertices.set(id, connector);
    this.firstAt.set(id, at);
    this.connectorIds.push(id);
    return id;
  }

  /** Where each D464 kind of silent drop happened, for {@link finish}. */
  private dropWarnings(lineOf: (at: number) => number): void {
    const { options, flowById, vertices } = this;
    const dropped: Occurrences = [];
    const ignored: Occurrences = [];
    for (const [id, marks] of this.marks) {
      if (marks.data.length === 0) continue;
      if (flowById.has(id)) {
        for (const mark of marks.data) {
          dropped.push({ ...mark, message: `The metadata on \`${id}\` is lost.` });
        }
      } else if (marks.view !== undefined && vertices.get(id)?.connector !== true) {
        ignored.push({ ...marks.view, message: `\`view\` on the node \`${id}\` is ignored.` });
      }
    }
    const once = (code: string, list: Occurrences, message: (first: string) => string) => {
      const [first, ...rest] = list;
      if (!first) return;
      const related = rest.map((o) => ({ message: o.message, range: o.at }));
      options.warn(code, message(first.message), first.at, {
        ...(related.length ? { related } : {}),
        astIds: list.map((o) => o.ast),
      });
    };
    dropped.sort((a, b) => a.at.start - b.at.start);
    once(
      'AGENTFLOW_METADATA_DROPPED',
      dropped,
      (m) =>
        `${m.slice(0, -1)}: it is written before its \`flow\`, so it lands on a node that the flow replaces (as in v12). Write it on the \`flow\` line, or after the flow's \`end\`.`
    );
    once(
      'AGENTFLOW_VIEW_IGNORED',
      ignored,
      (m) =>
        `${m.slice(0, -1)}: only a flow can be collapsed (as in v12). Put \`view: collapsed\` on a flow.`
    );
    if (!this.reservedClaimed()) {
      once(
        'AGENTFLOW_RESERVED_ID',
        this.reservedAt.map((mark) => ({ ...mark, message: 'The node `connectors` is left out.' })),
        () =>
          '`connectors` is a reserved id: the node is left out of the diagram and its edges have no end there (as in v12). Use another id.'
      );
    }
    once(
      'AGENTFLOW_CONNECTOR_REPLACED',
      this.replaced.map(({ at, ast, id, first }) => ({
        at,
        ast,
        message: `\`connector ${id}\` replaces the node \`${id}\` written at line ${lineOf(first.start)}.`,
      })),
      (m) =>
        `${m.slice(0, -1)}: the node's label, shape and metadata are dropped (as in v12). Declare the connector before using its id, or use another id.`
    );
  }

  /**
   * v12's `getData` rules that the diagnostics need, run once at the end (D461): the collapsed
   * flows hide what they hold; each id gets the flow that lists it as its parent, except where
   * that closes a containment cycle (`CONTAINMENT_VIOLATION`, the assignment dropped); every
   * vertex drawn is checked for a removed or unsupported shape. v12 walked the parents of each
   * flow for every assignment and the members of each collapsed flow again for each collapsed
   * flow around it; here both are linear (union-find roots, and redirects between collapses).
   */
  finish(lineOf: (at: number) => number): void {
    const { flows, flowById, vertices, globalNodes } = this;
    if (globalNodes.size > 0) {
      for (const flow of flows) {
        if (flow.nodes.some((n) => globalNodes.has(n))) {
          flow.nodes = flow.nodes.filter((n) => !globalNodes.has(n));
        }
      }
    }
    for (const v of vertices.values()) {
      if (!v.connector) v.kind = vertexKind(v.type);
    }
    const into = collapsedInto(flows, flowById);
    const parent = containment(flows, into, (flow, id) => {
      const message = `Container "${flow}" cannot contain "${id}" because "${id}" already contains it. The nesting that would close the loop is dropped.`;
      const { range, astIds } = this.openings.cycle(flow, id);
      this.options.warn('CONTAINMENT_VIOLATION', message, range, { astIds });
      this.findings.push({
        id: 'CONTAINMENT_VIOLATION',
        severity: 'warning',
        message,
        nodeId: id,
        range,
      });
    });
    for (const flow of flows) {
      const p = parent.get(flow.id);
      if (p !== undefined) flow.parent = p;
      const c = into(flow.id);
      if (c !== undefined) flow.collapsedInto = c;
    }
    for (const v of vertices.values()) {
      const p = parent.get(v.id);
      if (p !== undefined) v.parent = p;
      const c = into(v.id);
      if (c !== undefined) v.collapsedInto = c;
      const check = drawnShape(v.type);
      v.shape = check.shape;
      // v12 checked the nodes it drew: not hidden ones, nor a flow's own id.
      if (!check.problem || c !== undefined || flowById.has(v.id)) continue;
      const removed = check.problem === 'removed';
      const id = removed ? 'SHAPE_REMOVED' : 'SHAPE_UNSUPPORTED';
      const message = removed
        ? `shape "${check.name}" was removed in v0.8.1, using "roundedRect"`
        : `shape "${check.name}" is not supported, using "roundedRect"`;
      const shape = this.marks.get(v.id)?.shape;
      const range = shape?.at ?? this.firstAt.get(v.id) ?? NO_RANGE;
      this.options.warn(id, message, range, { astIds: [shape?.ast ?? v.ast] });
      this.findings.push({ id, severity: 'warning', message, nodeId: v.id, range });
    }
    this.dropWarnings(lineOf);
  }

  model(warnings: Diagnostic[], title: string | undefined): AgentflowModel {
    const { flowById } = this;
    const vertices: AgentflowVertex[] = [];
    for (const v of this.vertices.values()) {
      const flow = flowById.get(v.id);
      if (flow === undefined) {
        vertices.push(v);
        continue;
      }
      // A vertex with a flow's id is that flow's group node in v12: its styles and classes
      // are the flow's.
      flow.styles = v.styles;
      flow.classes = v.classes;
    }
    const model: AgentflowModel = {
      direction: this.direction,
      vertices,
      edges: this.edges,
      flows: this.flows,
      connectors: this.connectorIds,
      globals: [...this.globalNodes],
      classes: [...this.classes.values()],
      tooltips: [...this.tooltips],
      links: this.links,
      callbacks: this.callbacks,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      findings: this.findings,
      warnings,
    };
    if (title) model.title = title;
    if (this.defaultInterpolate !== undefined) model.defaultInterpolate = this.defaultInterpolate;
    if (this.defaultStyle !== undefined) model.defaultStyle = this.defaultStyle;
    return model;
  }
}
