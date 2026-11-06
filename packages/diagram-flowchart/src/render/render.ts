// Draws a laid-out flowchart through the SvgWriter (DESIGN §7). Structure follows v12's group
// classes (`clusters`, `edgePaths`, `edgeLabels`, `nodes`); every vertex, edge and subgraph is
// one element with `data-id`, `data-ast` and semantic classes (R-SVG-2, -3, R-PARSE-8).
import type { LayoutModel, LayoutModelNode, RoutePoint } from '@mermaid-js/core/layout';
import { layered } from '@mermaid-js/core/layout';
import { stageEnd, stageStart } from '@mermaid-js/core/timing';
import {
  checkLinkTarget,
  checkUrl,
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  translate,
  type Attrs,
  type OutlinePaint,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { FlowModel } from '../parser/index.ts';
import type { FlowRenderContext, FlowWarning } from './context.ts';
import { drawIcon, drawImage } from './assets.ts';
import { arrowheads, marker, markerTrim, routePath, type Arrowheads } from './edges.ts';
import { prepare, type EdgeView, type NodeView, type Prepared } from './prepare.ts';
import { drawShape, shapeFilled, shapeInset, usesPlain, type Pads } from './shapes.ts';

/** The flowchart's layout: the engine's LayoutModel, plus the measured views when they are fresh. */
export interface FlowLayout extends LayoutModel {
  /** Set by `layoutFlowchart`; a `postLayout` hook that builds a new model drops it. */
  readonly flow?: Prepared;
}

/**
 * Measures the model and lays it out with `ctx.layout` (default `layered`). The bench times the
 * measuring as `measure`, so core's `layout` is the engine alone (D203).
 */
export function layoutFlowchart(model: FlowModel, ctx: FlowRenderContext): FlowLayout {
  const t = stageStart();
  const prepared = prepare(model, ctx);
  stageEnd('measure', t);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  return { ...laid, flow: prepared };
}

const THICK = 3.5;
const DOTTED = '2' as SafeValue;
const LABEL_PAD = 4;

const cls = (names: readonly string[]): string => {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
};

// Moves a route end from the node's box onto the outline of the shape drawn in it.
function inset(
  p: RoutePoint,
  view: NodeView | undefined,
  box: LayoutModelNode | undefined,
  pads: Pads
): RoutePoint {
  if (!view || !box || view.group) return p;
  const dx = p.x - box.x;
  const dy = p.y - box.y;
  if (Math.abs(Math.abs(dy) - box.height / 2) < 0.5) {
    const side = dy < 0 ? 0 : 2;
    const a = shapeInset(view.shape, view.w, view.h, side, dx, pads) + (box.height - view.h) / 2;
    return { ...p, y: p.y + (side === 0 ? a : -a) };
  }
  if (Math.abs(Math.abs(dx) - box.width / 2) < 0.5) {
    const side = dx < 0 ? 3 : 1;
    const a = shapeInset(view.shape, view.w, view.h, side, dy, pads) + (box.width - view.w) / 2;
    return { ...p, x: p.x + (side === 3 ? a : -a) };
  }
  return p;
}

interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

/**
 * Per-subgraph palette colour (#86, v12 flowchart `genColor`). On only when the theme carries
 * a non-empty `borderColorArray`, never by theme name (D152). The slot is the subgraph's source
 * order modulo the palette length; the fill comes from `bkgColorArray` only when that is not
 * empty, so `redux-dark-color` colours borders only.
 */
function paletteSlots(theme: FlowRenderContext['theme']): (view: NodeView) => Tint | undefined {
  const border = theme.palette('borderColorArray');
  const bkg = theme.palette('bkgColorArray');
  return (view) => {
    if (view.order === undefined || border.length === 0) return undefined;
    const slot = view.order % border.length;
    return {
      id: `color-${slot}`,
      stroke: border[slot]!,
      fill: bkg.length > 0 ? bkg[view.order % bkg.length] : undefined,
    };
  };
}

type ThemeOf = FlowRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

/** Node paint: every vertex, and the edges' lines and heads. */
interface NodePaint {
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  readonly fill: Color;
  /** The outline: the theme's gradient when `useGradient` is on (D182), else nodeBorder. */
  readonly stroke: OutlinePaint;
  /**
   * nodeBorder as a colour where the outline is the gradient: a filled part's fill (a dot,
   * the fork bar), and a one-segment inner line, whose bounding box has no width or height
   * (shapes.ts `usesPlain`, D185).
   * Read only when the gradient is on and such a shape is drawn.
   */
  readonly plainStroke: Color | undefined;
  readonly text: Color;
  readonly strokeWidth: Length;
  readonly line: Color;
  readonly arrow: Color;
  /**
   * The theme's drop shadow (#85), a CSS filter on node outlines, icons, subgraph rects and the
   * collapsed card; never on edges, labels or a collapsed card's dots. A theme with `none` (the
   * classic themes) writes no filter at all.
   */
  readonly shadow: ReturnType<ThemeOf['filter']> | undefined;
}

interface Paints {
  readonly heads: Arrowheads;
  readonly node: NodePaint;
  readonly cluster?: { fill: Color; stroke: OutlinePaint; strokeWidth: Length; text: Color };
  /** A collapsed subgraph's separator and dots take clusterBorder (v12 `.collapsed-*` rules). */
  readonly collapsedLine?: Attrs;
  readonly slotOf: (view: NodeView) => Tint | undefined;
  readonly edgeLabel?: { fill: Color; text: Color };
}

/**
 * Every theme variable the body uses, looked up before the root is written, so the root
 * `style` can declare exactly the aliases used (theme.rootStyle()). The order is the order
 * they are declared in.
 */
function paints(theme: ThemeOf, flow: Prepared): Paints {
  const heads = arrowheads(theme);
  const node: NodePaint = {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    fill: theme.color('mainBkg'),
    stroke: theme.outline('nodeBorder'),
    plainStroke:
      theme.gradient() && flow.nodes.some((v) => usesPlain(v.shape))
        ? theme.color('nodeBorder')
        : undefined,
    text: theme.color('nodeTextColor'),
    strokeWidth: theme.length('strokeWidth'),
    line: theme.color('lineColor'),
    arrow: theme.color('arrowheadColor'),
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
  };
  const cluster =
    flow.groups.length > 0
      ? {
          fill: theme.color('clusterBkg'),
          stroke: theme.outline('clusterBorder'),
          strokeWidth: theme.length('clusterStrokeWidth'),
          text: theme.color('titleColor'),
        }
      : undefined;
  const collapsedLine = flow.nodes.some((v) => v.shape === 'collapsedGroup')
    ? { stroke: theme.color('clusterBorder') }
    : undefined;
  const slotOf = paletteSlots(theme);
  const edgeLabel = flow.edges.some((e) => e.label.width > 0)
    ? { fill: theme.color('edgeLabelBackground'), text: theme.color('textColor') }
    : undefined;
  return { heads, node, cluster, collapsedLine, slotOf, edgeLabel };
}

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly layout: FlowLayout;
  readonly flow: Prepared;
  readonly ctx: FlowRenderContext;
  readonly paint: Paints;
  readonly warn: (warning: FlowWarning) => void;
}

