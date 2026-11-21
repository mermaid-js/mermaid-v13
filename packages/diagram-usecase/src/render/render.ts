/**
 * Draws a laid-out usecase diagram through the `SvgWriter` (DESIGN §7, spec #517 T4): the root,
 * the front-matter title (D472), then v12's sections in v12's order, boundaries (`clusters`),
 * relationship lines (`edgePaths`), their labels (`edgeLabels`) and the `nodes`. What each box
 * holds and where is the layout's (`UsecaseLayout.usecase`, #565); this file only paints it.
 * No `<style>` but `theme: 'auto'`'s, no `foreignObject` and no ids but the root's title and
 * description (R-SEC-2, R-ARCH-6, D475).
 */
import { translate, type SvgWriter } from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/shared/svg/document';
import type { UsecaseLayout } from '../layout/layout.ts';
import { prepareUsecase, type UsecasePrepared } from '../layout/prepare.ts';
import type { UsecaseModel } from '../model.ts';
import { drawBoundaries } from './boundaries.ts';
import type { UsecaseRenderContext } from './context.ts';
import { drawEdgeLabels, drawEdges } from './edges.ts';
import { spoken } from './accessible-names.ts';
import { drawNodes } from './nodes.ts';
import { paints } from './paint.ts';
import { fontAttrs, type Scene } from './scene.ts';

/** Writes the whole `<svg>` document for a laid-out usecase diagram. */
export function renderUsecase(
  model: UsecaseModel,
  layout: UsecaseLayout,
  ctx: UsecaseRenderContext,
  w: SvgWriter
): void {
  const p = layout.usecase ?? prepareUsecase(model, ctx);
  const paint = paints(model, p, ctx);
  const scene: Scene = {
    w,
    model,
    layout,
    p,
    ctx,
    paint,
    fontOf: fontAttrs(paint),
    spokenOf: spokenLabels(p),
  };
  const { width, band } = openRoot(scene);
  drawTitle(scene, width);
  // A title wider than the drawing centres the drawing under it.
  const dx = Math.max(0, (titleWidth(p) - layout.width) / 2);
  const moved = band > 0 || dx > 0;
  if (moved) w.open('g', { transform: translate(dx, band) });
  drawBoundaries(scene);
  drawEdges(scene);
  drawEdgeLabels(scene);
  drawNodes(scene);
  if (moved) w.close();
  w.close();
}

/** The spoken label of every actor, use case and JSON table, by model id. */
function spokenLabels(p: UsecasePrepared): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of p.nodes.values()) {
    if (v.kind === 'actor') out.set(v.actor.id, spoken(v.actor.label, v.actor.labelType));
    else if (v.kind === 'usecase')
      out.set(v.useCase.id, spoken(v.useCase.label, v.useCase.labelType));
    else if (v.kind === 'json') out.set(v.table.id, v.table.id);
  }
  return out;
}

/**
 * The `<svg>` root with its title and description (R-A11Y-1). The drawing is the layout's box,
 * with the front-matter title's band above it (D472, D224), at least as wide as the title.
 */
function openRoot({ w, layout, p, ctx, paint, model }: Scene): { width: number; band: number } {
  const padding = p.config.diagramPadding;
  const band = p.title ? p.title.height + padding : 0;
  const width = Math.max(1, Math.ceil(Math.max(layout.width, titleWidth(p))));
  const height = Math.max(1, Math.ceil(layout.height + band));
  const maxWidth = p.config.useMaxWidth;
  openSvgRoot(w, ctx, {
    name: 'usecase',
    viewBox: [0, 0, width, height],
    maxWidth,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': paint.font,
      'font-size': paint.fontSize,
    },
  });
  return { width, band };
}

/** The front-matter title's width with the diagram's padding on each side, or 0. */
const titleWidth = (p: UsecasePrepared): number =>
  p.title ? p.title.width + 2 * p.config.diagramPadding : 0;

/** The front-matter title (D472): v12's `insertTitle` class, centred over the drawing. */
function drawTitle({ w, p, paint }: Scene, width: number): void {
  const title = p.title;
  if (!title) return;
  w.label(title, width / 2, p.config.diagramPadding + title.height / 2, {
    class: 'usecaseDiagramTitleText',
    'data-id': 'title',
    fill: paint.title,
  });
}
