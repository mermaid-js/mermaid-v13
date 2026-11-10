/**
 * AgentflowModel: the plain-data result of an agentflow parse (DESIGN §4.3), and the builder
 * the parser drives. The builder does what v12's `AgentFlowDB` (`fa796a943`) did with each
 * parsed statement, written from a copy of v13 flowchart's builder (D467), and it reports at
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
 * Flowchart's builder is ported from Pele's `src/diagrams/flowchart/db.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
 * cspell:ignore kepano
 */
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import type { AstId, Diagnostic, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import type { YamlMap } from '@mermaid-js/core/preprocess';
import { collapsedInto, containment } from './containment.ts';
import { drawnShape, isValidShape, RESERVED_ID, resolveShape, vertexKind } from './shapes.ts';
import type { AgentflowShape, VertexKind } from './shapes.ts';

export type LabelType = 'text' | 'string' | 'markdown';

/** An edge's meaning: `-->` sequence, `--x` failure, `-.-` reference. */
export type EdgeSemantic = 'sequence' | 'failure' | 'reference';

export interface AgentflowLabel {
  text: string;
  type: LabelType;
}

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

export interface AgentflowModelEdge {
  /** Model id: the user's `id@` or `L_<start>_<end>_<n>`. */
  id: string;
  ast: AstId;
  isUserDefinedId: boolean;
  start: string;
  end: string;
  /** `arrow_point`, `arrow_cross` or `arrow_open`. */
  type: string;
  /** `normal` or `dotted`. */
  stroke: string;
  length?: number;
  semantic?: EdgeSemantic;
  text: string;
  labelType: LabelType;
  classes: string[];
  style?: string[];
  interpolate?: string;
  animate?: boolean;
  animation?: string;
  /** Every `@{ … }` key as written. */
  metadata?: YamlMap;
}

export interface AgentflowClass {
  id: string;
  styles: string[];
  textStyles: string[];
}

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
  dir?: string;
  metadata?: YamlMap;
  /** `view: collapsed` in its metadata. */
  collapsed: boolean;
  /** The flow that holds it (after the containment cut), if any. */
  parent?: string;
  /** The outermost collapsed flow it is hidden in, if any. */
  collapsedInto?: string;
}

export interface AgentflowLink {
  /** Vertex id. */
  id: string;
  url: string;
  target?: string;
  range: Range;
}

export interface AgentflowCallback {
  /** Vertex id. */
  id: string;
  name: string;
  args?: string;
  range: Range;
}

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
  /** `TB`, `BT`, `LR` or `RL` (v12 maps `TD`, `v`, `<`, `>`, `^`). */
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

export interface LinkInfo {
  type: string;
  stroke: string;
  length?: number;
  semantic?: EdgeSemantic;
  text?: AgentflowLabel;
  id?: string;
}

/** Item of a block body as v12's grammar collects it. */
export type DocItem = string | readonly string[] | { stmt: 'dir'; value: string };

export interface BuilderOptions {
  maxEdges: number;
  maxNodes: number;
  inheritDir: boolean;
  error(code: string, message: string, range: Range): void;
  warn(code: string, message: string, range: Range, related?: RelatedInfo[]): void;
}

function labelType(type: unknown): LabelType {
  return type === 'markdown' || type === 'string' || type === 'text' ? type : 'markdown';
}

/** A YAML value as JavaScript's `toString` writes it, which v12's sanitiser used. */
function v12Text(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => (v === null ? '' : v12Text(v))).join(',');
  if (typeof value === 'object' && value !== null) return '[object Object]';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function unquote(text: string): string {
  return text.startsWith('"') && text.endsWith('"') ? text.substring(1, text.length - 1) : text;
}

