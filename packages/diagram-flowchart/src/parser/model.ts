/**
 * FlowModel: the plain-data result of a flowchart parse (DESIGN §4.3), and the builder the
 * parser drives. The builder reproduces what v12's `FlowDB` did with each parsed statement,
 * ported from Pele's `src/diagrams/flowchart/db.ts` @ 3a2f075 (https://github.com/obsidianmd/pele,
 * MIT, (c) 2026 kepano) and checked against v12.2's `flowDb.ts`.
 *
 * Differences from v12's FlowDB: text is kept as written (no sanitising: that happens when
 * SVG is written), links keep the URL as written (checked at render time), callbacks are
 * recorded instead of bound, and errors are diagnostics instead of exceptions.
 */
// cspell:words kepano
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';
import type { YamlMap, YamlValue } from '@mermaid-js/core/preprocess';
import { isValidShape } from './shapes.ts';

export type LabelType = 'text' | 'string' | 'markdown';

export interface FlowLabel {
  text: string;
  type: LabelType;
}

export interface FlowVertex {
  id: string;
  /** AST id of the vertex's first mention, e.g. `n:A`. */
  ast: AstId;
  text: string;
  labelType: LabelType;
  /**
   * v12 vertex type: a bracket shape (`square`, `round`, `diamond`, …) or a `@{ shape }`
   * name. Undefined for a bare id.
   */
  type?: string;
  styles: string[];
  classes: string[];
  /** `[|field:value|…]` properties. */
  props: Record<string, string>;
  dir?: string;
  /** `click` URL as written (trimmed). Checked against `securityLevel` when SVG is written. */
  link?: string;
  linkTarget?: string;
  icon?: string;
  form?: string;
  pos?: string;
  img?: string;
  constraint?: string;
  assetWidth?: number;
  assetHeight?: number;
}

export interface FlowModelEdge {
  /** Model id: the user's `id@` or `L_<start>_<end>_<n>`. */
  id: string;
  ast: AstId;
  isUserDefinedId: boolean;
  start: string;
  end: string;
  /** `arrow_point`, `arrow_open`, `double_arrow_cross`, …, or `INVALID`. */
  type: string;
  /** `normal`, `thick`, `dotted`, `invisible` or `INVALID`. */
  stroke: string;
  length?: number;
  text: string;
  labelType: LabelType;
  classes: string[];
  style?: string[];
  interpolate?: string;
  animate?: boolean;
  animation?: string;
  step?: number;
}

export interface FlowClass {
  id: string;
  styles: string[];
  textStyles: string[];
}

export interface FlowModelSubgraph {
  id: string;
  ast: AstId;
  title: string;
  labelType: LabelType;
  /** Member ids in the order v12 lists them. */
  nodes: string[];
  classes: string[];
  dir?: string;
  metadata?: YamlMap;
}

export interface FlowLink {
  /** Vertex id. */
  id: string;
  url: string;
  target?: string;
  range: Range;
}

export interface FlowCallback {
  /** Vertex id. */
  id: string;
  name: string;
  args?: string;
  range: Range;
}

export interface FlowModel {
  /** `TB`, `BT`, `LR` or `RL` (v12 maps `TD`, `v`, `<`, `>`, `^`). */
  direction: string;
  vertices: FlowVertex[];
  edges: FlowModelEdge[];
  /** `linkStyle default interpolate …`. */
  defaultInterpolate?: string;
  /** `linkStyle default …`. */
  defaultStyle?: string[];
  classes: FlowClass[];
  subgraphs: FlowModelSubgraph[];
  /** `[id, tooltip]` in the order the ids first got one. */
  tooltips: [string, string][];
  /** `click … href`/URL statements, in source order. */
  links: FlowLink[];
  /** `click … callback` / `call` statements. Ignored unless a plugin claims `callbacks`. */
  callbacks: FlowCallback[];
  accTitle: string;
  accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  warnings: Diagnostic[];
}

export interface LinkInfo {
  type: string;
  stroke: string;
  length?: number;
  text?: FlowLabel;
  id?: string;
}

/** Item of a subgraph body as v12's grammar collects it. */
export type DocItem = string | string[] | { stmt: 'dir'; value: string };

export interface BuilderOptions {
  maxEdges: number;
  maxNodes: number;
  inheritDir: boolean;
  error(code: string, message: string, range: Range): void;
  warn(code: string, message: string, range: Range): void;
}

