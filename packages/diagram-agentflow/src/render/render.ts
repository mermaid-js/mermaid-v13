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
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  translate,
  type Attrs,
  type SafeUrl,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { layoutLabel, type MeasuredLabel } from '@mermaid-js/core/text';
import {
  AGENTFLOW_LENGTH_DEFAULTS,
  configLengths,
  type AgentflowEdgeView,
  type AgentflowGroupView,
  type AgentflowLayout,
  type AgentflowNodeView,
  type AgentflowPrepared,
} from '../layout/index.ts';
import type { AgentflowModel } from '../parser/index.ts';
import type { AgentflowRenderContext } from './context.ts';
import { marker, markerTrim, routePath } from './edges.ts';
import { paints, type Paints } from './paint.ts';
import { drawShape, usesPlain, type ShapePaint } from './shapes.ts';
import { flowOrder, flowTint, kindTint, type Tint } from './slots.ts';

/** v12's frame (`clusters.js` `flowGroup`): corner radius and stroke width. */
const FRAME = { radius: 10, width: 0.75 } as const;
/** v12's `.agentflowTitleText`: 18 px. */
const TITLE_SIZE = 18;
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

/** The front-matter title, measured and placed: centred over the drawing, its baseline up. */
interface Title {
  readonly label: MeasuredLabel;
  readonly x: number;
  /** Centre of the label box. */
  readonly y: number;
}

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
  if (scene.paint.frame) drawFrames(scene);
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
  if (scene.paint.edgeLabel) for (const e of prepared.edges) drawEdgeLabel(scene, e);
  w.close();
  const tips = new Map(model.tooltips);
  w.open('g', { class: 'nodes', fill: scene.paint.node.text });
  for (const view of prepared.nodes) drawNode(scene, view, tips.get(view.id));
  w.close();
  if (title) drawTitle(scene, title);
  w.close();
}

/**
 * The title (D218, v12 `insertTitle`): `agentflow.titleTopMargin` from its baseline up to the
 * top of the layout's box, centred on it; none for an empty one.
 */
function titleOf(
  model: AgentflowModel,
  layout: AgentflowLayout,
  ctx: AgentflowRenderContext
): Title | undefined {
  const text = model.title?.trim();
  if (!text) return undefined;
  const margin = configLengths(
    ctx.config.agentflow,
    AGENTFLOW_LENGTH_DEFAULTS,
    'agentflow',
    (warning) => ctx.warn(warning)
  )('titleTopMargin');
  const font = { family: ctx.theme.value('fontFamily'), size: TITLE_SIZE, weight: 400 };
  const label = layoutLabel(text, font, Infinity, ctx.measurer);
  const top = -margin - label.baseline;
  return { label, x: layout.width / 2, y: top + label.height / 2 };
}

