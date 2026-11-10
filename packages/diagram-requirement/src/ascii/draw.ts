// Draws a requirement diagram laid out in cells onto the text grid (#588, D438), after ER's
// (`diagram-er/src/ascii/draw.ts`, copied, not imported): relation lines (solid for
// `contains`, dotted for the rest) with their `<<kind>>` labels, the boxes with the kind and
// the name above a divider and the body lines below it, a tee where a line leaves a box, the
// `contains` mark at the source (`⊕`, `(+)` in ascii), the arrowhead at the target, and the
// front-matter title on the first line.
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
  graphemes,
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
import type { BoxView, RelationView, RequirementPrepared } from '../layout/prepare.ts';

interface Centred {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The cells of a box from its centre and size (the grid model's convention, `LayoutGraph.grid`). */
function cellRect(b: Centred): CellRect {
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

const textOf = (label: MeasuredLabel, line: number): string =>
  (label.lines[line] ?? []).map((r) => r.text).join('');

/** `text` cut to `width` cells, ending in `mark` when it was cut (packet's `cut`). */
function cut(text: string, width: number, mark: string): string {
  if (cellWidth(text) <= width) return text;
  let out = '';
  let used = 0;
  for (const g of graphemes(text)) {
    if (used + g.width > width - 1) break;
    out += g.text;
    used += g.width;
  }
  return out + mark;
}

/** Writes a label's lines centred in a `width`-cell-wide block from (x, y). */
function writeCentred(
  canvas: Canvas,
  label: MeasuredLabel,
  x: number,
  y: number,
  width: number
): void {
  label.lines.forEach((_, i) => {
    const w = label.widths[i] ?? 0;
    drawText(canvas, x + Math.floor((width - w) / 2), y + i, textOf(label, i));
  });
}

interface End {
  readonly relation: RelationView;
  /** The end cell, next to the box. */
  readonly cell: Point;
  /** Direction from the end cell into its box. */
  readonly into: Dir;
  /** The source end (a tee, and the `contains` mark) or the target end (the arrowhead). */
  readonly source: boolean;
}

function drawLine(
  canvas: Canvas,
  glyphs: GlyphSet,
  r: RelationView,
  route: readonly Point[],
  ports: { source: Side; target: Side },
  ends: End[]
): void {
  const cells = cellsOf(route);
  if (cells.length === 0) return;
  const dotted = r.dashed ? glyphs.dotted : undefined;
  const last = cells.length - 1;
  const into = { source: INTO[ports.source], target: INTO[ports.target] };
  cells.forEach((c, i) => {
    let arms = 0;
    const arm = (d: Dir): void => void (arms |= armOf(d, 1));
    if (i > 0) arm(dirOf(c, cells[i - 1]!));
    if (i < last) arm(dirOf(c, cells[i + 1]!));
    if (i === 0) arm(into.source);
    if (i === last) arm(into.target);
    let glyph = glyphFor(arms, glyphs);
    if (dotted && arms === (armOf(LEFT, 1) | armOf(RIGHT, 1))) glyph = dotted.h;
    if (dotted && arms === (armOf(UP, 1) | armOf(DOWN, 1))) glyph = dotted.v;
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
  ends.push({ relation: r, cell: cells[0]!, into: into.source, source: true });
  ends.push({ relation: r, cell: cells[last]!, into: into.target, source: false });
}

/** The border glyph where a line leaves a box: a tee with its stem towards the line. */
function tee(canvas: Canvas, glyphs: GlyphSet, end: End): void {
  const x = end.cell.x + DX[end.into];
  const y = end.cell.y + DY[end.into];
  const out = opposite(end.into);
  const fallback = sideOf(glyphs.tee, out);
  if (glyphs.name !== 'unicode') return void canvas.set(x, y, fallback);
  const stub = glyphFor(armOf(out, 1), unicode)!;
  const merged = junction(canvas.get(x, y), stub);
  canvas.set(x, y, merged === stub ? fallback : merged);
}

/**
 * The `contains` mark on the end cell: `⊕`, or in ascii `(+)`, across a vertical line and
 * along a horizontal one, outwards from the box.
 */
function containsMark(canvas: Canvas, glyphs: GlyphSet, end: End): void {
  const { x, y } = end.cell;
  if (glyphs.name === 'unicode') return void canvas.set(x, y, '⊕');
  if (end.into === UP || end.into === DOWN) return void drawText(canvas, x - 1, y, '(+)');
  drawText(canvas, end.into === RIGHT ? x - 2 : x, y, '(+)');
}

/**
 * A box: the outline, the kind and the name centred, and with a body the divider row and the
 * body lines, each cut to its `cut` cells with `mark`.
 */
function drawBoxView(
  canvas: Canvas,
  glyphs: GlyphSet,
  view: BoxView,
  r: CellRect,
  mark: string
): void {
  drawBox(canvas, glyphs, r);
  const right = r.x + r.width - 1;
  if (view.divider !== undefined) {
    const y = r.y + view.divider;
    for (let x = r.x; x <= right; x++) {
      const arms = (x > r.x ? armOf(LEFT, 1) : 0) | (x < right ? armOf(RIGHT, 1) : 0);
      canvas.draw(x, y, glyphFor(arms, glyphs)!);
    }
  }
  for (const line of view.lines) {
    if (line.align === 'center') {
      writeCentred(canvas, line.label, r.x + 1, r.y + line.y, r.width - 2);
      continue;
    }
    line.label.lines.forEach((_, i) => {
      const text = textOf(line.label, i);
      const shown = line.cut === undefined ? text : cut(text, line.cut, mark);
      drawText(canvas, r.x + line.x, r.y + line.y + i, shown);
    });
  }
}

export interface DrawOptions {
  /** The front-matter title, printed centred on the first lines. */
  readonly title?: string;
  /** `ascii.maxWidth`: a longer title wraps to it (or to the drawing, when that is wider). */
  readonly maxWidth?: number;
}

/**
 * Draws a cell layout. `routes` are the repaired routes in cell indices (corners only).
 * Returns the text: `\n` line ends, no trailing spaces, the empty margin trimmed.
 */
export function drawRequirement(
  prepared: RequirementPrepared,
  layout: LayoutModel,
  routes: ReadonlyMap<string, readonly Point[]>,
  glyphs: GlyphSet,
  options: DrawOptions
): string {
  const canvas = new Canvas();
  // Core's glyph sets have no ellipsis; `~` keeps the `ascii` charset pure ASCII (packet's).
  const mark = glyphs.name === 'unicode' ? '…' : '~';

  const ends: End[] = [];
  for (const r of prepared.relations) {
    const placed = layout.edges.get(r.id);
    const route = routes.get(r.id);
    if (!placed || !route) continue;
    drawLine(canvas, glyphs, r, route, placed.ports, ends);
  }

  for (const r of prepared.relations) {
    const at = layout.edges.get(r.id)?.label;
    if (!at || r.label.width === 0) continue;
    const box = cellRect({ ...at, width: r.label.width, height: Math.max(r.label.height, 1) });
    // The patch around the text is the relation's own (repair keeps other lines out of it).
    for (let y = box.y; y < box.y + box.height; y++)
      for (let x = box.x - 1; x <= box.x + box.width; x++) canvas.set(x, y, ' ');
    writeCentred(canvas, r.label, box.x, box.y, box.width);
  }

  for (const view of prepared.boxes) {
    const box = layout.nodes.get(view.id);
    if (box) drawBoxView(canvas, glyphs, view, cellRect(box), mark);
  }

  for (const end of ends) {
    if (end.source) {
      tee(canvas, glyphs, end);
      if (end.relation.marker === 'contains') containsMark(canvas, glyphs, end);
    } else if (end.relation.marker === 'arrow') {
      canvas.set(end.cell.x, end.cell.y, sideOf(glyphs.head, end.into));
    }
  }

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
    const wrapped = maxWidth === undefined ? [text] : wrapTitle(text, Math.max(width, maxWidth));
    const out = new Canvas();
    wrapped.forEach((line, i) =>
      drawText(out, Math.max(0, Math.floor((width - cellWidth(line)) / 2)), i, line)
    );
    lines.unshift(...out.toString().split('\n'));
  }
  return lines.join('\n');
}
