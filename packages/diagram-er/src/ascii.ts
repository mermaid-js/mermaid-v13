/**
 * The ER diagram's text output (D76, D109, DESIGN §6.3), a separate lazily loaded entry
 * (`@mermaid-js/diagram-er/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * The layout runs with the cell measurer and the cell profile (`ctx.units`), which puts entity
 * tables, ports and `stepped` routes on the grid (D77, D78); `ascii` repairs the routes and
 * draws tables, lines, crow's-foot ends and labels through core's text-grid kit.
 */
import { asciiOptions, cellMeasurer, repairRoutes, type GlyphSet } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { ErModel } from './parser/index.ts';
import { layoutEr, type ErLayout, type ErRenderContext } from './layout/layout.ts';
import { drawEr } from './ascii/draw.ts';
import { asciiWarnings, type AsciiRouteWarning } from './ascii/warnings.ts';
import { asciiRoute, glyphSetOf } from '@mermaid-js/shared/ascii';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiRouteWarning,
  AsciiWarning,
} from './ascii/warnings.ts';

/** What the `ascii` hook reads besides the layout context (core's `TextRenderContext` fits). */
export interface ErAsciiContext extends ErRenderContext {
  /** The front-matter `title`, printed centred on the first line (D82). */
  readonly title?: string;
  /** The parse's AST: its statement ids (`style:1`, `accTitle:1`, …) join the drop warnings. */
  readonly ast?: AstNode;
}

const glyphsFor = (ctx: ErRenderContext): GlyphSet => glyphSetOf(ctx.config);

/** Lays an ER diagram out in cells: the cell measurer and the cell profile (`ascii.padding`). */
export function layoutAscii(model: ErModel, ctx: ErRenderContext): ErLayout {
  const { padding } = asciiOptions(ctx.config);
  return layoutEr(model, { ...ctx, measurer: cellMeasurer, units: cellProfile(padding) });
}

/**
 * The ER diagram's `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no
 * trailing spaces. Warns once per feature kind it drops (D82). A layout not in cells (no grid,
 * or a `postLayout` model without the views) is redone with `layoutAscii`.
 */
export function ascii(model: ErModel, layout: ErLayout, ctx: ErAsciiContext): string {
  const fresh = layout.er?.graph.grid === undefined;
  const laid = fresh ? layoutAscii(model, ctx) : layout;
  const er = laid.er!;
  // The profile the tables were measured with: cell padding is what the cell text sits in.
  const units =
    !fresh && ctx.units?.id === 'cell' ? ctx.units : cellProfile(asciiOptions(ctx.config).padding);
  const glyphs = glyphsFor(ctx);
  const { routes, unresolved } = repairRoutes(er.graph, laid);
  for (const w of asciiWarnings(model, er, ctx.ast)) ctx.warn(w);
  // D78: a stretch no lane was found for stays as snapped; say which edges cross or share.
  const routeWarning: AsciiRouteWarning | undefined = asciiRoute(unresolved, 'relationships');
  if (routeWarning) ctx.warn(routeWarning);
  const maxWidth = ctx.config.ascii?.maxWidth;
  return drawEr(er, laid, routes, glyphs, {
    title: ctx.title,
    ctx,
    pad: units.builder.nodePad.x,
    ...(maxWidth !== undefined ? { maxWidth } : {}),
  });
}