/** Writes the whole `<svg>` document for a laid-out flowchart. */
export function renderFlowchart(
  model: FlowModel,
  layout: FlowLayout,
  ctx: FlowRenderContext,
  w: SvgWriter
): void {
  const flow = layout.flow ?? prepare(model, ctx);
  const scene: Scene = {
    w,
    layout,
    flow,
    ctx,
    paint: paints(ctx.theme, flow),
    warn: (warning) => ctx.warn(warning),
  };
  openRoot(scene, model);
  if (scene.paint.cluster) drawClusters(scene);
  w.open('g', {
    class: 'edgePaths',
    fill: 'none',
    stroke: scene.paint.node.line,
    'stroke-width': scene.paint.node.strokeWidth,
    'stroke-linecap': 'round',
  });
  for (const e of flow.edges) drawEdge(scene, e);
  w.close();
  w.open('g', { class: 'edgeLabels' });
  if (scene.paint.edgeLabel) for (const e of flow.edges) drawEdgeLabel(scene, e);
  w.close();
  const tips = new Map(model.tooltips);
  w.open('g', { class: 'nodes', fill: scene.paint.node.text });
  for (const view of flow.nodes) drawNode(scene, view, tips.get(view.id));
  w.close();
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, paint }: Scene, model: FlowModel): void {
  const { theme, config } = ctx;
  // The id prefix hashes the text and config, and most diagrams never write an id.
  const prefix = (): string => ctx.idPrefix ?? 'mermaid';
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = config.flowchart?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-flowchart',
    viewBox: [0, 0, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'flowchart',
    'aria-labelledby': title ? `${prefix()}-title` : undefined,
    'aria-describedby': desc ? `${prefix()}-desc` : undefined,
    'data-mermaid-version': ctx.version ?? '13',
    'data-p': auto ? styleScope(prefix()) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': paint.node.font,
    'font-size': paint.node.fontSize,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix()), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix()}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix()}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id?: string): void {
  w.open(tag, id === undefined ? undefined : { id });
  w.text(text);
  w.close();
}

