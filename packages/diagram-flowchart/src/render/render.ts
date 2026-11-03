// Draws a laid-out flowchart through the SvgWriter (DESIGN §7). Structure follows v12's group
// classes (`clusters`, `edgePaths`, `edgeLabels`, `nodes`); every vertex, edge and subgraph is
// one element with `data-id`, `data-ast` and semantic classes (R-SVG-2, -3, R-PARSE-8).
import type { LayoutModel, LayoutModelNode, RoutePoint } from '@mermaid-js/core/layout';
import { layered } from '@mermaid-js/core/layout';
import {
  checkLinkTarget,
  checkUrl,
  px,
  styleText,
  themeStyleSheet,
  translate,
  type Attrs,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { FlowModel } from '../parser/index.ts';
import type { FlowRenderContext } from './context.ts';
import { marker, markerTrim, routePath } from './edges.ts';
import { prepare, type NodeView, type Prepared } from './prepare.ts';
import { drawShape, shapeFilled, shapeInset, type Pads } from './shapes.ts';

/** The flowchart's layout: the engine's LayoutModel, plus the measured views when they are fresh. */
export interface FlowLayout extends LayoutModel {
  /** Set by `layoutFlowchart`; a `postLayout` hook that builds a new model drops it. */
  readonly flow?: Prepared;
}

/** Measures the model and lays it out with `ctx.layout` (default `layered`). */
export function layoutFlowchart(model: FlowModel, ctx: FlowRenderContext): FlowLayout {
  const prepared = prepare(model, ctx);
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

/** Writes the whole `<svg>` document for a laid-out flowchart. */
export function renderFlowchart(
  model: FlowModel,
  layout: FlowLayout,
  ctx: FlowRenderContext,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  const flow = layout.flow ?? prepare(model, ctx);
  const warn = ctx.warn;
  const securityLevel = ctx.securityLevel ?? 'default';
  const prefix = ctx.idPrefix ?? 'mermaid';
  const labelled = flow.edges.some((e) => e.label.width > 0);

  // Every theme variable the body uses is looked up here, before the root is written, so the
  // root `style` can declare exactly the aliases used (theme.rootStyle()).
  const P = {
    ff: theme.font(),
    fs: theme.length('fontSize'),
    fill: theme.color('mainBkg'),
    stroke: theme.color('nodeBorder'),
    text: theme.color('nodeTextColor'),
    sw: theme.length('strokeWidth'),
    line: theme.color('lineColor'),
    arrow: theme.color('arrowheadColor'),
  };
  const G =
    flow.groups.length > 0
      ? {
          fill: theme.color('clusterBkg'),
          stroke: theme.color('clusterBorder'),
          sw: theme.length('clusterStrokeWidth'),
          text: theme.color('titleColor'),
        }
      : undefined;
  // A collapsed subgraph's separator and dots take clusterBorder (v12 `.collapsed-*` rules).
  const C = flow.nodes.some((v) => v.shape === 'collapsedGroup')
    ? { stroke: theme.color('clusterBorder') }
    : undefined;
  const L = labelled
    ? { fill: theme.color('edgeLabelBackground'), text: theme.color('textColor') }
    : undefined;

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
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version ?? '13',
    'data-p': auto ? prefix : undefined,
    style: styleText({ ...(maxWidth ? { 'max-width': px(width) } : {}), ...theme.rootStyle() }),
    'font-family': P.ff,
    'font-size': P.fs,
  });
  if (auto) w.styleSheet(themeStyleSheet(prefix, auto.light, auto.dark));
  if (title) {
    w.open('title', { id: `${prefix}-title` });
    w.text(title);
    w.close();
  }
  if (desc) {
    w.open('desc', { id: `${prefix}-desc` });
    w.text(desc);
    w.close();
  }

  if (G) {
    w.open('g', { class: 'clusters' });
    for (const g of flow.groups) {
      const box = layout.groups.get(g.id);
      if (!box) continue;
      const fill = g.style.shape.fill;
      w.open('g', { class: 'cluster' + cls(g.classes), 'data-id': g.id, 'data-ast': g.ast });
      w.leaf('rect', {
        x: box.x - box.width / 2,
        y: box.y - box.height / 2,
        width: box.width,
        height: box.height,
        fill: G.fill,
        stroke: G.stroke,
        'stroke-width': G.sw,
        ...g.style.shape,
      });
      w.label(g.label, box.title.x, box.title.y, {
        class: 'cluster-label',
        fill: (fill && theme.ink(fill)) || G.text,
        ...g.style.text,
      });
      w.close();
    }
    w.close();
  }

  const views = new Map<string, NodeView>();
  for (const n of flow.nodes) views.set(n.id, n);
  w.open('g', {
    class: 'edgePaths',
    fill: 'none',
    stroke: P.line,
    'stroke-width': P.sw,
    'stroke-linecap': 'round',
  });
  for (const e of flow.edges) {
    const edge = e.edge;
    const route = layout.edges.get(e.id);
    w.open('g', {
      class:
        'edge flowchart-link' +
        (edge.stroke === 'invisible'
          ? ' edge-thickness-invisible'
          : ` edge-thickness-${edge.stroke === 'thick' ? 'thick' : 'normal'} edge-pattern-${
              edge.stroke === 'dotted' ? 'dotted' : 'solid'
            }`) +
        (edge.animate || edge.animation ? ` edge-animation-${edge.animation ?? 'fast'}` : '') +
        cls(edge.classes),
      'data-id': edge.id,
      'data-ast': edge.ast,
    });
    if (route && route.points.length > 1 && edge.stroke !== 'invisible') {
      const points = route.points.slice();
      const last = points.length - 1;
      points[0] = inset(points[0]!, views.get(e.source), layout.nodes.get(e.source), flow.pads);
      points[last] = inset(
        points[last]!,
        views.get(e.target),
        layout.nodes.get(e.target),
        flow.pads
      );
      const path = routePath(
        w,
        points,
        e.source === e.target ? 'rounded' : e.curve,
        markerTrim(e.start),
        markerTrim(e.end)
      );
      w.leaf('path', {
        d: path.d,
        'stroke-width': edge.stroke === 'thick' ? THICK : undefined,
        'stroke-dasharray': edge.stroke === 'dotted' ? DOTTED : undefined,
        ...e.style.shape,
        fill: 'none',
      });
      const head: Attrs = { fill: (e.style.shape.stroke as Paint | undefined) ?? P.arrow };
      marker(w, e.start, path.sx, path.sy, path.sdx, path.sdy, head);
      marker(w, e.end, path.ex, path.ey, path.edx, path.edy, head);
    }
    w.close();
  }
  w.close();

  w.open('g', { class: 'edgeLabels' });
  if (L)
    for (const e of flow.edges) {
      const at = layout.edges.get(e.id)?.label;
      if (!at || e.label.width === 0) continue;
      const lw = e.label.width + 2 * LABEL_PAD;
      w.open('g', { class: 'edgeLabel', 'data-id': e.edge.id });
      w.leaf('rect', {
        x: at.x - lw / 2,
        y: at.y - e.label.height / 2,
        width: lw,
        height: e.label.height,
        rx: 3,
        fill: L.fill,
      });
      w.label(e.label, at.x, at.y, { fill: L.text, ...e.style.text });
      w.close();
    }
  w.close();

  const tips = new Map(model.tooltips);
  w.open('g', { class: 'nodes', fill: P.text });
  for (const view of flow.nodes) {
    const box = layout.nodes.get(view.id);
    if (!box) continue;
    const v = view.vertex;
    w.open('g', {
      class:
        (view.shape === 'collapsedGroup' ? 'node cluster collapsed' : 'node default') +
        cls(view.classes),
      'data-id': view.id,
      'data-ast': view.ast,
      transform: translate(box.x, box.y),
    });
    const tip = tips.get(view.id);
    if (tip) {
      w.open('title');
      w.text(tip);
      w.close();
    }
    const href =
      v?.link === undefined
        ? undefined
        : checkUrl(v.link, { securityLevel, linkSchemes: ctx.linkSchemes, warn });
    if (href) w.open('a', { href, target: checkLinkTarget(v?.linkTarget, warn) });
    const shapeAttrs: Attrs = {
      fill: P.fill,
      stroke: P.stroke,
      'stroke-width': P.sw,
      ...view.style.shape,
    };
    const lineAttrs: Attrs =
      C && view.shape === 'collapsedGroup'
        ? C
        : { stroke: shapeAttrs.stroke, 'stroke-width': shapeAttrs['stroke-width'] };
    if (v?.img) drawImage(w, view, v.img, securityLevel, ctx);
    else if (v?.icon) drawIcon(w, view, shapeAttrs, ctx);
    else drawShape(view.shape, w, view.w, view.h, shapeAttrs, lineAttrs, flow.pads);
    const fill = view.style.shape.fill;
    w.label(view.label, 0, view.dy, {
      fill: fill && shapeFilled(view.shape) && !v?.img && !v?.icon ? theme.ink(fill) : undefined,
      ...view.style.text,
    });
    if (href) w.close();
    w.close();
  }
  w.close();
  w.close();
}

