// Draws a laid-out flowchart through the SvgWriter (DESIGN §7). Structure follows v12's group
// classes (`clusters`, `edgePaths`, `edgeLabels`, `nodes`); every vertex, edge and subgraph is
// one element with `data-id`, `data-ast` and semantic classes (R-SVG-2, -3, R-PARSE-8).
import type {
  LayoutModel,
  LayoutModelGroup,
  LayoutModelNode,
  RoutePoint,
} from '@mermaid-js/core/layout';
import { layered, pxProfile } from '@mermaid-js/core/layout';
import { drawFolded } from '@mermaid-js/core/svg/folded';
import { drawFramed } from '@mermaid-js/core/svg/framed';
import {
  checkLinkTarget,
  checkUrl,
  translate,
  type Attrs,
  type OutlinePaint,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import {
  ANIMATED_DASH,
  animateEdge,
  clickCursor,
  cls,
  openSvgRoot,
  paletteSlots,
  textElement,
  placeTitle,
  titledViewBox,
} from '@mermaid-js/shared/svg/document';
import { edgeLabel } from '@mermaid-js/shared/svg/graph';
import type { FlowModel } from '../parser/index.ts';
import type { FlowRenderContext, FlowWarning } from './context.ts';
import { drawIcon, drawImage } from './assets.ts';
import { arrowheads, marker, markerTrim, type Arrowheads } from '@mermaid-js/shared/svg/arrowheads';
import { routePath } from '@mermaid-js/shared/svg/route';
import { prepare, type EdgeView, type NodeView, type Prepared } from './prepare.ts';
import { drawShape, shapeFilled, shapeInset, usesPlain, type Pads } from './shapes.ts';

/** The flowchart's layout: the engine's LayoutModel, plus the measured views when they are fresh. */
export interface FlowLayout extends LayoutModel {
  /** Set by `layoutFlowchart`; a `postLayout` hook that builds a new model drops it. */
  readonly flow?: Prepared;
  /** With `flow`: the lane drawer, on a layout the `swimlane` layout made (D535, D536). */
  readonly lanes?: LaneDrawer;
}

/**
 * Draws every group of a swimlane render: the lanes the engine made, then each subgraph in
 * order, a lane as a lane and any other through `plain` (the renderer's subgraph box).
 */
export type LaneDrawer = (scene: Scene, plain: PlainCluster) => void;

/**
 * Swimlane lane drawing and warnings (spec #528, D535, D536): a part of its own
 * (`../lanes.ts`), which `mermaid` loads with the `swimlane` layout for flowcharts
 * (`layoutParts`), so a plain flowchart loads none of it (R-PERF-1). A render gets it as
 * `ctx.layoutPart` only when that layout laid it out, so it is also the answer to "is this a
 * swimlane render": then the top-level groups are lanes. Its default export makes one layout's
 * drawer, its lanes worked out once, and given `warn`, raises v12's swimlane warnings.
 */
export type LaneDrawerFactory = (
  cls: Classes,
  model: FlowModel,
  flow: Prepared,
  layout: LayoutModel,
  warn?: Warn
) => LaneDrawer;

/** The renderer's class-name helper, passed to the part so it imports none of this file. */
export type Classes = (names: readonly string[]) => string;

/** Draws one subgraph as a plain box. */
export type PlainCluster = (view: NodeView, box: LayoutModelGroup) => void;

type Warn = (warning: FlowWarning) => void;

/** The layout's lane drawer: only on a render the `swimlane` layout laid out. */
function lanesFor(
  { layoutPart }: FlowRenderContext,
  ...args: [FlowModel, Prepared, LayoutModel, Warn?]
): LaneDrawer | undefined {
  return typeof layoutPart === 'function'
    ? (layoutPart as LaneDrawerFactory)(cls, ...args)
    : undefined;
}

/** Measures the model and lays it out with `ctx.layout` (default `layered`). */
export function layoutFlowchart(model: FlowModel, ctx: FlowRenderContext): FlowLayout {
  const prepared = prepare(model, ctx);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  // Its warnings at layout, as prepare's own: once per layout, also for a host that only lays out.
  const lanes = lanesFor(ctx, model, prepared, laid, (w) => ctx.warn(w));
  return { ...laid, flow: prepared, lanes };
}

const THICK = 3.5;
const DOTTED = '2' as SafeValue;

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

export interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

type ThemeOf = FlowRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

/** Node paint: every vertex, and the edges' lines and heads. */
export interface NodePaint {
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

export interface Paints {
  readonly heads: Arrowheads;
  readonly node: NodePaint;
  /**
   * Shared by every element that has no palette slot or style of its own, so those write the
   * same attributes, in the same order, without a new object each: a node's outline paint and
   * its inner lines, and an arrowhead's paint.
   */
  readonly shape: Attrs;
  readonly line: Attrs;
  readonly head: Attrs;
  readonly cluster?: { fill: Color; stroke: OutlinePaint; strokeWidth: Length; text: Color };
  /**
   * A lane's border: clusterBorder as a colour, never the gradient (v12's swimlane styles forced
   * `stroke: clusterBorder` on lanes without a palette slot). Set only under the swimlane engine.
   */
  readonly laneStroke?: Color;
  /** A collapsed subgraph's separator and dots take clusterBorder (v12 `.collapsed-*` rules). */
  readonly collapsedLine?: Attrs;
  /** Folded blocks (#670): the icon's filled nodes and the type's muted grey. */
  readonly folded?: { readonly ink: Color; readonly muted: Color };
  /** A subgraph's palette slot from its source order (a lane's too, the default lane's included). */
  readonly slotOf: (view: Pick<NodeView, 'order'>) => Tint | undefined;
  /** `text` is the label paint of an edge without a text style. */
  readonly edgeLabel?: { fill: Color; text: Attrs };
}

/** Whether a checked style sets nothing (prepare shares one object per distinct class list). */
function isEmpty(style: Attrs): boolean {
  for (const _name in style) return false;
  return true;
}

/**
 * Every theme variable the body uses, looked up before the root is written, so the root
 * `style` can declare exactly the aliases used (theme.rootStyle()). The order is the order
 * they are declared in.
 */
function paints(theme: ThemeOf, flow: Prepared, lanes: boolean): Paints {
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
  // Under the swimlane engine loose nodes sit in a lane, which flowchart's model does not have.
  const cluster =
    flow.groups.length > 0 || lanes
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
  const laneStroke = lanes ? theme.color('clusterBorder') : undefined;
  // Read here, not in core, so the theme inventory lists the diagrams that use them.
  const folded = flow.nodes.some((v) => v.block === 'folded')
    ? { ink: theme.color('nodeBorder'), muted: theme.color('mutedBorder') }
    : undefined;
  const slot = paletteSlots(theme);
  const slotOf = (view: Pick<NodeView, 'order'>): Tint | undefined =>
    view.order === undefined ? undefined : slot(view.order);
  const labelPaint = flow.edges.some((e) => e.label.width > 0)
    ? { fill: theme.color('edgeLabelBackground'), text: { fill: theme.color('textColor') } }
    : undefined;
  const shape: Attrs = {
    fill: node.fill,
    stroke: node.stroke,
    'stroke-width': node.strokeWidth,
    filter: node.shadow,
  };
  const line: Attrs = { stroke: node.stroke, 'stroke-width': node.strokeWidth };
  // An arrowhead's paint: these three keys in this order, as an edge with a style writes them.
  const head: Attrs = { fill: node.arrow, opacity: undefined, 'fill-opacity': undefined };
  return {
    heads,
    node,
    shape,
    line,
    head,
    cluster,
    laneStroke,
    collapsedLine,
    folded,
    slotOf,
    edgeLabel: labelPaint,
  };
}

/** What every section of one render draws from. */
export interface Scene {
  readonly w: SvgWriter;
  readonly layout: FlowLayout;
  readonly flow: Prepared;
  readonly ctx: FlowRenderContext;
  readonly paint: Paints;
  readonly warn: Warn;
  /** The lane drawer, on a render the `swimlane` layout laid out (D535, D536). */
  readonly lanes: LaneDrawer | undefined;
}

/** Writes the whole `<svg>` document for a laid-out flowchart. */
export function renderFlowchart(
  model: FlowModel,
  layout: FlowLayout,
  ctx: FlowRenderContext,
  w: SvgWriter
): void {
  const flow = layout.flow ?? prepare(model, ctx);
  // Built once, at layout; a layout from elsewhere (a `postLayout` model) gets its own.
  const lanes = layout.lanes ?? lanesFor(ctx, model, flow, layout);
  const scene: Scene = {
    w,
    layout,
    flow,
    ctx,
    paint: paints(ctx.theme, flow, !!lanes),
    warn: (warning) => ctx.warn(warning),
    lanes,
  };
  const conf = ctx.config.flowchart;
  // v12's `flowchartTitleText`: 18 px in `textColor`, `titleTopMargin` above the drawing (D652).
  const title = placeTitle(model.title, layout.width, conf?.titleTopMargin ?? 25, ctx, 18);
  const ink = title && ctx.theme.color('textColor');
  openRoot(scene, model, titledViewBox(layout, title, conf?.diagramPadding ?? 8));
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
  if (title && ink) {
    w.label(title.label, title.x, title.y, {
      class: 'flowchartTitleText',
      fill: ink,
      'font-size': 18,
    });
  }
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot(
  { w, ctx, paint }: Scene,
  model: FlowModel,
  viewBox: ReturnType<typeof titledViewBox>
): void {
  openSvgRoot(w, ctx, {
    name: 'flowchart',
    viewBox,
    maxWidth: ctx.config.flowchart?.useMaxWidth !== false,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': paint.node.font,
      'font-size': paint.node.fontSize,
    },
  });
}

function drawClusters(scene: Scene): void {
  const { w, layout, flow, ctx, paint } = scene;
  const cluster = paint.cluster!;
  w.open('g', { class: 'clusters' });
  const plain: PlainCluster = (g, box) => {
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
  };
  if (scene.lanes) scene.lanes(scene, plain);
  else
    for (const g of flow.groups) {
      const box = layout.groups.get(g.id);
      if (box) plain(g, box);
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

/** The edge's line: its weight and pattern, then the author's style, then an animation's dashes. */
function edgeLine(edge: EdgeView['edge'], d: Attrs['d'], style: Attrs, animated: boolean): Attrs {
  const dotted = edge.stroke === 'dotted';
  return {
    d,
    'stroke-width': edge.stroke === 'thick' ? THICK : undefined,
    'stroke-dasharray': dotted ? DOTTED : undefined,
    // v12 drew dotted edges with butt caps; the group's round caps close a 2px dash's gaps.
    // Animated edges keep round caps, as v12's .edge-animation-* rules set them.
    'stroke-linecap': dotted && !animated ? 'butt' : undefined,
    ...style,
    // The moving dashes replace the edge's own pattern and any `linkStyle` one, as in v12.
    ...(animated && { 'stroke-dasharray': ANIMATED_DASH, 'stroke-dashoffset': undefined }),
    fill: 'none',
  };
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
    const style = e.style.shape;
    w.outline('edge', 'path', edgeLine(edge, path.d, style, animateEdge(w, edge)));
    // The head fades with its line: opacity, and stroke-opacity as the head's fill-opacity.
    const headPaint: Attrs =
      style.stroke === undefined &&
      style.opacity === undefined &&
      style['stroke-opacity'] === undefined
        ? paint.head
        : {
            fill: style.stroke ?? paint.node.arrow,
            opacity: style.opacity,
            'fill-opacity': style['stroke-opacity'],
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

/** An edge's label as a tag, bordered in the edge's own stroke (D626, D627). */
function drawEdgeLabel({ w, layout, ctx, paint }: Scene, e: EdgeView): void {
  const at = layout.edges.get(e.id)?.label;
  if (!at || e.label.width === 0) return;
  const { fill, text } = paint.edgeLabel!;
  const own = isEmpty(e.style.text) ? text : { fill: text.fill, ...e.style.text };
  edgeLabel(w, e.label, at, e.edge.id, {
    fill,
    stroke: e.style.shape.stroke ?? paint.node.line,
    text: own,
    patch: (ctx.units ?? pxProfile).builder.labelPatch,
  });
}

/** A node's own classes: a collapsed subgraph's card, a block (ADR-15), or a plain node. */
function nodeClass(view: NodeView): string {
  if (view.shape === 'collapsedGroup') return 'node cluster collapsed';
  if (!view.block) return 'node default';
  return view.block === 'folded' ? 'node embed folded' : 'node embed';
}

/** The outline attributes of a node, from its palette slot and its style. */
function shapeAttrsOf(paint: Scene['paint'], view: NodeView, slot: Tint | undefined): Attrs {
  // A collapsed subgraph takes its palette slot; the author's style still wins (spread after).
  if (slot === undefined && isEmpty(view.style.shape)) return paint.shape;
  return {
    fill: slot?.fill ?? paint.node.fill,
    stroke: slot?.stroke ?? paint.node.stroke,
    'stroke-width': paint.node.strokeWidth,
    filter: paint.node.shadow,
    ...view.style.shape,
  };
}

/**
 * Inner lines follow the outline, except a collapsed card's separator and dots, which take
 * the palette slot's border or else clusterBorder.
 */
function lineAttrsOf(
  paint: Scene['paint'],
  view: NodeView,
  slot: Tint | undefined,
  shapeAttrs: Attrs
): Attrs {
  const plain = slot === undefined && isEmpty(view.style.shape);
  let lineAttrs: Attrs = plain
    ? paint.line
    : { stroke: shapeAttrs.stroke, 'stroke-width': shapeAttrs['stroke-width'] };
  if (paint.collapsedLine && view.shape === 'collapsedGroup') {
    lineAttrs = slot ? { stroke: slot.stroke } : paint.collapsedLine;
  }
  if (paint.node.plainStroke && lineAttrs.stroke === paint.node.stroke && usesPlain(view.shape)) {
    lineAttrs = { ...lineAttrs, stroke: paint.node.plainStroke };
  }
  return lineAttrs;
}

/** The fill, stroke and inner-line attributes of a node. */
function nodeAttrs(
  paint: Scene['paint'],
  view: NodeView,
  slot: Tint | undefined
): { shapeAttrs: Attrs; lineAttrs: Attrs } {
  const shapeAttrs = shapeAttrsOf(paint, view, slot);
  return { shapeAttrs, lineAttrs: lineAttrsOf(paint, view, slot, shapeAttrs) };
}

/** A block's border and transparent background, which set a block apart from a subgraph. */
function blockFrame(paint: Scene['paint'], view: NodeView): Attrs {
  return {
    fill: 'none',
    stroke: paint.node.stroke,
    'stroke-width': paint.node.strokeWidth,
    ...view.style.shape,
  };
}

/** The picture of a node that is not a folded block: block frame, image, icon or shape. */
function drawNodeBody(
  { w, flow, ctx, paint, warn }: Scene,
  view: NodeView,
  attrs: { shapeAttrs: Attrs; lineAttrs: Attrs }
): void {
  const v = view.vertex;
  if (view.block) {
    drawFramed(
      w,
      { width: view.w, height: view.h },
      view.label.height,
      view.embed ?? null,
      blockFrame(paint, view)
    );
  } else if (v?.img) drawImage(w, view, v.img, ctx.securityLevel ?? 'default', warn);
  else if (v?.icon) {
    // D298: the glyph takes the author's stroke, else nodeBorder (`node.stroke`, the gradient
    // under neo).
    drawIcon(w, view, attrs.shapeAttrs, view.style.shape.stroke ?? paint.node.stroke, ctx);
  } else {
    drawShape({
      kind: view.shape,
      w,
      width: view.w,
      height: view.h,
      attrs: attrs.shapeAttrs,
      lines: attrs.lineAttrs,
      pads: flow.pads,
    });
  }
}

/** The checked link of a node, or undefined when it has none or the level refuses it. */
function nodeHref({ ctx, warn }: Scene, v: NodeView['vertex']): ReturnType<typeof checkUrl> {
  if (v?.link === undefined) return undefined;
  return checkUrl(v.link, {
    securityLevel: ctx.securityLevel ?? 'default',
    linkSchemes: ctx.linkSchemes,
    warn,
  });
}

/** A folded block: its frame, mark and title. */
function drawFoldedNode({ w, paint }: Scene, view: NodeView): void {
  const frame = blockFrame(paint, view);
  const { type, label } = view.fold!;
  drawFolded(w, { width: view.w, height: view.h }, view.label, label!, type.length, {
    frame,
    mark: frame.stroke ?? paint.node.stroke,
    ...paint.folded!,
    title: view.style.text,
  });
}

function drawNode(scene: Scene, view: NodeView, tip?: string): void {
  const { w, layout, ctx, paint, warn } = scene;
  const box = layout.nodes.get(view.id);
  if (!box) return;
  const v = view.vertex;
  const slot = paint.slotOf(view);
  const { block } = view;
  w.open('g', {
    class: nodeClass(view) + cls(view.classes),
    'data-id': view.id,
    'data-ast': view.ast,
    'data-color-id': slot?.id,
    transform: translate(box.x, box.y),
    // A block is one image to assistive technology, named by its title (ADR-15).
    role: block ? 'img' : undefined,
    'aria-label': block ? v?.text || view.id : undefined,
    cursor: clickCursor(view.classes),
  });
  if (tip) textElement(w, 'title', tip);
  const href = nodeHref(scene, v);
  if (href) w.open('a', { href, target: checkLinkTarget(v?.linkTarget, warn) });
  if (block === 'folded') {
    drawFoldedNode(scene, view);
    if (href) w.close();
    w.close();
    return;
  }
  drawNodeBody(scene, view, nodeAttrs(paint, view, slot));
  const fill = view.style.shape.fill;
  const ink =
    fill && shapeFilled(view.shape) && !v?.img && !v?.icon && !block
      ? ctx.theme.ink(fill)
      : undefined;
  // No attributes at all writes the same label as `{ fill: undefined }`.
  w.label(
    view.label,
    view.dx,
    view.dy,
    ink === undefined && isEmpty(view.style.text) ? undefined : { fill: ink, ...view.style.text }
  );
  if (href) w.close();
  w.close();
}
