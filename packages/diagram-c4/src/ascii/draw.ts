// Draws a C4 layout laid out for the grid (`C4Layout.cell`, #545, D459) onto the text grid: the
// px layout divided by the cell size, every edge rounded to the nearest cell. In order:
//
// 1. boundaries: dashed frames, deployment nodes solid ones (as the SVG draws them);
// 2. relations: stepped lines from the cell outside one end's side to the cell outside the
//    other's, through the routed corners; each leg leaves and reaches its side square on;
// 3. elements: boxes over the lines (a line under a box is hidden, never cut through it), in the
//    flowchart's text form of their shape: rounded corners for `rounded` and `person`, caps for
//    the cylinder, double sides for `fr-rect`, square for the queue;
// 4. arrowheads on the cell outside the side they point into, and a tee on the side where a
//    line without one leaves;
// 5. text: a boundary's label in its top border (`┌╌ Label ╌┐`), its `[type]` and description
//    on the rows below; an element's name, `[Kind]` and description centred inside; the title;
// 6. each relation's label and `[techn]`, a space either side, at the middle of its line: the
//    path cell nearest the middle where it covers no box, frame, arrowhead, line end or turn,
//    header or other label (pitfall 20), else the nearest free place about it.
//
// A line wider than its room is cut with `…` (`...` in the ascii charset). Glyphs come from core
// (`armOf`, `glyphFor`, `sideOf`, pitfall 21). The empty margin round the drawing is trimmed.
import {
  armOf,
  Canvas,
  cellWidth,
  DOWN,
  DX,
  DY,
  drawBox,
  drawText,
  glyphFor,
  graphemes,
  LEFT,
  opposite,
  RIGHT,
  sideOf,
  UP,
  type BoxOptions,
  type CellRect,
  type Dir,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
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

/** The cell size a layout without `cell` is read at: the cell profile's. */
const CELL = { x: 8, y: 16 } as const;

/** A self-loop's reach past its side, in cells, at the least. */
const LOOP_REACH = 2;

/** How far about a label's middle a free place is looked for, in cells. */
const SEARCH = 24;

/**
 * The most places tried, nearest the middle first: for a straight line's middle leg, and for a
 * label along its line. Bounds the work on a large diagram (R-SEC-5).
 */
const STEP_TRIES = 48;
const LABEL_TRIES = 256;

/** Each shape's box options (flowchart's text forms; the queue has none, a square box). */
const FORMS: Readonly<Record<C4ShapeId, BoxOptions>> = {
  person: { form: 'rounded' },
  rounded: { form: 'rounded' },
  cyl: { form: 'caps' },
  'h-cyl': {},
  'fr-rect': { form: 'double-side' },
};

interface Cell {
  readonly x: number;
  readonly y: number;
}

/** The layout's px on the cell grid. */
class Grid {
  constructor(
    private readonly sx: number,
    private readonly sy: number
  ) {}

  col(x: number): number {
    return Math.round(x / this.sx);
  }

  row(y: number): number {
    return Math.round(y / this.sy);
  }

  /** A px point in cells, unrounded. */
  at(x: number, y: number): Cell {
    return { x: x / this.sx, y: y / this.sy };
  }

  /** A box's cells, its border included; each edge on its nearest cell boundary. */
  rect(r: Rect): CellRect {
    const x = this.col(r.x);
    const y = this.row(r.y);
    return {
      x,
      y,
      width: Math.max(2, this.col(r.x + r.width) - x),
      height: Math.max(2, this.row(r.y + r.height) - y),
    };
  }
}

/** The cells nothing else may be drawn over: boxes, frames, arrowheads, headers and labels. */
class Taken {
  private readonly cells = new Set<number>();

  private static key(x: number, y: number): number {
    return y * 0x100000 + x;
  }

  add(x: number, y: number): void {
    this.cells.add(Taken.key(x, y));
  }

  rect(r: CellRect): void {
    for (let j = r.y; j < r.y + r.height; j++)
      for (let i = r.x; i < r.x + r.width; i++) this.add(i, j);
  }

  border(r: CellRect): void {
    const right = r.x + r.width - 1;
    const bottom = r.y + r.height - 1;
    for (let i = r.x; i <= right; i++) {
      this.add(i, r.y);
      this.add(i, bottom);
    }
    for (let j = r.y; j <= bottom; j++) {
      this.add(r.x, j);
      this.add(right, j);
    }
  }

  has(x: number, y: number): boolean {
    return this.cells.has(Taken.key(x, y));
  }

  /** Whether the `w` × `h` cells from (x, y) are on the canvas and free. */
  free(x: number, y: number, w: number, h: number): boolean {
    if (x < 0 || y < 0) return false;
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.cells.has(Taken.key(i, j))) return false;
    return true;
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A label's lines as written text. */
const linesOf = (label: PlacedLabel | undefined): string[] =>
  label ? label.text.lines.map((runs) => runs.map((r) => r.text).join('')) : [];

/**
 * `text` in at most `width` cells: cut with `ell` when it is wider, or when `force` (the last of
 * the lines that fit, more following).
 */
function cut(text: string, width: number, ell: string, force = false): string {
  if (width <= 0) return '';
  if (!force && cellWidth(text) <= width) return text;
  const ellW = cellWidth(ell);
  const room = ellW <= width ? width - ellW : width;
  let out = '';
  let w = 0;
  for (const g of graphemes(text)) {
    if (w + g.width > room) break;
    out += g.text;
    w += g.width;
  }
  return ellW <= width ? out.trimEnd() + ell : out;
}

/** What drawing reads. */
interface Pen {
  readonly canvas: Canvas;
  readonly glyphs: GlyphSet;
  readonly grid: Grid;
  readonly taken: Taken;
  readonly ell: string;
  /** What a stepped line should keep off: the elements' cells, the frames', the lines drawn. */
  readonly avoid: { readonly shapes: Taken; readonly frames: Taken; readonly lines: Taken };
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
  pen.taken.border(r);
}

/** Writes `lines` centred across `r` from row `top`, each cut to the room inside its border. */
function centred(pen: Pen, r: CellRect, lines: readonly string[], top: number): void {
  lines.forEach((line, k) => {
    const text = cut(line, r.width - 4, pen.ell);
    drawText(pen.canvas, r.x + Math.floor((r.width - cellWidth(text)) / 2), top + k, text);
  });
}

/** `lines` cut to `rows`, the last one shown with `ell` when some are left out. */
function fit(lines: readonly string[], rows: number, width: number, ell: string): string[] {
  if (lines.length <= rows) return [...lines];
  const kept = lines.slice(0, Math.max(0, rows));
  if (kept.length > 0) kept[kept.length - 1] = cut(kept[kept.length - 1]!, width, ell, true);
  return kept;
}

/** A boundary's text: its label in its top border, `[type]` and the description below it. */
function boundaryText(pen: Pen, b: C4BoundaryLayout): void {
  const r = pen.grid.rect(b.box);
  const label = linesOf(b.label).join(' ').trim();
  if (label !== '' && r.width >= 5) {
    const text = cut(label, r.width - 4, pen.ell);
    const w = cellWidth(text) + 2;
    const x = r.x + 1 + Math.floor((r.width - 2 - w) / 2);
    pen.canvas.set(x, r.y, ' ');
    drawText(pen.canvas, x + 1, r.y, text);
    pen.canvas.set(x + w - 1, r.y, ' ');
  }
  // The header's rows: below the border, above the contents (the layout's `head`).
  const last = Math.min(pen.grid.row(b.box.y + b.head), r.y + r.height - 2);
  const lines = fit([...linesOf(b.type), ...linesOf(b.descr)], last - r.y, r.width - 4, pen.ell);
  centred(pen, r, lines, r.y + 1);
  for (let k = 0; k < lines.length; k++)
    for (let i = r.x; i < r.x + r.width; i++) pen.taken.add(i, r.y + 1 + k);
}

/** An element's text, centred where the layout centres it, inside its border. */
function elementText(pen: Pen, e: C4ElementLayout): void {
  const r = pen.grid.rect(e.box);
  const parts = [e.name, e.type, e.descr].filter((l): l is PlacedLabel => l !== undefined);
  const lines = fit(parts.flatMap(linesOf), r.height - 2, r.width - 4, pen.ell);
  const first = parts[0]!;
  const end = parts[parts.length - 1]!;
  const middle = (pen.grid.row(first.y) + pen.grid.row(end.y + end.height)) / 2;
  const top = clamp(
    Math.round(middle - lines.length / 2),
    r.y + 1,
    r.y + r.height - 1 - lines.length
  );
  centred(pen, r, lines, top);
}

/** The way from `a` to the neighbouring cell `b`. */
function dirOf(a: Cell, b: Cell): Dir {
  if (b.x > a.x) return RIGHT;
  if (b.x < a.x) return LEFT;
  return b.y > a.y ? DOWN : UP;
}

const across = (d: Dir): boolean => d === LEFT || d === RIGHT;

/**
 * The way a line goes into its shape at `end`: square into the side of `box` the end is nearest
 * (the outline meets the box there, or comes nearest it on a curve); on a tie, the way the end
 * points (the larger part of its unit vector).
 */
function into(end: C4RelationEnd, box: Rect): Dir {
  const gaps: [number, Dir][] = [
    [Math.abs(end.x - box.x), RIGHT],
    [Math.abs(box.x + box.width - end.x), LEFT],
    [Math.abs(end.y - box.y), DOWN],
    [Math.abs(box.y + box.height - end.y), UP],
  ];
  const least = Math.min(...gaps.map(([g]) => g));
  const sideways: Dir = end.dx > 0 ? RIGHT : LEFT;
  const down: Dir = end.dy > 0 ? DOWN : UP;
  const pointed = Math.abs(end.dx) >= Math.abs(end.dy) ? sideways : down;
  const near = gaps.filter(([g]) => g - least < 1e-6).map(([, d]) => d);
  return near.includes(pointed) ? pointed : near[0]!;
}

/** The cell outside `r` on the side a line going `d` meets, level with `p` (inside the side). */
function outside(r: CellRect, d: Dir, p: Cell): Cell {
  const x = clamp(Math.round(p.x), r.x + 1, r.x + r.width - 2);
  const y = clamp(Math.round(p.y), r.y + 1, r.y + r.height - 2);
  if (d === RIGHT) return { x: r.x - 1, y };
  if (d === LEFT) return { x: r.x + r.width, y };
  if (d === DOWN) return { x, y: r.y - 1 };
  return { x, y: r.y + r.height };
}

/** `m` moved no nearer the shape than `s`, along the way `d` leads into it. */
function behind(m: Cell, s: Cell, d: Dir): Cell {
  if (d === RIGHT) return { x: Math.min(m.x, s.x), y: m.y };
  if (d === LEFT) return { x: Math.max(m.x, s.x), y: m.y };
  if (d === DOWN) return { x: m.x, y: Math.min(m.y, s.y) };
  return { x: m.x, y: Math.max(m.y, s.y) };
}

const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

function deduped(points: readonly Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const p of points) if (out.length === 0 || !same(out[out.length - 1]!, p)) out.push(p);
  return out;
}

/**
 * The corners from `s` to `e` through `mids`, every leg level or upright: the first leg leaves
 * square to the start's side (`sIn` points into that shape), the last reaches the end's square.
 */
function corners(
  s: Cell,
  sIn: Dir,
  mids: readonly Cell[],
  e: Cell,
  eIn: Dir,
  cost: (points: readonly Cell[]) => number
): Cell[] {
  const inner = mids.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y) }));
  if (inner.length > 0) {
    inner[0] = behind(inner[0]!, s, opposite(sIn));
    inner[inner.length - 1] = behind(inner[inner.length - 1]!, e, eIn);
  }
  const pts = deduped([s, ...inner, e]);
  const out: Cell[] = [pts[0]!];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (a.x !== b.x && a.y !== b.y) {
      const first = i === 0;
      const last = i + 2 === pts.length;
      if (first && last) out.push(...stepped(a, sIn, b, eIn, cost));
      else if (first) out.push(across(sIn) ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      else if (last) out.push(across(eIn) ? { x: a.x, y: b.y } : { x: b.x, y: a.y });
      else out.push({ x: b.x, y: a.y });
    }
    out.push(b);
  }
  return deduped(out);
}