// The asset box sits above or below the label (`pos: t` puts the label on top).
function assetTop(view: NodeView, size: number): number {
  if (view.label.height === 0) return -size / 2;
  return view.vertex?.pos === 't' ? view.h / 2 - size : -view.h / 2;
}

function drawImage(
  w: SvgWriter,
  view: NodeView,
  url: string,
  securityLevel: 'default' | 'strict',
  ctx: FlowRenderContext
): void {
  const v = view.vertex!;
  const href = checkUrl(url, { securityLevel, linkSchemes: ctx.linkSchemes, warn: ctx.warn });
  const aw = v.assetWidth && v.assetWidth > 0 && v.assetWidth <= 4000 ? v.assetWidth : 80;
  const ah = v.assetHeight && v.assetHeight > 0 && v.assetHeight <= 4000 ? v.assetHeight : 80;
  if (!href) return;
  w.leaf('image', {
    href,
    x: -aw / 2,
    y: assetTop(view, ah),
    width: aw,
    height: ah,
    preserveAspectRatio: v.constraint === 'on' ? 'xMidYMid meet' : 'none',
  });
}

// Icon packs are not part of M1: the icon's frame is drawn and the glyph is left out.
function drawIcon(w: SvgWriter, view: NodeView, a: Attrs, ctx: FlowRenderContext): void {
  const v = view.vertex!;
  const size = v.assetHeight && v.assetHeight > 0 && v.assetHeight <= 4000 ? v.assetHeight : 48;
  const top = assetTop(view, size);
  ctx.warn({
    code: 'ICON_UNAVAILABLE',
    message: `The icon ${JSON.stringify(v.icon!.slice(0, 60))} is not available; its frame is drawn without it.`,
  });
  if (v.form === 'circle') w.leaf('circle', { cy: top + size / 2, r: size / 2, ...a });
  else if (v.form === 'square' || v.form === 'rounded')
    w.leaf('rect', {
      x: -size / 2,
      y: top,
      width: size,
      height: size,
      rx: v.form === 'rounded' ? 8 : undefined,
      ...a,
    });
}
