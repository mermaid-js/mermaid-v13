// Draws a flowchart laid out in cells onto the text grid (DESIGN §6.3, D76, D82): groups
// outermost first with the title on the top border, then edges and their heads, edge labels,
// node boxes through the text-form table, tees where edges leave a box, and the front-matter
// title on the first line.
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
import type { EdgeView, Prepared } from '../render/prepare.ts';
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
  framed: (end: End) => boolean
): void {
  for (const end of ends) {
    const head = markerGlyph(glyphs, framed(end) ? { ...end, into: opposite(end.into) } : end);
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
  const write = listWriter(glyphs);
  const gaps = drawFrames(canvas, glyphs, flow.groups, layout, write);

  const ends: End[] = [];
  for (const e of flow.edges) {
    const placed = layout.edges.get(e.id);
    const route = routes.get(e.id);
    if (!placed || !route || e.edge.stroke === 'invisible') continue;
    drawEdge(canvas, glyphs, e, route, placed.ports, ends);
  }
  clearGaps(canvas, glyphs, gaps);
  // An edge between a group and its own member ends on the group's frame (#42).
  const framed = (end: End): boolean => onFrame(layout, end);
  drawMarkers(canvas, glyphs, ends, framed);
  drawEdgeLabels(canvas, flow.edges, layout, write);

  for (const n of flow.nodes) {
    const box = layout.nodes.get(n.id);
    if (!box) continue;
    const r = cellRect(box);
    drawBox(canvas, glyphs, r, textForm(n.shape, glyphs) ?? {});
    writeBoxLabel(canvas, n.label, r, write);
  }
  for (const end of ends)
    if (!markerGlyph(glyphs, end) && !framed(end))
      tee(canvas, glyphs.tee, glyphs.name === 'unicode', end, end.stroke === 'thick' ? 2 : 1);

  return finish(canvas, options.title, options.maxWidth);
}
