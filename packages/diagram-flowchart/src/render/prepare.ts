// FlowModel → LayoutGraph: resolves group membership, collapsed subgraphs, class styles and
// edge defaults the way v12's FlowDB.getData did (via Pele's src/diagrams/flowchart/graph.ts
// @ 3a2f075, https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), and measures every label
// before layout (DESIGN §6.1).
// cspell:ignore kepano
import type { Dir, LayoutGraph, LayoutGroup, LayoutNode } from '@mermaid-js/core/layout';
import { fromPx, pxProfile } from '@mermaid-js/core/layout';
import { graphSpacing, groupPadding, labelledEdge, sideways } from '@mermaid-js/shared/layout';
import { styleCache, type CheckedStyle } from '@mermaid-js/core/svg';
import { textStyle } from '@mermaid-js/shared/svg/edges';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { FlowModel, FlowModelEdge, FlowVertex } from '../parser/index.ts';
import { configLengths, type ConfigLength } from './config-length.ts';
import type { FlowRenderContext } from './context.ts';
import { curveKind, curveRouting, type CurveKind } from '@mermaid-js/shared/svg/edges';
import { dirOf, nesting, type Nesting } from './nesting.ts';
import { flowchartConfigDefaults } from '../generated/config-defaults.ts';
import { assetSize } from './assets.ts';
import { canonicalShape, shapeHasLabel, shapeSize, shapeSpan, type Pads } from './shapes.ts';
import { themePads } from '@mermaid-js/shared/shapes';

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

function vertexShape(v: FlowVertex): string {
  if (v.img) return 'img';
  return v.icon ? 'icon' : canonicalShape(v.type);
}

function arrows(type: string, stroke: string): [string, string] {
  if (stroke === 'invisible' || type === 'arrow_open') return ['none', 'none'];
  if (type.startsWith('double_')) {
    const single = type.slice('double_'.length);
    return [single, single];
  }
  return ['none', type === 'arrow_circle' || type === 'arrow_cross' ? type : 'arrow_point'];
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
    pads: themePads(ctx.theme, pad),
    wrap: fromPx(units, length('wrappingWidth') ?? 0, 'x') || units.builder.wrapWidth,
    minWidth: length('minNodeWidth') ?? 0,
    // This is the only place the builder looks at which profile it has.
    cells: units.id === 'cell',
    label: (text, markdown, f, max, bits = 0) =>
      layoutLabel(text, f, max, measurer, { markdown, style: bits, inline }),
    styleOf: styleCache(
      new Map(model.classes.map((c) => [c.id, [...c.styles, ...c.textStyles]])),
      ctx.warn
    ),
  };
  const rootDir = dirOf(model.direction) ?? 'TB';
  const nest = nesting(model, rootDir);
  const { views, groups, nodes } = nodeViews(model, nest, m);
  const edges = edgeViews(model, nest.collapsedInto, views, m);
  const graph = layoutGraph(model, rootDir, nest, { groups, nodes, edges }, m, length);
  return { graph, groups, nodes, edges, views, pads: m.pads };
}

/** One view per drawn subgraph and vertex, measured; clusters sorted outermost first. */
function nodeViews(
  model: FlowModel,
  nest: Nesting,
  m: Measure
): Pick<Prepared, 'views' | 'groups' | 'nodes'> {
  const { collapsedInto, subgraphs } = nest;
  const views = new Map<string, NodeView>();
  const groups: NodeView[] = [];
  const nodes: NodeView[] = [];
  // Every view is measured below; until then it holds the empty label.
  const empty = m.label('', false, m.font, 0);
  const blank = (id: string, ast: string, group: boolean, shape: string): NodeView => ({
    id,
    ast,
    group,
    shape,
    label: empty,
    w: 0,
    h: 0,
    dy: 0,
    style: m.styleOf([]),
    classes: [],
    parent: nest.parentOf.get(id),
    depth: nest.depthOf(id),
  });

  for (const sg of model.subgraphs) {
    if (collapsedInto.has(sg.id)) continue;
    const collapsed = nest.isCollapsed(sg.id);
    const view = blank(sg.id, sg.ast, !collapsed, collapsed ? 'collapsedGroup' : 'rect');
    view.classes = sg.classes;
    view.style = m.styleOf(sg.classes);
    view.order = nest.order.get(sg.id);
    views.set(sg.id, view);
    if (collapsed) nodes.push(view);
    else groups.push(view);
  }
  for (const v of model.vertices) {
    if (collapsedInto.has(v.id)) continue;
    const existing = views.get(v.id);
    if (existing) {
      // A vertex named like a subgraph styles the subgraph (v12).
      existing.classes = v.classes;
      existing.style = m.styleOf(v.classes, v.styles);
      continue;
    }
    const view = blank(v.id, v.ast, false, vertexShape(v));
    view.vertex = v;
    view.classes = v.classes;
    view.style = m.styleOf(['default', 'node', ...v.classes], v.styles);
    views.set(v.id, view);
    nodes.push(view);
  }
  for (const view of nodes) {
    const sg = subgraphs.get(view.id);
    const v = view.vertex;
    if (sg) measureNode(view, sg.title, sg.labelType === 'markdown', m);
    else if (v) measureNode(view, v.text, v.labelType === 'markdown', m, v);
  }
  for (const view of groups) {
    const sg = subgraphs.get(view.id)!;
    const [f, bits] = textStyle(view.style, m.font);
    view.label = m.label(sg.title, sg.labelType === 'markdown', f, Infinity, bits);
  }
  groups.sort((g, h) => g.depth - h.depth);
  return { views, groups, nodes };
}