/**
 * The inner corners of a straight relation stepped from `a` to `b`, each end square to its side:
 * a Z (both ends level, or both upright) with its middle leg where the steps cost least
 * (nearest the middle on a tie), or the one L that fits a level and an upright end. Diagonal
 * lines run clear of the shapes in px, so a step through a shape is the step's fault: the cost
 * counts the shapes', frames' and other lines' cells it covers (`lineCost`).
 */
function stepped(
  a: Cell,
  sIn: Dir,
  b: Cell,
  eIn: Dir,
  cost: (points: readonly Cell[]) => number
): Cell[] {
  if (across(sIn) !== across(eIn)) return [across(sIn) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }];
  const level = across(sIn);
  const [lo, hi] = level ? [a.x, b.x] : [a.y, b.y];
  const middle = (lo + hi) / 2;
  const leg = (m: number): Cell[] =>
    level
      ? [
          { x: m, y: a.y },
          { x: m, y: b.y },
        ]
      : [
          { x: a.x, y: m },
          { x: b.x, y: m },
        ];
  const centre = Math.round(middle);
  let best = leg(centre);
  let bestCost = cost([a, ...best, b]);
  // The middle leg strictly between the ends (so each end's leg leaves its side), nearest the
  // middle first: the first that costs least wins.
  const [min, max] = [Math.min(lo, hi) + 1, Math.max(lo, hi) - 1];
  for (let k = 1, tried = 0; bestCost > 0 && tried < STEP_TRIES && k <= max - min + 1; k++)
    for (const m of [centre - k, centre + k]) {
      if (m < min || m > max || bestCost === 0) continue;
      tried++;
      const c = cost([a, ...leg(m), b]);
      if (c < bestCost) {
        best = leg(m);
        bestCost = c;
      }
    }
  return best;
}

