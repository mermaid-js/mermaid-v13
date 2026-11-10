// Draws a flowchart laid out in cells onto the text grid (DESIGN §6.3, D76, D82): groups
// outermost first with the title on the top border, then edges and their heads, edge labels,
// node boxes through the text-form table, tees where edges leave a box, and the front-matter
// title on the first line.
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
import type { EdgeView, Prepared } from '../render/prepare.ts';
import { textForm } from './shapes.ts';
import type { Centred } from '@mermaid-js/core/ascii';
import { cellRect } from '@mermaid-js/core/ascii';
import { dirOf } from '@mermaid-js/core/ascii';
import { cellsOf } from '@mermaid-js/core/ascii';
import { wrapTitle } from '@mermaid-js/core/ascii';
import { finish } from '@mermaid-js/core/ascii';
import { tee } from '@mermaid-js/core/ascii';
import { writeLabel } from '@mermaid-js/core/ascii';
import { drawLineCells } from '@mermaid-js/core/ascii';
export { cellRect } from '@mermaid-js/core/ascii';

interface End {
  /** The node or group the edge ends at. */
  at: string;
  cell: Point;
  /** Direction from the end cell into its box. */
  into: Dir;
  marker: string;
  stroke: string;
}

function drawEdge(
  canvas: Canvas,
  glyphs: GlyphSet,
  e: EdgeView,
  route: readonly Point[],
  ports: { source: Side; target: Side },
  ends: End[]
): void {
  const cells = cellsOf(route);
  if (cells.length === 0) return;
  const weight = e.edge.stroke === 'thick' ? 2 : 1;
  const dotted = e.edge.stroke === 'dotted' ? glyphs.dotted : undefined;
  const last = cells.length - 1;
  const source = { at: e.source, cell: cells[0]!, into: INTO[ports.source], marker: e.start };
  const target = { at: e.target, cell: cells[last]!, into: INTO[ports.target], marker: e.end };
  drawLineCells(canvas, glyphs, cells, source.into, target.into, dotted, weight);
  for (const end of [source, target])
    ends.push({ ...end, stroke: weight === 2 ? 'thick' : 'light' });
}

/** The glyph an end's marker puts in its cell, if any. */
function markerGlyph(glyphs: GlyphSet, end: End): string | undefined {
  switch (end.marker) {
    case 'arrow_point':
      return sideOf(glyphs.head, end.into);
    case 'arrow_circle':
      return glyphs.circle;
    case 'arrow_cross':
      return glyphs.cross;
    default:
      return undefined;
  }
}

// A marker on a group's frame is reached from inside the group, so it points the other way.
function drawMarkers(
  canvas: Canvas,
  glyphs: GlyphSet,
  ends: readonly End[],
  onFrame: (end: End) => boolean
): void {
  for (const end of ends) {
    const head = markerGlyph(glyphs, onFrame(end) ? { ...end, into: opposite(end.into) } : end);
    if (head) canvas.set(end.cell.x, end.cell.y, head);
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
export function drawFlowchart(
  flow: Prepared,
  layout: LayoutModel,
  routes: ReadonlyMap<string, readonly Point[]>,
  glyphs: GlyphSet,
  options: DrawOptions = {}
): string {
  const canvas = new Canvas();

  // A space either side of a title, where the border is still plain (`┌─ one ───┐`).
  const gaps: Point[] = [];
  for (const g of flow.groups) {
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
  for (const e of flow.edges) {
    const placed = layout.edges.get(e.id);
    const route = routes.get(e.id);
    if (!placed || !route || e.edge.stroke === 'invisible') continue;
    drawEdge(canvas, glyphs, e, route, placed.ports, ends);
  }
  for (const { x, y } of gaps) if (canvas.get(x, y) === glyphs.solid.h) canvas.set(x, y, ' ');
  // An edge between a group and its own member ends on the group's frame (#42): the line
  // already joins the border there, so there is no tee to add, and
  // the line reaches it from inside the group, so a marker there points the other way.
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
  drawMarkers(canvas, glyphs, ends, onFrame);

  for (const e of flow.edges) {
    const at = layout.edges.get(e.id)?.label;
    if (!at || e.label.width === 0) continue;
    const r = cellRect({ ...at, width: e.label.width, height: Math.max(e.label.height, 1) });
    // The patch around the text is the edge's own (repair keeps other lines out of it).
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x - 1; x <= r.x + r.width; x++) canvas.set(x, y, ' ');
    writeLabel(canvas, e.label, r.x, r.y, r.width, glyphs.name === 'ascii' ? '-' : undefined);
  }

  for (const n of flow.nodes) {
    const box = layout.nodes.get(n.id);
    if (!box) continue;
    const r = cellRect(box);
    drawBox(canvas, glyphs, r, textForm(n.shape, glyphs) ?? {});
    // D140: a grown box keeps its label centred.
    const lines = n.label.lines.length;
    const top = r.y + Math.floor((r.height - lines) / 2);
    writeLabel(canvas, n.label, r.x + 1, top, r.width - 2, glyphs.name === 'ascii' ? '-' : undefined);
  }
  for (const end of ends) if (!markerGlyph(glyphs, end) && !onFrame(end)) tee(canvas, glyphs.tee, glyphs.name === 'unicode', end, end.stroke === 'thick' ? 2 : 1);

  return finish(canvas, options.title, options.maxWidth);
}
