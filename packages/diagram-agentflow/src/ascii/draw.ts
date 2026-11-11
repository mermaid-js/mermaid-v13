// Draws an agentflow laid out in cells onto the text grid (D469, D82, DESIGN §6.3), as
// flowchart's does: flows outermost first, each a frame with its title on the top border, then
// edges and their heads, edge labels, node boxes through the text-form table, tees where edges
// leave a box, and the front-matter title on the first line.
import {
  Canvas,
  drawBox,
  INTO,
  opposite,
  sideOf,
  type Dir,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { LayoutModel, Point, Side } from '@mermaid-js/core/layout';
import type { AgentflowEdgeView, AgentflowPrepared, Arrowhead } from '../layout/index.ts';
import { textForm } from './shapes.ts';
import {
  cellRect,
  cellsOf,
  clearGaps,
  drawEdgeLabels,
  drawFrames,
  drawLineCells,
  finish,
  listWriter,
  onFrame,
  tee,
  writeBoxLabel,
} from '@mermaid-js/shared/ascii';
export { cellRect } from '@mermaid-js/shared/ascii';

interface End {
  /** The node or flow the edge ends at. */
  at: string;
  cell: Point;
  /** Direction from the end cell into its box. */
  into: Dir;
  marker: Arrowhead;
}

function drawEdge(
  canvas: Canvas,
  glyphs: GlyphSet,
  e: AgentflowEdgeView,
  route: readonly Point[],
  ports: { source: Side; target: Side },
  ends: End[]
): void {
  const cells = cellsOf(route);
  if (cells.length === 0) return;
  // `-.-` is dotted; agentflow has no thick stroke.
  const dotted = e.edge.stroke === 'dotted' ? glyphs.dotted : undefined;
  const last = cells.length - 1;
  const source = { at: e.source, cell: cells[0]!, into: INTO[ports.source], marker: e.start };
  const target = { at: e.target, cell: cells[last]!, into: INTO[ports.target], marker: e.end };
  drawLineCells(canvas, glyphs, cells, source.into, target.into, dotted);
  ends.push(source, target);
}

/** The glyph an end's marker puts in its cell, if any: `-->` a head, `--x` a cross. */
function markerGlyph(glyphs: GlyphSet, end: End): string | undefined {
  switch (end.marker) {
    case 'arrow_point':
      return sideOf(glyphs.head, end.into);
    case 'arrow_cross':
      return glyphs.cross;
    case 'none':
      return undefined;
  }
}

export interface DrawOptions {
  /** The front-matter title, printed centred on the first lines. */
  readonly title?: string;
  /** `ascii.maxWidth`: a longer title wraps to it (or to the drawing, when that is wider). */
  readonly maxWidth?: number;
}

/**
 * Draws a cell layout. `routes` are the repaired edge routes in cell indices (corners only).
 * Returns the text: `\n` line ends, no trailing spaces, the empty margin around the drawing
 * trimmed.
 */
export function drawAgentflow(
  prepared: AgentflowPrepared,
  layout: LayoutModel,
  routes: ReadonlyMap<string, readonly Point[]>,
  glyphs: GlyphSet,
  options: DrawOptions = {}
): string {
  const canvas = new Canvas();
  const write = listWriter(glyphs);
  const gaps = drawFrames(canvas, glyphs, prepared.groups, layout, write);

  const ends: End[] = [];
  for (const e of prepared.edges) {
    const placed = layout.edges.get(e.id);
    const route = routes.get(e.id);
    if (!placed || !route) continue;
    drawEdge(canvas, glyphs, e, route, placed.ports, ends);
  }
  clearGaps(canvas, glyphs, gaps);
  // An edge between a flow and its own member ends on the flow's frame (flowchart's #42).
  const framed = (end: End): boolean => onFrame(layout, end);
  for (const end of ends) {
    const head = markerGlyph(glyphs, framed(end) ? { ...end, into: opposite(end.into) } : end);
    if (head) canvas.set(end.cell.x, end.cell.y, head);
  }
  drawEdgeLabels(canvas, prepared.edges, layout, write);

  for (const n of prepared.nodes) {
    const box = layout.nodes.get(n.id);
    if (!box) continue;
    const r = cellRect(box);
    const form = textForm(n.shape, glyphs);
    drawBox(canvas, glyphs, r, form.box);
    if (form.fold) canvas.set(r.x + r.width - 1, r.y, form.fold);
    writeBoxLabel(canvas, n.label, r, write);
  }
  for (const end of ends)
    if (!markerGlyph(glyphs, end) && !framed(end))
      tee(canvas, glyphs.tee, glyphs.name === 'unicode', end);

  return finish(canvas, options.title, options.maxWidth);
}
