// Draws an agentflow laid out in cells onto the text grid (D469, D82, DESIGN §6.3), a local copy
// of flowchart's (D446, never an import): flows outermost first, each a frame with its title on
// the top border, then edges and their heads, edge labels, node boxes through the text-form
// table, tees where edges leave a box, and the front-matter title on the first line.
import {
  armOf,
  Canvas,
  cellWidth,
  DOWN,
  drawBox,
  drawText,
  DX,
  DY,
  glyphFor,
  INTO,
  junction,
  LEFT,
  opposite,
  RIGHT,
  sideOf,
  unicode,
  UP,
  type CellRect,
  type Dir,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { LayoutModel, Point, Side } from '@mermaid-js/core/layout';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { AgentflowEdgeView, AgentflowPrepared, Arrowhead } from '../layout/index.ts';
import { textForm } from './shapes.ts';
import type { Centred } from '@mermaid-js/shared/ascii';
import { cellRect } from '@mermaid-js/shared/ascii';
import { dirOf } from '@mermaid-js/shared/ascii';
import { cellsOf } from '@mermaid-js/shared/ascii';
import { wrapTitle } from '@mermaid-js/shared/ascii';
import { finish } from '@mermaid-js/shared/ascii';
import { tee } from '@mermaid-js/shared/ascii';
import { writeLabel } from '@mermaid-js/shared/ascii';
import { drawLineCells } from '@mermaid-js/shared/ascii';
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

  // A space either side of a title, where the border is still plain (`┌─ Triage ───┐`).
  const gaps: Point[] = [];
  for (const g of prepared.groups) {
    const box = layout.groups.get(g.id);
    if (!box) continue;
    drawBox(canvas, glyphs, cellRect(box));
    if (g.label.width === 0) continue;
    // The repair router walled these cells off: round(x − w/2 + ½) from the title's centre.
    const at = cellRect({
      ...box.title,
      width: g.label.width,
      height: Math.max(g.label.height, 1),
    });
    writeLabel(canvas, g.label, at.x, at.y, at.width, glyphs.name === 'ascii' ? '-' : undefined);
    gaps.push({ x: at.x - 1, y: at.y }, { x: at.x + at.width, y: at.y });
  }

  const ends: End[] = [];
  for (const e of prepared.edges) {
    const placed = layout.edges.get(e.id);
    const route = routes.get(e.id);
    if (!placed || !route) continue;
    drawEdge(canvas, glyphs, e, route, placed.ports, ends);
  }
  for (const { x, y } of gaps) if (canvas.get(x, y) === glyphs.solid.h) canvas.set(x, y, ' ');
  // An edge between a flow and its own member ends on the flow's frame (flowchart's #42): the
  // line already joins the border there, so there is no tee to add, and the line reaches it
  // from inside the flow, so a marker there points the other way.
  const onFrame = (end: End): boolean => {
    const g = layout.groups.get(end.at);
    if (!g) return false;
    const r = cellRect(g);
    const { x, y } = end.cell;
    const inX = x >= r.x && x < r.x + r.width;
    const inY = y >= r.y && y < r.y + r.height;
    return (
      (inX && (y === r.y || y === r.y + r.height - 1)) ||
      (inY && (x === r.x || x === r.x + r.width - 1))
    );
  };
  for (const end of ends) {
    const head = markerGlyph(glyphs, onFrame(end) ? { ...end, into: opposite(end.into) } : end);
    if (head) canvas.set(end.cell.x, end.cell.y, head);
  }

  for (const e of prepared.edges) {
    const at = layout.edges.get(e.id)?.label;
    if (!at || e.label.width === 0) continue;
    const r = cellRect({ ...at, width: e.label.width, height: Math.max(e.label.height, 1) });
    // The patch around the text is the edge's own (repair keeps other lines out of it).
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x - 1; x <= r.x + r.width; x++) canvas.set(x, y, ' ');
    writeLabel(canvas, e.label, r.x, r.y, r.width, glyphs.name === 'ascii' ? '-' : undefined);
  }

  for (const n of prepared.nodes) {
    const box = layout.nodes.get(n.id);
    if (!box) continue;
    const r = cellRect(box);
    const form = textForm(n.shape, glyphs);
    drawBox(canvas, glyphs, r, form.box);
    if (form.fold) canvas.set(r.x + r.width - 1, r.y, form.fold);
    // D140: a grown box keeps its label centred.
    const lines = n.label.lines.length;
    const top = r.y + Math.floor((r.height - lines) / 2);
    writeLabel(
      canvas,
      n.label,
      r.x + 1,
      top,
      r.width - 2,
      glyphs.name === 'ascii' ? '-' : undefined
    );
  }
  for (const end of ends)
    if (!markerGlyph(glyphs, end) && !onFrame(end))
      tee(canvas, glyphs.tee, glyphs.name === 'unicode', end);

  return finish(canvas, options.title, options.maxWidth);
}