function measureNode(
  view: NodeView,
  text: string,
  markdown: boolean,
  m: Measure,
  v?: FlowVertex
): void {
  const [f, bits] = textStyle(view.style, m.font);
  const has = shapeHasLabel(view.shape);
  view.label = m.label(has || v?.img || v?.icon ? text : '', markdown, f, m.wrap, bits);
  const lw = view.label.width;
  const lh = view.label.height;
  if (m.cells) {
    // A text-form box: the label, its padding and a border cell on each side.
    const pad = (m.ctx.units ?? pxProfile).builder.nodePad;
    view.w = lw + 2 * (pad.x + 1);
    view.h = view.label.lines.length + 2 * (pad.y + 1);
    view.dy = 0;
    return;
  }
  // v12 widens vertex labels to minNodeWidth; round shapes and collapsed subgraphs keep theirs.
  const keepWidth =
    view.shape === 'circle' || view.shape === 'dbl-circ' || view.shape === 'collapsedGroup';
  const s =
    v?.img || v?.icon
      ? assetSize(v, lw, lh)
      : shapeSize(
          view.shape,
          lw > 0 && has && !keepWidth ? Math.max(lw, m.minWidth) : lw,
          lh,
          m.pads
        );
  view.w = s.w;
  view.h = s.h;
  view.dy = s.dy;
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
  { groups, nodes, edges }: Pick<Prepared, 'groups' | 'nodes' | 'edges'>,
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
  // Node spacing runs across the flow and rank spacing along it.
  const spacing = graphSpacing(units, rootDir, length);
  // How edges are routed follows the diagram's default curve: `linkStyle default interpolate`
  // first, then config, as each edge's own drawing does.
  const curve = curveKind(model.defaultInterpolate ?? flow.curve);
  const graph: LayoutGraph = {
    direction: rootDir,
    nodes: nodes.map((n): LayoutNode => {
      const node: LayoutNode = { id: n.id, width: n.w, height: n.h, shape: n.shape };
      if (n.parent !== undefined) node.parent = n.parent;
      // A text-form box leaves the span to the engine's `corner` metric.
      if (!m.cells && n.shape !== 'img' && n.shape !== 'icon') {
        node.span = shapeSpan(n.shape, n.w, n.h, sideways(nest.flowDir(n.id)));
      }
      return node;
    }),
    groups: groups.map((g): LayoutGroup => {
      const titled = g.label.height > 0;
      const group: LayoutGroup = {
        id: g.id,
        padding: groupPadding(b, titled),
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
    edges: edges.map((e) => labelledEdge(b, e.id, e.source, e.target, e.label, e.edge.length ?? 1)),
    ...spacing,
    // Text output trims the empty margin, so in cells a margin would only eat into
    // `availableWidth` (`ascii.maxWidth`, D84): the profile's own (0) applies.
    diagramPadding:
      units.grid === undefined
        ? fromConfig('diagramPadding', b.diagramPadding, 'x', 0)
        : b.diagramPadding,
    // On the grid routes are always square (D78): curves have no text form (D82).
    routing: units.grid === undefined ? curveRouting(curve) : 'stepped',
    headRoom: b.headRoom,
    metrics: units.engine,
  };
  if (units.grid !== undefined) graph.grid = units.grid;
  return graph;
}