function labelType(type: unknown): LabelType {
  return type === 'markdown' || type === 'string' || type === 'text' ? type : 'markdown';
}

function unquote(text: string): string {
  return text.startsWith('"') && text.endsWith('"') ? text.substring(1, text.length - 1) : text;
}

function countChar(ch: string, str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) if (str[i] === ch) count++;
  return count;
}

// The v12 arrow type of each arrowhead character, and the start character that doubles an end.
const ARROW_TYPE: Readonly<Record<string, string>> = {
  '<': 'arrow_point',
  x: 'arrow_cross',
  o: 'arrow_circle',
};
const ARROW_TWIN: ReadonlyMap<string, string> = new Map([
  ['x', 'x'],
  ['>', '<'],
  ['o', 'o'],
]);

function destructStartLink(raw: string): { type: string; stroke: string; length?: number } {
  let str = raw.trim();
  let type = 'arrow_open';
  const first = str[0];
  if (first === '<' || first === 'x' || first === 'o') {
    type = ARROW_TYPE[first]!;
    str = str.slice(1);
  }
  let stroke = 'normal';
  if (str.includes('=')) stroke = 'thick';
  if (str.includes('.')) stroke = 'dotted';
  return { type, stroke };
}

function destructEndLink(raw: string): { type: string; stroke: string; length: number } {
  const str = raw.trim();
  let line = str.slice(0, -1);
  let type = 'arrow_open';
  const last = str.slice(-1);
  const twin = ARROW_TWIN.get(last);
  if (twin) {
    type = ARROW_TYPE[twin]!;
    if (str.startsWith(twin)) {
      type = 'double_' + type;
      line = line.slice(1);
    }
  }
  let stroke = 'normal';
  let length = line.length - 1;
  if (line.startsWith('=')) stroke = 'thick';
  if (line.startsWith('~')) stroke = 'invisible';
  const dots = countChar('.', line);
  if (dots) {
    stroke = 'dotted';
    length = dots;
  }
  return { type, stroke, length };
}

/** v12 `FlowDB.destructLink`. */
export function destructLink(end: string, start?: string): LinkInfo {
  const info = destructEndLink(end);
  if (!start) return info;
  const startInfo = destructStartLink(start);
  if (startInfo.stroke !== info.stroke) return { type: 'INVALID', stroke: 'INVALID' };
  if (startInfo.type === 'arrow_open') startInfo.type = info.type;
  else {
    if (startInfo.type !== info.type) return { type: 'INVALID', stroke: 'INVALID' };
    startInfo.type = 'double_' + startInfo.type;
  }
  if (startInfo.type === 'double_arrow') startInfo.type = 'double_arrow_point';
  startInfo.length = info.length;
  return startInfo;
}

const INTERNAL_METADATA_KEYS = ['laneRole', 'laneIndex', 'drawnExtent'];

const isMap = (v: YamlValue | undefined): v is YamlMap =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Collects one parse's model, in v12 FlowDB order. Create one per parse. */
export class FlowBuilder {
  direction = 'TB';
  readonly vertices = new Map<string, FlowVertex>();
  readonly edges: FlowModelEdge[] = [];
  readonly classes = new Map<string, FlowClass>();
  readonly subgraphs: FlowModelSubgraph[] = [];
  readonly tooltips = new Map<string, string>();
  readonly links: FlowLink[] = [];
  readonly callbacks: FlowCallback[] = [];
  defaultInterpolate: string | undefined;
  defaultStyle: string[] | undefined;
  accTitle = '';
  accDescr = '';
  private readonly subgraphById = new Map<string, FlowModelSubgraph>();
  private readonly edgeById = new Map<string, FlowModelEdge>();
  private readonly pairCount = new Map<string, number>();
  private readonly members = new Set<string>();
  private subCount = 0;
  /** Limits already reported, so a breach is one diagnostic, not one per item. */
  private readonly limitHit = new Set<'edges' | 'nodes'>();
  /** `style X` on an id nothing defined yet; warned at the end unless X is a subgraph. */
  private readonly unknownStyles: { id: string; at: Range }[] = [];

  constructor(private readonly options: BuilderOptions) {}

  /** Whether `id` names an edge (`id@`), which v12 never turns into a vertex. */
  hasEdge(id: string): boolean {
    return this.edgeById.has(id);
  }

