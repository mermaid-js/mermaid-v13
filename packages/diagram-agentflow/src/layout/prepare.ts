/**
 * AgentflowModel → LayoutGraph: v12's `getData` rules (`fa796a943` `agentflowDb.ts`), over the
 * nesting the model already resolved (`parent`, `collapsedInto`, the containment cycle cut,
 * D461). A collapsed flow is a card node standing in for everything inside it; an edge into it
 * ends at the card, an edge whose two distinct ends fold into one card is dropped, and an
 * authored self-loop is kept. Flows are groups with their own direction (`flowchart.inheritDir`
 * applied by the parser, D466) and `algorithm` for the engine (D174). Every label is measured
 * before layout (DESIGN §6.1), each length from the unit profile, the theme, config or the
 * metrics table (pitfall 13). Written from a copy of v13 flowchart's builder (D446).
 *
 * Flowchart's builder is ported from Pele's `src/diagrams/flowchart/graph.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano). Changed: flows and collapsed
 * cards instead of subgraphs, agentflow's config section and shapes, as above.
 * cspell:ignore kepano
 */
import type {
  Dir,
  LayoutGraph,
  LayoutGroup,
  LayoutNode,
  UnitProfile,
} from '@mermaid-js/core/layout';
import { fromPx, pxProfile } from '@mermaid-js/core/layout';
import { graphSpacing, groupPadding, labelledEdge, sideways } from '@mermaid-js/shared/layout';
import type { AgentflowDiagramConfig } from '@mermaid-js/core/config';
import type { CheckedStyle } from '@mermaid-js/core/svg';
import { styleCache } from '@mermaid-js/shared/svg/document';
import { curveKind, curveRouting, type CurveKind } from '@mermaid-js/shared/svg/route';
import { textStyle } from '@mermaid-js/shared/svg/graph';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type {
  AgentflowFlowModel,
  AgentflowModel,
  AgentflowModelEdge,
  AgentflowVertex,
} from '../parser/index.ts';
import { layoutDir } from '../parser/index.ts';
import { configLengths, type ConfigLength } from './config-length.ts';
import type { AgentflowLayoutContext } from './context.ts';
import { agentflowConfigDefaults } from '../generated/config-defaults.ts';
import { AGENTFLOW_METRICS, FLOWCHART_LENGTH_DEFAULTS, TITLE_MARGIN_DEFAULTS } from './metrics.ts';
import { shapeSize, shapeSpan, type LayoutShape, type ShapeGeometry } from './shapes.ts';
import { themePads } from '@mermaid-js/shared/shapes/kit';

/** A vertex or a collapsed flow, drawn as a node. */
export interface AgentflowNodeView {
  id: string;
  ast: string;
  shape: LayoutShape;
  label: MeasuredLabel;
  w: number;
  h: number;
  /** Label shift from the centre. */
  dy: number;
  style: CheckedStyle;
  classes: readonly string[];
  /** The flow it is drawn in. */
  parent?: string;
  /** Set for a vertex or connector. */
  vertex?: AgentflowVertex;
  /** Set for a collapsed flow. */
  flow?: AgentflowFlowModel;
}

/** A flow drawn as a frame around its members. */
export interface AgentflowGroupView {
  id: string;
  ast: string;
  flow: AgentflowFlowModel;
  label: MeasuredLabel;
  style: CheckedStyle;
  classes: readonly string[];
  parent?: string;
  /** How many flows hold it (0 at the top). */
  depth: number;
}

export interface AgentflowEdgeView {
  edge: AgentflowModelEdge;
  /** Layout edge id (the model id, made unique). */
  id: string;
  /** The ends drawn: the model's, or the collapsed flow each one is hidden in. */
  source: string;
  target: string;
  label: MeasuredLabel;
  style: CheckedStyle;
  /** Arrowheads (v12 `destructEdgeType`). */
  start: Arrowhead;
  end: Arrowhead;
  /** `linkStyle … interpolate`, the default's, or `flowchart.curve` (v12's order). */
  curve: CurveKind;
}

/** The arrowheads an agentflow edge has: `-->`, `--x` or none (`-.-`). */
export type Arrowhead = 'none' | 'arrow_point' | 'arrow_cross';

export type { CurveKind };

export interface AgentflowPrepared {
  graph: LayoutGraph;
  /** Flows drawn as frames, outermost first. */
  groups: AgentflowGroupView[];
  nodes: AgentflowNodeView[];
  edges: AgentflowEdgeView[];
  /** Every node view by id. */
  views: ReadonlyMap<string, AgentflowNodeView>;
  /** The theme's padding and the metrics table the shapes were sized with. */
  geometry: ShapeGeometry;
  /** `flowchart.subGraphTitleMargin` (D466): room above and below each flow title. */
  titleMargin: { readonly top: number; readonly bottom: number };
  /** `agentflow.titleTopMargin` (D218): the front-matter title's baseline above the drawing. */
  titleTopMargin: number;
}