/** Every cell along `points`, in order. */
function cellsAlong(points: readonly Cell[]): Cell[] {
  const out: Cell[] = [points[0]!];
  for (let i = 0; i + 1 < points.length; i++) {
    const b = points[i + 1]!;
    let c = out[out.length - 1]!;
    while (!same(c, b)) {
      const d = dirOf(c, b);
      c = { x: c.x + DX[d], y: c.y + DY[d] };
      out.push(c);
    }
  }
  return out;
}

/** A relation on the grid: its cells from start to end, and the way each end points into its shape. */
interface Line {
  readonly rel: C4RelationLayout;
  readonly cells: readonly Cell[];
  readonly sIn: Dir;
  readonly eIn: Dir;
}

/** What `points` stepped through cost: shapes' cells most, then other lines', then frames'. */
function lineCost(pen: Pen, points: readonly Cell[]): number {
  const { shapes, frames, lines } = pen.avoid;
  const cells = cellsAlong(points);
  let cost = 0;
  for (let k = 1; k + 1 < cells.length; k++) {
    const { x, y } = cells[k]!;
    if (shapes.has(x, y)) cost += 100;
    else if (lines.has(x, y)) cost += 2;
    else if (frames.has(x, y)) cost += 1;
  }
  return cost;
}

/** A relation's end: its shape's px box, and its cells. */
interface EndBox {
  readonly px: Rect;
  readonly cells: CellRect;
}

