/**
 * Draws a laid-out architecture diagram through the SvgWriter (DESIGN §7, spec #525 T4). The
 * layout (`layoutArchitecture`) measured everything and `compass` placed it; this file paints it
 * in v12's order (`architectureRenderer.ts:625-631`): `g.architecture-edges`, then
 * `g.architecture-services` (services, then junctions), then `g.architecture-groups`, drawn last
 * with no fill so the edges and services show through.
 *
 * v12's class names stay. Each service, junction and group is one `g` with `data-id` and
 * `data-ast` (its AST id, D508), and so is each edge's `path.edge`; labels, arrowheads and icons
 * carry `data-id` only, or nothing (R-PARSE-8). No element has an id but the accessible title and
 * description (`${idPrefix}-title`, `-desc`); the model's `title` is not drawn (v12 never drew
 * it). Services and junctions are translated to their corner, as v12's were; everything else
 * has absolute coordinates.
 */
import {
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  translate,
  rotate,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import { ARCHITECTURE_ARROW_SHRUNK, ARCHITECTURE_EDGE_NOT_DRAWN } from '../codes.ts';
import type { ArchitectureLayout } from '../layout/layout.ts';
import type { ArchitectureSizes } from '../layout/metrics.ts';
import type { ArchitectureNodeView } from '../layout/prepare.ts';
import type { ArchitectureModel } from '../model.ts';
import { drawIcon, drawTextIcon, fitTextIcon, iconsNotRendered } from './assets.ts';
import type { ArchitectureRenderContext } from './context.ts';
import { edgeScene, type EdgeEnd, type EdgeScene, type Extent, type PlacedLabel } from './edges.ts';
import { paints, type Paints } from './paint.ts';

interface Scene {
  readonly w: SvgWriter;
  readonly model: ArchitectureModel;
  readonly layout: ArchitectureLayout;
  readonly ctx: ArchitectureRenderContext;
  readonly paint: Paints;
  readonly sizes: ArchitectureSizes;
  readonly font: FontKey;
  /** Each edge's line, heads and label, in model order; no points where the engine routed none. */
  readonly edges: readonly EdgeScene[];
  /** The drawing's bounds: the layout's, and whatever edge labels reach past them. */
  readonly bounds: Extent;
  /** Names drawn as v12's `?` that no extension warned about. */
  readonly unresolved: string[];
}

/** Writes the whole `<svg>` document for a laid-out architecture diagram. */
export function renderArchitecture(
  model: ArchitectureModel,
  layout: ArchitectureLayout,
  ctx: ArchitectureRenderContext,
  w: SvgWriter
): void {
  const { sizes, font } = layout.architecture;
  // Every theme variable is read before the root, so its style declares them.
  const paint = paints(ctx.theme, sizes.groupDash);
  const edges = planEdges(model, layout, ctx);
  const scene: Scene = {
    w,
    model,
    layout,
    ctx,
    paint,
    sizes,
    font,
    edges,
    bounds: boundsOf(layout, edges),
    unresolved: [],
  };
  openRoot(scene);
  drawEdges(scene);
  drawNodes(scene);
  drawGroups(scene);
  w.close();
  if (scene.unresolved.length > 0) iconsNotRendered(ctx, scene.unresolved);
  const missing = edges.filter((e) => e.points.length < 2).map((e) => e.ast);
  if (missing.length > 0)
    ctx.warn({
      code: ARCHITECTURE_EDGE_NOT_DRAWN,
      message: `The layout engine routed no line for ${missing.map((id) => JSON.stringify(id)).join(', ')}; ${missing.length === 1 ? 'it is' : 'they are'} left out of the drawing.`,
    });
  const shrunk = edges.filter((e) => e.shrunk).length;
  if (shrunk > 0)
    ctx.warn({
      code: ARCHITECTURE_ARROW_SHRUNK,
      message: `The arrowheads of ${String(shrunk)} edge${shrunk === 1 ? '' : 's'} were shrunk to fit their line: at architecture.iconSize ${String(sizes.iconSize)} they are longer than the line's end.`,
    });
}

/**
 * Each edge's scene, from the engine's route and the boxes of its two ends; an edge the engine
 * routed none for keeps a scene with no points, so it still has its element (D508).
 */
function planEdges(
  model: ArchitectureModel,
  layout: ArchitectureLayout,
  ctx: ArchitectureRenderContext
): EdgeScene[] {
  const { sizes, font, edges: views } = layout.architecture;
  const junctions = new Set(model.junctions.map((j) => j.id));
  const endOf = (id: string): EdgeEnd | undefined => {
    const box = layout.nodes.get(id);
    return box && { box, junction: junctions.has(id) };
  };
  return views.map((v) => {
    const edge = model.edges[v.index]!;
    const route = layout.edges.get(v.id);
    if (!route || route.points.length < 2)
      return { ast: edge.astId, points: [], heads: [], shrunk: false };
    const source = endOf(edge.lhsId);
    const target = endOf(edge.rhsId);
    return edgeScene(
      {
        edge,
        route,
        ...(source ? { source } : {}),
        ...(target ? { target } : {}),
        ...(v.label ? { label: v.label } : {}),
      },
      sizes,
      font,
      ctx
    );
  });
}

/** The layout's box, grown to hold every edge label and arrowhead. */
function boundsOf(layout: ArchitectureLayout, edges: readonly EdgeScene[]): Extent {
  let x0 = 0;
  let y0 = 0;
  let x1 = layout.width;
  let y1 = layout.height;
  const take = (x: number, y: number): void => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const e of edges) {
    for (const head of e.heads)
      for (let i = 0; i + 1 < head.length; i += 2) take(head[i]!, head[i + 1]!);
    if (e.label) {
      take(e.label.extent.x0, e.label.extent.y0);
      take(e.label.extent.x1, e.label.extent.y1);
    }
  }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot({ w, model, ctx, bounds }: Scene): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const width = Math.max(1, bounds.x1 - bounds.x0);
  const height = Math.max(1, bounds.y1 - bounds.y0);
  const section = (config.architecture ?? {}) as Readonly<Record<string, unknown>>;
  const maxWidth = section.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-architecture',
    viewBox: [bounds.x0, bounds.y0, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'architecture',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
    'font-size': fontSize,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', content: string, id: string): void {
  w.open(tag, { id });
  w.text(content);
  w.close();
}

/** A label in v12's `architecture-service-label` group, `data-id` its owner's AST id. */
function drawLabel(
  { w, paint }: Scene,
  owner: string,
  box: MeasuredLabel,
  x: number,
  y: number,
  turn?: Pick<PlacedLabel, 'angle' | 'about'>
): void {
  w.open('g', {
    class: 'architecture-service-label',
    'data-id': owner,
    transform:
      turn && turn.angle !== 0 ? rotate(turn.angle, turn.about.x, turn.about.y) : undefined,
  });
  w.label(box, x, y, { fill: paint.text });
  w.close();
}

/** `g.architecture-edges`: per edge a `g` with its `path.edge`, `polygon.arrow` heads and label. */
function drawEdges(scene: Scene): void {
  const { w, paint, edges } = scene;
  w.open('g', { class: 'architecture-edges' });
  for (const e of edges) {
    const { ast } = e;
    w.open('g');
    if (e.points.length < 2) {
      // Not routed: its element stays, with no line (ARCHITECTURE_EDGE_NOT_DRAWN).
      w.leaf('path', { class: 'edge', 'data-id': ast, 'data-ast': ast });
      w.close();
      continue;
    }
    const d = w.path();
    e.points.forEach((p, k) => (k === 0 ? d.moveTo(p.x, p.y) : d.lineTo(p.x, p.y)));
    w.outline('edge', 'path', {
      class: 'edge',
      'data-id': ast,
      'data-ast': ast,
      d: d.done(),
      fill: 'none',
      stroke: paint.edge,
      'stroke-width': paint.edgeWidth,
    });
    for (const head of e.heads)
      w.leaf('polygon', { class: 'arrow', 'data-id': ast, points: head, fill: paint.arrow });
    if (e.label) drawLabel(scene, ast, e.label.box, e.label.at.x, e.label.at.y, e.label);
    w.close();
  }
  w.close();
}

/** `g.architecture-services`: every service in model order, then every junction (v12). */
function drawNodes(scene: Scene): void {
  const { w, layout } = scene;
  const views = layout.architecture.nodes;
  w.open('g', { class: 'architecture-services' });
  for (const v of views) if (v.kind === 'service') drawService(scene, v);
  for (const v of views) if (v.kind === 'junction') drawJunction(scene, v);
  w.close();
}

/**
 * One service, translated to its icon's corner: its label under the icon (v12 wrote it first),
 * then its icon, its text icon, or v12's dashed outline when it has neither.
 */
function drawService(scene: Scene, v: ArchitectureNodeView): void {
  const { w, model, layout, ctx, paint, sizes, font } = scene;
  const box = layout.nodes.get(v.id);
  if (!box) return;
  const service = model.services[v.index]!;
  const size = sizes.iconSize;
  w.open('g', {
    class: 'architecture-service',
    'data-id': service.astId,
    'data-ast': service.astId,
    transform: translate(box.x - size / 2, box.y - box.height / 2),
  });
  if (v.label)
    drawLabel(scene, service.astId, v.label, sizes.labelAt.x, sizes.labelAt.y + v.label.height / 2);
  const corner = { x: 0, y: 0 };
  if (service.icon !== undefined) {
    if (drawIcon(w, ctx, service.icon, size, corner)) scene.unresolved.push(service.icon);
  } else if (service.iconText !== undefined) {
    drawTextIcon(w, fitTextIcon(service.iconText, sizes, font, ctx), size, corner);
  } else {
    const r = sizes.serviceCorner;
    const d = w
      .path()
      .moveTo(0, size)
      .lineTo(0, r)
      .quadTo(0, 0, r, 0)
      .lineTo(size - r, 0)
      .quadTo(size, 0, size, r)
      .lineTo(size, size)
      .close()
      .done();
    w.outline('node', 'path', {
      class: 'node-bkg',
      d,
      fill: 'none',
      stroke: paint.border,
      'stroke-width': paint.borderWidth,
      'stroke-dasharray': paint.dash,
    });
  }
  w.close();
}

/** One junction: v12's invisible `iconSize` box, so `data-id` has an element to sit on. */
function drawJunction({ w, model, layout, sizes }: Scene, v: ArchitectureNodeView): void {
  const box = layout.nodes.get(v.id);
  if (!box) return;
  const junction = model.junctions[v.index]!;
  const size = sizes.iconSize;
  w.open('g', {
    class: 'architecture-junction',
    'data-id': junction.astId,
    'data-ast': junction.astId,
    transform: translate(box.x - size / 2, box.y - size / 2),
  });
  w.leaf('rect', { width: size, height: size, 'fill-opacity': 0 });
  w.close();
}

/**
 * `g.architecture-groups`, after everything else: per group its dashed `rect.node-bkg`, then its
 * title band (the engine placed it): the icon, then the label, start-anchored.
 */
function drawGroups(scene: Scene): void {
  const { w, model, layout, ctx, paint, sizes } = scene;
  w.open('g', { class: 'architecture-groups' });
  for (const v of layout.architecture.groups) {
    const box = layout.groups.get(v.id);
    if (!box) continue;
    const group = model.groups[v.index]!;
    w.open('g', { class: 'architecture-group', 'data-id': group.astId, 'data-ast': group.astId });
    w.outline('group', 'rect', {
      class: 'node-bkg',
      x: box.x - box.width / 2,
      y: box.y - box.height / 2,
      width: box.width,
      height: box.height,
      fill: 'none',
      stroke: paint.border,
      'stroke-width': paint.borderWidth,
      'stroke-dasharray': paint.dash,
    });
    if (v.title) {
      const left = box.title.x - v.title.width / 2;
      const middle = box.title.y;
      const icon = group.icon !== undefined ? sizes.groupIcon : 0;
      if (group.icon !== undefined) {
        const at = { x: left, y: middle - icon / 2 };
        if (drawIcon(w, ctx, group.icon, icon, at)) scene.unresolved.push(group.icon);
      }
      if (v.label) {
        const x = left + icon + sizes.groupLabelGap;
        drawLabel(scene, group.astId, startAnchored(v.label), x + v.label.width / 2, middle);
      }
    }
    w.close();
  }
  w.close();
}

/** `label` drawn from its left edge (`text-anchor: start`), as v12 drew a group's title. */
function startAnchored(label: MeasuredLabel): MeasuredLabel {
  return label.left ? label : { ...label, left: true };
}
