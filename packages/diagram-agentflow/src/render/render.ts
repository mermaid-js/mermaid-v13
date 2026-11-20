/**
 * Draws a laid-out agentflow through the SvgWriter (DESIGN §7), keeping v12's classes: flows as
 * `g.cluster.flow-cluster` (the frame and its title), edges as `path.flowchart-link` with inline
 * arrowheads, vertices as `g.node.default.af-kind-<kind>`, a collapsed flow as a `g.node` card
 * (`rect.flow-collapsed`, `line.collapsed-separator`, three `circle.collapsed-indicator`), and the
 * front-matter title as `text.agentflowTitleText` (D218). `data-ast` goes on each `g.node`, flow
 * `g.cluster` and edge `path`; labels carry `data-id` only (D468, R-PARSE-8). Edge ends are on
 * the drawn outlines already: the layout put them there (`layout/ends.ts`).
 */
import { pxProfile } from '@mermaid-js/core/layout';
import {
  checkLinkTarget,
  checkUrl,
  translate,
  type Attrs,
  type SafeUrl,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import {
  cls,
  openSvgRoot,
  placeTitle,
  textElement,
  titledViewBox,
  type PlacedTitle,
} from '@mermaid-js/shared/svg/document';
import { edgeLabel } from '@mermaid-js/shared/svg/graph';
import { plainLine } from '@mermaid-js/shared/svg/node-paint';
import { marker, markerTrim, type MarkerPaint } from '@mermaid-js/shared/svg/arrowheads';
import { routePath } from '@mermaid-js/shared/svg/route';
import {
  AGENTFLOW_METRICS,
  type AgentflowEdgeView,
  type AgentflowGroupView,
  type AgentflowLayout,
  type AgentflowNodeView,
  type AgentflowPrepared,
} from '../layout/index.ts';
import type { AgentflowModel } from '../parser/index.ts';
import type { AgentflowRenderContext } from './context.ts';
import { paints, type FramePaint, type LabelPaint, type Paints } from './paint.ts';
import { drawCardTrim, shapeDrawer, usesPlain } from './shapes.ts';
import { flowOrder, flowTint, kindTint, type Tint } from './slots.ts';

/** v12's frame (`clusters.js` `flowGroup`) stroke width; its corner radius is the metrics'. */
const FRAME_WIDTH = 0.75;
/** v12's `.agentflowTitleText`: 18 px. */
const TITLE_SIZE = 18;
const DOTTED = '2' as SafeValue;
/** An edge label's background: padding either side, corner radius. */

/** The front-matter title, measured and placed: centred over the drawing, its baseline up. */
type Title = PlacedTitle;

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly layout: AgentflowLayout;
  readonly prepared: AgentflowPrepared;
  readonly ctx: AgentflowRenderContext;
  readonly paint: Paints;
  /** Each flow's number in declaration order, for its palette slot. */
  readonly order: ReadonlyMap<string, number>;
}

/** Writes the whole `<svg>` document for a laid-out agentflow. */
export function renderAgentflow(
  model: AgentflowModel,
  layout: AgentflowLayout,
  ctx: AgentflowRenderContext,
  w: SvgWriter
): void {
  const prepared = layout.agentflow;
  const title = titleOf(model, layout, ctx);
  const scene: Scene = {
    w,
    layout,
    prepared,
    ctx,
    paint: paints(ctx.theme, prepared, title !== undefined),
    order: flowOrder(model),
  };
  openRoot(scene, model, title);
  const { frame, edgeLabel: labelPaint, title: ink } = scene.paint;
  if (frame) drawFrames(scene, frame);
  w.open('g', {
    class: 'edgePaths',
    fill: 'none',
    stroke: scene.paint.node.line,
    'stroke-width': scene.paint.node.strokeWidth,
    'stroke-linecap': 'round',
  });
  for (const e of prepared.edges) drawEdge(scene, e);
  w.close();
  w.open('g', { class: 'edgeLabels' });
  if (labelPaint) for (const e of prepared.edges) drawEdgeLabel(scene, e, labelPaint);
  w.close();
  const tips = new Map(model.tooltips);
  w.open('g', { class: 'nodes', fill: scene.paint.node.text });
  for (const view of prepared.nodes) drawNode(scene, view, tips.get(view.id));
  w.close();
  if (title && ink) drawTitle(w, title, ink);
  w.close();
}

/**
 * The title (D218, D652, v12 `insertTitle`): `agentflow.titleTopMargin` from its baseline up to
 * the top of the layout's box, centred on it; none for an empty one.
 */