/** v12 `destructEdgeType`: an open link has no head; a cross or point head at the end. */
const arrowsOf = (type: string): [Arrowhead, Arrowhead] =>
  type === 'arrow_open'
    ? ['none', 'none']
    : ['none', type === 'arrow_cross' ? 'arrow_cross' : 'arrow_point'];

/** Everything the views and the graph are measured with. */
interface Measure {
  readonly ctx: AgentflowLayoutContext;
  readonly units: UnitProfile;
  /** `agentflow.*` lengths. */
  readonly agentflowLength: ConfigLength<keyof AgentflowDiagramConfig>;
  /** Character cells (text output, #551): every node is a text-form box (DESIGN §6.3). */
  readonly cells: boolean;
  readonly font: FontKey;
  readonly geometry: ShapeGeometry;
  /** The diagram's curve: `linkStyle default interpolate`, else `flowchart.curve`. */
  readonly curve: CurveKind;
  readonly wrap: number;
  readonly minWidth: number;
  readonly edgeWrap: number;
  readonly label: (
    text: string,
    markdown: boolean,
    f: FontKey,
    max: number,
    bits?: number
  ) => MeasuredLabel;
  readonly styleOf: (classes: readonly string[], own?: readonly string[]) => CheckedStyle;
}

/** Measures the model and builds the graph the layout engine gets. */
export function prepareAgentflow(
  model: AgentflowModel,
  ctx: AgentflowLayoutContext
): AgentflowPrepared {
  const { theme, measurer, inline } = ctx;
  const units = ctx.units ?? pxProfile;
  const warn = (w: { code: string; message: string; path: string }) => ctx.warn(w);
  const agentflowLength = configLengths(
    ctx.config.agentflow,
    agentflowConfigDefaults,
    'agentflow',
    warn
  );
  const flowchart = ctx.config.flowchart;
  const flowchartLength = configLengths(flowchart, FLOWCHART_LENGTH_DEFAULTS, 'flowchart', warn);
  const titleMarginLength = configLengths(
    flowchart?.subGraphTitleMargin,
    TITLE_MARGIN_DEFAULTS,
    'flowchart.subGraphTitleMargin',
    warn
  );
  const font: FontKey = {
    family: theme.value('fontFamily'),
    size: theme.number('fontSize'),
    weight: 400,
  };
  const m: Measure = {
    ctx,
    units,
    agentflowLength,
    // This is the only place the builder looks at which profile it has (flowchart's rule).
    cells: units.id === 'cell',
    font,
    geometry: { pads: themePads(theme, flowchartLength('padding')), metrics: AGENTFLOW_METRICS },
    curve: curveKind(model.defaultInterpolate ?? flowchart?.curve),
    wrap: fromPx(units, agentflowLength('wrappingWidth'), 'x') || units.builder.wrapWidth,
    minWidth: fromPx(units, agentflowLength('minNodeWidth'), 'x'),
    edgeWrap: units.builder.edgeWrap,
    label: (text, markdown, f, max, bits = 0) =>
      // v12's HTML labels kept a long word whole (#649); in cells it is split to fit its box.
      layoutLabel(text, f, max, measurer, {
        markdown,
        style: bits,
        inline,
        keepWords: units.id !== 'cell',
      }),
    styleOf: styleCache(
      new Map(model.classes.map((c) => [c.id, [...c.styles, ...c.textStyles]])),
      (w) => ctx.warn(w)
    ),
  };
  const rootDir = layoutDir(model.direction) ?? 'TB';
  const { views, groups, nodes, flowDir } = nodeViews(model, rootDir, m);
  const edges = edgeViews(model, views, groups, m);
  const titleMargin = { top: titleMarginLength('top'), bottom: titleMarginLength('bottom') };
  const graph = layoutGraph(model, rootDir, { groups, nodes, edges, flowDir, titleMargin }, m);
  // Read only for a title, so an unused bad value raises no warning.
  const titleTopMargin = model.title?.trim()
    ? agentflowLength('titleTopMargin')
    : agentflowLength.fallback('titleTopMargin');
  return { graph, groups, nodes, edges, views, geometry: m.geometry, titleMargin, titleTopMargin };
}

interface Views {
  views: Map<string, AgentflowNodeView>;
  groups: AgentflowGroupView[];
  nodes: AgentflowNodeView[];
  /** The direction a node's nearest flow lays out in, else the diagram's. */
  flowDir: (id: string | undefined) => Dir;
}

