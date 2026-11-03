// FlowModel → LayoutGraph: resolves group membership, collapsed subgraphs, class styles and
// edge defaults the way v12's FlowDB.getData did (via Pele's src/diagrams/flowchart/graph.ts
// @ 3a2f075, https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), and measures every label
// before layout (DESIGN §6.1).
// cspell:ignore kepano
import type { Dir, LayoutGraph, LayoutGroup, LayoutNode } from '@mermaid-js/core/layout';
import { layoutSettings } from '@mermaid-js/core/layout';
import { checkStyle, type CheckedStyle } from '@mermaid-js/core/svg';
import { layoutLabel, Style, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { FlowModel, FlowModelEdge, FlowModelSubgraph, FlowVertex } from '../parser/index.ts';
import type { FlowRenderContext } from './context.ts';
import { curveKind, type CurveKind } from './edges.ts';
import { flowchartConfigDefaults } from '../generated/config-defaults.ts';
import {
  canonicalShape,
  shapeHasLabel,
  shapeSize,
  shapeSpan,
  type PadXY,
  type Pads,
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
  pads: Pads;
}

// The room the layout leaves around an edge label (Pele's): the label sits on a patch.
const LABEL_W = 12;
const LABEL_H = 4;
const GROUP_PAD = 20;
const TITLE_PAD = 16;
const EDGE_WRAP = 200;
const IMG = 80;
const ICON = 48;
// Room the layout leaves in a crossed gap for an arrowhead (v13's former 8px point less 1). It
// stays theme-independent, so the layout does not move with the arrowhead variables (D154).
const HEAD_ROOM = 7;
// The smallest hexagonSlant drawn: each pointed end as deep as the hexagon is tall.
const MIN_SLANT = 1;

const ROUTING: Readonly<Partial<Record<CurveKind, 'straight' | 'curved'>>> = {
  linear: 'straight',
  curved: 'curved',
};

function vertexShape(v: FlowVertex): string {
  if (v.img) return 'img';
  return v.icon ? 'icon' : canonicalShape(v.type);
}

const DIRS: Readonly<Record<string, Dir>> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };
const dirOf = (d: string | undefined): Dir | undefined => (d ? DIRS[d.toUpperCase()] : undefined);
const sideways = (d: Dir): boolean => d === 'LR' || d === 'RL';
const asset = (v: number | undefined, fallback: number): number =>
  v !== undefined && v > 0 && v <= 4000 ? v : fallback;

/** A config number (v12 also took numeric strings), capped; `fallback` when not one. */
function size(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return typeof n === 'number' && n >= 0 && n < 1e4 ? n : fallback;
}

function arrows(type: string, stroke: string): [string, string] {
  if (stroke === 'invisible' || type === 'arrow_open') return ['none', 'none'];
  if (type.startsWith('double_')) {
    const single = type.slice(7);
    return [single, single];
  }
  return ['none', type === 'arrow_circle' || type === 'arrow_cross' ? type : 'arrow_point'];
}

function textStyle(style: CheckedStyle, font: FontKey): [FontKey, number] {
  const t = style.text;
  const weight = t['font-weight'];
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  const bits = (bold ? Style.Bold : 0) | (t['font-style'] === 'italic' ? Style.Italic : 0);
  const size = parseFloat(String(t['font-size'] ?? ''));
  return [size > 0 && size < 1000 ? { ...font, size } : font, bits];
}

