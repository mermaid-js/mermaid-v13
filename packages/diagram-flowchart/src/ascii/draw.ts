// Draws a flowchart laid out in cells onto the text grid (DESIGN §6.3, D76, D82): groups
// outermost first with the title on the top border, then edges and their heads, edge labels,
// node boxes through the text-form table, tees where edges leave a box, and the front-matter
// title on the first line.
import {
  armOf,
  Canvas,
  DOWN,
  drawBox,
  drawText,
  glyphFor,
  INTO,
  LEFT,
  opposite,
  RIGHT,
  sideOf,
  UP,
  type CellRect,
  type Dir,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { LayoutModel, Point, Side } from '@mermaid-js/core/layout';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { EdgeView, NodeView, Prepared } from '../render/prepare.ts';
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
  type LabelWriter,
} from '@mermaid-js/shared/ascii';

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
  drawLineCells(canvas, glyphs, cells, source.into, target.into, { dotted, weight });
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

/**
 * The two border cells beside a group title's first line as written (on the border), not the
 * whole block: a wider line below it would otherwise leave a gap beside a corner, cut off from
 * the border (#603). A left-aligned block starts where `writeLabel` puts it, the line at its
 * own indent.
 */
function titleGaps(label: MeasuredLabel, at: { x: number; y: number; width: number }): Point[] {
  const first = label.widths[0] ?? at.width;
  const block = at.x + Math.floor((at.width - (label.left ? label.width : first)) / 2);
  const x = label.left ? block + (label.indents[0] ?? 0) : block;
  return [
    { x: x - 1, y: at.y },
    { x: block + first, y: at.y },
  ];
}

/**
 * An embedded diagram block (ADR-15) drawn as text: its frame, the title rows and a divider
 * under them when it has a title, and the inner diagram's text centred in the rest (a grown
 * box keeps it centred, D140). The inner text is copied as it is, not merged with the frame.
 */
function drawBlock(
  canvas: Canvas,
  glyphs: GlyphSet,
  n: NodeView,
  r: CellRect,
  write: LabelWriter
): void {
  const inner = n.embedText!;
  drawBox(canvas, glyphs, r);
  let top = r.y + 1;
  if (n.label.width > 0) {
    write(canvas, n.label, r.x + 1, top, r.width - 2);
    top += n.label.lines.length;
    const right = r.x + r.width - 1;
    for (let x = r.x + 1; x < right; x++) canvas.set(x, top, glyphs.solid.h);
    canvas.set(r.x, top, glyphFor(armOf(UP, 1) | armOf(DOWN, 1) | armOf(RIGHT, 1), glyphs)!);
    canvas.set(right, top, glyphFor(armOf(UP, 1) | armOf(DOWN, 1) | armOf(LEFT, 1), glyphs)!);
    top += 1;
  }
  const rows = r.y + r.height - 1 - top;
  drawText(
    canvas,
    r.x + Math.floor((r.width - inner.columns) / 2),
    top + Math.floor((rows - inner.rows) / 2),
    inner.text
  );
}

/**
 * A folded block (#670) drawn as text: a box like a folded subgraph's (`+` in its top-left
 * corner) with the title, a dotted divider, and the inner type centred under it.
 */
function drawFolded(
  canvas: Canvas,
  glyphs: GlyphSet,
  n: NodeView,
  r: CellRect,
  write: LabelWriter
): void {
  const type = n.fold!.label!;
  drawBox(canvas, glyphs, r, textForm('collapsedGroup', glyphs) ?? {});
  const right = r.x + r.width - 1;
  const rows = n.label.lines.length;
  // The padding rows go above the title and below the type.
  const top = r.y + Math.floor((r.height - rows - 2) / 2);
  write(canvas, n.label, r.x + 1, top, r.width - 2);
  const divider = top + rows;
  for (let x = r.x + 1; x < right; x++) canvas.set(x, divider, glyphs.dotted.h);
  canvas.set(r.x, divider, glyphFor(armOf(UP, 1) | armOf(DOWN, 1) | armOf(RIGHT, 1), glyphs)!);
  canvas.set(right, divider, glyphFor(armOf(UP, 1) | armOf(DOWN, 1) | armOf(LEFT, 1), glyphs)!);
  write(canvas, type, r.x + 1, divider + 1, r.width - 2);
}

/** A node's box and label: a block (ADR-15), a folded one (#670), or a text-form shape. */
function drawNode(
  canvas: Canvas,
  glyphs: GlyphSet,
  n: NodeView,
  r: CellRect,
  write: LabelWriter
): void {
  if (n.block === 'folded') return drawFolded(canvas, glyphs, n, r, write);
  if (n.embedText) return drawBlock(canvas, glyphs, n, r, write);
  drawBox(canvas, glyphs, r, textForm(n.shape, glyphs) ?? {});
  // D140: a grown box keeps its label centred.
  writeBoxLabel(canvas, n.label, r, write);
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
  const gaps = drawFrames(canvas, glyphs, flow.groups, layout, write, titleGaps);

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
    drawNode(canvas, glyphs, n, r, write);
  }
  for (const end of ends)
    if (!markerGlyph(glyphs, end) && !framed(end))
      tee(canvas, glyphs.tee, glyphs.name === 'unicode', end, end.stroke === 'thick' ? 2 : 1);

  return finish(canvas, options.title, options.maxWidth);
}