function drawClusters({ w, layout, flow, ctx, paint }: Scene): void {
  const cluster = paint.cluster!;
  w.open('g', { class: 'clusters' });
  for (const g of flow.groups) {
    const box = layout.groups.get(g.id);
    if (!box) continue;
    const fill = g.style.shape.fill;
    const slot = paint.slotOf(g);
    w.open('g', {
      class: 'cluster' + cls(g.classes),
      'data-id': g.id,
      'data-ast': g.ast,
      'data-color-id': slot?.id,
    });
    // The author's `style` / `classDef` still wins over the palette (spread after).
    w.outline('group', 'rect', {
      x: box.x - box.width / 2,
      y: box.y - box.height / 2,
      width: box.width,
      height: box.height,
      fill: slot?.fill ?? cluster.fill,
      stroke: slot?.stroke ?? cluster.stroke,
      'stroke-width': cluster.strokeWidth,
      filter: paint.node.shadow,
      ...g.style.shape,
    });
    w.label(g.label, box.title.x, box.title.y, {
      class: 'cluster-label',
      fill: (fill && ctx.theme.ink(fill)) || cluster.text,
      ...g.style.text,
    });
    w.close();
  }
  w.close();
}

function edgeClass(edge: EdgeView['edge']): string {
  const look =
    edge.stroke === 'invisible'
      ? ' edge-thickness-invisible'
      : ` edge-thickness-${edge.stroke === 'thick' ? 'thick' : 'normal'} edge-pattern-${
          edge.stroke === 'dotted' ? 'dotted' : 'solid'
        }`;
  const animation =
    edge.animate || edge.animation ? ` edge-animation-${edge.animation ?? 'fast'}` : '';
  return 'edge flowchart-link' + look + animation + cls(edge.classes);
}

function drawEdge({ w, layout, flow, paint }: Scene, e: EdgeView): void {
  const edge = e.edge;
  const route = layout.edges.get(e.id);
  w.open('g', { class: edgeClass(edge), 'data-id': edge.id, 'data-ast': edge.ast });
  if (route && route.points.length > 1 && edge.stroke !== 'invisible') {
    const points = route.points.slice();
    const last = points.length - 1;
    const { views, pads } = flow;
    points[0] = inset(points[0]!, views.get(e.source), layout.nodes.get(e.source), pads);
    points[last] = inset(points[last]!, views.get(e.target), layout.nodes.get(e.target), pads);
    const path = routePath(
      w,
      points,
      e.source === e.target ? 'rounded' : e.curve,
      markerTrim(e.start, paint.heads),
      markerTrim(e.end, paint.heads)
    );
    w.outline('edge', 'path', {
      d: path.d,
      'stroke-width': edge.stroke === 'thick' ? THICK : undefined,
      'stroke-dasharray': edge.stroke === 'dotted' ? DOTTED : undefined,
      // v12 drew dotted edges with butt caps; the group's round caps close a 2px dash's gaps.
      // Animated edges keep round caps, as v12's .edge-animation-* rules set them.
      'stroke-linecap':
        edge.stroke === 'dotted' && !edge.animate && !edge.animation ? 'butt' : undefined,
      ...e.style.shape,
      fill: 'none',
    });
    // The head fades with its line: opacity, and stroke-opacity as the head's fill-opacity.
    const headPaint: Attrs = {
      fill: e.style.shape.stroke ?? paint.node.arrow,
      opacity: e.style.shape.opacity,
      'fill-opacity': e.style.shape['stroke-opacity'],
    };
    marker(
      w,
      e.start,
      { x: path.sx, y: path.sy, dx: path.sdx, dy: path.sdy },
      headPaint,
      paint.heads
    );
    marker(
      w,
      e.end,
      { x: path.ex, y: path.ey, dx: path.edx, dy: path.edy },
      headPaint,
      paint.heads
    );
  }
  w.close();
}

