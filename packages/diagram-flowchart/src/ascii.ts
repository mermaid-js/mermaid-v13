/**
 * The flowchart's text output (D76, DESIGN §6.3), a separate lazily loaded entry
 * (`@mermaid-js/diagram-flowchart/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * The pipeline lays out with the cell measurer and the cell profile (`ctx.units`), which gives
 * `stepped` routes on the grid (D77, D78); `ascii` snaps and repairs the routes and draws them.
 */
import { asciiOptions, cellMeasurer, repairRoutes, type GlyphSet } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { FlowModel } from './parser/index.ts';
import type { FlowRenderContext } from './render/context.ts';
import { layoutFlowchart, type FlowLayout } from './render/render.ts';
import { drawFlowchart } from './ascii/draw.ts';
import { asciiWarnings, type AsciiRouteWarning } from './ascii/warnings.ts';
import { asciiRoute, glyphSetOf } from '@mermaid-js/shared/ascii';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiRouteWarning,
  AsciiShapeWarning,
  AsciiWarning,
} from './ascii/warnings.ts';

/** What the `ascii` hook reads besides the render context. */
export interface FlowAsciiContext extends FlowRenderContext {
  /** The front-matter `title`, printed centred on the first line (D82). */
  readonly title?: string;
  /** The parse's AST: its statement ids (`style:1`, `accTitle:1`, …) join the drop warnings. */
  readonly ast?: AstNode;
}

// The `ascii` config section (DESIGN §6.3) through core's one resolver; unset keys default.
const glyphsFor = (ctx: FlowRenderContext): GlyphSet => glyphSetOf(ctx.config);

/**
 * Lays a flowchart out in cells: the cell measurer, the cell profile (`ascii.padding`) and
 * `stepped` routes on the grid, whatever `ctx` carries (D77, D78).
 */
function layoutAscii(model: FlowModel, ctx: FlowRenderContext): FlowLayout {
  const { padding } = asciiOptions(ctx.config);
  return layoutFlowchart(model, { ...ctx, measurer: cellMeasurer, units: cellProfile(padding) });
}

/**
 * The flowchart's `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no
 * trailing spaces. Warns once per feature kind it drops and once for shapes drawn as plain
 * boxes (D82). A layout not in cells (no grid) is redone with `layoutAscii`.
 */
export function ascii(model: FlowModel, layout: FlowLayout, ctx: FlowAsciiContext): string {
  const laid = layout.flow?.graph.grid === undefined ? layoutAscii(model, ctx) : layout;
  const flow = laid.flow!;
  const glyphs = glyphsFor(ctx);
  const { routes, unresolved } = repairRoutes(flow.graph, laid);
  const curve = ctx.config.flowchart?.curve;
  for (const w of asciiWarnings(model, flow, glyphs, ctx.ast, curve)) ctx.warn(w);
  // D78: a stretch no lane was found for stays as snapped; say which edges cross or share.
  const ast = new Map(flow.edges.map((e) => [e.id, e.edge.ast]));
  const routeWarning: AsciiRouteWarning | undefined = asciiRoute(
    unresolved,
    'edges',
    (id) => ast.get(id) ?? []
  );
  if (routeWarning) ctx.warn(routeWarning);
  const maxWidth = ctx.config.ascii?.maxWidth;
  return drawFlowchart(flow, laid, routes, glyphs, {
    title: ctx.title,
    ...(maxWidth !== undefined ? { maxWidth } : {}),
  });
}
