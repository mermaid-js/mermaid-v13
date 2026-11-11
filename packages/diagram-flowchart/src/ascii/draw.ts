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
import type { EdgeView, NodeView, Prepared } from '../render/prepare.ts';
import { textForm } from './shapes.ts';

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
    // Only a list item's own marker: a bullet written in the text stays as written.
    if (glyphs.name === 'ascii' && label.left) text = text.replace(/^(\s*)[•◦]/, '$1-');
    const indent = label.indents[i] ?? 0;
    const lineWidth = label.widths[i] ?? 0;
    const at = label.left ? x + Math.floor((width - label.width) / 2) + indent : x;
    drawText(canvas, label.left ? at : x + Math.floor((width - lineWidth) / 2), y + i, text);
  });
}

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
  cells.forEach((c, i) => {
    let arms = 0;
    const arm = (d: Dir): void => void (arms |= armOf(d, weight));
    if (i > 0) arm(dirOf(c, cells[i - 1]!));
    if (i < last) arm(dirOf(c, cells[i + 1]!));
    if (i === 0) arm(source.into);
    if (i === last) arm(target.into);
    let glyph = glyphFor(arms, glyphs);
    if (dotted && arms === (armOf(LEFT, weight) | armOf(RIGHT, weight))) glyph = dotted.h;
    if (dotted && arms === (armOf(UP, weight) | armOf(DOWN, weight))) glyph = dotted.v;
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
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

/** The border glyph where an edge leaves a box: a tee with its stem towards the edge. */
function tee(canvas: Canvas, glyphs: GlyphSet, end: End): void {
  const x = end.cell.x + DX[end.into];
  const y = end.cell.y + DY[end.into];
  const out = opposite(end.into);
  const fallback = sideOf(glyphs.tee, out);
  if (glyphs.name !== 'unicode') return void canvas.set(x, y, fallback);
  // A one-armed stub towards the edge, merged into the border as a tee.
  const stub = glyphFor(armOf(out, end.stroke === 'thick' ? 2 : 1), unicode)!;
  const merged = junction(canvas.get(x, y), stub);
  canvas.set(x, y, merged === stub ? fallback : merged);
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
function drawBlock(canvas: Canvas, glyphs: GlyphSet, n: NodeView, r: CellRect): void {
  const inner = n.embedText!;
  drawBox(canvas, glyphs, r);
  let top = r.y + 1;
  if (n.label.width > 0) {
    writeLabel(canvas, n.label, r.x + 1, top, r.width - 2, glyphs);
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
    writeLabel(canvas, g.label, at.x, at.y, at.width, glyphs);
    gaps.push(...titleGaps(g.label, at));
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
    writeLabel(canvas, e.label, r.x, r.y, r.width, glyphs);
  }

  for (const n of flow.nodes) {
    const box = layout.nodes.get(n.id);
    if (!box) continue;
    const r = cellRect(box);
    if (n.embedText) {
      drawBlock(canvas, glyphs, n, r);
      continue;
    }
    drawBox(canvas, glyphs, r, textForm(n.shape, glyphs) ?? {});
    // D140: a grown box keeps its label centred.
    const lines = n.label.lines.length;
    const top = r.y + Math.floor((r.height - lines) / 2);
    writeLabel(canvas, n.label, r.x + 1, top, r.width - 2, glyphs);
  }
  for (const end of ends) if (!markerGlyph(glyphs, end) && !onFrame(end)) tee(canvas, glyphs, end);

  return finish(canvas, options.title, options.maxWidth);
}

// Greedy word wrap to `width` cells; a word longer than that keeps a line of its own.
function wrapTitle(text: string, width: number): string[] {
  if (cellWidth(text) <= width) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && cellWidth(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** Trims the empty margin and puts the title, centred, on the first lines. */
function finish(canvas: Canvas, title: string | undefined, maxWidth?: number): string {
  let lines = canvas.toString().split('\n');
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const margin = Math.min(...lines.filter((l) => l !== '').map((l) => l.search(/\S/)));
  if (margin > 0 && Number.isFinite(margin)) lines = lines.map((l) => l.slice(margin));
  const text = title?.trim();
  if (text) {
    const width = Math.max(0, ...lines.map(cellWidth));
    // Only a width budget wraps it: then to the budget, or to the drawing when that is wider.
    const wrapped = maxWidth === undefined ? [text] : wrapTitle(text, Math.max(width, maxWidth));
    const out = new Canvas();
    wrapped.forEach((line, i) =>
      drawText(out, Math.max(0, Math.floor((width - cellWidth(line)) / 2)), i, line)
    );
    lines.unshift(...out.toString().split('\n'));
  }
  return lines.join('\n');
}
