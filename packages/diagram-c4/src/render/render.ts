/**
 * Draws a laid-out C4 diagram through the SvgWriter (spec #522 T4, DESIGN §7, D215, D227). The
 * layout (`layoutC4`) measured and placed everything; this file only paints it:
 *
 * - the root, its accessible `<title>`/`<desc>` (`accTitle`, `accDescr`), and the drawn title;
 * - `g.c4-boundaries`: each boundary, parents first, a `g.c4-boundary` (`data-id` its alias,
 *   `data-ast`) with its frame, dashed but for deployment nodes, and its header: the bold label,
 *   `[type]` and the description. Boundaries come first, so a filled one no longer paints over
 *   its contents (v12 drew it after them);
 * - `g.c4-elements`: each element a `g.node.c4-shape.c4-<kind>[.c4-external]` (`data-id` its
 *   alias, `data-ast`), its outline (`./shapes.ts`), then its text, `c4-name`, `c4-type` and
 *   `c4-descr`, in a `g.label`;
 * - `g.c4-relations`: each relation a `g.c4-relation` (`./relations.ts`).
 *
 * No `<style>` (but `theme: 'auto'`'s), `<marker>`, `<symbol>` or `foreignObject`; no element
 * id but `${idPrefix}-title` and `-desc`. `data-ast` marks one element per drawn AST node
 * (pitfall 12, D458): each element's `g.node`, each boundary's `g` and each relation's `path`;
 * text carries `data-id` only. The viewBox is the layout's canvas: everything drawn and the
 * config margins round it (D224). Only elements are sketched by a hand-drawn drawer (D301).
 */
import { px, styleScope, styleText, themeStyleSheet, type SvgWriter } from '@mermaid-js/core/svg';
import { C4_METRICS as M } from '../layout/metrics.ts';
import type { C4BoundaryLayout, C4ElementLayout, C4Layout } from '../layout/types.ts';
import type { C4Model } from '../model.ts';
import type { C4RenderContext } from './context.ts';
import { C4_RENDER_METRICS as R } from './metrics.ts';
import { paints, type Paints } from './paint.ts';
import { drawRelation } from './relations.ts';
import { drawShape } from './shapes.ts';
import { drawText } from './text.ts';

/** What every section of one render draws from. */
export interface Scene {
  readonly w: SvgWriter;
  readonly ctx: C4RenderContext;
  readonly model: C4Model;
  readonly layout: C4Layout;
  readonly paint: Paints;
  /** The theme's font family, which the root carries: text measured in it names no family. */
  readonly family: string;
}

/** Writes the whole `<svg>` document for a laid-out C4 diagram. */
export function renderC4(
  model: C4Model,
  layout: C4Layout,
  ctx: C4RenderContext,
  w: SvgWriter
): void {
  // Every theme variable is read before the root, so its style declares them.
  const scene: Scene = {
    w,
    ctx,
    model,
    layout,
    paint: paints(model, layout, ctx),
    family: ctx.theme.value('fontFamily'),
  };
  openRoot(scene);
  if (layout.title && scene.paint.title)
    drawText(scene, layout.title, 'c4-title', scene.paint.title);
  if (layout.boundaries.length > 0) {
    w.open('g', { class: 'c4-boundaries' });
    for (const b of layout.boundaries) drawBoundary(scene, b);
    w.close();
  }
  if (layout.elements.length > 0) {
    w.open('g', { class: 'c4-elements' });
    for (const e of layout.elements) drawElement(scene, e);
    w.close();
  }
  if (layout.relations.length > 0) {
    w.open('g', { class: 'c4-relations' });
    for (const r of layout.relations) drawRelation(scene, r);
    w.close();
  }
  w.close();
}

/** The `<svg>` root with its accessible title and description (R-A11Y-1, D453). */
function openRoot({ w, ctx, model, layout }: Scene): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const width = Math.max(1, Math.ceil(layout.width));
  const height = Math.max(1, Math.ceil(layout.height));
  const maxWidth = (config as { c4?: { useMaxWidth?: unknown } }).c4?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-c4',
    viewBox: [0, 0, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'c4',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
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

/** v12 `drawBoundary`: the frame (`rx` 2.5, dashed but for a deployment node) and the header. */
function drawBoundary(scene: Scene, b: C4BoundaryLayout): void {
  const { w, paint } = scene;
  const p = paint.boundaries.get(b.index)!;
  w.open('g', {
    class: b.nodeKind ? 'c4-boundary c4-deployment-node' : 'c4-boundary',
    'data-id': b.alias,
    'data-ast': b.ast,
  });
  w.leaf('rect', {
    x: b.box.x,
    y: b.box.y,
    width: b.box.width,
    height: b.box.height,
    rx: M.boundaryRadius,
    fill: p.fill,
    stroke: p.stroke,
    'stroke-width': R.boundaryStroke,
    'stroke-dasharray': b.nodeKind ? undefined : R.boundaryDash,
  });
  if (p.text) {
    if (b.label) drawText(scene, b.label, 'c4-boundary-label', p.text, b.alias);
    if (b.type) drawText(scene, b.type, 'c4-boundary-type', p.text, b.alias);
    if (b.descr) drawText(scene, b.descr, 'c4-boundary-descr', p.text, b.alias);
  }
  w.close();
}

/** v12's element classes: `node c4-shape c4-<kind>`, and `c4-external` for an external kind. */
const elementClass = (kind: string): string =>
  `node c4-shape c4-${kind}${kind.startsWith('external_') ? ' c4-external' : ''}`;

/** An element: its `g.node`, its outline, then its text in a `g.label`. */
function drawElement(scene: Scene, e: C4ElementLayout): void {
  const { w, paint } = scene;
  const p = paint.elements.get(e.index)!;
  w.open('g', { class: elementClass(e.kind), 'data-id': e.alias, 'data-ast': e.ast });
  drawShape(
    w,
    e.shape,
    e.box,
    { fill: p.fill, stroke: p.stroke, 'stroke-width': R.elementStroke },
    { stroke: p.stroke, 'stroke-width': R.elementStroke }
  );
  w.open('g', { class: 'label', 'data-id': e.alias });
  if (e.name) drawText(scene, e.name, 'c4-name', p.text);
  drawText(scene, e.type, 'c4-type', p.text);
  if (e.descr) drawText(scene, e.descr, 'c4-descr', p.text);
  w.close();
  w.close();
}