/** The relation's cells: outside its start's side, through its routed corners, to outside its end's. */
function lineOf(pen: Pen, rel: C4RelationLayout, fromBox: EndBox, toBox: EndBox): Line {
  const { grid } = pen;
  const from = fromBox.cells;
  const to = toBox.cells;
  const pts = rel.points.map((p) => grid.at(p.x, p.y));
  const sIn = into(rel.start, fromBox.px);
  const eIn = into(rel.end, toBox.px);
  const s = outside(from, sIn, pts[0]!);
  let e = outside(to, eIn, pts[pts.length - 1]!);
  let mids = pts.slice(1, -1);
  if (rel.route === 'loop') {
    // Out from the side and back, a row apart at the least.
    if (e.y === s.y) e = { x: e.x, y: s.y + 1 < to.y + to.height - 1 ? s.y + 1 : s.y - 1 };
    const control = Math.max(...(rel.controls ?? []).map((c) => grid.col(c.x)), s.x);
    const reach = Math.max(control, s.x + LOOP_REACH);
    mids = [
      { x: reach, y: s.y },
      { x: reach, y: e.y },
    ];
  }
  const cost = (points: readonly Cell[]): number => lineCost(pen, points);
  const cells = cellsAlong(corners(s, sIn, mids, e, eIn, cost));
  for (const c of cells) pen.avoid.lines.add(c.x, c.y);
  return { rel, cells, sIn, eIn };
}

