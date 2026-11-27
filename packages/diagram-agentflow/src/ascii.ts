/**
 * The agentflow's text output (spec #523 T7, D320, D469, DESIGN §6.3), a separate lazily loaded
 * entry (`@mermaid-js/diagram-agentflow/ascii`, manifest key `ascii`) so SVG renders never load
 * it (R-ASCII-9). It cannot reuse flowchart's hook (isolation), so it draws from the
 * `AgentflowModel` with core's text-grid kit: the pipeline lays the graph out with the cell
 * measurer and the cell profile (`ctx.units`), which gives text-form boxes and `stepped` routes
 * on the grid with `layered` (D77, D78, D179); `ascii` repairs the routes and draws them in either
 * charset (R-ASCII-6). It never crops: the API adds `ASCII_TOO_WIDE` when the drawing is wider
 * than `ascii.maxWidth` (R-ASCII-8).
 */
import {
  ascii as asciiGlyphs,
  asciiOptions,
  cellMeasurer,
  repairRoutes,
  unicode,
} from '@mermaid-js/core/ascii';
import { cellProfile, layered } from '@mermaid-js/core/layout';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { layoutAgentflow, type AgentflowLayout } from './layout/index.ts';
import type { AgentflowModel } from './parser/index.ts';
import type { AgentflowRenderContext } from './render/context.ts';
import { drawAgentflow } from './ascii/draw.ts';
import { asciiWarnings, type AsciiRouteWarning } from './ascii/warnings.ts';
import { asciiRoute } from '@mermaid-js/shared/ascii';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
  AsciiRouteWarning,
  AsciiWarning,
} from './ascii/warnings.ts';

/** What the `ascii` hook reads besides the render context (core's `TextRenderContext`). */
export interface AgentflowAsciiContext extends AgentflowRenderContext {
  /** The front-matter `title`, printed centred on the first line (D82). */
  readonly title?: string;
  /** The parse's AST: its statement ids (`style:1`, `accTitle:1`, …) join the drop warnings. */
  readonly ast?: AstNode;
}

/**
 * Lays an agentflow out in cells: the cell measurer, the cell profile (`ascii.padding`) and
 * `layered`, whatever `ctx` carries (D77, D78, D179).
 */
export function layoutAscii(model: AgentflowModel, ctx: AgentflowRenderContext): AgentflowLayout {
  const { padding } = asciiOptions(ctx.config);
  return layoutAgentflow(model, {
    ...ctx,
    measurer: cellMeasurer,
    units: cellProfile(padding),
    layout: layered,
  });
}

/**
 * The agentflow `ascii` hook (DESIGN §12.1): the drawing as text, `\n` line ends, no trailing
 * spaces. Warns once per feature kind it drops (D82). A layout not in cells (no grid, or a
 * `postLayout` model without the views) is redone with {@link layoutAscii}.
 */
export function ascii(
  model: AgentflowModel,
  layout: AgentflowLayout,
  ctx: AgentflowAsciiContext
): string {
  // A `postLayout` hook may hand back a plain layout model, without the views.
  const fresh = 'agentflow' in layout && layout.agentflow.graph.grid !== undefined;
  const laid = fresh ? layout : layoutAscii(model, ctx);
  const prepared = laid.agentflow;
  const options = asciiOptions(ctx.config);
  const glyphs = options.charset === 'ascii' ? asciiGlyphs : unicode;
  const { routes, unresolved } = repairRoutes(prepared.graph, laid);
  for (const w of asciiWarnings(model, prepared, ctx.config, ctx.ast)) ctx.warn(w);
  // D78: a stretch no lane was found for stays as snapped; say which edges cross or share.
  const ast = new Map(prepared.edges.map((e) => [e.id, e.edge.ast]));
  const routeWarning: AsciiRouteWarning | undefined = asciiRoute(
    unresolved,
    'edges',
    (id) => ast.get(id) ?? []
  );
  if (routeWarning) ctx.warn(routeWarning);
  return drawAgentflow(prepared, laid, routes, glyphs, {
    title: ctx.title ?? model.title,
    ctx,
    ...(options.maxWidth !== undefined ? { maxWidth: options.maxWidth } : {}),
  });
}
