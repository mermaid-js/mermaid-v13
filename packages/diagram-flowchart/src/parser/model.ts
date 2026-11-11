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
import { isYamlMap } from '@mermaid-js/core/preprocess';
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
import { isValidShape } from './shapes.ts';

export type LabelType = FlowLabelType;
export type FlowLabel = FlowLabelText;

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

export interface FlowModelEdge extends FlowEdgeRecord {
  /** `arrow_point`, `arrow_open`, `double_arrow_cross`, …, or `INVALID`. */
  type: string;
  /** `normal`, `thick`, `dotted`, `invisible` or `INVALID`. */
  stroke: string;
  step?: number;
}

export type FlowClass = FlowClassRecord;

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

/** A `click … href`/URL statement. */
export type FlowLink = FlowLinkRecord;
/** A `click … callback` or `call` statement. */
export type FlowCallback = FlowCallbackRecord;

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

export type LinkInfo = FlowLinkInfo;

/** Item of a subgraph body as v12's grammar collects it. */
export type DocItem = FlowDocItem;

export type BuilderOptions = FlowBuilderOptions;

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

/** What one mention of a vertex sets. */
export type VertexParts = FlowVertexParts;

/** Collects one parse's model, in v12 FlowDB order. Create one per parse. */
export class FlowBuilder extends FlowBuilderBase<
  FlowVertex,
  FlowModelEdge,
  LinkInfo,
  BuilderOptions
> {
  readonly subgraphs: FlowModelSubgraph[] = [];
  private readonly subgraphById = new Map<string, FlowModelSubgraph>();
  private readonly members = new Set<string>();
  private subCount = 0;
  /** `style X` on an id nothing defined yet; warned at the end unless X is a subgraph. */
  private readonly unknownStyles: { id: string; at: Range }[] = [];

  protected edgeOf(edge: FlowEdgeRecord): FlowModelEdge {
    return edge;
  }

  protected container(id: string): FlowModelSubgraph | undefined {
    return this.subgraphById.get(id);
  }

  protected noEdgeAt(pos: string): string {
    const n = this.edges.length;
    if (n === 0) return `linkStyle ${pos} refers to a link, but there are no links above it.`;
    return `linkStyle ${pos} refers to a link that does not exist: there ${
      n === 1
        ? 'is 1 link above it, number 0'
        : `are ${n} links above it, numbered from 0 to ${n - 1}`
    }.`;
  }

  /** v12 `addVertex`: create the vertex `id` if it is new, then apply `parts` to it. */
  addVertex(id: string, ast: AstId, at: Range, parts: VertexParts = {}): void {
    if (!id || id.trim().length === 0) return;
    const { label, type, styles, props, data } = parts;
    let doc: YamlMap | undefined;
    if (data !== undefined && isYamlMap(data)) {
      doc = { ...data };
      for (const key of INTERNAL_METADATA_KEYS) delete doc[key];
    }

    const subgraph = this.subgraphById.get(id);
    if (subgraph && doc) {
      if (Object.keys(doc).length > 0) subgraph.metadata = { ...subgraph.metadata, ...doc };
      return;
    }

    const edge = this.edgeById.get(id);
    if (edge) {
      if (doc) this.edgeData(edge, doc, at);
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
      if (this.atNodeLimit(at)) return;
      // `props` keys are the author's: no prototype, so `__proto__` is a key like any other.
      const own = Object.create(null) as Record<string, string>;
      vertex = { id, ast, text: id, labelType: 'text', styles: [], classes: [], props: own };
      this.vertices.set(id, vertex);
    }
    if (label !== undefined) {
      vertex.labelType = label.type;
      vertex.text = unquoteLabel(label.text.trim());
    }
    if (type !== undefined) vertex.type = type;
    if (styles) vertex.styles.push(...styles);
    if (props) for (const [k, v] of Object.entries(props)) vertex.props[k] = v;

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
      vertex.labelType = flowLabelType(doc.labelType);
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
    const w = Number(doc.w);
    const h = Number(doc.h);
    if (doc.w && Number.isFinite(w)) vertex.assetWidth = w;
    if (doc.h && Number.isFinite(h)) vertex.assetHeight = h;
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

    const { nodeList, dir } = this.listed(list);

    id ??= 'subGraph' + this.subCount;
    this.subCount++;
    const members = this.members;
    const subgraph: FlowModelSubgraph = {
      id,
      ast: astFor(id),
      title: (titleText?.text ?? '').trim(),
      labelType: flowLabelType(titleText?.type),
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
