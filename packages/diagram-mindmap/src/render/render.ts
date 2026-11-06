// Draws a laid-out mindmap through the SvgWriter (DESIGN §7, spec #294 T4). The layout
// (`layoutMindmap`) measured and placed everything; this file only paints it: the edges under
// the nodes, as v12's `edgePaths` before `nodes`. Each node is one `g.mindmap-node` with
// `data-id` and `data-ast` (its AST id, R-PARSE-8) holding its outline, the rule under a plain
// node, the icon (its glyph or the reference as written) and the label; edges carry `data-id` only (`edge:<child>`, D289).
// v12's classes stay: `section-<n>` (`section-root section--1` for the root) and the author's
// `:::` classes on nodes, `edge section-edge-<n> edge-depth-<d>` on edges (`d` from the raw
// indent, GAPS #388). Coordinates are absolute; nothing has a transform.
import {
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  type Attrs,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type { MindmapLayout } from '../layout/layout.ts';
import type { MindmapNodeView } from '../layout/prepare.ts';
import type { MindmapModel } from '../model.ts';
import { drawIcon, iconsNotRendered } from './assets.ts';
import type { MindmapRenderContext } from './context.ts';
import { drawEdge } from './edges.ts';
import { paints, type Paints } from './paint.ts';
import { nodeOutline } from './shapes.ts';

interface Scene {
  readonly w: SvgWriter;
  readonly model: MindmapModel;
  readonly layout: MindmapLayout;
  readonly ctx: MindmapRenderContext;
  readonly paint: Paints;
}

/** An author's `:::` classes as class names: characters outside `[\w-]` dropped. */
function userClasses(names: readonly string[]): string {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
}

/** Writes the whole `<svg>` document for a laid-out mindmap. */
export function renderMindmap(
  model: MindmapModel,
  layout: MindmapLayout,
  ctx: MindmapRenderContext,
  w: SvgWriter
): void {
  // Every theme variable is read before the root, so its style declares them.
  const scene: Scene = { w, model, layout, ctx, paint: paints(ctx.theme) };
  openRoot(scene);
  drawEdges(scene);
  drawNodes(scene);
  w.close();
}

/** The `<svg>` root. Mindmap has no title or description (v12's grammar has none). */
function openRoot({ w, layout, ctx }: Scene): void {
  const { theme, config } = ctx;
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = config.mindmap?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-mindmap',
    viewBox: [0, 0, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'mindmap',
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(ctx.idPrefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
    'font-size': fontSize,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(ctx.idPrefix), auto.light, auto.dark));
}

function drawEdges({ w, model, layout, paint }: Scene): void {
  const { edges } = layout.mindmap;
  if (edges.length === 0) return;
  w.open('g', { class: 'mindmap-edges' });
  for (const e of edges) {
    const route = layout.edges.get(e.id);
    if (!route || route.points.length < 2) continue;
    const child = model.nodes[e.child]!;
    const section = child.section ?? 0;
    // v12 `edge-depth-<parent.level + 1>`: the raw indent, not the tree depth.
    const depth = model.nodes[child.parent!]!.level + 1;
    const { stroke, width } = paint.edge(section, depth);
    drawEdge(w, route, {
      class: `edge section-edge-${section} edge-depth-${depth}`,
      'data-id': e.id,
      stroke,
      'stroke-width': width,
    });
  }
  w.close();
}

function drawNodes(scene: Scene): void {
  const { w, layout } = scene;
  let iconShown = false;
  w.open('g', { class: 'mindmap-nodes' });
  for (const v of layout.mindmap.nodes) {
    const at = layout.nodes.get(v.id);
    if (!at) continue;
    // Without glyphs (no extension has them) mindmap warns itself; else the extension does.
    if (drawNode(scene, v, at.x + v.frame.dx, at.y + v.frame.dy) && !iconShown && !scene.ctx.icon) {
      iconShown = true;
      iconsNotRendered(scene.ctx);
    }
  }
  w.close();
}

/** One node, its frame centred at (`x`, `y`); true when it has an icon. */
function drawNode(scene: Scene, v: MindmapNodeView, x: number, y: number): boolean {
  const { w, model, paint, ctx } = scene;
  const node = model.nodes[v.index]!;
  const n = node.section ?? -1;
  const p = paint.node(node.section);
  w.open('g', {
    class: `mindmap-node ${node.section === undefined ? 'section-root ' : ''}section-${n}${userClasses(node.classes)}`,
    'data-id': v.id,
    'data-ast': node.ast,
  });
  const outline: Attrs = {
    class: `node-bkg node-${v.shape}`,
    fill: p.fill,
    stroke: p.stroke,
    'stroke-width': p.strokeWidth,
    filter: p.filter,
  };
  nodeOutline(w, v, x, y, outline, paint);
  if (v.shape === 'default' && p.rule) {
    const bottom = y + v.frame.height / 2;
    w.outline('divider', 'line', {
      class: `node-line-${n}`,
      x1: x - v.frame.width / 2,
      y1: bottom,
      x2: x + v.frame.width / 2,
      y2: bottom,
      stroke: p.rule,
      'stroke-width': p.ruleWidth,
    });
  }
  if (v.icon && node.icon) {
    const at = { x: x + v.icon.at.x, y: y + v.icon.at.y };
    drawIcon(w, ctx, node.icon.text, v.icon, at, paint.icon(node.section));
  }
  w.label(v.label, x + v.labelAt.x, y + v.labelAt.y, { class: 'mindmap-node-label', fill: p.text });
  w.close();
  return v.icon !== undefined;
}
