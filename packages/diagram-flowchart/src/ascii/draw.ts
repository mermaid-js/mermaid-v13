// Draws a flowchart laid out in cells onto the text grid (DESIGN §6.3, D76, D82): groups
// outermost first with the title on the top border, then edges and their heads, edge labels,
// node boxes through the text-form table, tees where edges leave a box, and the front-matter
// title on the first line.
import {
  Canvas,
  cellWidth,
  drawBox,
  drawText,
  glyphFor,
  junction,
  type CellRect,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { LayoutModel, Point, Side } from '@mermaid-js/core/layout';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { EdgeView, Prepared } from '../render/prepare.ts';
import { textForm } from './shapes.ts';

// Directions, and arms packed as in core/ascii glyphs.ts: up·64 + right·16 + down·4 + left.
type Dir = 0 | 1 | 2 | 3;
const UP: Dir = 0;
const RIGHT: Dir = 1;
const DOWN: Dir = 2;
const LEFT: Dir = 3;
const SHIFT = [6, 4, 2, 0] as const;
const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
/** The direction from an end cell into the box behind it. */
const INTO: Record<Side, Dir> = { top: DOWN, right: LEFT, bottom: UP, left: RIGHT };
const HEAD = ['up', 'right', 'down', 'left'] as const;

interface Centred {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The cells of a box from its centre and size: columns `x − w/2 + ½ … x + w/2 − ½`, the grid
 * model's convention (`LayoutGraph.grid`), which the repair router shares.
 */
export function cellRect(b: Centred): CellRect {
  const x = Math.round(b.x - b.width / 2 + 0.5);
  const y = Math.round(b.y - b.height / 2 + 0.5);
  return {
    x,
    y,
    width: Math.round(b.x + b.width / 2 - 0.5) - x + 1,
    height: Math.round(b.y + b.height / 2 - 0.5) - y + 1,
  };
}

function dirOf(a: Point, b: Point): Dir {
  if (b.x !== a.x) return b.x > a.x ? RIGHT : LEFT;
  return b.y > a.y ? DOWN : UP;
}

/** The cells a corner polyline passes, in order. */
function cellsOf(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  points.forEach((p, i) => {
    if (i === 0) return void out.push(p);
    const prev = points[i - 1]!;
    const d = dirOf(prev, p);
    const n = Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    for (let k = 1; k <= n; k++) out.push({ x: prev.x + DX[d] * k, y: prev.y + DY[d] * k });
  });
  return out;
}

/** Writes a label's lines centred in a `width`-cell-wide block from (x, y). */
function writeLabel(
  canvas: Canvas,
  label: MeasuredLabel,
  x: number,
  y: number,
  width: number,
  glyphs: GlyphSet
): void {
  label.lines.forEach((runs, i) => {
    let text = runs.map((r) => r.text).join('');
    if (glyphs.name === 'ascii') text = text.replace(/[•◦]/g, '-');
    const indent = label.indents[i] ?? 0;
    const lineWidth = label.widths[i] ?? 0;
    const at = label.left ? x + Math.floor((width - label.width) / 2) + indent : x;
    drawText(canvas, label.left ? at : x + Math.floor((width - lineWidth) / 2), y + i, text);
  });
}

interface End {
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
  const source = { cell: cells[0]!, into: INTO[ports.source], marker: e.start };
  const target = { cell: cells[last]!, into: INTO[ports.target], marker: e.end };
  cells.forEach((c, i) => {
    let arms = 0;
    const arm = (d: Dir): void => void (arms |= weight << SHIFT[d]);
    if (i > 0) arm(dirOf(c, cells[i - 1]!));
    if (i < last) arm(dirOf(c, cells[i + 1]!));
    if (i === 0) arm(source.into);
    if (i === last) arm(target.into);
    let glyph = glyphFor(arms, glyphs);
    if (dotted && arms === ((weight << SHIFT[LEFT]) | (weight << SHIFT[RIGHT]))) glyph = dotted.h;
    if (dotted && arms === ((weight << SHIFT[UP]) | (weight << SHIFT[DOWN]))) glyph = dotted.v;
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
  for (const end of [source, target])
    ends.push({ ...end, stroke: weight === 2 ? 'thick' : 'light' });
}

/** The glyph an end's marker puts in its cell, if any. */
function markerGlyph(glyphs: GlyphSet, end: End): string | undefined {
  switch (end.marker) {
    case 'arrow_point':
      return glyphs.head[HEAD[end.into]];
    case 'arrow_circle':
      return glyphs.circle;
    case 'arrow_cross':
      return glyphs.cross;
    default:
      return undefined;
  }
}

// A one-armed stub per direction, light and heavy, to merge into a border as a tee.
const STUB = { light: '╵╶╷╴', thick: '╹╺╻╸' } as const;

/** The border glyph where an edge leaves a box: a tee with its stem towards the edge. */
function tee(canvas: Canvas, glyphs: GlyphSet, end: End): void {
  const x = end.cell.x + DX[end.into];
  const y = end.cell.y + DY[end.into];
  const out = ((end.into + 2) % 4) as Dir;
  const fallback = glyphs.tee[HEAD[out]];
  if (glyphs.name !== 'unicode') return void canvas.set(x, y, fallback);
  const stub = STUB[end.stroke as 'light' | 'thick'][out]!;
  const merged = junction(canvas.get(x, y), stub);
  canvas.set(x, y, merged === stub ? fallback : merged);
}

export interface DrawOptions {
  /** The front-matter title, printed centred on the first line. */
  readonly title?: string;
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
    writeLabel(canvas, g.label, at.x, at.y, at.width, glyphs);
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
  for (const end of ends) {
    const head = markerGlyph(glyphs, end);
    if (head) canvas.set(end.cell.x, end.cell.y, head);
  }

  for (const e of flow.edges) {
    const at = layout.edges.get(e.id)?.label;
    if (!at || e.label.width === 0) continue;
    const r = cellRect({ ...at, width: e.label.width, height: Math.max(e.label.height, 1) });
    // The patch around the text is the edge's own (repair keeps other lines out of it).
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x - 1; x <= r.x + r.width; x++) canvas.set(x, y, ' ');
    writeLabel(canvas, e.label, r.x, r.y, r.width, glyphs);
  }

  for (const n of flow.nodes) {
    const box = layout.nodes.get(n.id);
    if (!box) continue;
    const r = cellRect(box);
    drawBox(canvas, glyphs, r, textForm(n.shape, glyphs) ?? {});
    // D140: a grown box keeps its label centred.
    const lines = n.label.lines.length;
    const top = r.y + Math.floor((r.height - lines) / 2);
    writeLabel(canvas, n.label, r.x + 1, top, r.width - 2, glyphs);
  }
  for (const end of ends) if (!markerGlyph(glyphs, end)) tee(canvas, glyphs, end);

  return finish(canvas, options.title);
}

/** Trims the empty margin and puts the title, centred, on the first line. */
function finish(canvas: Canvas, title: string | undefined): string {
  let lines = canvas.toString().split('\n');
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const margin = Math.min(...lines.filter((l) => l !== '').map((l) => l.search(/\S/)));
  if (margin > 0 && Number.isFinite(margin)) lines = lines.map((l) => l.slice(margin));
  const text = title?.trim();
  if (text) {
    const out = new Canvas();
    const width = Math.max(0, ...lines.map(cellWidth));
    const tw = cellWidth(text);
    drawText(out, Math.max(0, Math.floor((width - tw) / 2)), 0, text);
    lines.unshift(out.toString());
  }
  return lines.join('\n');
}
