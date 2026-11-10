/**
 * Draws a laid-out sankey diagram through the SvgWriter (spec #427 T4, DESIGN §7). The layout
 * (`layoutSankey`) placed and measured everything; this file only paints it, in v12's order
 * (`sankeyRenderer.ts`): the nodes (`g.nodes`), their labels (`g.node-labels`), then the links
 * (`g.links`), so links are drawn over the labels as in v12. Each node's `g.node` and each
 * link's `g.link` carries `data-id` and `data-ast` (its AST id, D397); labels carry `data-id`
 * only. The only ids are `${idPrefix}-title` (D396) and the writer's user-space gradient ids
 * (D391). The viewBox is the layout's bounds, with no padding (D224).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  openSvgRoot,
  styleText,
  translate,
  type Attrs,
  type OutlinePaint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { SankeyLabel, SankeyLayout, SankeyLinkLayout } from '../layout/index.ts';
import { SANKEY_METRICS } from '../layout/metrics.ts';
import type { SankeyModel } from '../model.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type SankeyRenderContext = Pick<RenderContext, 'config' | 'theme' | 'idPrefix' | 'version'>;

interface Scene {
  readonly w: SvgWriter;
  readonly layout: SankeyLayout;
  readonly paint: Paints;
}

/** v12's inline `style="mix-blend-mode: multiply"` on every `g.link` (D392). */
const BLEND = styleText({ 'mix-blend-mode': 'multiply' as SafeValue });

/** Writes the whole `<svg>` document for a laid-out sankey diagram. */
export function renderSankey(
  model: SankeyModel,
  layout: SankeyLayout,
  ctx: SankeyRenderContext,
  w: SvgWriter
): void {
  // Every theme variable is read before the root, so its style declares them.
  const scene: Scene = { w, layout, paint: paints(ctx.theme, layout.labelStyle) };
  openRoot(model, scene, ctx);
  drawNodes(scene);
  drawLabels(scene);
  drawLinks(scene);
  w.close();
}

/**
 * The `<svg>` root. Sankey has no `accTitle`/`accDescr` syntax, so the front-matter title is
 * the accessible name (D396), as a `<title>`; it is never drawn. The font family is the
 * theme's: the layout measured the labels in it.
 */
function openRoot(model: SankeyModel, { w, layout }: Scene, ctx: SankeyRenderContext): void {
  const { theme } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = layout.useMaxWidth;
  const title = model.title?.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  openSvgRoot(w, ctx, {
    name: 'sankey',
    viewBox: [x, y, width, height],
    maxWidth,
    title,
    attrs: { 'font-family': font },
  });
}

/** v12 L154–172: one `g.node` per node at its corner, holding its rect. */
function drawNodes({ w, layout }: Scene): void {
  w.open('g', { class: 'nodes' });
  for (const n of layout.nodes) {
    w.open('g', {
      class: 'node',
      'data-id': n.ast,
      'data-ast': n.ast,
      transform: translate(n.x0, n.y0),
    });
    w.leaf('rect', { width: n.x1 - n.x0, height: n.y1 - n.y0, fill: n.fill });
    w.close();
  }
  w.close();
}

/**
 * v12 L206–225: `g.node-labels` at 14 px in `textColor` (v12's root `fill`), one `text` per
 * node (`legacy`), or every `sankey-label-bg` then every `sankey-label-fg` (`outlined`). v12's
 * halo was the background text's own stroke painted under its fill (`paint-order: stroke`);
 * here the background text is stroked and the foreground text drawn over it, the same picture.
 */
function drawLabels({ w, layout, paint }: Scene): void {
  const metrics = SANKEY_METRICS;
  w.open('g', { class: 'node-labels', 'font-size': layout.font.size, fill: paint.text });
  if (paint.halo) {
    const halo: Attrs = {
      class: 'sankey-label-bg',
      stroke: paint.halo,
      'stroke-width': metrics.outlineWidth,
      'stroke-linejoin': metrics.outlineJoin,
    };
    for (const n of layout.nodes) drawLabel(w, n.ast, n.label, halo);
    for (const n of layout.nodes) drawLabel(w, n.ast, n.label, { class: 'sankey-label-fg' });
  } else for (const n of layout.nodes) drawLabel(w, n.ast, n.label, {});
  w.close();
}

/** One line of plain text (D395) at the label's anchor, `dy` below the node's centre. */
function drawLabel(w: SvgWriter, ast: string, label: SankeyLabel, attrs: Attrs): void {
  w.open('text', {
    ...attrs,
    'data-id': ast,
    x: label.x,
    y: label.y,
    dy: label.dy,
    'text-anchor': label.anchor,
  });
  w.text(label.text);
  w.close();
}

/** v12 L228–279: `g.links` holding one blended `g.link` per link, each with its path. */
function drawLinks(scene: Scene): void {
  const { w, layout } = scene;
  w.open('g', { class: 'links', fill: 'none', 'stroke-opacity': SANKEY_METRICS.linkOpacity });
  for (const link of layout.links) {
    w.open('g', { class: 'link', 'data-id': link.ast, 'data-ast': link.ast, style: BLEND });
    const { from, c1, c2, to } = link.path;
    w.leaf('path', {
      d: w.path().moveTo(from.x, from.y).curveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y).done(),
      stroke: linkStroke(scene, link),
      'stroke-width': link.strokeWidth,
    });
    w.close();
  }
  w.close();
}

/**
 * A link's stroke by `linkColor`: its source's or target's fill, one colour for all, or a
 * user-space gradient from the source's colour at `source.x1` to the target's at `target.x0`
 * (D391). The colours are the layout's, so every link has one.
 */
function linkStroke({ w, layout }: Scene, link: SankeyLinkLayout): OutlinePaint {
  const from = link.sourceFill;
  const to = link.targetFill;
  switch (layout.linkColor) {
    case 'source':
      return from;
    case 'target':
      return to;
    case 'gradient':
      return w.linearGradient({ x1: link.path.from.x, x2: link.path.to.x, from, to });
    default:
      return layout.linkColor;
  }
}
