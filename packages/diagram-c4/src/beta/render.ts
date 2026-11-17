/**
 * Draws a laid-out c4-beta diagram (spec #730): the scene `placeC4Beta` made, through the painters
 * legacy C4 draws with (`render/render.ts` `drawScene`). Only what differs is here: the root's
 * name (`c4beta`) and no `<title>` on a relation, whose description is already its label.
 */
import type { C4Layout } from '../layout/types.ts';
import type { C4RenderContext } from '../render/context.ts';
import { c4betaSection } from '../config.ts';
import { drawScene } from '../render/render.ts';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { betaPaints } from './paint.ts';
import type { C4BetaModel } from './model.ts';

export function renderC4Beta(
  model: C4BetaModel,
  layout: C4Layout,
  ctx: C4RenderContext,
  w: SvgWriter
): void {
  const view = {
    name: 'c4beta',
    maxWidth: c4betaSection(ctx.config).useMaxWidth,
    accTitle: model.accTitle.trim(),
    accDescr: model.accDescr.trim(),
    relationTitle: () => undefined,
  };
  drawScene(view, layout, betaPaints(model, layout, ctx), ctx, w);
}