function titleOf(
  model: AgentflowModel,
  layout: AgentflowLayout,
  ctx: AgentflowRenderContext
): Title | undefined {
  return placeTitle(model.title, layout.width, layout.agentflow.titleTopMargin, ctx, TITLE_SIZE);
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, paint }: Scene, model: AgentflowModel, title?: Title): void {
  openSvgRoot(w, ctx, {
    name: 'agentflow',
    viewBox: titledViewBox(layout, title, layout.agentflow.graph.diagramPadding ?? 0),
    maxWidth: ctx.config.agentflow?.useMaxWidth !== false,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': paint.node.font,
      'font-size': paint.node.fontSize,
    },
  });
}

/** A flow's tint, or a collapsed card's (its flow's), under a palette. */
function flowSlot({ paint, order }: Scene, id: string): Tint | undefined {
  const n = order.get(id);
  return paint.palette && n !== undefined ? flowTint(paint.palette, n) : undefined;
}

/**
 * Each expanded flow, outermost first: v12's `flowGroup` frame (rx 10, 0.75 px, unfilled), its
 * stroke `nodeBorder` and the shadow as v12's neo rule drew it, or its palette slot; the title
 * `subGraphTitleMargin.top` below the frame's top (D466).
 */
function drawFrames(scene: Scene, frame: FramePaint): void {
  const { w, layout, prepared, ctx, paint } = scene;
  const titlePad = (ctx.units ?? pxProfile).builder.titlePad;
  w.open('g', { class: 'clusters' });
  for (const g of prepared.groups) {
    const box = layout.groups.get(g.id);
    if (!box) continue;
    const slot = flowSlot(scene, g.id);
    const top = box.y - box.height / 2;
    w.open('g', {
      class: 'cluster flow-cluster' + cls(g.classes),
      'data-id': g.id,
      'data-ast': g.ast,
      'data-color-id': slot?.id,
    });
    // The author's `style` / `classDef` still wins over the palette (spread after).
    w.outline('group', 'rect', {
      x: box.x - box.width / 2,
      y: top,
      width: box.width,
      height: box.height,
      rx: AGENTFLOW_METRICS.flowRadius,
      fill: slot?.fill ?? 'none',
      stroke: slot?.stroke ?? frame.stroke,
      'stroke-width': FRAME_WIDTH,
      filter: paint.node.shadow,
      ...g.style.shape,
    });
    drawFrameTitle(scene, g, frame, box.title.x, top + prepared.titleMargin.top + titlePad / 2);
    w.close();
  }
  w.close();
}

function drawFrameTitle(
  { w, ctx }: Scene,
  g: AgentflowGroupView,
  frame: FramePaint,
  x: number,
  top: number
): void {
  const fill = g.style.shape.fill;
  w.label(g.label, x, top + g.label.height / 2, {
    class: 'cluster-label',
    fill: (fill && ctx.theme.ink(fill)) || frame.text,
    ...g.style.text,
  });
}

function edgeClass(e: AgentflowEdgeView, animated: boolean): string {
  const edge = e.edge;
  const pattern = edge.stroke === 'dotted' ? 'dotted' : 'solid';
  const animation = animated ? ` edge-animation-${edge.animation ?? 'fast'}` : '';
  return `flowchart-link edge-thickness-normal edge-pattern-${pattern}${animation}${cls(edge.classes)}`;
}

/** One edge: its `path` (with `data-ast`) and its arrowhead after it. */
function drawEdge({ w, layout, paint }: Scene, e: AgentflowEdgeView): void {
  const route = layout.edges.get(e.id);
  if (!route || route.points.length < 2) return;
  const edge = e.edge;
  const path = routePath(
    w,
    route.points,
    e.source === e.target ? 'rounded' : e.curve,
    markerTrim(e.start, paint.heads),
    markerTrim(e.end, paint.heads)
  );
  const dotted = edge.stroke === 'dotted';
  const animated = edge.animate === true || edge.animation !== undefined;
  w.outline('edge', 'path', {
    class: edgeClass(e, animated),
    'data-id': edge.id,
    'data-ast': edge.ast,
    d: path.d,
    'stroke-dasharray': dotted ? DOTTED : undefined,
    // v12 drew dotted edges with butt caps; animated edges keep round ones.
    'stroke-linecap': dotted && !animated ? 'butt' : undefined,
    ...e.style.shape,
    fill: 'none',
  });
  // The head fades with its line: opacity, and stroke-opacity as the head's fill-opacity.
  const headPaint: MarkerPaint = {
    fill: e.style.shape.stroke ?? paint.node.arrow,
    opacity: e.style.shape.opacity,
    'fill-opacity': e.style.shape['stroke-opacity'],
  };
  const start = { x: path.sx, y: path.sy, dx: path.sdx, dy: path.sdy };
  marker(w, e.start, start, headPaint, paint.heads, true);
  const end = { x: path.ex, y: path.ey, dx: path.edx, dy: path.edy };
  marker(w, e.end, end, headPaint, paint.heads, true);
}