/** Draws a line's glyphs (not its heads), merging with what is drawn: frames, other lines. */
function drawLine(pen: Pen, line: Line): void {
  const { canvas, glyphs } = pen;
  const { cells, rel, sIn, eIn } = line;
  cells.forEach((c, k) => {
    let arms = 0;
    if (k > 0) arms |= armOf(dirOf(c, cells[k - 1]!), 1);
    if (k + 1 < cells.length) arms |= armOf(dirOf(c, cells[k + 1]!), 1);
    // An end without an arrowhead reaches into its side, which then shows a tee.
    if (k === 0 && !rel.startArrow) arms |= armOf(sIn, 1);
    if (k + 1 === cells.length && !rel.endArrow) arms |= armOf(eIn, 1);
    const glyph = glyphFor(arms, glyphs);
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
}

/** A line's ends: arrowheads on their cells, a tee on the side where an end has none. */
function drawEnds(pen: Pen, line: Line): void {
  const { canvas, glyphs, taken } = pen;
  const ends = [
    { c: line.cells[0]!, d: line.sIn, arrow: line.rel.startArrow },
    { c: line.cells[line.cells.length - 1]!, d: line.eIn, arrow: line.rel.endArrow },
  ];
  for (const { c, d, arrow } of ends) {
    if (arrow) {
      canvas.set(c.x, c.y, sideOf(glyphs.head, d));
      taken.add(c.x, c.y);
    } else {
      const tee = glyphFor(armOf(opposite(d), 1), glyphs);
      if (tee) canvas.draw(c.x + DX[d], c.y + DY[d], tee);
    }
  }
}

/** Keeps labels off a line's ends and corners, so each line still reads where it turns. */
function keepTurns(pen: Pen, { cells }: Line): void {
  cells.forEach((c, k) => {
    const turn =
      k === 0 || k + 1 === cells.length || dirOf(cells[k - 1]!, c) !== dirOf(c, cells[k + 1]!);
    if (turn) pen.taken.add(c.x, c.y);
  });
}

/** The label block's top-left corner when it sits at `c` on its line. */
const anchor = (c: Cell, w: number, h: number): Cell => ({
  x: c.x - Math.floor(w / 2),
  y: c.y - Math.floor((h - 1) / 2),
});

/** Where a `w` × `h` label goes: on its line nearest the middle, else about it, else below all. */
function labelSpot(
  pen: Pen,
  cells: readonly Cell[],
  w: number,
  h: number,
  below: (h: number) => number
): Cell {
  const { taken } = pen;
  const mid = Math.floor((cells.length - 1) / 2);
  const order = cells
    .map((_, k) => k)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b)
    .slice(0, LABEL_TRIES);
  for (const k of order) {
    const at = anchor(cells[k]!, w, h);
    if (taken.free(at.x, at.y, w, h)) return at;
  }
  const centre = anchor(cells[mid]!, w, h);
  for (let r = 1; r <= SEARCH; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (taken.free(centre.x + dx, centre.y + dy, w, h))
          return { x: centre.x + dx, y: centre.y + dy };
      }
  return { x: Math.max(0, centre.x), y: below(h) };
}

/** A relation's label and `[techn]`, a space either side, where `labelSpot` finds room. */
function relationLabel(pen: Pen, line: Line, below: (h: number) => number): void {
  const lines = [...linesOf(line.rel.label), ...linesOf(line.rel.techn)];
  if (lines.length === 0) return;
  const w = Math.max(...lines.map(cellWidth)) + 2;
  const h = lines.length;
  const at = labelSpot(pen, line.cells, w, h, below);
  const { canvas, taken } = pen;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      canvas.set(at.x + i, at.y + j, ' ');
      taken.add(at.x + i, at.y + j);
    }
  lines.forEach((text, k) =>
    drawText(canvas, at.x + 1 + Math.floor((w - 2 - cellWidth(text)) / 2), at.y + k, text)
  );
}

