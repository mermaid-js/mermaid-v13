/**
 * The flowchart's text output (D76, DESIGN §6.3), a separate lazily loaded entry
 * (`@mermaid-js/diagram-flowchart/ascii`, manifest key `ascii`) so SVG renders never load it.
 *
 * The pipeline lays out with the cell measurer and the cell profile (`ctx.units`), which gives
 * `stepped` routes on the grid (D77, D78); `ascii` snaps and repairs the routes and draws them.
 */
import {
  ascii as asciiGlyphs,
  cellMeasurer,
  repairRoutes,
  unicode,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import { cellProfile, type CellPadding } from '@mermaid-js/core/layout';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { FlowModel } from './parser/index.ts';
import type { FlowRenderContext } from './render/context.ts';
import { layoutFlowchart, type FlowLayout } from './render/render.ts';
import { drawFlowchart } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';

export type {
  AsciiDroppedFeature,
  AsciiDroppedWarning,
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

/** The `ascii` config section (DESIGN §6.3); its schema arrives with the API wiring. */
interface AsciiOptions {
  charset?: unknown;
  padding?: unknown;
}

const options = (ctx: FlowRenderContext): AsciiOptions =>
  ((ctx.config as { ascii?: AsciiOptions }).ascii ?? {}) as AsciiOptions;

const glyphsFor = (ctx: FlowRenderContext): GlyphSet =>
  options(ctx).charset === 'ascii' ? asciiGlyphs : unicode;

/**
 * Lays a flowchart out in cells: the cell measurer, the cell profile (`ascii.padding`) and
 * `stepped` routes on the grid, whatever `ctx` carries (D77, D78).
 */
export function layoutAscii(model: FlowModel, ctx: FlowRenderContext): FlowLayout {
  const padding: CellPadding = options(ctx).padding === 'roomy' ? 'roomy' : 'compact';
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
  for (const w of asciiWarnings(model, flow, glyphs, ctx.ast)) ctx.warn(w);
  // D78: a stretch no lane was found for stays as snapped; say which edges cross or share.
  if (unresolved.length > 0) {
    const edges = [...new Set(unresolved.map((c) => c.edge))];
    const ast = new Map(flow.edges.map((e) => [e.id, e.edge.ast]));
    ctx.warn({
      code: 'ASCII_ROUTE',
      astIds: edges.map((id) => ast.get(id) ?? id),
      message: `No free lane for edges ${edges.join(', ')}; their lines touch other lines or text.`,
    });
  }
  return drawFlowchart(flow, laid, routes, glyphs, { title: ctx.title });
}