  /** v12 `addVertex`. `data` is the parsed `@{…}` block. Returns whether it created a vertex. */
  addVertex(
    id: string,
    ast: AstId,
    at: Range,
    label?: FlowLabel,
    type?: string,
    styles?: string[],
    props?: Record<string, string>,
    data?: YamlMap | null
  ): void {
    if (!id || id.trim().length === 0) return;
    let doc: YamlMap | undefined;
    if (data !== undefined) {
      if (isMap(data)) {
        doc = { ...data };
        for (const key of INTERNAL_METADATA_KEYS) delete doc[key];
      }
    }

    const subgraph = this.subgraphById.get(id);
    if (subgraph && doc) {
      if (Object.keys(doc).length > 0) subgraph.metadata = { ...subgraph.metadata, ...doc };
      return;
    }

    const edge = this.edgeById.get(id);
    if (edge) {
      if (doc?.animate !== undefined) edge.animate = doc.animate as boolean;
      if (doc?.animation !== undefined) edge.animation = doc.animation as string;
      if (doc?.curve !== undefined) edge.interpolate = doc.curve as string;
      if (doc?.step !== undefined) {
        const step = doc.step;
        if (typeof step === 'number' && Number.isInteger(step) && step > 0) edge.step = step;
      }
      return;
    }

    let vertex = this.vertices.get(id);
    if (vertex === undefined) {
      // Reported in finish(): a subgraph with this id (defined before or after) takes the style.
      if (label === undefined && type === undefined && styles !== undefined)
        this.unknownStyles.push({ id, at });
      if (this.vertices.size >= this.options.maxNodes) {
        if (!this.limitHit.has('nodes')) {
          this.limitHit.add('nodes');
          this.options.error(
            'NODE_LIMIT',
            `Node limit exceeded: the diagram has more than ${this.options.maxNodes} nodes. The limit is set by the page or app that renders the diagram.`,
            at
          );
        }
        return;
      }
      vertex = { id, ast, text: id, labelType: 'text', styles: [], classes: [], props: {} };
      this.vertices.set(id, vertex);
    }
    if (label !== undefined) {
      vertex.labelType = label.type;
      vertex.text = unquote(label.text.trim());
    }
    if (type !== undefined) vertex.type = type;
    if (styles) vertex.styles.push(...styles);
    if (props) Object.assign(vertex.props, props);

    if (doc === undefined) return;
    if (doc.shape) {
      const shape = doc.shape;
      if (typeof shape !== 'string') {
        this.options.error('UNKNOWN_SHAPE', `No such shape: ${String(shape)}.`, at);
      } else if (shape !== shape.toLowerCase() || shape.includes('_')) {
        this.options.error(
          'UNKNOWN_SHAPE',
          `No such shape: ${shape}. Shape names should be lowercase.`,
          at
        );
      } else if (!isValidShape(shape)) {
        this.options.error('UNKNOWN_SHAPE', `No such shape: ${shape}.`, at);
      } else vertex.type = shape;
    }
    const docLabel = typeof doc.label === 'string' ? doc.label : undefined;
    if (doc.label) {
      vertex.text = String(doc.label);
      vertex.labelType = labelType(doc.labelType);
    }
    if (doc.icon) {
      vertex.icon = String(doc.icon);
      if (!docLabel?.trim() && vertex.text === id) vertex.text = '';
    }
    if (doc.form) vertex.form = String(doc.form);
    if (doc.pos) vertex.pos = String(doc.pos);
    if (doc.img) {
      vertex.img = String(doc.img);
      if (!docLabel?.trim() && vertex.text === id) vertex.text = '';
    }
    if (doc.constraint) vertex.constraint = String(doc.constraint);
    if (doc.w) vertex.assetWidth = Number(doc.w);
    if (doc.h) vertex.assetHeight = Number(doc.h);
  }