/** The drawn box: the layout's, grown to hold the title and the padding around it. */
function viewBox(
  layout: AgentflowLayout,
  title: Title | undefined
): [number, number, number, number] {
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  if (!title) return [0, 0, width, height];
  const pad = layout.agentflow.graph.diagramPadding ?? 0;
  const half = title.label.width / 2;
  const x0 = Math.floor(Math.min(0, title.x - half - pad));
  const y0 = Math.floor(Math.min(0, title.y - title.label.height / 2 - pad));
  const x1 = Math.ceil(Math.max(width, title.x + half + pad));
  return [x0, y0, x1 - x0, height - y0];
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, paint }: Scene, model: AgentflowModel, title?: Title): void {
  const { theme, config } = ctx;
  const prefix = (): string => ctx.idPrefix ?? 'mermaid';
  const box = viewBox(layout, title);
  const maxWidth = config.agentflow?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const acc = model.accTitle.trim();
  const desc = model.accDescr.trim();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-agentflow',
    viewBox: box,
    width: maxWidth ? '100%' : box[2],
    height: maxWidth ? undefined : box[3],
    role: 'img',
    'aria-roledescription': 'agentflow',
    'aria-labelledby': acc ? `${prefix()}-title` : undefined,
    'aria-describedby': desc ? `${prefix()}-desc` : undefined,
    'data-mermaid-version': ctx.version ?? '13',
    'data-p': auto ? styleScope(prefix()) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(box[2]) } : {}, theme.rootStyleText()),
    'font-family': paint.node.font,
    'font-size': paint.node.fontSize,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix()), auto.light, auto.dark));
  if (acc) textElement(w, 'title', acc, `${prefix()}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix()}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id?: string): void {
  w.open(tag, id === undefined ? undefined : { id });
  w.text(text);
  w.close();
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
function drawFrames(scene: Scene): void {
  const { w, layout, prepared, ctx, paint } = scene;
  const frame = paint.frame!;
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
      rx: FRAME.radius,
      fill: slot?.fill ?? 'none',
      stroke: slot?.stroke ?? frame.stroke,
      'stroke-width': FRAME.width,
      filter: paint.node.shadow,
      ...g.style.shape,
    });
    drawFrameTitle(scene, g, box.title.x, top + prepared.titleMargin.top + titlePad / 2);
    w.close();
  }
  w.close();
}

function drawFrameTitle(
  { w, ctx, paint }: Scene,
  g: AgentflowGroupView,
  x: number,
  top: number
): void {
  const fill = g.style.shape.fill;
  w.label(g.label, x, top + g.label.height / 2, {
    class: 'cluster-label',
    fill: (fill && ctx.theme.ink(fill)) || paint.frame!.text,
    ...g.style.text,
  });
}

function edgeClass(e: AgentflowEdgeView): string {
  const edge = e.edge;
  const animation =
    edge.animate || edge.animation ? ` edge-animation-${edge.animation ?? 'fast'}` : '';
  return (
    `flowchart-link edge-thickness-normal edge-pattern-${edge.stroke === 'dotted' ? 'dotted' : 'solid'}` +
    animation +
    cls(edge.classes)
  );
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
  w.outline('edge', 'path', {
    class: edgeClass(e),
    'data-id': edge.id,
    'data-ast': edge.ast,
    d: path.d,
    'stroke-dasharray': dotted ? DOTTED : undefined,
    // v12 drew dotted edges with butt caps; animated edges keep round ones.
    'stroke-linecap': dotted && !edge.animate && !edge.animation ? 'butt' : undefined,
    ...e.style.shape,
    fill: 'none',
  });
  // The head fades with its line: opacity, and stroke-opacity as the head's fill-opacity.
  const headPaint: Attrs = {
    fill: e.style.shape.stroke ?? paint.node.arrow,
    opacity: e.style.shape.opacity,
    'fill-opacity': e.style.shape['stroke-opacity'],
  };
  const start = { x: path.sx, y: path.sy, dx: path.sdx, dy: path.sdy };
  marker(w, e.start, start, headPaint, paint.heads);
  marker(w, e.end, { x: path.ex, y: path.ey, dx: path.edx, dy: path.edy }, headPaint, paint.heads);
}

function drawEdgeLabel({ w, layout, paint }: Scene, e: AgentflowEdgeView): void {
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
    securityLevel: ctx.securityLevel ?? 'default',
    linkSchemes: ctx.linkSchemes,
    warn: (warning) => ctx.warn(warning),
  });
}

/** The outline's paint (the slot over the theme's, the author's style last) and inner lines'. */
function shapePaint({ paint }: Scene, view: AgentflowNodeView, slot: Tint | undefined): ShapePaint {
  const shape: Attrs = {
    fill: slot?.fill ?? paint.node.fill,
    stroke: slot?.stroke ?? paint.node.stroke,
    'stroke-width': paint.node.strokeWidth,
    filter: paint.node.shadow,
    ...view.style.shape,
  };
  let line: Attrs = { stroke: shape.stroke, 'stroke-width': shape['stroke-width'] };
  if (paint.node.plainStroke && line.stroke === paint.node.stroke && usesPlain(view.shape))
    line = { ...line, stroke: paint.node.plainStroke };
  const card =
    view.shape === 'collapsedGroup' && paint.card
      ? {
          separator: { stroke: paint.card.separator },
          dots: { fill: paint.card.dots, filter: paint.node.shadow },
        }
      : undefined;
  return { shape, line, card };
}

/** A vertex (`g.node.default.af-kind-<kind>`) or a collapsed flow's card (`g.node`). */
function drawNode(scene: Scene, view: AgentflowNodeView, tip?: string): void {
  const { w, layout, prepared, ctx } = scene;
  const box = layout.nodes.get(view.id);
  if (!box) return;
  const v = view.vertex;
  const card = view.shape === 'collapsedGroup';
  const slot = nodeTint(scene, view);
  w.open('g', {
    class: (card ? 'node' : `node default af-kind-${v?.kind ?? 'task'}`) + cls(view.classes),
    'data-id': view.id,
    'data-ast': view.ast,
    'data-color-id': card ? slot?.id : undefined,
    transform: translate(box.x, box.y),
  });
  if (tip) textElement(w, 'title', tip);
  const href = linkOf(ctx, view);
  if (href) {
    w.open('a', { href, target: checkLinkTarget(v?.linkTarget, (warning) => ctx.warn(warning)) });
  }
  drawShape(view.shape, w, view.w, view.h, shapePaint(scene, view, slot), prepared.geometry);
  const fill = view.style.shape.fill;
  w.label(view.label, 0, view.dy, {
    fill: fill ? ctx.theme.ink(fill) : undefined,
    ...view.style.text,
  });
  if (href) w.close();
  w.close();
}

function drawTitle({ w, paint }: Scene, title: Title): void {
  w.label(title.label, title.x, title.y, {
    class: 'agentflowTitleText',
    fill: paint.title,
    'font-size': TITLE_SIZE,
  });
}
