// FlowModel → LayoutGraph: resolves group membership, collapsed subgraphs, class styles and
// edge defaults the way v12's FlowDB.getData did (via Pele's src/diagrams/flowchart/graph.ts
// @ 3a2f075, https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), and measures every label
// before layout (DESIGN §6.1).
// cspell:ignore kepano
import type { Dir, LayoutGraph, LayoutGroup, LayoutNode } from '@mermaid-js/core/layout';
import { fromPx, pxProfile } from '@mermaid-js/core/layout';
import { checkStyle, type CheckedStyle } from '@mermaid-js/core/svg';
import {
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import type { FlowModel, FlowModelEdge, FlowModelSubgraph, FlowVertex } from '../parser/index.ts';
import { configLengths, type ConfigLength } from './config-length.ts';
import type { FlowRenderContext } from './context.ts';
import { curveKind, type CurveKind } from './edges.ts';
import { dirOf, nesting, type Nesting } from './nesting.ts';
import { flowchartConfigDefaults } from '../generated/config-defaults.ts';
import { assetSize } from './assets.ts';
import {
  canonicalShape,
  shapeHasLabel,
  shapeSize,
  shapeSpan,
  type PadXY,
  type Pads,
  type ShapeSize,
} from './shapes.ts';

export interface NodeView {
  id: string;
  ast: string;
  /** A subgraph drawn as a cluster. */
  group: boolean;
  shape: string;
  label: MeasuredLabel;
  w: number;
  h: number;
  /** Label shift from the centre. */
  dy: number;
  style: CheckedStyle;
  classes: string[];
  parent?: string;
  vertex?: FlowVertex;
  /** Nesting depth of a cluster (0 at the top). */
  depth: number;
  /**
   * A subgraph's place in source order (pre-order over nesting, as v12 `declarationIndex`).
   * Subgraphs hidden inside a collapsed one still count, so collapsing does not shift the
   * palette cycle. The renderer turns it into a palette slot (#86).
   */
  order?: number;
}

export interface EdgeView {
  edge: FlowModelEdge;
  /** Layout edge id (the model id, made unique). */
  id: string;
  source: string;
  target: string;
  label: MeasuredLabel;
  style: CheckedStyle;
  start: string;
  end: string;
  curve: CurveKind;
}

export interface Prepared {
  graph: LayoutGraph;
  /** Clusters, outermost first. */
  groups: NodeView[];
  nodes: NodeView[];
  edges: EdgeView[];
  /** Every subgraph and vertex view by id, clusters included. */
  views: ReadonlyMap<string, NodeView>;
  pads: Pads;
}

// The smallest hexagonSlant drawn (a ratio, not a length): each pointed end as deep as the
// hexagon is tall.
const MIN_SLANT = 1;

const ROUTING: Readonly<Partial<Record<CurveKind, 'straight' | 'curved'>>> = {
  linear: 'straight',
  curved: 'curved',
};

function vertexShape(v: FlowVertex): string {
  if (v.img) return 'img';
  return v.icon ? 'icon' : canonicalShape(v.type);
}

const sideways = (d: Dir): boolean => d === 'LR' || d === 'RL';

function arrows(type: string, stroke: string): [string, string] {
  if (stroke === 'invisible' || type === 'arrow_open') return ['none', 'none'];
  if (type.startsWith('double_')) {
    const single = type.slice('double_'.length);
    return [single, single];
  }
  return ['none', type === 'arrow_circle' || type === 'arrow_cross' ? type : 'arrow_point'];
}

function textStyle(style: CheckedStyle, font: FontKey): [FontKey, number] {
  const t = style.text;
  const weight = t['font-weight'];
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  const bits = (bold ? Style.Bold : 0) | (t['font-style'] === 'italic' ? Style.Italic : 0);
  const size = fontSizePx(t['font-size'], font.size);
  return [size !== undefined && size > 0 && size < 1000 ? { ...font, size } : font, bits];
}

/** Everything the views and the graph are measured with. */
interface Measure {
  readonly ctx: FlowRenderContext;
  readonly font: FontKey;
  readonly pads: Pads;
  readonly wrap: number;
  readonly minWidth: number;
  /** Character cells: every node is a text-form box (DESIGN §6.3). */
  readonly cells: boolean;
  readonly label: (
    text: string,
    markdown: boolean,
    f: FontKey,
    max: number,
    bits?: number
  ) => MeasuredLabel;
  readonly styleOf: (classes: readonly string[], own?: readonly string[]) => CheckedStyle;
}

/**
 * Measures the model and builds the graph the layout engine gets. Every length comes from the
 * unit profile (D77, R-ARCH-3): px config values are divided by `pxPerUnit`, and the builder's
 * own lengths are `units.builder`. With the px profile the graph is today's, byte for byte.
 */
export function prepare(model: FlowModel, ctx: FlowRenderContext): Prepared {
  const { theme, measurer, inline } = ctx;
  const units = ctx.units ?? pxProfile;
  const flow = ctx.config.flowchart ?? {};
  const font: FontKey = {
    family: theme.value('fontFamily'),
    size: theme.number('fontSize'),
    weight: 400,
  };
  // flowchart.padding: the classic themes' padding variables are multiples of it (D152).
  const length = configLengths(flow, flowchartConfigDefaults, (w) => ctx.warn(w));
  const pad = length('padding') ?? flowchartConfigDefaults.padding!;
  const m: Measure = {
    ctx,
    font,
    pads: padsOf(ctx.theme, pad),
    wrap: fromPx(units, length('wrappingWidth') ?? 0, 'x') || units.builder.wrapWidth,
    minWidth: length('minNodeWidth') ?? 0,
    // This is the only place the builder looks at which profile it has.
    cells: units.id === 'cell',
    label: (text, markdown, f, max, bits = 0) =>
      layoutLabel(text, f, max, measurer, { markdown, style: bits, inline }),
    styleOf: styleCache(model, ctx),
  };
  const rootDir = dirOf(model.direction) ?? 'TB';
  const nest = nesting(model, rootDir);
  const { views, groups, nodes, layoutNodes } = nodeViews(model, nest, m);
  const edges = edgeViews(model, nest.collapsedInto, views, m);
  const graph = layoutGraph(model, rootDir, nest, { groups, layoutNodes, edges }, m, length);
  return { graph, groups, nodes, edges, views, pads: m.pads };
}

function padsOf(theme: FlowRenderContext['theme'], pad: number): Pads {
  const padOf = (name: string) => theme.padding(name, pad);
  const xy = (shape: string): PadXY => ({
    x: padOf(`${shape}PaddingX`),
    y: padOf(`${shape}PaddingY`),
  });
  return {
    node: xy('node'),
    r: theme.number('radius'),
    pad,
    stadium: xy('stadium'),
    hexagon: xy('hexagon'),
    // A slant of 0 would put the hexagon's points at infinity.
    hexagonSlant: Math.max(theme.number('hexagonSlant'), MIN_SLANT),
    subroutine: xy('subroutine'),
    cylinder: xy('cylinder'),
    lean: xy('lean'),
    odd: xy('odd'),
    ringGap: theme.number('doubleCircleGap'),
    ringPad: padOf('doubleCirclePadding'),
    circlePad: padOf('circlePadding'),
    circleMin: theme.number('circleMinDiameter'),
  };
}

/** The checked style of class names plus own declarations, one per distinct list. */
function styleCache(model: FlowModel, ctx: FlowRenderContext): Measure['styleOf'] {
  const classDefs = new Map<string, string[]>();
  for (const c of model.classes) classDefs.set(c.id, [...c.styles, ...c.textStyles]);
  const styles = new Map<string, CheckedStyle>();
  return (classes, own = []) => {
    const decls: string[] = [];
    for (const name of classes) {
      for (const s of classDefs.get(name) ?? []) decls.push(s.trim());
    }
    for (const s of own) decls.push(s.trim());
    const key = decls.join(';');
    let style = styles.get(key);
    if (!style) styles.set(key, (style = checkStyle(decls, ctx.warn)));
    return style;
  };
}

/** Build detached graph nodes directly, retaining model references until their labels are measured. */
function nodeViews(
  model: FlowModel,
  nest: Nesting,
  m: Measure
): Pick<Prepared, 'views' | 'groups' | 'nodes'> & { layoutNodes: LayoutNode[] } {
  const { collapsedInto, subgraphs } = nest;
  const views = new Map<string, NodeView>();
  const groups: NodeView[] = [];
  const nodes: NodeView[] = [];
  const layoutNodes: LayoutNode[] = [];
  // Styles are resolved before any labels, in source order, including a vertex that styles
  // an already declared subgraph. Keep references in columns, not one draft object per node.
  const sources: (FlowVertex | FlowModelSubgraph)[] = [];
  const ids: string[] = [];
  const asts: string[] = [];
  const orders: (number | undefined)[] = [];
  const styles: CheckedStyle[] = [];
  const classes: string[][] = [];
  const nodeIndices: number[] = [];
  const groupIndices: number[] = [];
  const measured: NodeView[] = [];
  const indices = new Map<string, number>();
  m.label('', false, m.font, 0);
  const stage = (source: FlowVertex | FlowModelSubgraph): number => {
    const i = sources.length;
    sources.push(source);
    ids.push(source.id);
    asts.push(source.ast);
    styles.push(m.styleOf([]));
    classes.push(source.classes);
    return i;
  };
  const addNode = (i: number, shape: string): void => {
    const id = ids[i]!;
    const node: LayoutNode = { id, width: 0, height: 0, shape };
    const parent = nest.parentOf.get(id);
    if (parent !== undefined) node.parent = parent;
    layoutNodes.push(node);
    nodeIndices.push(i);
  };
  for (const sg of model.subgraphs) {
    if (collapsedInto.has(sg.id)) continue;
    const collapsed = nest.isCollapsed(sg.id);
    const i = stage(sg);
    styles[i] = m.styleOf(sg.classes);
    orders[i] = nest.order.get(sg.id);
    indices.set(sg.id, i);
    if (collapsed) addNode(i, 'collapsedGroup');
    else groupIndices.push(i);
  }
  const subgraphCount = sources.length;
  for (const v of model.vertices) {
    if (collapsedInto.has(v.id)) continue;
    const existing = indices.get(v.id);
    if (existing !== undefined) {
      classes[existing] = v.classes;
      styles[existing] = m.styleOf(v.classes, v.styles);
      continue;
    }
    const shape = vertexShape(v);
    const i = stage(v);
    addNode(i, shape);
    styles[i] = m.styleOf(['default', 'node', ...v.classes], v.styles);
    indices.set(v.id, i);
  }
  const finish = (
    size: ShapeSize,
    i: number,
    group: boolean,
    shape: string,
    label: MeasuredLabel
  ): NodeView => {
    // Every sizer returns a fresh object. Promote it into the renderer's view instead of
    // copying its three fields into another record; the engine's node remains independent.
    const view = size as NodeView;
    const source = sources[i]!;
    view.id = ids[i]!;
    view.ast = asts[i]!;
    view.group = group;
    view.shape = shape;
    view.label = label;
    view.style = styles[i]!;
    view.classes = classes[i]!;
    view.parent = nest.parentOf.get(view.id);
    view.depth = nest.depthOf(view.id);
    if (i < subgraphCount) view.order = orders[i];
    else view.vertex = source as FlowVertex;
    measured[i] = view;
    return view;
  };
  for (let n = 0; n < layoutNodes.length; n++) {
    const node = layoutNodes[n]!;
    const i = nodeIndices[n]!;
    const source = sources[i]!;
    const sg = subgraphs.get(node.id);
    const v = i < subgraphCount ? undefined : (source as FlowVertex);
    const text = sg ? sg.title : v!.text;
    const markdown = (sg ? sg.labelType : v!.labelType) === 'markdown';
    const shape = node.shape!;
    const has = shapeHasLabel(shape);
    const [f, bits] = textStyle(styles[i]!, m.font);
    const label = m.label(has || v?.img || v?.icon ? text : '', markdown, f, m.wrap, bits);
    const size = measureNode(shape, has, label, m, v);
    const view = finish(size, i, false, shape, label);
    nodes.push(view);
    node.width = view.w;
    node.height = view.h;
  }
  for (const i of groupIndices) {
    const sg = subgraphs.get(ids[i]!)!;
    const [f, bits] = textStyle(styles[i]!, m.font);
    const label = m.label(sg.title, sg.labelType === 'markdown', f, Infinity, bits);
    groups.push(finish({ w: 0, h: 0, dy: 0 }, i, true, 'rect', label));
  }
  // The map keeps declaration order even though nodes are measured before cluster titles.
  indices.forEach((i, id) => views.set(id, measured[i]!));
  groups.sort((g, h) => g.depth - h.depth);
  return { views, groups, nodes, layoutNodes };
}

function measureNode(
  shape: string,
  has: boolean,
  label: MeasuredLabel,
  m: Measure,
  v?: FlowVertex
): ShapeSize {
  const lw = label.width;
  const lh = label.height;
  if (m.cells) {
    // A text-form box includes label padding and a border cell on each side.
    const pad = (m.ctx.units ?? pxProfile).builder.nodePad;
    return { w: lw + 2 * (pad.x + 1), h: label.lines.length + 2 * (pad.y + 1), dy: 0 };
  }
  // v12 widens vertex labels to minNodeWidth; round shapes and collapsed subgraphs keep theirs.
  const keepWidth = shape === 'circle' || shape === 'dbl-circ' || shape === 'collapsedGroup';
  return v?.img || v?.icon
    ? assetSize(v, lw, lh)
    : shapeSize(shape, lw > 0 && has && !keepWidth ? Math.max(lw, m.minWidth) : lw, lh, m.pads);
}

/** One view per drawn edge; edges into a collapsed subgraph end at it, and a loop it hides goes. */
function edgeViews(
  model: FlowModel,
  collapsedInto: ReadonlyMap<string, string>,
  views: ReadonlyMap<string, NodeView>,
  m: Measure
): EdgeView[] {
  const flow = m.ctx.config.flowchart ?? {};
  const edgeWrap = (m.ctx.units ?? pxProfile).builder.edgeWrap;
  const edges: EdgeView[] = [];
  const ids = new Set<string>();
  for (const e of model.edges) {
    const source = collapsedInto.get(e.start) ?? e.start;
    const target = collapsedInto.get(e.end) ?? e.end;
    if (!views.has(source) || !views.has(target)) continue;
    if (source === target && (collapsedInto.has(e.start) || collapsedInto.has(e.end))) continue;
    let id = e.id;
    for (let n = 2; ids.has(id); n++) id = `${e.id}#${n}`;
    ids.add(id);
    const [start, end] = arrows(e.type, e.stroke);
    const style = m.styleOf(e.classes, [...(model.defaultStyle ?? []), ...(e.style ?? [])]);
    // Measured in the font the label is drawn in, as node labels are.
    const [f, bits] = textStyle(style, m.font);
    edges.push({
      edge: e,
      id,
      source,
      target,
      label: m.label(e.text, e.labelType === 'markdown', f, edgeWrap, bits),
      style,
      start,
      end,
      curve: curveKind(e.interpolate ?? model.defaultInterpolate ?? flow.curve),
    });
  }
  return edges;
}

/** The graph the layout engine gets, every length from the unit profile. */
function layoutGraph(
  model: FlowModel,
  rootDir: Dir,
  nest: Nesting,
  {
    groups,
    layoutNodes,
    edges,
  }: Pick<Prepared, 'groups' | 'edges'> & { layoutNodes: LayoutNode[] },
  m: Measure,
  length: ConfigLength
): LayoutGraph {
  const units = m.ctx.units ?? pxProfile;
  const b = units.builder;
  const flow = m.ctx.config.flowchart ?? {};
  // Config numbers may arrive as strings from front matter, as v12 accepted them. They are px:
  // node spacing runs across the flow and rank spacing along it.
  const fromConfig = (key: string, fallback: number, axis: 'x' | 'y', min: number): number => {
    const px = length(key);
    return px === undefined ? fallback : fromPx(units, px, axis, min);
  };
  const along = sideways(rootDir) ? 'x' : 'y';
  const across = along === 'x' ? 'y' : 'x';
  const spacingOn = (rank: 'x' | 'y', node: 'x' | 'y') => ({
    node: fromConfig('nodeSpacing', b.spacing.node, node, b.minSpacing.node),
    rank: fromConfig('rankSpacing', b.spacing.rank, rank, b.minSpacing.rank),
    edge: b.spacing.edge,
  });
  const spacing = spacingOn(along, across);
  // An LR/RL drawing the engine turns to TB for `availableWidth` runs its ranks down (#47).
  const down = spacingOn('y', 'x');
  const turned = down.node !== spacing.node || down.rank !== spacing.rank;
  // How edges are routed follows the diagram's default curve: `linkStyle default interpolate`
  // first, then config, as each edge's own drawing does.
  const curve = curveKind(model.defaultInterpolate ?? flow.curve);
  for (const node of layoutNodes) {
    // A text-form box leaves the span to the engine's `corner` metric. Keep this after
    // every label measurement, as custom measurers can observe or change model metadata.
    if (!m.cells && node.shape !== 'img' && node.shape !== 'icon') {
      node.span = shapeSpan(node.shape!, node.width, node.height, sideways(nest.flowDir(node.id)));
    }
  }
  const graph: LayoutGraph = {
    direction: rootDir,
    nodes: layoutNodes,
    groups: groups.map((g): LayoutGroup => {
      const titled = g.label.height > 0;
      const group: LayoutGroup = {
        id: g.id,
        padding: {
          top: titled ? b.titlePad : b.groupPad,
          right: b.groupPad,
          bottom: b.groupPad,
          left: b.groupPad,
        },
      };
      if (titled) group.title = { width: g.label.width, height: g.label.height };
      if (g.parent !== undefined) group.parent = g.parent;
      const d = dirOf(nest.subgraphs.get(g.id)?.dir);
      if (d) group.direction = d;
      // `@{ algorithm }` is for the layout engine to read (an ELK plugin); layered ignores it.
      const algorithm = nest.subgraphs.get(g.id)?.metadata?.algorithm;
      if (typeof algorithm === 'string') group.algorithm = algorithm;
      return group;
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      minLen: e.edge.length ?? 1,
      ...(e.label.width > 0
        ? {
            label: {
              width: e.label.width + b.labelPatch.x,
              height: e.label.height + b.labelPatch.y,
            },
          }
        : {}),
    })),
    spacing,
    ...(turned ? { turnedSpacing: down } : {}),
    // Text output trims the empty margin, so in cells a margin would only eat into
    // `availableWidth` (`ascii.maxWidth`, D84): the profile's own (0) applies.
    diagramPadding:
      units.grid === undefined
        ? fromConfig('diagramPadding', b.diagramPadding, 'x', 0)
        : b.diagramPadding,
    // On the grid routes are always square (D78): curves have no text form (D82).
    routing: units.grid === undefined ? (ROUTING[curve] ?? 'stepped') : 'stepped',
    headRoom: b.headRoom,
    metrics: units.engine,
  };
  if (units.grid !== undefined) graph.grid = units.grid;
  return graph;
}