/** An edge's label as a tag, bordered in the edge's own stroke (D626, D627). */
function drawEdgeLabel(
  { w, layout, ctx, paint: { node } }: Scene,
  e: AgentflowEdgeView,
  paint: LabelPaint
): void {
  const at = layout.edges.get(e.id)?.label;
  if (!at || e.label.width === 0) return;
  edgeLabel(w, e.label, at, e.edge.id, {
    fill: paint.fill,
    stroke: e.style.shape.stroke ?? node.line,
    text: { fill: paint.text, ...e.style.text },
    patch: (ctx.units ?? pxProfile).builder.labelPatch,
  });
}

/** A vertex's kind tint or a card's flow tint, under a palette. */
function nodeTint(scene: Scene, view: AgentflowNodeView): Tint | undefined {
  if (view.shape === 'collapsedGroup') return flowSlot(scene, view.id);
  const palette = scene.paint.palette;
  return palette && view.vertex ? kindTint(palette, view.vertex.kind) : undefined;
}

/** The vertex's `click` URL when it passes the link check, else undefined (with a warning). */
function linkOf(ctx: AgentflowRenderContext, view: AgentflowNodeView): SafeUrl | undefined {
  const url = view.vertex?.link;
  if (url === undefined) return undefined;
  return checkUrl(url, {
    securityLevel: ctx.securityLevel,
    linkSchemes: ctx.linkSchemes,
    warn: (warning) => ctx.warn(warning),
  });
}

/** The outline's paint: the slot over the theme's, the author's style last. */
function outlinePaint({ paint }: Scene, view: AgentflowNodeView, slot: Tint | undefined): Attrs {
  return {
    fill: slot?.fill ?? paint.node.fill,
    stroke: slot?.stroke ?? paint.node.stroke,
    'stroke-width': paint.node.strokeWidth,
    filter: paint.node.shadow,
    ...view.style.shape,
  };
}

/** Inner lines follow the outline; the refdoc's rule is plain under the gradient (D185). */
function linePaint({ paint }: Scene, view: AgentflowNodeView, outline: Attrs): Attrs {
  const line: Attrs = { stroke: outline.stroke, 'stroke-width': outline['stroke-width'] };
  return plainLine(paint.node, line, usesPlain(view.shape));
}

/** A vertex (`g.node.default.af-kind-<kind>`) or a collapsed flow's card (`g.node`). */
function drawNode(scene: Scene, view: AgentflowNodeView, tip?: string): void {
  const { w, layout, prepared, ctx, paint } = scene;
  const box = layout.nodes.get(view.id);
  if (!box) return;
  const v = view.vertex;
  const isCard = view.shape === 'collapsedGroup';
  const slot = nodeTint(scene, view);
  w.open('g', {
    class: (isCard ? 'node' : `node default af-kind-${v?.kind ?? 'task'}`) + cls(view.classes),
    'data-id': view.id,
    'data-ast': view.ast,
    'data-color-id': isCard ? slot?.id : undefined,
    transform: translate(box.x, box.y),
  });
  if (tip) textElement(w, 'title', tip);
  const href = linkOf(ctx, view);
  if (href) {
    w.open('a', { href, target: checkLinkTarget(v?.linkTarget, (warning) => ctx.warn(warning)) });
  }
  const outline = outlinePaint(scene, view, slot);
  const line = linePaint(scene, view, outline);
  shapeDrawer(view.shape)(w, view.w, view.h, outline, line, prepared.geometry);
  // A card's separator (`flowContainerStroke`) and dots (`nodeBorder`, with the shadow).
  if (isCard && paint.card) {
    const separator = { stroke: paint.card.separator };
    const dots = { fill: paint.card.dots, filter: paint.node.shadow };
    drawCardTrim(w, view.w, view.h, separator, dots);
  }
  const fill = view.style.shape.fill;
  w.label(view.label, 0, view.dy, {
    fill: fill ? ctx.theme.ink(fill) : undefined,
    ...view.style.text,
  });
  if (href) w.close();
  w.close();
}

function drawTitle(w: SvgWriter, title: Title, fill: LabelPaint['text']): void {
  w.label(title.label, title.x, title.y, {
    class: 'agentflowTitleText',
    fill,
    'font-size': TITLE_SIZE,
  });
}
