// Draws a C4 layout laid out on the cell profile (`C4Layout.cell`, #545, D459) onto the text
// grid: the px layout divided by the cell size, every edge rounded to the nearest cell. In order:
//
// 1. boundaries: dashed frames, deployment nodes solid ones (as the SVG draws them);
// 2. relations: each a stepped line from the cell outside its start's side to the cell outside
//    its end's, routed on the grid round elements, boundary header text and the title, guided by
//    the layout's routed points (`./route.ts`);
// 3. elements: boxes in the flowchart's text form of their shape: rounded corners for `rounded`
//    and `person`, caps for the cylinder, double sides for `fr-rect`, square for the queue;
// 4. arrowheads on the cell outside the side they point into, and a tee on the side where a
//    line without one leaves;
// 5. text: a boundary's label in its top border (`┌╌ Label ╌┐`), its `[type]` and description
//    on the rows below; an element's name, `[Kind]` and description centred inside; the title;
// 6. each relation's label and `[techn]`, a space either side, at or beside the middle of its
//    line, wrapped narrower where it does not fit there when the layout's text may wrap (the root
//    `wrap` true, #683), else kept on one line and cut (`placeLabel`).
//
// A line wider than its room is cut with `…` (`...` in the ascii charset). Glyphs come from core
// (`armOf`, `glyphFor`, `sideOf`, pitfall 21). The empty margin round the drawing is trimmed.
import {
  armOf,
  Canvas,
  cellWidth,
  DX,
  DY,
  drawBox,
  drawText,
  glyphFor,
  graphemes,
  opposite,
  sideOf,
  type BoxOptions,
  type CellRect,
  type Dir,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import { dirOf } from '@mermaid-js/shared/ascii';
import type {
  C4BoundaryLayout,
  C4ElementLayout,
  C4Layout,
  C4RelationEnd,
  C4RelationLayout,
  C4ShapeId,
  PlacedLabel,
  Rect,
} from '../layout/index.ts';
import { BlockCounts } from './counts.ts';
import { CellSet, clamp, Grid, type Cell } from './grid.ts';
import { routeLine, RouteBudget, type RouteField, type RouteRequest } from './route.ts';

/**
 * The search steps and label cells the relations of one drawing may take together (R-SEC-5),
 * also capped by the integrator's `limits.maxLayoutWork` (D542), as the SVG layout's budget.
 */
export const ROUTE_BUDGET = 1_000_000;

/** How far the router may go round the drawing, in cells. */
const ROUTE_MARGIN = 3;

/** A label's places: this many cells along its line either side of the middle, and this far beside. */
const LABEL_ALONG = 12;
const LABEL_BESIDE = 2;

/** The narrowest a label is wrapped to, in cells. */
const LABEL_LEAST = 6;

/** The four ways, clockwise from up (core's `Dir` order). */
const DIRS: readonly Dir[] = [0, 1, 2, 3];

/** Each shape's box options (flowchart's text forms; the queue has none, a square box). */
const FORMS: Readonly<Record<C4ShapeId, BoxOptions>> = {
  person: { form: 'rounded' },
  rounded: { form: 'rounded' },
  cyl: { form: 'caps' },
  'h-cyl': {},
  'fr-rect': { form: 'double-side' },
};

/** A label's lines as written text. */
const linesOf = (label: PlacedLabel | undefined): string[] =>
  label ? label.text.lines.map((runs) => runs.map((r) => r.text).join('')) : [];

/**
 * `text` in at most `width` cells: cut with `ellipsis` when it is wider, or when `force` (the
 * last of the lines that fit, more following).
 */
function cut(text: string, width: number, ellipsis: string, force = false): string {
  if (width <= 0) return '';
  if (!force && cellWidth(text) <= width) return text;
  const ellipsisWidth = cellWidth(ellipsis);
  const room = ellipsisWidth <= width ? width - ellipsisWidth : width;
  let out = '';
  let w = 0;
  for (const g of graphemes(text)) {
    if (w + g.width > room) break;
    out += g.text;
    w += g.width;
  }
  return ellipsisWidth <= width ? out.trimEnd() + ellipsis : out;
}

/** `lines` cut to `rows`, the last one shown with `ellipsis` when some are left out. */
function fit(lines: readonly string[], rows: number, width: number, ellipsis: string): string[] {
  if (lines.length <= rows) return [...lines];
  const kept = lines.slice(0, Math.max(0, rows));
  if (kept.length > 0) kept[kept.length - 1] = cut(kept[kept.length - 1]!, width, ellipsis, true);
  return kept;
}

/** A text written from a cell, one row. */
interface Written {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

/** A relation on the grid: its cells from start to end, and the way each end goes into its shape. */
interface Line {
  readonly rel: C4RelationLayout;
  readonly cells: readonly Cell[];
  readonly startInto: Dir;
  readonly endInto: Dir;
}

/** What drawing reads. */
interface Pen {
  readonly canvas: Canvas;
  readonly glyphs: GlyphSet;
  readonly grid: Grid;
  readonly ellipsis: string;
  /** Cells no label covers: boxes, arrowheads, header text, the title, labels. */
  readonly labelBlocks: CellSet;
  /** Frames' border cells: a label covers them only when no place near its line is clear. */
  readonly frameCells: CellSet;
  /** What routing and placing labels may still spend. */
  readonly budget: RouteBudget;
  /** Whether a label may be wrapped narrower than the layout's lines (`C4Layout.labelsWrap`). */
  readonly wrap: boolean;
}

/** A frame: dashed rules for a boundary, solid for a deployment node. */
function drawFrame(pen: Pen, r: CellRect, dashed: boolean): void {
  const { canvas, glyphs } = pen;
  const s = dashed ? glyphs.dotted : glyphs.solid;
  const right = r.x + r.width - 1;
  const bottom = r.y + r.height - 1;
  for (let i = r.x + 1; i < right; i++) {
    canvas.draw(i, r.y, s.h);
    canvas.draw(i, bottom, s.h);
  }
  for (let j = r.y + 1; j < bottom; j++) {
    canvas.draw(r.x, j, s.v);
    canvas.draw(right, j, s.v);
  }
  canvas.draw(r.x, r.y, s.tl);
  canvas.draw(right, r.y, s.tr);
  canvas.draw(r.x, bottom, s.bl);
  canvas.draw(right, bottom, s.br);
}

/** `lines` centred across `r` from row `top`, each cut to the room inside its border. */
function centred(pen: Pen, r: CellRect, lines: readonly string[], top: number): Written[] {
  return lines.map((line, k) => {
    const text = cut(line, r.width - 4, pen.ellipsis);
    return { x: r.x + Math.floor((r.width - cellWidth(text)) / 2), y: top + k, text };
  });
}

/**
 * A boundary's header text: its label in its top border, a space either side, and `[type]` and
 * the description on the rows below the border, above its contents (the layout's `head`).
 */
function headerText(pen: Pen, b: C4BoundaryLayout): Written[] {
  const r = pen.grid.rect(b.box);
  const out: Written[] = [];
  const label = linesOf(b.label).join(' ').trim();
  if (label !== '' && r.width >= 5) {
    const text = cut(label, r.width - 4, pen.ellipsis);
    const w = cellWidth(text) + 2;
    out.push({ x: r.x + 1 + Math.floor((r.width - 2 - w) / 2), y: r.y, text: ` ${text} ` });
  }
  const last = Math.min(pen.grid.row(b.box.y + b.head), r.y + r.height - 2);
  const rest = [...linesOf(b.type), ...linesOf(b.descr)];
  out.push(...centred(pen, r, fit(rest, last - r.y, r.width - 4, pen.ellipsis), r.y + 1));
  return out;
}

/** An element's text, centred where the layout centres it, inside its border. */
function elementText(pen: Pen, e: C4ElementLayout): Written[] {
  const r = pen.grid.rect(e.box);
  const parts = [e.name, e.type, e.descr].filter((l): l is PlacedLabel => l !== undefined);
  const lines = fit(parts.flatMap(linesOf), r.height - 2, r.width - 4, pen.ellipsis);
  const first = parts[0]!;
  const end = parts[parts.length - 1]!;
  const middle = (pen.grid.row(first.y) + pen.grid.row(end.y + end.height)) / 2;
  const top = clamp(
    Math.round(middle - lines.length / 2),
    r.y + 1,
    r.y + r.height - 1 - lines.length
  );
  return centred(pen, r, lines, top);
}

/** The title's lines, centred where the layout centres it. */
function titleText(pen: Pen, title: PlacedLabel | undefined): Written[] {
  if (!title) return [];
  const row = pen.grid.row(title.y);
  const centre = pen.grid.col(title.x + title.width / 2);
  return linesOf(title).map((text, k) => ({
    x: Math.max(0, centre - Math.floor(cellWidth(text) / 2)),
    y: row + k,
    text,
  }));
}

/** Marks every cell a text covers. */
function cover(set: CellSet, texts: readonly Written[]): void {
  for (const t of texts) {
    // Measured once: `cellWidth` reads the whole text (#689).
    const width = cellWidth(t.text);
    for (let i = 0; i < width; i++) set.add(t.x + i, t.y);
  }
}

/**
 * The way a line goes into its shape at `end`: square into the side of `box` the end is nearest
 * (the outline meets the box there, or comes nearest it on a curve); on a tie, the way the end
 * points (the larger part of its unit vector). A line going `d` meets the side facing `-d`.
 */
function into(end: C4RelationEnd, box: Rect): Dir {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const gap = (d: Dir): number =>
    DX[d] !== 0
      ? Math.abs(end.x - (cx - (DX[d] * box.width) / 2))
      : Math.abs(end.y - (cy - (DY[d] * box.height) / 2));
  const least = Math.min(...DIRS.map(gap));
  const near = DIRS.filter((d) => gap(d) - least < 1e-6);
  const level = Math.abs(end.dx) >= Math.abs(end.dy);
  const pointed = DIRS.find((d) =>
    level ? DX[d] === Math.sign(end.dx) && DX[d] !== 0 : DY[d] === Math.sign(end.dy) && DY[d] !== 0
  );
  return pointed !== undefined && near.includes(pointed) ? pointed : near[0]!;
}

/**
 * The cell outside `r` on the side a line going `d` meets (the side facing `-d`), level with `p`
 * along that side and inside its ends.
 */
function outside(r: CellRect, d: Dir, p: Cell): Cell {
  const x = clamp(Math.round(p.x), r.x + 1, r.x + r.width - 2);
  const y = clamp(Math.round(p.y), r.y + 1, r.y + r.height - 2);
  // `r.x - 1` going right, `r.x + width` going left; the same down the rows.
  const across = (from: number, size: number, step: number): number =>
    from + (size - 1 - step * (size + 1)) / 2;
  return {
    x: DX[d] === 0 ? x : across(r.x, r.width, DX[d]),
    y: DY[d] === 0 ? y : across(r.y, r.height, DY[d]),
  };
}

/** A relation's end: its shape's px box, and its cells. */
interface EndBox {
  readonly px: Rect;
  readonly cells: CellRect;
}

/** A relation's route request: its end cells, the ways into its shapes, its routed points. */
function requestOf(pen: Pen, rel: C4RelationLayout, from: EndBox, to: EndBox): RouteRequest {
  const { grid } = pen;
  const points = rel.points.map((p) => grid.at(p.x, p.y));
  const startInto = into(rel.start, from.px);
  const endInto = into(rel.end, to.px);
  const start = outside(from.cells, startInto, points[0]!);
  let end = outside(to.cells, endInto, points[points.length - 1]!);
  // A self-loop's ends a row apart at the least, its controls in the guide.
  if (rel.route === 'loop' && end.x === start.x && end.y === start.y) {
    const below = start.y + 1 < to.cells.y + to.cells.height - 1;
    end = { x: end.x, y: below ? start.y + 1 : start.y - 1 };
  }
  const controls = (rel.controls ?? []).map((c) => grid.at(c.x, c.y));
  const guide =
    controls.length === 2
      ? [points[0]!, controls[0]!, controls[1]!, points[points.length - 1]!]
      : points;
  return { start, startInto, end, endInto, guide };
}

/** Draws a line's glyphs (not its heads), merging with what is drawn: frames, other lines. */
function drawLine(pen: Pen, line: Line): void {
  const { canvas, glyphs } = pen;
  const { cells, rel, startInto, endInto } = line;
  cells.forEach((c, k) => {
    let arms = 0;
    if (k > 0) arms |= armOf(dirOf(c, cells[k - 1]!), 1);
    if (k + 1 < cells.length) arms |= armOf(dirOf(c, cells[k + 1]!), 1);
    // An end without an arrowhead reaches into its side, which then shows a tee.
    if (k === 0 && !rel.startArrow) arms |= armOf(startInto, 1);
    if (k + 1 === cells.length && !rel.endArrow) arms |= armOf(endInto, 1);
    const glyph = glyphFor(arms, glyphs);
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
}

/** A line's ends: arrowheads on their cells, a tee on the side where an end has none. */
function drawEnds(pen: Pen, line: Line): void {
  const { canvas, glyphs, labelBlocks } = pen;
  const ends = [
    { c: line.cells[0]!, d: line.startInto, arrow: line.rel.startArrow },
    { c: line.cells[line.cells.length - 1]!, d: line.endInto, arrow: line.rel.endArrow },
  ];
  for (const { c, d, arrow } of ends) {
    if (arrow) {
      canvas.set(c.x, c.y, sideOf(glyphs.head, d));
      labelBlocks.add(c.x, c.y);
    } else {
      const tee = glyphFor(armOf(opposite(d), 1), glyphs);
      if (tee) canvas.draw(c.x + DX[d], c.y + DY[d], tee);
    }
  }
}

/** A placed relation label: its relation and its cells. */
export interface PlacedText extends CellRect {
  readonly ast: string;
  /** No place near its line was clear of frames: it covers some. */
  readonly crowded?: boolean;
}

/** Where a line's own label may go over it: every cell but its ends and turns. */
function straightCells(cells: readonly Cell[]): CellSet {
  const out = new CellSet();
  cells.forEach((c, k) => {
    if (k === 0 || k + 1 === cells.length) return;
    if (dirOf(cells[k - 1]!, c) === dirOf(c, cells[k + 1]!)) out.add(c.x, c.y);
  });
  return out;
}

/** The places for a `w` × `h` block `gap` cells from `c` (over it at 0), the centred ones first. */
function blocksAt(c: Cell, w: number, h: number, gap: number): Cell[] {
  const out: Cell[] = [];
  for (let y = c.y - h + 1 - gap; y <= c.y + gap; y++)
    for (let x = c.x - w + 1 - gap; x <= c.x + gap; x++) {
      const dx = Math.max(x - c.x, c.x - (x + w - 1), 0);
      const dy = Math.max(y - c.y, c.y - (y + h - 1), 0);
      if (Math.max(dx, dy) === gap) out.push({ x, y });
    }
  const centre = { x: c.x - Math.floor(w / 2), y: c.y - Math.floor((h - 1) / 2) };
  const off = (p: Cell): number => Math.abs(p.x - centre.x) + Math.abs(p.y - centre.y);
  return out.sort((a, b) => off(a) - off(b) || a.y - b.y || a.x - b.x);
}

/** `lines` wrapped at `width` cells at word breaks; a word wider is cut with `ellipsis`. */
function wrapped(lines: readonly string[], width: number, ellipsis: string): string[] {
  const out: string[] = [];
  for (const line of lines) {
    let row = '';
    for (const word of line.split(/\s+/).filter((w) => w !== '')) {
      const next = row === '' ? word : `${row} ${word}`;
      if (cellWidth(next) <= width) row = next;
      else {
        if (row !== '') out.push(row);
        row = cut(word, width, ellipsis);
      }
    }
    out.push(row);
  }
  return out;
}

/** A label's widths to try: its own, then narrower, each about a sixth less, down to `least`. */
function labelWidths(natural: number, least: number): number[] {
  const out = [natural];
  for (let w = natural; w > least; ) {
    w = Math.max(least, Math.min(w - 1, Math.floor((w * 5) / 6)));
    out.push(w);
  }
  return out;
}

/**
 * The first place for a block over or beside a cell of `near` that `fits`, nearer first.
 * `places` is the block's places `gap` cells from the cell (0, 0), in `blocksAt`'s order: the
 * same from every cell, so they are listed and sorted once for all of `near`.
 */
function firstPlace(
  near: readonly Cell[],
  places: (gap: number) => readonly Cell[],
  fits: (at: Cell) => boolean
): Cell | undefined {
  for (let gap = 0; gap <= LABEL_BESIDE; gap++)
    for (const c of near)
      for (const p of places(gap)) {
        const at = { x: c.x + p.x, y: c.y + p.y };
        if (fits(at)) return at;
      }
  return undefined;
}

/** What a label must stay clear of, by tier: 2 label blocks; 1 frames too; 0 other lines too. */
type Marked = (x: number, y: number) => boolean;

/**
 * Whether a `w` × `h` block at a place by a cell of `near` is clear of `marked[t]` for every
 * tier `t` from `tier` up, and on the canvas. Each tier's cells are counted once (`BlockCounts`)
 * over every cell such a block can cover, when a place first asks: a place is then a few reads,
 * not a scan of its cells, which every other place of the block would scan again (#689).
 */
function clearance(
  near: readonly Cell[],
  w: number,
  h: number,
  marked: readonly Marked[]
): (at: Cell, tier: number) => boolean {
  const xs = near.map((c) => c.x);
  const ys = near.map((c) => c.y);
  const x = Math.max(0, Math.min(...xs) - w + 1 - LABEL_BESIDE);
  const y = Math.max(0, Math.min(...ys) - h + 1 - LABEL_BESIDE);
  const region = {
    x,
    y,
    width: Math.max(0, Math.max(...xs) + LABEL_BESIDE + w - x),
    height: Math.max(0, Math.max(...ys) + LABEL_BESIDE + h - y),
  };
  const counts: BlockCounts[] = [];
  return (at, tier) => {
    if (at.x < 0 || at.y < 0) return false;
    for (let t = marked.length - 1; t >= tier; t--) {
      counts[t] ??= new BlockCounts(region, marked[t]!);
      if (counts[t]!.count(at.x, at.y, w, h) > 0) return false;
    }
    return true;
  };
}

/**
 * Where a relation's label goes (pitfall 20), with the lines it is drawn as: over or beside (up
 * to `LABEL_BESIDE` cells off) a cell of its line within `LABEL_ALONG` cells of the middle, nearer
 * first, covering no label block (boxes, arrowheads, header text, labels), no frame and no other
 * line, only its own straight cells; else the same over other lines; else wrapped narrower (a
 * label wider than the gap between two shapes stays by its line), each width tried both ways,
 * its words whole first, then its longest cut. Wrapped only with `pen.wrap` (the root `wrap`
 * true, #683); without it each line stays one line, cut narrower instead. Each
 * place tried is charged to the drawing's budget; once spent, a label sits over the middle. With no such place it is `crowded`: the same
 * places over frames too, else over the middle cell, whatever is there.
 */
function placeLabel(
  pen: Pen,
  line: Line,
  others: CellSet,
  text: readonly string[]
): { at: Cell; lines: string[]; crowded: boolean } {
  const { cells } = line;
  const own = straightCells(cells);
  const mid = Math.floor((cells.length - 1) / 2);
  const near: Cell[] = [];
  for (let k = 0; k <= LABEL_ALONG; k++)
    for (const i of k === 0 ? [mid] : [mid - k, mid + k])
      if (i >= 0 && i < cells.length) near.push(cells[i]!);
  /** 0: clear of frames and other lines; 1: of frames; 2: of label blocks only. */
  const marked: Marked[] = [
    (x, y) => others.has(x, y) && !own.has(x, y),
    (x, y) => pen.frameCells.has(x, y),
    (x, y) => pen.labelBlocks.has(x, y),
  ];
  const natural = Math.max(...text.map(cellWidth));
  const word = Math.max(...text.flatMap((t) => t.split(/\s+/)).map(cellWidth));
  // Wrapped narrower only when the layout's text may wrap (the root `wrap` true); else
  // each line stays one line, cut with the ellipsis as the last way to stay clear by its line.
  const whole = pen.wrap ? labelWidths(natural, Math.max(LABEL_LEAST, word)) : [natural];
  const least = pen.wrap ? word : natural;
  // Narrower than its longest word (or its own width): cut, as a last way to stay clear.
  const cutWords = least > LABEL_LEAST ? labelWidths(least - 1, LABEL_LEAST) : [];
  const linesAt = (width: number): string[] => {
    if (width === natural) return [...text];
    return pen.wrap
      ? wrapped(text, width, pen.ellipsis)
      : text.map((t) => cut(t, width, pen.ellipsis));
  };
  const phases: [readonly number[], readonly number[]][] = [
    [whole, [0, 1]],
    [cutWords, [0, 1]],
    [[...whole, ...cutWords], [2]],
  ];
  for (const [widths, tiers] of phases)
    for (const width of widths) {
      if (pen.budget.done) break;
      const lines = linesAt(width);
      const w = Math.max(...lines.map(cellWidth)) + 2;
      const h = lines.length;
      const clear = clearance(near, w, h, marked);
      const sorted: Cell[][] = [];
      const places = (gap: number): Cell[] => (sorted[gap] ??= blocksAt({ x: 0, y: 0 }, w, h, gap));
      for (const tier of tiers) {
        const at = firstPlace(near, places, (p) => {
          pen.budget.charge(w * h);
          return clear(p, tier);
        });
        if (at) return { at, lines, crowded: tier === 2 };
      }
    }
  const m = cells[mid]!;
  const at = {
    x: Math.max(0, m.x - Math.floor((natural + 2) / 2)),
    y: Math.max(0, m.y - Math.floor((text.length - 1) / 2)),
  };
  return { at, lines: [...text], crowded: true };
}

/** A relation's label and `[techn]`, a space either side, where `placeLabel` puts it. */
function relationLabel(pen: Pen, line: Line, lineCells: CellSet): PlacedText | undefined {
  const text = [...linesOf(line.rel.label), ...linesOf(line.rel.techn)];
  if (text.length === 0) return undefined;
  const { at, lines, crowded } = placeLabel(pen, line, lineCells, text);
  const width = Math.max(...lines.map(cellWidth)) + 2;
  const height = lines.length;
  const { canvas, labelBlocks } = pen;
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      canvas.set(at.x + i, at.y + j, ' ');
      labelBlocks.add(at.x + i, at.y + j);
    }
  lines.forEach((t, k) =>
    drawText(canvas, at.x + 1 + Math.floor((width - 2 - cellWidth(t)) / 2), at.y + k, t)
  );
  return { ast: line.rel.ast, x: at.x, y: at.y, width, height, ...(crowded ? { crowded } : {}) };
}

/** A drawing: its text, where its first row and column were on the grid, and what it drew there. */
export interface C4Drawing {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  /** Each relation's cells, from start to end, in the text's cells. */
  readonly lines: readonly { readonly ast: string; readonly cells: readonly Cell[] }[];
  /** Each relation label's cells, in the text's cells. */
  readonly labels: readonly PlacedText[];
  /** The boundaries' header text and the title, in the text's cells. */
  readonly headers: readonly CellRect[];
}

/** A px box of `layout` in the cells `drawC4` draws it on, before the margin is trimmed. */
export function c4CellRect(layout: C4Layout, r: Rect): CellRect {
  return new Grid(layout).rect(r);
}

/** The cells the router may use: everything drawn and its ends, `ROUTE_MARGIN` round. */
function routeBounds(rects: readonly CellRect[], cells: readonly Cell[]): CellRect {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  for (const c of cells) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + 1);
    y1 = Math.max(y1, c.y + 1);
  }
  const x = Math.max(0, x0 - ROUTE_MARGIN);
  const y = Math.max(0, y0 - ROUTE_MARGIN);
  return { x, y, width: x1 + ROUTE_MARGIN - x, height: y1 + ROUTE_MARGIN - y };
}

/**
 * Draws a layout laid out on the cell profile: `\n` line ends, no trailing spaces, the empty
 * margin round the drawing trimmed. An empty diagram is the empty string.
 */
export function drawC4(layout: C4Layout, glyphs: GlyphSet, budget = ROUTE_BUDGET): C4Drawing {
  const grid = new Grid(layout);
  const pen: Pen = {
    budget: new RouteBudget(budget),
    wrap: layout.labelsWrap === true,
    canvas: new Canvas(),
    glyphs,
    grid,
    ellipsis: glyphs.name === 'ascii' ? '...' : '…',
    labelBlocks: new CellSet(),
    frameCells: new CellSet(),
  };
  const { canvas, labelBlocks } = pen;
  const field: RouteField = {
    blocked: new CellSet(),
    ends: new CellSet(),
    frameLevel: new CellSet(),
    frameUpright: new CellSet(),
    level: new CellSet(),
    upright: new CellSet(),
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  };

  const frames = layout.boundaries.map((b) => grid.rect(b.box));
  layout.boundaries.forEach((b, k) => {
    const r = frames[k]!;
    drawFrame(pen, r, b.nodeKind === undefined);
    pen.frameCells.border(r);
    const right = r.x + r.width - 1;
    const bottom = r.y + r.height - 1;
    for (let i = r.x + 1; i < right; i++) {
      field.frameLevel.add(i, r.y);
      field.frameLevel.add(i, bottom);
    }
    for (let j = r.y + 1; j < bottom; j++) {
      field.frameUpright.add(r.x, j);
      field.frameUpright.add(right, j);
    }
    for (const [x, y] of [
      [r.x, r.y],
      [right, r.y],
      [r.x, bottom],
      [right, bottom],
    ] as const)
      field.blocked.add(x, y);
  });
  const shapes = layout.elements.map((e) => grid.rect(e.box));
  for (const r of shapes) field.blocked.rect(r);
  const headers = [
    ...layout.boundaries.flatMap((b) => headerText(pen, b)),
    ...titleText(pen, layout.title),
  ];
  cover(field.blocked, headers);
  cover(labelBlocks, headers);

  // v12 `getC4Shape`: a relation's end is an element first, then a boundary.
  const endBox = (box: Rect): EndBox => ({ px: box, cells: grid.rect(box) });
  const boundaryBoxes = new Map<string, EndBox>();
  for (const b of layout.boundaries)
    if (!boundaryBoxes.has(b.alias)) boundaryBoxes.set(b.alias, endBox(b.box));
  const elementBoxes = new Map<string, EndBox>();
  for (const e of layout.elements)
    if (!elementBoxes.has(e.alias)) elementBoxes.set(e.alias, endBox(e.box));
  const boxOf = (alias: string): EndBox | undefined =>
    elementBoxes.get(alias) ?? boundaryBoxes.get(alias);
  const requests: { rel: C4RelationLayout; req: RouteRequest }[] = [];
  for (const rel of layout.relations) {
    const from = boxOf(rel.from);
    const to = boxOf(rel.to);
    if (from && to) requests.push({ rel, req: requestOf(pen, rel, from, to) });
  }
  for (const { req } of requests) {
    field.ends.add(req.start.x, req.start.y);
    field.ends.add(req.end.x, req.end.y);
  }
  const bounds = routeBounds(
    [...frames, ...shapes],
    requests.flatMap(({ req }) => [
      req.start,
      req.end,
      ...req.guide.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    ])
  );
  const routing: RouteField = { ...field, bounds };
  const lineCells = new CellSet();
  const lines: Line[] = requests.map(({ rel, req }) => {
    const cells = routeLine(req, routing, pen.budget);
    cells.forEach((c, k) => {
      const prev = cells[k - 1];
      const next = cells[k + 1];
      for (const n of [prev, next])
        if (n) (n.y === c.y ? field.level : field.upright).add(c.x, c.y);
      lineCells.add(c.x, c.y);
    });
    return { rel, cells, startInto: req.startInto, endInto: req.endInto };
  });
  for (const line of lines) drawLine(pen, line);

  for (const r of shapes) {
    for (let j = r.y; j < r.y + r.height; j++)
      for (let i = r.x; i < r.x + r.width; i++) canvas.set(i, j, ' ');
    labelBlocks.rect(r);
  }
  layout.elements.forEach((e, k) => drawBox(canvas, glyphs, shapes[k]!, FORMS[e.shape]));
  for (const line of lines) drawEnds(pen, line);
  for (const t of [...headers, ...layout.elements.flatMap((e) => elementText(pen, e))])
    drawText(canvas, t.x, t.y, t.text);

  const labels = lines.flatMap((line) => relationLabel(pen, line, lineCells) ?? []);
  const { text, left, top } = trimmed(canvas);
  const shift = <T extends Cell>(c: T): T => ({ ...c, x: c.x - left, y: c.y - top });
  return {
    text,
    left,
    top,
    lines: lines.map((l) => ({ ast: l.rel.ast, cells: l.cells.map(shift) })),
    labels: labels.map(shift),
    headers: headers.map((h) => shift({ x: h.x, y: h.y, width: cellWidth(h.text), height: 1 })),
  };
}

/** The canvas as text without its empty margin, and where that text starts. */
function trimmed(canvas: Canvas): { text: string; left: number; top: number } {
  let lines = canvas.toString().split('\n');
  let top = 0;
  while (lines.length > 0 && lines[0] === '') {
    lines.shift();
    top++;
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const margin = Math.min(...lines.filter((l) => l !== '').map((l) => l.search(/\S/)));
  const left = margin > 0 && Number.isFinite(margin) ? margin : 0;
  if (left > 0) lines = lines.map((l) => l.slice(left));
  return { text: lines.join('\n'), left, top };
}
