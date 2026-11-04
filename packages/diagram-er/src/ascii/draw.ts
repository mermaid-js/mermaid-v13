// Draws an ER diagram laid out in cells onto the text grid (DESIGN §6.3, D76, D109): subgraph
// frames outermost first with the title on the top border, relationship lines (solid when
// identifying, dotted otherwise), their labels, entity tables, tees where lines leave a box,
// the crow's-foot marks at each end and the front-matter title on the first line.
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
import type { ErCardinality } from '../parser/index.ts';
import type { EdgeView, EntityView, ErPrepared } from '../layout/prepare.ts';

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
  /** The entity or subgraph the line ends at. */
  at: string;
  /** The end cell, next to the box. */
  cell: Point;
  /** The cell before it on the line, unless that is the other end's. */
  before?: Point;
  /** Direction from the end cell into its box. */
  into: Dir;
  cardinality: ErCardinality;
}

function drawLine(
  canvas: Canvas,
  glyphs: GlyphSet,
  e: EdgeView,
  route: readonly Point[],
  ports: { source: Side; target: Side },
  ends: End[]
): void {
  const cells = cellsOf(route);
  if (cells.length === 0) return;
  const dotted = e.relationship.identifying ? undefined : glyphs.dotted;
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
  // The cell before the end, also where the line turns there: the outer mark says zero or one,
  // which a drawing must not lose. Not the other end's cell on a two-cell line.
  const before = (i: number, step: number): Point | undefined =>
    cells[i + 2 * step] ? cells[i + step] : undefined;
  const end = (i: number, step: number, d: Dir, at: string, cardinality: ErCardinality): End => {
    const b = before(i, step);
    return { at, cell: cells[i]!, into: d, cardinality, ...(b ? { before: b } : {}) };
  };
  const { from, to } = e.relationship;
  ends.push(end(0, 1, into.source, e.source, from.cardinality));
  ends.push(end(last, -1, into.target, e.target, to.cardinality));
}

/**
 * The marks an end draws, nearest the entity first: a bar or crow's foot next to the box,
 * then a bar or ring (mermaid-ascii's `||`, `|o`, `}|`, `}o` read from the entity outwards).
 */
function marks(glyphs: GlyphSet, end: End): [string, string | undefined] {
  const c = glyphs.cardinality;
  const across = end.into === LEFT || end.into === RIGHT ? c.bar.h : c.bar.v;
  const many = sideOf(c.many, end.into);
  switch (end.cardinality) {
    case 'onlyOne':
      return [across, across];
    case 'zeroOrOne':
      return [across, c.ring];
    case 'oneOrMore':
      return [many, across];
    case 'zeroOrMore':
      return [many, c.ring];
    case 'mdParent':
      return [c.parent, undefined];
  }
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
 * An entity: the outer box, the name band, and with attributes a rule under the name, the
 * column dividers and one row per attribute, cell text `pad` cells in from its divider.
 */
function drawEntity(
  canvas: Canvas,
  glyphs: GlyphSet,
  view: EntityView,
  r: CellRect,
  pad: number
): void {
  drawBox(canvas, glyphs, r);
  const right = r.x + r.width - 1;
  const bottom = r.y + r.height - 1;
  const inner = r.width - 2;
  if (view.columns.length === 0) {
    // D140: a grown box keeps its name centred.
    const top = r.y + Math.floor((r.height - view.label.lines.length) / 2);
    writeCentred(canvas, view.label, r.x + 1, top, inner);
    return;
  }
  writeCentred(canvas, view.label, r.x + 1, r.y + view.header.at, inner);
  const rule = r.y + view.header.at + view.header.size;
  // Stubs merged into what is drawn: the sides become tees, the dividers cross the rules.
  for (let x = r.x; x <= right; x++) {
    const arms = (x > r.x ? armOf(LEFT, 1) : 0) | (x < right ? armOf(RIGHT, 1) : 0);
    canvas.draw(x, rule, glyphFor(arms, glyphs)!);
  }
  view.columns.forEach((col, c) => {
    if (c === 0 || col.size === 0) return;
    const x = r.x + col.at - 1;
    for (let y = rule; y <= bottom; y++) {
      const arms = (y > rule ? armOf(UP, 1) : 0) | (y < bottom ? armOf(DOWN, 1) : 0);
      canvas.draw(x, y, glyphFor(arms, glyphs)!);
    }
  });
  for (const row of view.rows) {
    row.cells.forEach((cell, c) => {
      const col = view.columns[c]!;
      if (col.size === 0) return;
      cell.lines.forEach((_, i) =>
        drawText(canvas, r.x + col.at + pad, r.y + row.band.at + i, textOf(cell, i))
      );
    });
  }
}

export interface DrawOptions {
  /** The front-matter title, printed centred on the first lines. */
  readonly title?: string;
  /** `ascii.maxWidth`: a longer title wraps to it (or to the drawing, when that is wider). */
  readonly maxWidth?: number;
  /** Cells between a table cell's divider and its text (the profile's `nodePad.x`). */
  readonly pad: number;
}

/**
 * Draws a cell layout. `routes` are the repaired routes in cell indices (corners only).
 * Returns the text: `\n` line ends, no trailing spaces, the empty margin trimmed.
 */
export function drawEr(
  er: ErPrepared,
  layout: LayoutModel,
  routes: ReadonlyMap<string, readonly Point[]>,
  glyphs: GlyphSet,
  options: DrawOptions
): string {
  const canvas = new Canvas();

  // A space either side of a title, where the border is still plain (`┌─ one ───┐`).
  const gaps: Point[] = [];
  for (const g of er.groups) {
    const box = layout.groups.get(g.id);
    if (!box) continue;
    drawBox(canvas, glyphs, cellRect(box));
    if (g.label.width === 0) continue;
    const at = cellRect({
      ...box.title,
      width: g.label.width,
      height: Math.max(g.label.height, 1),
    });
    writeCentred(canvas, g.label, at.x, at.y, at.width);
    gaps.push({ x: at.x - 1, y: at.y }, { x: at.x + at.width, y: at.y });
  }

  const ends: End[] = [];
  for (const e of er.edges) {
    const placed = layout.edges.get(e.id);
    const route = routes.get(e.id);
    if (!placed || !route) continue;
    drawLine(canvas, glyphs, e, route, placed.ports, ends);
  }
  for (const { x, y } of gaps) if (canvas.get(x, y) === glyphs.solid.h) canvas.set(x, y, ' ');

  for (const e of er.edges) {
    const at = layout.edges.get(e.id)?.label;
    if (!at || e.label.width === 0) continue;
    const r = cellRect({ ...at, width: e.label.width, height: Math.max(e.label.height, 1) });
    // The patch around the text is the edge's own (repair keeps other lines out of it).
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x - 1; x <= r.x + r.width; x++) canvas.set(x, y, ' ');
    writeCentred(canvas, e.label, r.x, r.y, r.width);
  }

  for (const view of er.entities) {
    const box = layout.nodes.get(view.id);
    if (box) drawEntity(canvas, glyphs, view, cellRect(box), options.pad);
  }

  // An end on a group's frame (a group's relationship to its own member) is reached from
  // inside the group: the line already joins the frame, and its marks face the other way.
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
    const framed = onFrame(end);
    if (!framed) tee(canvas, glyphs, end);
    const [near, far] = marks(glyphs, framed ? { ...end, into: opposite(end.into) } : end);
    canvas.set(end.cell.x, end.cell.y, near);
    if (far && end.before) canvas.set(end.before.x, end.before.y, far);
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