  private addSingleLink(
    start: string,
    end: string,
    info: LinkInfo,
    id: string | undefined,
    ast: AstId
  ): void {
    const edge: FlowModelEdge = {
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
    if (this.defaultInterpolate !== undefined) edge.interpolate = this.defaultInterpolate;
    if (info.text !== undefined) {
      edge.text = unquote(info.text.text.trim());
      edge.labelType = labelType(info.text.type);
    }
    const pair = start + '\0' + end;
    const count = this.pairCount.get(pair) ?? 0;
    if (id && !this.edgeById.has(id)) {
      edge.id = id;
      edge.isUserDefinedId = true;
    } else edge.id = `L_${start}_${end}_${count === 0 ? 0 : count + 1}`;
    this.edges.push(edge);
    this.pairCount.set(pair, count + 1);
    if (!this.edgeById.has(edge.id)) this.edgeById.set(edge.id, edge);
  }

  /** v12 `addLink`: every start to every end; the user id goes to the last-start/first-end pair. */
  addLink(
    starts: string[],
    ends: string[],
    info: LinkInfo,
    astFor: (start: string, end: string) => AstId,
    at: Range
  ): void {
    if (this.limitHit.has('edges')) return;
    // Checked before making any: `A & … --> B & …` multiplies, so one short line can ask
    // for millions of edges (v12 checked one edge at a time, with the same message).
    const max = this.options.maxEdges;
    if (this.edges.length + starts.length * ends.length > max) {
      this.limitHit.add('edges');
      this.options.error(
        'EDGE_LIMIT',
        `Edge limit exceeded. ${max} edges found, but the limit is ${max}. Raise maxEdges in the configuration passed to initialize() to allow more edges.`,
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
        this.addSingleLink(start, end, info, own, astFor(start, end));
      }
    }
  }

  /** v12 indexed `edges[pos]` with the index text, so only canonical integers hit an edge. */
  private edgeAt(pos: string, at: Range): FlowModelEdge | undefined {
    const edge = /^(?:0|[1-9]\d*)$/.test(pos) ? this.edges[Number(pos)] : undefined;
    if (!edge) {
      this.options.error(
        'LINK_STYLE_INDEX',
        this.edges.length === 0
          ? `linkStyle ${pos} refers to a link, but there are no links above it.`
          : `linkStyle ${pos} refers to a link that does not exist: there ${
              this.edges.length === 1
                ? 'is 1 link above it, number 0'
                : `are ${this.edges.length} links above it, numbered from 0 to ${this.edges.length - 1}`
            }.`,
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
      this.subgraphById.get(id)?.classes.push(className);
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

  /** v12 `addSubGraph`; returns the subgraph id. */
  addSubGraph(
    idText: FlowLabel | undefined,
    list: DocItem[],
    titleText: FlowLabel | undefined,
    astFor: (id: string) => AstId
  ): string {
    let id: string | undefined = idText?.text.trim();
    if (idText !== undefined && idText === titleText && /\s/.test(titleText.text)) id = undefined;

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
      else if (Array.isArray(entry)) entry.forEach(add);
      else dir = entry.value;
    }
    if (dir === undefined && this.options.inheritDir) dir = this.direction;

    id ??= 'subGraph' + this.subCount;
    this.subCount++;
    const members = this.members;
    const subgraph: FlowModelSubgraph = {
      id,
      ast: astFor(id),
      title: (titleText?.text ?? '').trim(),
      labelType: labelType(titleText?.type),
      // A node belongs to the first subgraph that lists it; a subgraph never contains itself.
      nodes: nodeList.filter((nodeId) => !members.has(nodeId) && nodeId !== id),
      classes: [],
    };
    if (dir !== undefined) subgraph.dir = dir;
    for (const nodeId of subgraph.nodes) members.add(nodeId);
    const existing = this.subgraphById.get(id);
    if (existing) existing.nodes.push(...subgraph.nodes);
    else this.subgraphs.push(subgraph);
    this.subgraphById.set(id, existing ?? subgraph);
    return id;
  }

  /** The subgraph with this id (a map lookup: a scan made many subgraphs quadratic). */
  subgraph(id: string): FlowModelSubgraph | undefined {
    return this.subgraphById.get(id);
  }

  /** Reports what needs the whole document: STYLE_UNKNOWN_NODE for ids that are not subgraphs. */
  finish(): void {
    for (const { id, at } of this.unknownStyles) {
      if (this.subgraphById.has(id)) continue;
      this.options.warn(
        'STYLE_UNKNOWN_NODE',
        `Style applied to unknown node "${id}". This may indicate a typo. The node will be created automatically.`,
        at
      );
    }
  }

  model(warnings: Diagnostic[]): FlowModel {
    const model: FlowModel = {
      direction: this.direction,
      vertices: [...this.vertices.values()],
      edges: this.edges,
      classes: [...this.classes.values()],
      subgraphs: this.subgraphs,
      tooltips: [...this.tooltips],
      links: this.links,
      callbacks: this.callbacks,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings,
    };
    if (this.defaultInterpolate !== undefined) model.defaultInterpolate = this.defaultInterpolate;
    if (this.defaultStyle !== undefined) model.defaultStyle = this.defaultStyle;
    return model;
  }
}