/** Measures the model and builds the graph the layout engine gets. */
export function prepare(model: FlowModel, ctx: FlowRenderContext): Prepared {
  const { theme, measurer } = ctx;
  const flow = ctx.config.flowchart ?? {};
  const font: FontKey = {
    family: theme.value('fontFamily'),
    size: theme.number('fontSize'),
    weight: 400,
  };
  // flowchart.padding: the classic themes' padding variables are multiples of it (D152).
  const pad = size(flow.padding, flowchartConfigDefaults.padding);
  const padOf = (name: string) => theme.padding(name, pad);
  const xy = (shape: string): PadXY => ({
    x: padOf(`${shape}PaddingX`),
    y: padOf(`${shape}PaddingY`),
  });
  const pads: Pads = {
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
  const wrap = size(flow.wrappingWidth) || 200;
  const minWidth = size(flow.minNodeWidth);
  const label = (text: string, markdown: boolean, f: FontKey, max: number, bits = 0) =>
    layoutLabel(text, f, max, measurer, { markdown, style: bits });

  const classDefs = new Map<string, string[]>();
  for (const c of model.classes) classDefs.set(c.id, [...c.styles, ...c.textStyles]);
  const styles = new Map<string, CheckedStyle>();
  const styleOf = (classes: readonly string[], own: readonly string[] = []): CheckedStyle => {
    const decls: string[] = [];
    for (const name of classes) for (const s of classDefs.get(name) ?? []) decls.push(s.trim());
    for (const s of own) decls.push(s.trim());
    const key = decls.join(';');
    let style = styles.get(key);
    if (!style) styles.set(key, (style = checkStyle(decls, ctx.warn)));
    return style;
  };

  // Subgraph nesting, as v12: a subgraph listed in another one's members is its child.
  const subgraphs = new Map<string, FlowModelSubgraph>();
  for (const sg of model.subgraphs) subgraphs.set(sg.id, sg);
  const sgParent = new Map<string, string>();
  for (const sg of model.subgraphs)
    for (const id of sg.nodes) if (subgraphs.has(id)) sgParent.set(id, sg.id);

  // Collapsed subgraphs (`id@{ view: collapsed }`) stand in for everything inside them.
  const collapsedInto = new Map<string, string>();
  const isCollapsed = (id: string): boolean => subgraphs.get(id)?.metadata?.view === 'collapsed';
  for (const sg of model.subgraphs) {
    let outer: string | undefined;
    const seen = new Set<string>();
    for (
      let id: string | undefined = sg.id;
      id !== undefined && !seen.has(id);
      id = sgParent.get(id)
    ) {
      seen.add(id);
      if (isCollapsed(id)) outer = id;
    }
    if (outer === undefined) continue;
    if (sg.id !== outer) collapsedInto.set(sg.id, outer);
    for (const id of sg.nodes) if (id !== outer) collapsedInto.set(id, outer);
  }

  // The first subgraph that lists a member is its parent (v12 walks them last to first).
  const parentOf = new Map<string, string>();
  for (let i = model.subgraphs.length - 1; i >= 0; i--) {
    const sg = model.subgraphs[i]!;
    if (collapsedInto.has(sg.id)) continue;
    for (const id of sg.nodes) parentOf.set(id, sg.id);
  }
  const depthOf = (id: string): number => {
    let d = 0;
    const seen = new Set<string>();
    for (let p = parentOf.get(id); p !== undefined && !seen.has(p); p = parentOf.get(p)) {
      seen.add(p);
      d++;
    }
    return d;
  };
  const rootDir = dirOf(model.direction) ?? 'TB';
  const flowDir = (id: string): Dir => {
    const seen = new Set<string>();
    for (let p = parentOf.get(id); p !== undefined && !seen.has(p); p = parentOf.get(p)) {
      seen.add(p);
      const d = dirOf(subgraphs.get(p)?.dir);
      if (d) return d;
    }
    return rootDir;
  };

  const views = new Map<string, NodeView>();
  const groups: NodeView[] = [];
  const nodes: NodeView[] = [];
  const measureNode = (view: NodeView, text: string, markdown: boolean, v?: FlowVertex): void => {
    const [f, bits] = textStyle(view.style, font);
    const has = shapeHasLabel(view.shape);
    view.label = label(has || v?.img || v?.icon ? text : '', markdown, f, wrap, bits);
    const lw = view.label.width;
    const lh = view.label.height;
    if (v?.img || v?.icon) {
      const aw = asset(v.assetWidth, v.img ? IMG : ICON);
      const ah = asset(v.assetHeight, v.img ? IMG : ICON);
      view.w = Math.max(aw, lw + 8);
      view.h = ah + (lh > 0 ? lh + 6 : 0);
      view.dy = lh > 0 ? (v.pos === 't' ? -ah / 2 : ah / 2) - (v.pos === 't' ? 3 : -3) : 0;
      return;
    }
    // v12 widens vertex labels to minNodeWidth; round shapes and collapsed subgraphs keep theirs.
    const keepWidth =
      view.shape === 'circle' || view.shape === 'dbl-circ' || view.shape === 'collapsedGroup';
    const s = shapeSize(
      view.shape,
      lw > 0 && has && !keepWidth ? Math.max(lw, minWidth) : lw,
      lh,
      pads
    );
    view.w = s.w;
    view.h = s.h;
    view.dy = s.dy;
  };
  const blank = (id: string, ast: string, group: boolean, shape: string): NodeView => ({
    id,
    ast,
    group,
    shape,
    label: label('', false, font, 0),
    w: 0,
    h: 0,
    dy: 0,
    style: styleOf([]),
    classes: [],
    parent: parentOf.get(id),
    depth: depthOf(id),
  });

  // Palette order follows the source. `model.subgraphs` is in closing order (a nested
  // subgraph lands before its parent), so walk the nesting forest pre-order like v12.
  const order = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();
  for (const sg of model.subgraphs) {
    const p = sgParent.get(sg.id);
    if (p !== undefined) childrenOf.set(p, [...(childrenOf.get(p) ?? []), sg.id]);
  }
  const walk = (id: string): void => {
    if (order.has(id)) return;
    order.set(id, order.size);
    for (const c of childrenOf.get(id) ?? []) walk(c);
  };
  for (const sg of model.subgraphs) if (!sgParent.has(sg.id)) walk(sg.id);
  // Subgraphs that only sit in a membership cycle have no root; number them last.
  for (const sg of model.subgraphs) walk(sg.id);

  for (const sg of model.subgraphs) {
    if (collapsedInto.has(sg.id)) continue;
    const collapsed = isCollapsed(sg.id);
    const view = blank(sg.id, sg.ast, !collapsed, collapsed ? 'collapsedGroup' : 'rect');
    view.classes = sg.classes;
    view.style = styleOf(sg.classes);
    view.order = order.get(sg.id);
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
      existing.style = styleOf(v.classes, v.styles);
      continue;
    }
    const shape = vertexShape(v);
    const view = blank(v.id, v.ast, false, shape);
    view.vertex = v;
    view.classes = v.classes;
    view.style = styleOf(['default', 'node', ...v.classes], v.styles);
    views.set(v.id, view);
    nodes.push(view);
  }
  for (const view of nodes) {
    const sg = subgraphs.get(view.id);
    const v = view.vertex;
    if (sg) measureNode(view, sg.title, sg.labelType === 'markdown');
    else if (v) measureNode(view, v.text, v.labelType === 'markdown', v);
  }
  for (const view of groups) {
    const sg = subgraphs.get(view.id)!;
    const [f, bits] = textStyle(view.style, font);
    view.label = label(sg.title, sg.labelType === 'markdown', f, Infinity, bits);
  }
  groups.sort((a, b) => a.depth - b.depth);

  const edges: EdgeView[] = [];
  const ids = new Set<string>();
  model.edges.forEach((e) => {
    const source = collapsedInto.get(e.start) ?? e.start;
    const target = collapsedInto.get(e.end) ?? e.end;
    if (!views.has(source) || !views.has(target)) return;
    if (source === target && (collapsedInto.has(e.start) || collapsedInto.has(e.end))) return;
    let id = e.id;
    for (let n = 2; ids.has(id); n++) id = `${e.id}#${n}`;
    ids.add(id);
    const [start, end] = arrows(e.type, e.stroke);
    edges.push({
      edge: e,
      id,
      source,
      target,
      label: label(e.text, e.labelType === 'markdown', font, EDGE_WRAP),
      style: styleOf(e.classes, [...(model.defaultStyle ?? []), ...(e.style ?? [])]),
      start,
      end,
      curve: curveKind(e.interpolate ?? model.defaultInterpolate ?? flow.curve),
    });
  });

  // Config numbers may arrive as strings from front matter, as v12 accepted them.
  const settings = layoutSettings({
    nodeSpacing: size(flow.nodeSpacing, 50),
    rankSpacing: size(flow.rankSpacing, 50),
    diagramPadding: size(flow.diagramPadding, 8),
  });
  const curve = curveKind(flow.curve);
  const graph: LayoutGraph = {
    direction: rootDir,
    nodes: nodes.map((n): LayoutNode => {
      const node: LayoutNode = { id: n.id, width: n.w, height: n.h, shape: n.shape };
      if (n.parent !== undefined) node.parent = n.parent;
      if (n.shape !== 'img' && n.shape !== 'icon')
        node.span = shapeSpan(n.shape, n.w, n.h, sideways(flowDir(n.id)));
      return node;
    }),
    groups: groups.map((g): LayoutGroup => {
      const titled = g.label.height > 0;
      const group: LayoutGroup = {
        id: g.id,
        padding: {
          top: titled ? TITLE_PAD : GROUP_PAD,
          right: GROUP_PAD,
          bottom: GROUP_PAD,
          left: GROUP_PAD,
        },
      };
      if (titled) group.title = { width: g.label.width, height: g.label.height };
      if (g.parent !== undefined) group.parent = g.parent;
      const d = dirOf(subgraphs.get(g.id)?.dir);
      if (d) group.direction = d;
      return group;
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      minLen: e.edge.length ?? 1,
      ...(e.label.width > 0
        ? { label: { width: e.label.width + LABEL_W, height: e.label.height + LABEL_H } }
        : {}),
    })),
    spacing: settings.spacing,
    diagramPadding: settings.diagramPadding,
    routing: ROUTING[curve] ?? 'stepped',
    headRoom: HEAD_ROOM,
  };
  return { graph, groups, nodes, edges, pads };
}
