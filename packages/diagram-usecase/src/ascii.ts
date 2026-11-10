/**
 * The usecase diagram's text output (spec #517 T7, D320, D478, DESIGN §6.3), a separate lazily
 * loaded entry (`@mermaid-js/diagram-usecase/ascii`, manifest key `ascii`) so SVG renders never
 * load it.
 *
 * The pipeline lays the same graph out with the cell measurer and the cell profile (`ctx.units`),
 * which puts every node, frame and `stepped` route on the grid with `layered` (D77, D78; text
 * output never uses another engine, D179); `ascii` repairs the routes and draws the D478 shapes
 * through core's text-grid kit, in either charset (R-ASCII-6). It never crops: the API adds
 * `ASCII_TOO_WIDE` when the drawing is wider than `ascii.maxWidth` (R-ASCII-8).
 */
import type { TextRenderContext } from '@mermaid-js/core';
import {
  ascii as asciiGlyphs,
  asciiOptions,
  cellMeasurer,
  repairRoutes,
  unicode,
} from '@mermaid-js/core/ascii';
import { cellProfile, layered } from '@mermaid-js/core/layout';
import type { UsecaseModel } from './model.ts';
import { layoutUsecase, type UsecaseLayout } from './layout/layout.ts';
import { drawUsecase } from './ascii/draw.ts';
import { asciiWarnings, type AsciiRouteWarning } from './ascii/warnings.ts';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiRouteWarning,
  AsciiWarning,
} from './ascii/warnings.ts';

/**
 * Lays a usecase diagram out in cells: the cell measurer, the cell profile (`ascii.padding`) and
 * `layered`, whatever `ctx` carries.
 */
export function layoutAscii(model: UsecaseModel, ctx: TextRenderContext): UsecaseLayout {
  const { padding } = asciiOptions(ctx.config);
  return layoutUsecase(model, {
    ...ctx,
    measurer: cellMeasurer,
    units: cellProfile(padding),
    layout: layered,
  });
}

/**
 * The usecase `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no trailing
 * spaces. Warns once per feature kind it drops (D82, D478). A layout not in cells (no grid, or a
 * `postLayout` model without the views) is redone with `layoutAscii`.
 */
export function ascii(model: UsecaseModel, layout: UsecaseLayout, ctx: TextRenderContext): string {
  const laid = layout.usecase?.graph.grid === undefined ? layoutAscii(model, ctx) : layout;
  const prepared = laid.usecase!;
  const options = asciiOptions(ctx.config);
  const glyphs = options.charset === 'ascii' ? asciiGlyphs : unicode;
  const { routes, unresolved } = repairRoutes(prepared.graph, laid);
  const section = ctx.config.usecase as Readonly<Record<string, unknown>> | undefined;
  for (const w of asciiWarnings(model, prepared, ctx.ast, section)) ctx.warn(w);
  // D78: a stretch no lane was found for stays as snapped; say which lines cross or share.
  if (unresolved.length > 0) {
    const edges = [...new Set(unresolved.map((c) => c.edge))];
    const warning: AsciiRouteWarning = {
      code: 'ASCII_ROUTE',
      astIds: edges.map((id) => id.replace(/-edge$/, '')),
      message: `No free lane for relationships ${edges.join(', ')}; their lines touch other lines or text.`,
    };
    ctx.warn(warning);
  }
  return drawUsecase(prepared, laid, routes, glyphs, {
    title: ctx.title ?? model.title,
    pad: cellProfile(options.padding).builder.nodePad.x,
    ...(options.maxWidth !== undefined ? { maxWidth: options.maxWidth } : {}),
  });
}
