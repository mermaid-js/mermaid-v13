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
import type { SvgWriter } from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/core/svg/document';
import { c4Section } from '../config.ts';
import { C4_METRICS as M } from '../layout/metrics.ts';
import type { C4BoundaryLayout, C4ElementLayout, C4Layout } from '../layout/types.ts';
import { isExternal, type C4ElementKind, type C4Model } from '../model.ts';
import type { C4RenderContext, Scene, SceneView } from './context.ts';
import { C4_RENDER_METRICS as R } from './metrics.ts';
import { paints, type Paints } from './paint.ts';
import { drawRelation } from './relations.ts';
import { drawShape } from './shapes.ts';
import { drawText } from './text.ts';

/** Writes the whole `<svg>` document for a laid-out C4 diagram. */
export function renderC4(
  model: C4Model,
  layout: C4Layout,
  ctx: C4RenderContext,
  w: SvgWriter
): void {
  const view: SceneView = {
    name: 'c4',
    maxWidth: c4Section(ctx.config).useMaxWidth,
    accTitle: model.accTitle.trim(),
    accDescr: model.accDescr.trim(),
    relationTitle: (index) => model.relations[index]!.descr?.trim(),
  };
  // Every theme variable is read before the root, so its style declares them.
  drawScene(view, layout, paints(model, layout, ctx), ctx, w);
}

/**
 * Writes the document for a laid-out scene and the paints its items need (read before the root).
 * Legacy C4 and c4-beta both end here.
 */
export function drawScene(
  view: SceneView,
  layout: C4Layout,
  paint: Paints,
  ctx: C4RenderContext,
  w: SvgWriter
): void {
  const scene: Scene = { w, ctx, view, layout, paint, family: ctx.theme.value('fontFamily') };
  openRoot(scene);
  if (layout.title && scene.paint.title)
    drawText(scene, { label: layout.title, cls: 'c4-title', fill: scene.paint.title });
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
function openRoot({ w, ctx, view, layout }: Scene): void {
  openSvgRoot(w, ctx, {
    name: view.name,
    viewBox: [0, 0, Math.max(1, Math.ceil(layout.width)), Math.max(1, Math.ceil(layout.height))],
    maxWidth: view.maxWidth,
    title: view.accTitle,
    desc: view.accDescr,
    // Read before the root style is written, so it declares its alias.
    attrs: { 'font-family': ctx.theme.font() },
  });
}

/** v12 `drawBoundary`: the frame (`rx` 2.5, dashed but for a deployment node) and the header. */
function drawBoundary(scene: Scene, b: C4BoundaryLayout): void {
  const { w, paint } = scene;
  const colours = paint.boundaries.get(b.index)!;
  const frame = b.nodeKind
    ? { cls: 'c4-boundary c4-deployment-node', dash: undefined }
    : { cls: 'c4-boundary', dash: R.boundaryDash };
  w.open('g', { class: frame.cls, 'data-id': b.alias, 'data-ast': b.ast });
  w.leaf('rect', {
    x: b.box.x,
    y: b.box.y,
    width: b.box.width,
    height: b.box.height,
    rx: M.boundaryRadius,
    fill: colours.fill,
    stroke: colours.stroke,
    'stroke-width': R.boundaryStroke,
    'stroke-dasharray': frame.dash,
  });
  const fill = colours.text;
  if (fill) {
    const dataId = b.alias;
    if (b.label) drawText(scene, { label: b.label, cls: 'c4-boundary-label', fill, dataId });
    if (b.type) drawText(scene, { label: b.type, cls: 'c4-boundary-type', fill, dataId });
    if (b.descr) drawText(scene, { label: b.descr, cls: 'c4-boundary-descr', fill, dataId });
  }
  w.close();
}

/** v12's element classes: `node c4-shape c4-<kind>`, and `c4-external` for an external kind. */
const elementClass = (kind: C4ElementKind): string =>
  `node c4-shape c4-${kind}${isExternal(kind) ? ' c4-external' : ''}`;

/** An element: its `g.node`, its outline, then its text in a `g.label`. */
function drawElement(scene: Scene, e: C4ElementLayout): void {
  const { w, paint } = scene;
  const colours = paint.elements.get(e.index)!;
  w.open('g', { class: elementClass(e.kind), 'data-id': e.alias, 'data-ast': e.ast });
  const line = { stroke: colours.stroke, 'stroke-width': R.elementStroke };
  drawShape(w, { shape: e.shape, box: e.box, paint: { ...line, fill: colours.fill }, line });
  w.open('g', { class: 'label', 'data-id': e.alias });
  const fill = colours.text;
  if (e.name) drawText(scene, { label: e.name, cls: 'c4-name', fill });
  if (e.type) drawText(scene, { label: e.type, cls: 'c4-type', fill });
  if (e.descr) drawText(scene, { label: e.descr, cls: 'c4-descr', fill });
  w.close();
  w.close();
}