/** One view per drawn flow, vertex and connector, measured; frames sorted outermost first. */
function nodeViews(model: AgentflowModel, rootDir: Dir, m: Measure): Views {
  const views = new Map<string, AgentflowNodeView>();
  const groupById = new Map<string, AgentflowGroupView>();
  const nodes: AgentflowNodeView[] = [];
  const empty = m.label('', false, m.font, 0);
  // v12 drew a hidden flow nowhere; a collapsed one as a card, the rest as frames.
  for (const flow of model.flows) {
    if (flow.collapsedInto !== undefined) continue;
    const style = m.styleOf(flow.classes, flow.styles);
    if (flow.collapsed) {
      const view: AgentflowNodeView = {
        id: flow.id,
        ast: flow.ast,
        shape: 'collapsedGroup',
        label: empty,
        w: 0,
        h: 0,
        dy: 0,
        style,
        classes: flow.classes,
        flow,
      };
      views.set(flow.id, view);
      nodes.push(view);
    } else {
      groupById.set(flow.id, {
        id: flow.id,
        ast: flow.ast,
        flow,
        label: empty,
        style,
        classes: flow.classes,
        depth: 0,
      });
    }
  }
  for (const v of model.vertices) {
    if (v.collapsedInto !== undefined || views.has(v.id) || groupById.has(v.id)) continue;
    const view: AgentflowNodeView = {
      id: v.id,
      ast: v.ast,
      shape: v.shape,
      label: empty,
      w: 0,
      h: 0,
      dy: 0,
      style: m.styleOf(['default', 'node', ...v.classes], v.styles),
      classes: v.classes,
      vertex: v,
    };
    views.set(v.id, view);
    nodes.push(view);
  }
  // A parent is a frame; the model's nesting has no cycle (D461), so the walks end.
  const parentOf = (p: string | undefined): string | undefined =>
    p !== undefined && groupById.has(p) ? p : undefined;
  for (const view of nodes) {
    const parent = parentOf(view.flow?.parent ?? view.vertex?.parent);
    if (parent !== undefined) view.parent = parent;
  }
  for (const g of groupById.values()) {
    const parent = parentOf(g.flow.parent);
    if (parent !== undefined) g.parent = parent;
  }
  // `f(flow)` = `step(flow, f(its parent))`, `base` above the top, memoised and without recursion.
  const upward = <T>(base: T, step: (g: AgentflowGroupView, above: T) => T) => {
    const memo = new Map<string, T>();
    return (id: string | undefined): T => {
      const chain: AgentflowGroupView[] = [];
      let value = base;
      for (let at = id; at !== undefined; at = chain[chain.length - 1]!.parent) {
        const seen = memo.get(at);
        if (seen !== undefined) {
          value = seen;
          break;
        }
        chain.push(groupById.get(at)!);
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        value = step(chain[i]!, value);
        memo.set(chain[i]!.id, value);
      }
      return value;
    };
  };
  const flowDir = upward<Dir>(rootDir, (g, above) => layoutDir(g.flow.dir) ?? above);
  // Depth of the frame itself: 1 for a top-level flow.
  const depthOf = upward<number>(0, (_g, above) => above + 1);
  for (const view of nodes) measureNode(view, m);
  const groups = [...groupById.values()];
  for (const g of groups) {
    g.depth = depthOf(g.id) - 1;
    const [f, bits] = textStyle(g.style, m.font);
    g.label = m.label(g.flow.title, g.flow.labelType === 'markdown', f, Infinity, bits);
  }
  groups.sort((a, b) => a.depth - b.depth);
  return { views, groups, nodes, flowDir };
}

function measureNode(view: AgentflowNodeView, m: Measure): void {
  const [f, bits] = textStyle(view.style, m.font);
  const text = view.vertex?.text ?? view.flow?.title ?? '';
  const markdown = (view.vertex?.labelType ?? view.flow?.labelType) === 'markdown';
  view.label = m.label(text, markdown, f, m.wrap, bits);
  const lw = view.label.width;
  if (m.cells) {
    // A text-form box (D469): the label, the profile's padding and a border cell on each side;
    // no least width (as flowchart's text forms). An empty label keeps its row, so a side's
    // mark never lands on a corner.
    const pad = m.units.builder.nodePad;
    view.w = lw + 2 * (pad.x + 1);
    view.h = Math.max(view.label.lines.length, 1) + 2 * (pad.y + 1);
    view.dy = 0;
    return;
  }
  // v12 widens a vertex label to `agentflow.minNodeWidth`; a collapsed card keeps its own.
  const keep = view.shape === 'collapsedGroup';
  const s = shapeSize(
    view.shape,
    lw > 0 && !keep ? Math.max(lw, m.minWidth) : lw,
    view.label.height,
    m.geometry
  );
  view.w = s.w;
  view.h = s.h;
  view.dy = s.dy;
}