/** A drawing: its text, and the cell of the layout's grid its first row and column were. */
export interface C4Drawing {
  readonly text: string;
  readonly left: number;
  readonly top: number;
}

/** A px box of `layout` in the cells `drawC4` draws it on, before the margin is trimmed. */
export function c4CellRect(layout: C4Layout, r: Rect): CellRect {
  const cell = layout.cell ?? CELL;
  return new Grid(cell.x, cell.y).rect(r);
}

/**
 * Draws a layout laid out for the grid: `\n` line ends, no trailing spaces, the empty margin
 * round the drawing trimmed. An empty diagram is the empty string.
 */
export function drawC4(layout: C4Layout, glyphs: GlyphSet): C4Drawing {
  const cell = layout.cell ?? CELL;
  const pen: Pen = {
    canvas: new Canvas(),
    glyphs,
    grid: new Grid(cell.x, cell.y),
    taken: new Taken(),
    ell: glyphs.name === 'ascii' ? '...' : '…',
    avoid: { shapes: new Taken(), frames: new Taken(), lines: new Taken() },
  };
  const { canvas, grid, taken } = pen;
  for (const b of layout.boundaries) {
    const r = grid.rect(b.box);
    drawFrame(pen, r, b.nodeKind === undefined);
    pen.avoid.frames.border(r);
  }
  for (const e of layout.elements) pen.avoid.shapes.rect(grid.rect(e.box));

  // v12 `getC4Shape`: a relation's end is an element first, then a boundary.
  const endBox = (box: Rect): EndBox => ({ px: box, cells: grid.rect(box) });
  const boxes = new Map<string, EndBox>();
  for (const b of layout.boundaries) if (!boxes.has(b.alias)) boxes.set(b.alias, endBox(b.box));
  const elementBoxes = new Map<string, EndBox>();
  for (const e of layout.elements)
    if (!elementBoxes.has(e.alias)) elementBoxes.set(e.alias, endBox(e.box));
  const boxOf = (alias: string): EndBox | undefined => elementBoxes.get(alias) ?? boxes.get(alias);
  const lines: Line[] = [];
  for (const rel of layout.relations) {
    const from = boxOf(rel.from);
    const to = boxOf(rel.to);
    if (from && to) lines.push(lineOf(pen, rel, from, to));
  }
  for (const line of lines) drawLine(pen, line);

  for (const e of layout.elements) {
    const r = grid.rect(e.box);
    for (let j = r.y; j < r.y + r.height; j++)
      for (let i = r.x; i < r.x + r.width; i++) canvas.set(i, j, ' ');
    drawBox(canvas, glyphs, r, FORMS[e.shape]);
    taken.rect(r);
  }
  for (const line of lines) {
    drawEnds(pen, line);
    keepTurns(pen, line);
  }

  for (const b of layout.boundaries) boundaryText(pen, b);
  for (const e of layout.elements) elementText(pen, e);
  if (layout.title) {
    const t = layout.title;
    const row = grid.row(t.y);
    const centre = grid.col(t.x + t.width / 2);
    linesOf(t).forEach((text, k) => {
      const w = cellWidth(text);
      const x = Math.max(0, centre - Math.floor(w / 2));
      drawText(canvas, x, row + k, text);
      for (let i = x; i < x + w; i++) taken.add(i, row + k);
    });
  }

  // A label with no room near its line goes below everything, each on its own rows.
  let next = canvas.rows + 1;
  const below = (h: number): number => {
    const top = next;
    next += h + 1;
    return top;
  };
  for (const line of lines) relationLabel(pen, line, below);
  return trimmed(canvas);
}

/** The canvas as text without its empty margin, and where that text starts. */
function trimmed(canvas: Canvas): C4Drawing {
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
