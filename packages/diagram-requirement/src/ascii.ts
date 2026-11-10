/**
 * The requirement diagram's text output (#588, D320, D438, DESIGN §6.3), a separate lazily
 * loaded entry (`@mermaid-js/diagram-requirement/ascii`, manifest key `ascii`) so SVG renders
 * never load it. Built from ER's (`@mermaid-js/diagram-er/ascii`, copied, not imported).
 *
 * The layout runs with the cell measurer and the cell profile (`ctx.units`), which puts the
 * boxes and `stepped` routes on the grid (D77, D78); `ascii` repairs the routes and draws the
 * boxes, lines, marks and labels through core's text-grid kit.
 */
import {
  ascii as asciiGlyphs,
  asciiOptions,
  cellMeasurer,
  repairRoutes,
  unicode,
} from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { RequirementRenderContext } from './layout/context.ts';
import { layoutRequirement, type RequirementLayout } from './layout/layout.ts';
import type { RequirementModel } from './model.ts';
import { drawRequirement, type RequirementGlyphs } from './ascii/draw.ts';
import { asciiWarnings, type AsciiRouteWarning } from './ascii/warnings.ts';
import { asciiRoute } from '@mermaid-js/core/ascii';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiRouteWarning,
  AsciiWarning,
} from './ascii/warnings.ts';

/** What the `ascii` hook reads besides the layout context (core's `TextRenderContext` fits). */
export interface RequirementAsciiContext extends RequirementRenderContext {
  /** The front-matter `title`, printed centred on the first line (D82). */
  readonly title?: string;
  /** The parse's AST: its statement ids (`style:1`, `accTitle:1`, …) join the drop warnings. */
  readonly ast?: AstNode;
}

/** Each charset's glyphs and marks (D438), the one place that tells the two apart. */
const UNICODE_GLYPHS: RequirementGlyphs = {
  set: unicode,
  ellipsis: '…',
  contains: '⊕',
  joins: true,
};
const ASCII_GLYPHS: RequirementGlyphs = {
  set: asciiGlyphs,
  ellipsis: '~',
  contains: '(+)',
  joins: false,
};

const glyphsFor = (ctx: RequirementRenderContext): RequirementGlyphs =>
  asciiOptions(ctx.config).charset === 'ascii' ? ASCII_GLYPHS : UNICODE_GLYPHS;

/** Lays a requirement diagram out in cells: the cell measurer and profile (`ascii.padding`). */
export function layoutAscii(
  model: RequirementModel,
  ctx: RequirementRenderContext
): RequirementLayout {
  const { padding } = asciiOptions(ctx.config);
  return layoutRequirement(model, { ...ctx, measurer: cellMeasurer, units: cellProfile(padding) });
}

/**
 * The requirement diagram's `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends,
 * no trailing spaces. Warns once per feature kind it drops (D82). A layout not in cells (no
 * grid, or a `postLayout` model without the views) is redone with `layoutAscii`. Wider than
 * `ascii.maxWidth`, it is drawn whole; the pipeline adds `ASCII_TOO_WIDE` (D84, R-ASCII-8).
 */
export function ascii(
  model: RequirementModel,
  layout: RequirementLayout,
  ctx: RequirementAsciiContext
): string {
  const laid = layout.requirement?.graph.grid === undefined ? layoutAscii(model, ctx) : layout;
  const prepared = laid.requirement!;
  const { routes, unresolved } = repairRoutes(prepared.graph, laid);
  const curve = ctx.config.flowchart?.curve;
  for (const w of asciiWarnings(model, prepared, ctx.ast, curve)) ctx.warn(w);
  // D78: a stretch no lane was found for stays as snapped; say which relations cross or share.
  const routeWarning: AsciiRouteWarning | undefined = asciiRoute(unresolved, 'relations');
  if (routeWarning) ctx.warn(routeWarning);
  const maxWidth = ctx.config.ascii?.maxWidth;
  const title = ctx.title ?? model.title;
  return drawRequirement(prepared, laid, routes, glyphsFor(ctx), {
    ...(title !== undefined ? { title } : {}),
    ...(maxWidth !== undefined ? { maxWidth } : {}),
  });
}