function drawEdgeLabel({ w, layout, paint }: Scene, e: EdgeView): void {
  const at = layout.edges.get(e.id)?.label;
  if (!at || e.label.width === 0) return;
  const lw = e.label.width + 2 * LABEL_PAD;
  w.open('g', { class: 'edgeLabel', 'data-id': e.edge.id });
  w.leaf('rect', {
    x: at.x - lw / 2,
    y: at.y - e.label.height / 2,
    width: lw,
    height: e.label.height,
    rx: 3,
    fill: paint.edgeLabel!.fill,
  });
  w.label(e.label, at.x, at.y, { fill: paint.edgeLabel!.text, ...e.style.text });
  w.close();
}

function drawNode(
  { w, layout, flow, ctx, paint, warn }: Scene,
  view: NodeView,
  tip?: string
): void {
  const box = layout.nodes.get(view.id);
  if (!box) return;
  const v = view.vertex;
  const slot = paint.slotOf(view);
  const securityLevel = ctx.securityLevel ?? 'default';
  w.open('g', {
    class:
      (view.shape === 'collapsedGroup' ? 'node cluster collapsed' : 'node default') +
      cls(view.classes),
    'data-id': view.id,
    'data-ast': view.ast,
    'data-color-id': slot?.id,
    transform: translate(box.x, box.y),
  });
  if (tip) textElement(w, 'title', tip);
  const href =
    v?.link === undefined
      ? undefined
      : checkUrl(v.link, { securityLevel, linkSchemes: ctx.linkSchemes, warn });
  if (href) w.open('a', { href, target: checkLinkTarget(v?.linkTarget, warn) });
  // A collapsed subgraph takes its palette slot; the author's style still wins (spread after).
  const shapeAttrs: Attrs = {
    fill: slot?.fill ?? paint.node.fill,
    stroke: slot?.stroke ?? paint.node.stroke,
    'stroke-width': paint.node.strokeWidth,
    filter: paint.node.shadow,
    ...view.style.shape,
  };
  // Inner lines follow the outline, except a collapsed card's separator and dots, which take
  // the palette slot's border or else clusterBorder.
  let lineAttrs: Attrs = {
    stroke: shapeAttrs.stroke,
    'stroke-width': shapeAttrs['stroke-width'],
  };
  if (paint.collapsedLine && view.shape === 'collapsedGroup') {
    lineAttrs = slot ? { stroke: slot.stroke } : paint.collapsedLine;
  }
  if (paint.node.plainStroke && lineAttrs.stroke === paint.node.stroke && usesPlain(view.shape)) {
    lineAttrs = { ...lineAttrs, stroke: paint.node.plainStroke };
  }
  if (v?.img) drawImage(w, view, v.img, securityLevel, warn);
  else if (v?.icon) {
    // D298: the glyph takes the author's stroke, else nodeBorder (`node.stroke`, the gradient
    // under neo).
    drawIcon(w, view, shapeAttrs, view.style.shape.stroke ?? paint.node.stroke, ctx);
  } else drawShape(view.shape, w, view.w, view.h, shapeAttrs, lineAttrs, flow.pads);
  const fill = view.style.shape.fill;
  w.label(view.label, 0, view.dy, {
    fill: fill && shapeFilled(view.shape) && !v?.img && !v?.icon ? ctx.theme.ink(fill) : undefined,
    ...view.style.text,
  });
  if (href) w.close();
  w.close();
}