function countChar(ch: string, str: string): number {
  let count = 0;
  for (const c of str) if (c === ch) count++;
  return count;
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

/** What one mention of a vertex sets. */
export interface VertexParts {
  label?: AgentflowLabel;
  /** The bracket shape, and where it is written. */
  type?: string;
  shapeAt?: Range;
  styles?: string[];
  props?: Record<string, string>;
  /** The parsed `@{ … }` block; null when it did not parse. */
  data?: YamlMap | null;
}

/** What one link statement asks for: every start to every end. */
export interface LinkParts {
  starts: string[];
  ends: string[];
  info: LinkInfo;
  astFor: (start: string, end: string) => AstId;
  /** The link, for the edge-limit diagnostic. */
  at: Range;
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
  shapeAt?: Range;
  /** The `@{ … }` blocks that wrote metadata. */
  dataAt: Range[];
  /** The `@{ … }` block that wrote `view`. */
  viewAt?: Range;
}

const NO_RANGE: Range = { start: 0, end: 0 };

/** Occurrences of one D464 warning: the first is the diagnostic's range, the rest related. */
type Occurrences = { at: Range; message: string }[];

/** Collects one parse's model, in v12 AgentFlowDB order. Create one per parse. */
export class AgentflowBuilder {
  direction = 'TB';
  readonly vertices = new Map<string, AgentflowVertex>();
  readonly edges: AgentflowModelEdge[] = [];
  readonly classes = new Map<string, AgentflowClass>();
  readonly flows: AgentflowFlowModel[] = [];
  readonly tooltips = new Map<string, string>();
  readonly links: AgentflowLink[] = [];
  readonly callbacks: AgentflowCallback[] = [];
  defaultInterpolate: string | undefined;
  defaultStyle: string[] | undefined;
  accTitle = '';
  accDescr = '';
  private readonly flowById = new Map<string, AgentflowFlowModel>();
  /** The opener of each flow's first opening, for `CONTAINMENT_VIOLATION`. */
  private readonly flowAt = new Map<string, Range>();
  private readonly edgeById = new Map<string, AgentflowModelEdge>();
  private readonly connectorIds: string[] = [];
  private readonly globalNodes = new Set<string>();
  /** Edges so far per start, then per end. */
  private readonly pairCount = new Map<string, Map<string, number>>();
  /** Ids some flow lists (v12's `makeUniq` scan, as a set). */
  private readonly members = new Set<string>();
  private readonly marks = new Map<string, VertexMarks>();
  /** First mention of each vertex. */
  private readonly firstAt = new Map<string, Range>();
  private subCount = 0;
  /** Limits already reported, so a breach is one diagnostic, not one per item. */
  private readonly limitHit = new Set<'edges' | 'nodes'>();
  private readonly reservedAt: Range[] = [];
  private readonly replaced: { at: Range; id: string; first: Range }[] = [];
  private readonly findings: AgentflowFinding[] = [];

  constructor(private readonly options: BuilderOptions) {}

  /** Whether `id` names an edge (`id@`), which v12 never turns into a vertex. */
  hasEdge(id: string): boolean {
    return this.edgeById.has(id);
  }

  /** The edge `id` names (the first one given it), if any. */
  edgeNamed(id: string): AgentflowModelEdge | undefined {
    return this.edgeById.get(id);
  }

  /** Whether `id` is a connector. */
  isConnector(id: string): boolean {
    return this.vertices.get(id)?.connector === true;
  }

  private marksOf(id: string): VertexMarks {
    let m = this.marks.get(id);
    if (!m) this.marks.set(id, (m = { dataAt: [] }));
    return m;
  }

  /** v12 `addVertex`: route `parts` to a flow, connector or edge, else to the vertex `id`. */
  addVertex(id: string, ast: AstId, at: Range, parts: VertexParts = {}): void {
    if (!id || id.trim().length === 0) return;
    const { label, type, styles, props, data } = parts;
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

    if (this.routed(id, doc, at)) return;
    let vertex = this.vertices.get(id);
    if (vertex === undefined) {
      if (this.vertices.size >= this.options.maxNodes) {
        if (!this.limitHit.has('nodes')) {
          this.limitHit.add('nodes');
          this.options.error(
            LIMIT_CODES.maxNodes,
            `Node limit exceeded: the diagram has more than ${this.options.maxNodes} nodes. The limit is set by the page or app that renders the diagram.`,
            at
          );
        }
        return;
      }
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
      vertex.text = unquote(label.text.trim());
    }
    if (type !== undefined) {
      vertex.type = type;
      this.marksOf(id).shapeAt = parts.shapeAt ?? at;
    }
    if (styles) vertex.styles.push(...styles);
    if (props) for (const [k, v] of Object.entries(props)) vertex.props[k] = v;
    if (doc === undefined) return;

    vertex.metadata = { ...vertex.metadata, ...doc };
    const marks = this.marksOf(id);
    marks.dataAt.push(at);
    if ('view' in doc) marks.viewAt = at;
    if (doc.shape) this.dataShape(vertex, authored, doc.shape, at);
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
    vertex.labelType = labelType(type);
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
  private routed(id: string, doc: YamlMap | undefined, at: Range): boolean {
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
      this.reservedAt.push(at);
      return true;
    }
    const edge = this.edgeById.get(id);
    if (!edge) return false;
    if (doc) this.edgeData(edge, doc, at);
    return true;
  }

  /** v12's `@{ shape }` checks, which threw: unknown shapes are errors. */
  private dataShape(vertex: AgentflowVertex, authored: unknown, shape: unknown, at: Range): void {
    const { options } = this;
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
      const bare = authored.replace(/[\s,]+$/, '');
      const comma =
        bare !== authored && isValidShape(resolveShape(bare) ?? bare)
          ? ` The comma is part of the name: remove it (\`shape: ${bare}\`), or quote the name (\`shape: "${bare}",\`).`
          : '';
      options.error('UNKNOWN_SHAPE', `No such shape: ${resolved}.${comma}`, at);
      return;
    }
    vertex.type = resolved;
    this.marksOf(vertex.id).shapeAt = at;
  }

  // An edge's `@{…}` keys: all kept as metadata; the presentation ones typed, anything else
  // in them dropped with a warning rather than reaching the model as the wrong type.
  private edgeData(edge: AgentflowModelEdge, doc: YamlMap, at: Range): void {
    edge.metadata = { ...edge.metadata, ...doc };
    const drop = (key: string, want: string) =>
      this.options.warn(
        'EDGE_DATA_DROPPED',
        `Edge ${JSON.stringify(edge.id)}: ${key} must be ${want}; ${JSON.stringify(doc[key])} was ignored.`,
        at
      );
    const { animate, animation, curve } = doc;
    if (animate !== undefined) {
      if (typeof animate === 'boolean') edge.animate = animate;
      else if (animate === 'true' || animate === 'false') edge.animate = animate === 'true';
      else drop('animate', 'true or false');
    }
    if (animation !== undefined) {
      if (animation === 'fast' || animation === 'slow') edge.animation = animation;
      else drop('animation', 'fast or slow');
    }
    if (curve !== undefined) {
      if (typeof curve === 'string') edge.interpolate = curve;
      else drop('curve', 'a curve name');
    }
  }

  private addSingleLink(parts: {
    start: string;
    end: string;
    info: LinkInfo;
    /** The user's id, when this edge takes it. */
    id: string | undefined;
    ast: AstId;
  }): void {
    const { start, end, info, id, ast } = parts;
    const edge: AgentflowModelEdge = {
      id: '',
      ast,
      isUserDefinedId: false,
      start,
      end,
      type: info.type,
      stroke: info.stroke,
      text: '',
      labelType: 'text',
      classes: [],
    };
    if (info.length !== undefined) edge.length = info.length > 10 ? 10 : info.length;
    if (info.semantic !== undefined) edge.semantic = info.semantic;
    if (this.defaultInterpolate !== undefined) edge.interpolate = this.defaultInterpolate;
    if (info.text !== undefined) {
      edge.text = unquote(info.text.text.trim());
      edge.labelType = labelType(info.text.type);
    }
    let ends = this.pairCount.get(start);
    if (!ends) this.pairCount.set(start, (ends = new Map<string, number>()));
    const count = ends.get(end) ?? 0;
    if (id && !this.edgeById.has(id)) {
      edge.id = id;
      edge.isUserDefinedId = true;
    } else edge.id = `L_${start}_${end}_${count === 0 ? 0 : count + 1}`;
    this.edges.push(edge);
    ends.set(end, count + 1);
    if (!this.edgeById.has(edge.id)) this.edgeById.set(edge.id, edge);
  }

  /** v12 `addLink`: every start to every end; the user id goes to the last-start/first-end pair. */
  addLink(parts: LinkParts): void {
    const { starts, ends, info, astFor, at } = parts;
    if (this.limitHit.has('edges')) return;
    // Checked before making any: `A & … --> B & …` multiplies, so one short line can ask for
    // millions of edges (v12 checked one edge at a time).
    const max = this.options.maxEdges;
    const wanted = this.edges.length + starts.length * ends.length;
    if (wanted > max) {
      this.limitHit.add('edges');
      this.options.error(
        LIMIT_CODES.maxEdges,
        `Edge limit exceeded: the diagram asks for ${wanted} edges, but the limit is ${max}. The limit is set by the page or app that renders the diagram.`,
        at
      );
      return;
    }
    const id = info.id?.replace('@', '');
    const lastStart = starts[starts.length - 1];
    const firstEnd = ends[0];
    for (const start of starts) {
      for (const end of ends) {
        const own = start === lastStart && end === firstEnd ? id : undefined;
        this.addSingleLink({ start, end, info, id: own, ast: astFor(start, end) });
      }
    }
  }

  /**
   * The edge `pos` names. v12 indexed `edges[pos]` with the index text and threw a TypeError
   * for any other; v13 reports its bounds message (D461).
   */
  private edgeAt(pos: string, at: Range): AgentflowModelEdge | undefined {
    const edge = /^(?:0|[1-9]\d*)$/.test(pos) ? this.edges[Number(pos)] : undefined;
    if (!edge) {
      this.options.error(
        'LINK_STYLE_INDEX',
        `The index ${pos} for linkStyle is out of bounds. Valid indices for linkStyle are between 0 and ${this.edges.length - 1}. (Help: Ensure that the index is within the range of existing edges.)`,
        at
      );
    }
    return edge;
  }

  /** v12 `updateLinkInterpolate`; returns false (after reporting) for a missing edge. */
  updateLinkInterpolate(positions: string[], interpolate: string, at: Range): boolean {
    for (const pos of positions) {
      if (pos === 'default') this.defaultInterpolate = interpolate;
      else {
        const edge = this.edgeAt(pos, at);
        if (!edge) return false;
        edge.interpolate = interpolate;
      }
    }
    return true;
  }

  /** v12 `updateLink`; returns false (after reporting) for a missing edge. */
  updateLink(positions: string[], style: string[], at: Range): boolean {
    for (const pos of positions) {
      if (pos === 'default') {
        this.defaultStyle = style;
        continue;
      }
      const edge = this.edgeAt(pos, at);
      if (!edge) return false;
      edge.style = style;
      if (style.length > 0 && !style.some((s) => s.startsWith('fill'))) style.push('fill:none');
    }
    return true;
  }

  addClass(ids: string, styles: string[]): void {
    const style = styles
      .join()
      .replace(/\\,/g, '§§§')
      .replace(/,/g, ';')
      .replace(/§§§/g, ',')
      .split(';');
    for (const id of ids.split(',')) {
      let def = this.classes.get(id);
      if (def === undefined) {
        def = { id, styles: [], textStyles: [] };
        this.classes.set(id, def);
      }
      for (const s of style) {
        if (s.includes('color')) def.textStyles.push(s.replace('fill', 'bgFill'));
        def.styles.push(s);
      }
    }
  }

  setDirection(dir: string): void {
    let d = dir.trim();
    if (d.includes('<')) d = 'RL';
    if (d.includes('^')) d = 'BT';
    if (d.includes('>')) d = 'LR';
    if (d.includes('v')) d = 'TB';
    if (d === 'TD') d = 'TB';
    this.direction = d;
  }

  setClass(ids: string, className: string): void {
    for (const id of ids.split(',')) {
      this.vertices.get(id)?.classes.push(className);
      this.edgeById.get(id)?.classes.push(className);
      this.flowById.get(id)?.classes.push(className);
    }
  }

  setTooltip(ids: string, tooltip: string): void {
    for (const id of ids.split(',')) this.tooltips.set(id, tooltip);
  }

  setLink(ids: string, url: string, at: Range, target?: string): void {
    const trimmed = url.trim();
    for (const id of ids.split(',')) {
      this.links.push(
        target === undefined
          ? { id, url: trimmed, range: at }
          : { id, url: trimmed, target, range: at }
      );
      const vertex = this.vertices.get(id);
      if (vertex !== undefined) {
        vertex.link = trimmed;
        if (target === undefined) delete vertex.linkTarget;
        else vertex.linkTarget = target;
      }
    }
    this.setClass(ids, 'clickable');
  }

  setClickEvent(ids: string, name: string, at: Range, args?: string): void {
    for (const id of ids.split(',')) {
      this.callbacks.push(
        args === undefined ? { id, name, range: at } : { id, name, args, range: at }
      );
    }
    this.setClass(ids, 'clickable');
  }

  setAccTitle(text: string): void {
    this.accTitle = text.replace(/^\s+/g, '');
  }

  setAccDescription(text: string): void {
    this.accDescr = text.replace(/\n\s+/g, '\n');
  }

  /**
   * v12 `addSubGraph` for `flow`: `idText` is the id as written (none for an anonymous flow),
   * `titleText` the bracketed title. Returns the flow id.
   */
  addFlow(parts: FlowParts): string {
    const { id: idText, list, title: titleText, opener, astFor } = parts;
    const seen = new Set<string>();
    const nodeList: string[] = [];
    let dir: string | undefined;
    const add = (item: string) => {
      if (item.trim() !== '' && !seen.has(item)) {
        seen.add(item);
        nodeList.push(item);
      }
    };
    for (const entry of list) {
      if (typeof entry === 'string') add(entry);
      else if ('stmt' in entry) dir = entry.value;
      else entry.forEach(add);
    }
    if (dir === undefined && this.options.inheritDir) dir = this.direction;

    const id = idText?.text.trim() ?? 'subGraph' + this.subCount;
    this.subCount++;
    const { members, globalNodes } = this;
    // A node belongs to the first flow that lists it; a flow never contains itself, nor a
    // node written in a `global` block.
    const nodes = nodeList.filter((n) => n !== id && !globalNodes.has(n) && !members.has(n));
    for (const n of nodes) members.add(n);
    const title = (titleText?.text ?? '').trim();
    const existing = this.flowById.get(id);
    if (existing) {
      // An id opened again merges into the first; its last title and direction win.
      existing.nodes.push(...nodes);
      if (title) existing.title = title;
      if (dir !== undefined) existing.dir = dir;
      astFor(id);
      return id;
    }
    const flow: AgentflowFlowModel = {
      id,
      ast: astFor(id),
      title,
      labelType: labelType(titleText?.type),
      nodes,
      classes: [],
      styles: [],
      collapsed: false,
    };
    if (dir !== undefined) flow.dir = dir;
    this.flows.push(flow);
    this.flowById.set(id, flow);
    this.flowAt.set(id, opener);
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
      this.replaced.push({ at, id, first: this.firstAt.get(id) ?? at });
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
      if (marks.dataAt.length === 0) continue;
      if (flowById.has(id)) {
        for (const at of marks.dataAt) {
          dropped.push({ at, message: `The metadata on \`${id}\` is lost.` });
        }
      } else if (marks.viewAt !== undefined && vertices.get(id)?.connector !== true) {
        ignored.push({ at: marks.viewAt, message: `\`view\` on the node \`${id}\` is ignored.` });
      }
    }
    const once = (code: string, list: Occurrences, message: (first: string) => string) => {
      const [first, ...rest] = list;
      if (!first) return;
      const related = rest.map((o) => ({ message: o.message, range: o.at }));
      options.warn(code, message(first.message), first.at, related.length ? related : undefined);
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
        this.reservedAt.map((at) => ({ at, message: 'The node `connectors` is left out.' })),
        () =>
          '`connectors` is a reserved id: the node is left out of the diagram and its edges have no end there (as in v12). Use another id.'
      );
    }
    once(
      'AGENTFLOW_CONNECTOR_REPLACED',
      this.replaced.map(({ at, id, first }) => ({
        at,
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
      const range = this.flowAt.get(id) ?? NO_RANGE;
      this.options.warn('CONTAINMENT_VIOLATION', message, range);
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
      const range = this.marks.get(v.id)?.shapeAt ?? this.firstAt.get(v.id) ?? NO_RANGE;
      this.options.warn(id, message, range);
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