/**
 * One view per drawn edge (v12's rules): an end hidden in a collapsed flow is redirected to it;
 * an edge whose two distinct ends fold into one card is dropped, an authored `x --> x` is kept;
 * an edge with an end that is drawn nowhere (the reserved `connectors` id) is left out.
 */
function edgeViews(
  model: AgentflowModel,
  views: ReadonlyMap<string, AgentflowNodeView>,
  groups: readonly AgentflowGroupView[],
  m: Measure
): AgentflowEdgeView[] {
  const into = new Map<string, string>();
  for (const v of model.vertices)
    if (v.collapsedInto !== undefined) into.set(v.id, v.collapsedInto);
  for (const f of model.flows) if (f.collapsedInto !== undefined) into.set(f.id, f.collapsedInto);
  const drawn = new Set<string>([...views.keys(), ...groups.map((g) => g.id)]);
  const edges: AgentflowEdgeView[] = [];
  const ids = new Set<string>();
  for (const e of model.edges) {
    const source = into.get(e.start) ?? e.start;
    const target = into.get(e.end) ?? e.end;
    if (!drawn.has(source) || !drawn.has(target)) continue;
    if (source === target && e.start !== e.end) continue;
    let id = e.id;
    for (let n = 2; ids.has(id); n++) id = `${e.id}#${n}`;
    ids.add(id);
    const [start, end] = arrowsOf(e.type);
    const style = m.styleOf(e.classes, [...(model.defaultStyle ?? []), ...(e.style ?? [])]);
    const [f, bits] = textStyle(style, m.font);
    edges.push({
      edge: e,
      id,
      source,
      target,
      label: m.label(e.text, e.labelType === 'markdown', f, m.edgeWrap, bits),
      style,
      start,
      end,
      curve: e.interpolate !== undefined ? curveKind(e.interpolate) : m.curve,
    });
  }
  return edges;
}

/** The graph the layout engine gets. */
function layoutGraph(
  model: AgentflowModel,
  rootDir: Dir,
  {
    groups,
    nodes,
    edges,
    flowDir,
    titleMargin,
  }: Pick<AgentflowPrepared, 'groups' | 'nodes' | 'edges' | 'titleMargin'> & Pick<Views, 'flowDir'>,
  m: Measure
): LayoutGraph {
  const { units, agentflowLength } = m;
  const b = units.builder;
  // Node spacing runs across the flow and rank spacing along it (px config, v12 `|| 50`).
  const spacing = graphSpacing(units, rootDir, agentflowLength);
  // In cells a flow's title sits on its top border (`ascii/warnings.ts` names a margin set).
  const titleRoom = m.cells ? 0 : fromPx(units, titleMargin.top + titleMargin.bottom, 'y');
  const graph: LayoutGraph = {
    direction: rootDir,
    nodes: nodes.map((n): LayoutNode => {
      const node: LayoutNode = { id: n.id, width: n.w, height: n.h, shape: n.shape };
      if (n.parent !== undefined) node.parent = n.parent;
      // A text-form box leaves the span to the engine's `corner` metric.
      if (!m.cells) node.span = shapeSpan(n.shape, n.w, n.h, sideways(flowDir(n.parent)));
      return node;
    }),
    groups: groups.map((g): LayoutGroup => {
      const titled = g.label.height > 0;
      const group: LayoutGroup = {
        id: g.id,
        padding: groupPadding(b, titled, titleRoom),
      };
      if (titled) group.title = { width: g.label.width, height: g.label.height };
      if (g.parent !== undefined) group.parent = g.parent;
      const d = layoutDir(g.flow.dir);
      if (d) group.direction = d;
      // `@{ algorithm }` is for an ELK engine to read; `mermaid` warns ELK_ALGORITHM_IGNORED (D174).
      const algorithm = g.flow.metadata?.algorithm;
      if (typeof algorithm === 'string') group.algorithm = algorithm;
      return group;
    }),
    edges: edges.map((e) => labelledEdge(b, e.id, e.source, e.target, e.label, e.edge.length ?? 1)),
    ...spacing,
    // Text output trims the empty margin, so in cells a margin would only eat into
    // `ascii.maxWidth` (D84): the profile's own (0) applies.
    diagramPadding: m.cells
      ? b.diagramPadding
      : fromPx(units, agentflowLength('diagramPadding'), 'x', 0),
    routing: units.grid === undefined ? curveRouting(m.curve) : 'stepped',
    headRoom: b.headRoom,
    metrics: units.engine,
  };
  if (units.grid !== undefined) graph.grid = units.grid;
  return graph;
}
