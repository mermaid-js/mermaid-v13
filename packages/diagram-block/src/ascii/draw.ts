// Draws the block text grid (D449): composite frames outermost first with their label on the
// top border (`┌─ Group ─┐`), leaf boxes in their shape's text form, block arrows as boxes with
// an arrowhead on each pointing side, then the edges as stepped lines (`route.ts`) with tees
// where they leave a box and their arrowheads, circles or crosses next to it, and last the edge
// labels, on their own line where it runs straight and has room, else on free cells beside it,
// never on a frame or a box (pitfall 20). Glyphs come from core's text-grid kit (`armOf`,
// `sideOf`, `glyphFor`, `junction`, pitfall 21).
import {
  armOf,
  Canvas,
  cellWidth,
  drawBox,
  drawText,
  DX,
  DY,
  DOWN,
  glyphFor,
  junction,
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
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { InlineSpans } from '@mermaid-js/core/text';
import type { BlockArrowType, BlockModel, BlockType } from '../model.ts';
import { blockTextGrid, cut, textLabel, type BlockText, type TextBox } from './grid.ts';
import { BLOCK_TEXT_METRICS, type TextSpacing } from './metrics.ts';
import { Board, Cell, route, Use, type EndSpec, type Point, type Route } from './route.ts';

/** The text form of each block type that has one (D82's table, as flowchart's). */
const FORMS: Partial<Record<BlockType, (g: GlyphSet) => BoxOptions>> = {
  na: () => ({}),
  square: () => ({}),
  round: () => ({ form: 'rounded' }),
  circle: () => ({ form: 'rounded' }),
  stadium: () => ({ form: 'rounded' }),
  diamond: (g) => {
    const m = g.name === 'unicode' ? '◇' : '*';
    return { marks: { top: m, right: m, bottom: m, left: m } };
  },
  hexagon: () => ({ marks: { left: '<', right: '>' } }),
  subroutine: () => ({ form: 'double-side' }),
  cylinder: () => ({ form: 'caps' }),
};

/** Whether `type` has a text form of its own; the others are plain boxes (`ASCII_SHAPE`). */
export const hasTextForm = (type: BlockType): boolean =>
  type === 'block_arrow' || type === 'composite' || FORMS[type] !== undefined;

/** The sides a block arrow points to (v12's directions: `x` both across, `y` both down). */
function pointing(directions: readonly string[] | undefined): Dir[] {
  const out = new Set<Dir>();
  for (const d of directions ?? []) {
    if (d === 'right' || d === 'x') out.add(RIGHT);
    if (d === 'left' || d === 'x') out.add(LEFT);
    if (d === 'up' || d === 'y') out.add(UP);
    if (d === 'down' || d === 'y') out.add(DOWN);
  }
  return [...out];
}

/** The box side of each direction (`Dir`: up, right, down, left). */
const MARK_SIDE = ['top', 'right', 'bottom', 'left'] as const;

/** The sides a self-loop is tried on, in order: two sides next to each other, then one. */
const LOOP_SIDES: readonly (readonly [Dir, Dir])[] = [
  [UP, RIGHT],
  [RIGHT, DOWN],
  [DOWN, LEFT],
  [LEFT, UP],
  [UP, DOWN],
  [RIGHT, LEFT],
  [UP, UP],
  [DOWN, DOWN],
  [LEFT, LEFT],
  [RIGHT, RIGHT],
];

function formOf(box: TextBox, directions: readonly string[] | undefined, g: GlyphSet): BoxOptions {
  if (box.type === 'block_arrow') {
    const marks: NonNullable<BoxOptions['marks']> = {};
    for (const d of pointing(directions)) marks[MARK_SIDE[d]] = sideOf(g.head, d);
    return { marks };
  }
  return FORMS[box.type]?.(g) ?? {};
}

/** The cells of `r`'s side marks (where no line may leave the box). */
function markCells(r: CellRect, o: BoxOptions): Point[] {
  const midX = r.x + Math.floor((r.width - 1) / 2);
  const midY = r.y + Math.floor((r.height - 1) / 2);
  const m = o.marks ?? {};
  const out: Point[] = [];
  if (m.top) out.push({ x: midX, y: r.y });
  if (m.bottom) out.push({ x: midX, y: r.y + r.height - 1 });
  if (m.left) out.push({ x: r.x, y: midY });
  if (m.right) out.push({ x: r.x + r.width - 1, y: midY });
  return out;
}

const shift = (r: CellRect, by: number): CellRect => ({ ...r, x: r.x + by, y: r.y + by });

/** Where a frame's title sits on its top border, with the blank either side. */
function titleOf(r: CellRect, title: string): { x: number; width: number } | undefined {
  const w = cellWidth(title);
  if (w === 0) return undefined;
  return { x: r.x + Math.floor((r.width - w) / 2), width: w };
}

export interface DrawOptions {
  readonly glyphs: GlyphSet;
  readonly spacing: TextSpacing;
  readonly maxWidth?: number;
  readonly inline?: InlineSpans;
}

export interface Drawn {
  readonly text: string;
  /** The grid as drawn, in the text's cells before the margin is trimmed. */
  readonly grid: BlockText;
  /** Each drawn edge's route, by AST id, in grid cells (as `grid`'s boxes). */
  readonly routes: ReadonlyMap<AstId, Route>;
  /** Where grid cell (0, 0) is in `text`: the text's column and line (either may be negative). */
  readonly origin: Point;
  /** Edges no route was found for (`ASCII_ROUTE`). */
  readonly forced: readonly AstId[];
}

function ancestors(boxes: readonly TextBox[], i: number): Set<number> {
  const out = new Set<number>();
  for (let p = boxes[i]!.parent; p !== undefined; p = boxes[p]!.parent) out.add(p);
  return out;
}

function markerOf(type: BlockArrowType, into: Dir, g: GlyphSet): string | undefined {
  if (type === 'arrow_point') return sideOf(g.head, into);
  if (type === 'arrow_circle') return g.circle;
  if (type === 'arrow_cross') return g.cross;
  return undefined;
}

/** What every drawing step shares: the glyphs, the canvas, the router's board, the boxes. */
interface Scene {
  readonly glyphs: GlyphSet;
  readonly canvas: Canvas;
  readonly board: Board;
  readonly grid: BlockText;
  /** The boxes' rectangles on the board (the grid's, shifted by the margin around it). */
  readonly rects: readonly CellRect[];
  /** Per box, the border cells no line may meet: a block arrow's heads, a frame's title. */
  readonly marks: readonly Set<number>[];
}

interface Routed {
  readonly e: BlockModel['edges'][number];
  readonly k: number;
  readonly r: Route;
}

function directionsOf(model: BlockModel): Map<string, readonly string[] | undefined> {
  const out = new Map<string, readonly string[] | undefined>();
  const stack = [...model.blocks];
  while (stack.length > 0) {
    const b = stack.pop()!;
    if (b.type === 'block_arrow') out.set(b.id, b.directions);
    stack.push(...b.children);
  }
  return out;
}

/** A frame, its title on the top border with a blank either side. */
function drawFrame(sc: Scene, box: TextBox, i: number): void {
  const r = sc.rects[i]!;
  drawBox(sc.canvas, sc.glyphs, r);
  const label = box.lines[0] ?? '';
  const title = titleOf(r, label);
  sc.board.frame(r, title ? { x: title.x - 1, width: title.width + 2 } : undefined);
  if (!title) return;
  // No line meets a frame at its title.
  for (let x = title.x - 1; x <= title.x + title.width; x++) sc.marks[i]!.add(sc.board.at(x, r.y));
  sc.canvas.set(title.x - 1, r.y, ' ');
  drawText(sc.canvas, title.x, r.y, label);
  sc.canvas.set(title.x + title.width, r.y, ' ');
}

/** A leaf box in its shape's text form, its label centred. */
function drawLeaf(sc: Scene, box: TextBox, i: number, directions: readonly string[] | undefined) {
  const r = sc.rects[i]!;
  const form = formOf(box, directions, sc.glyphs);
  drawBox(sc.canvas, sc.glyphs, r, form);
  sc.board.wall(r);
  // A line may leave a diamond or a hexagon at a side mark, the tee replacing it (as
  // flowchart's), never a block arrow at its arrowhead.
  if (box.type === 'block_arrow')
    for (const p of markCells(r, form)) sc.marks[i]!.add(sc.board.at(p.x, p.y));
  const inner = r.width - 2;
  const top = r.y + 1 + Math.floor((r.height - 2 - box.lines.length) / 2);
  box.lines.forEach((line, k) =>
    drawText(sc.canvas, r.x + 1 + Math.floor((inner - cellWidth(line)) / 2), top + k, line)
  );
}

/** Routes every edge whose ends are drawn, in model order. */
function routeEdges(sc: Scene, model: BlockModel): { routed: Routed[]; forced: AstId[] } {
  const index = new Map(sc.grid.boxes.map((b, i) => [b.id, i]));
  const forced: AstId[] = [];
  const routed: Routed[] = [];
  model.edges.forEach((e, k) => {
    const s = index.get(e.start);
    const t = index.get(e.end);
    if (s === undefined || t === undefined) return;
    const loop = s === t;
    const end = (i: number, other: number, sides?: readonly Dir[]): EndSpec => ({
      rect: sc.rects[i]!,
      inside: !loop && ancestors(sc.grid.boxes, other).has(i),
      marks: sc.marks[i]!,
      ...(sides ? { sides } : {}),
    });
    // A self-loop leaves one side and comes back into the next one round, top and right first.
    const tries: [EndSpec, EndSpec][] = loop
      ? LOOP_SIDES.map(([a, b]) => [end(s, t, [a]), end(t, s, [b])])
      : [[end(s, t), end(t, s)]];
    const r = route(sc.board, k, tries);
    if (r.forced) forced.push(e.ast);
    if (r.cells.length > 0) routed.push({ e, k, r });
  });
  return { routed, forced };
}

function dirTo(a: Point, b: Point): Dir {
  if (b.x !== a.x) return b.x > a.x ? RIGHT : LEFT;
  return b.y > a.y ? DOWN : UP;
}

/** One edge's line, its tees and its end markers. */
function drawLine(sc: Scene, { e, r }: Routed): void {
  const { canvas, glyphs } = sc;
  const weight = e.thickness === 'thick' ? 2 : 1;
  const dotted = e.pattern === 'dotted';
  const last = r.cells.length - 1;
  const across = armOf(LEFT, weight) | armOf(RIGHT, weight);
  const down = armOf(UP, weight) | armOf(DOWN, weight);
  r.cells.forEach((c, i) => {
    let arms = 0;
    if (i > 0) arms |= armOf(dirTo(c, r.cells[i - 1]!), weight);
    if (i < last) arms |= armOf(dirTo(c, r.cells[i + 1]!), weight);
    if (i === 0) arms |= armOf(r.startInto, weight);
    if (i === last) arms |= armOf(r.endInto, weight);
    let glyph = glyphFor(arms, glyphs);
    if (dotted && arms === across) glyph = glyphs.dotted.h;
    if (dotted && arms === down) glyph = glyphs.dotted.v;
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
  // A tee where the line meets a border, unless a marker sits at that end.
  const tee = (c: Point, into: Dir): void => {
    const x = c.x + DX[into];
    const y = c.y + DY[into];
    const out = opposite(into);
    const stub = glyphFor(armOf(out, weight), glyphs)!;
    const merged = junction(canvas.get(x, y), stub);
    canvas.set(x, y, merged === stub ? sideOf(glyphs.tee, out) : merged);
  };
  const first = r.cells[0]!;
  const end = r.cells[last]!;
  const startMark = markerOf(e.arrowTypeStart, r.startInto, glyphs);
  const endMark = markerOf(e.arrowTypeEnd, r.endInto, glyphs);
  if (startMark && last > 0) canvas.set(first.x, first.y, startMark);
  else tee(first, r.startInto);
  if (endMark) canvas.set(end.x, end.y, endMark);
  else tee(end, r.endInto);
}

/** A candidate place for a label: its first cell and how far it is from the line's middle. */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly d: number;
}

/**
 * Edge labels, after every line: on the line where it runs straight with room, else on free
 * cells beside it, never on a frame, a box, another line or another label (pitfall 20).
 */
class Labels {
  private readonly labelled: Uint8Array;

  constructor(private readonly sc: Scene) {
    this.labelled = new Uint8Array(sc.board.width * sc.board.height);
  }

  /** A cell nothing is drawn on or reserved for. */
  private free(x: number, y: number): boolean {
    const { board, canvas } = this.sc;
    if (!board.inside(x, y)) return x >= 0 && y >= 0 && canvas.get(x, y) === ' ';
    const i = board.at(x, y);
    return (
      board.kind[i] === Cell.Free &&
      board.use[i] === Use.None &&
      this.labelled[i] === 0 &&
      canvas.get(x, y) === ' '
    );
  }

  /** A cell of edge `k`'s own straight run (`use`), not under a label. */
  private own(x: number, y: number, k: number, use: number): boolean {
    const { board } = this.sc;
    if (!board.inside(x, y)) return false;
    const i = board.at(x, y);
    return board.owner[i] === k + 1 && board.use[i] === use && this.labelled[i] === 0;
  }

  /** Whether `width` cells from `x` on row `y`, and a blank either side, are free but `skip`. */
  private fits(x: number, y: number, width: number, skip?: number): boolean {
    for (let j = x - 1; j <= x + width; j++) if (j !== skip && !this.free(j, y)) return false;
    return true;
  }

  /** On a straight run across: the text and a blank either side over the line. */
  private across(r: Route, k: number, width: number, mid: number, offer: (s: Spot) => void) {
    const cells = r.cells;
    for (let i = 1; i < cells.length - 1; ) {
      const c = cells[i]!;
      let j = i;
      while (j < cells.length - 1 && cells[j]!.y === c.y && this.own(cells[j]!.x, c.y, k, Use.H))
        j++;
      const n = j - i;
      if (n >= width + 2) {
        const left = Math.min(c.x, cells[j - 1]!.x);
        offer({
          x: left + 1 + Math.floor((n - width - 2) / 2),
          y: c.y,
          d: Math.abs((i + j - 1) / 2 - mid),
        });
      }
      i = Math.max(j, i + 1);
    }
  }

  /** Across a straight run down: the text over the line, on free cells either side. */
  private down(r: Route, k: number, width: number, mid: number, offer: (s: Spot) => void) {
    for (let i = 1; i < r.cells.length - 1; i++) {
      const c = r.cells[i]!;
      if (!this.own(c.x, c.y, k, Use.V)) continue;
      const x = c.x - Math.floor((width - 1) / 2);
      if (this.fits(x, c.y, width, c.x)) offer({ x, y: c.y, d: Math.abs(i - mid) + 0.5 });
    }
  }

  /** Beside the line: the nearest free run of cells to its middle. */
  private beside(m: Point, width: number, offer: (s: Spot) => void): void {
    const R = BLOCK_TEXT_METRICS.labelReach;
    for (let y = m.y - R; y <= m.y + R; y++)
      for (let x = m.x - R - width; x <= m.x + R; x++)
        if (this.fits(x, y, width))
          offer({ x, y, d: 1000 + Math.abs(y - m.y) + Math.abs(x + width / 2 - m.x) });
  }

  place({ k, r }: Routed, text: string): void {
    const width = cellWidth(text);
    if (width === 0) return;
    const mid = (r.cells.length - 1) / 2;
    let best: Spot | undefined;
    const offer = (s: Spot): void => {
      if (!best || s.d < best.d) best = s;
    };
    this.across(r, k, width, mid, offer);
    this.down(r, k, width, mid, offer);
    const m = r.cells[Math.floor(mid)]!;
    if (!best) this.beside(m, width, offer);
    // Nothing near: past the drawing's right edge, on the line's middle row.
    const at = best ?? { x: Math.max(this.sc.canvas.columns, this.sc.board.width) + 1, y: m.y };
    const { canvas, board } = this.sc;
    for (let j = at.x - 1; j <= at.x + width; j++) {
      canvas.set(j, at.y, ' ');
      if (board.inside(j, at.y)) this.labelled[board.at(j, at.y)] = 1;
    }
    drawText(canvas, at.x, at.y, text);
  }
}

/** Draws `model` on the text grid. */
export function drawBlock(model: BlockModel, options: DrawOptions): Drawn {
  const { glyphs, spacing } = options;
  const mark = glyphs.name === 'unicode' ? '…' : '~';
  const grid = blockTextGrid(model, {
    spacing,
    mark,
    ...(options.maxWidth !== undefined ? { maxWidth: options.maxWidth } : {}),
    ...(options.inline ? { inline: options.inline } : {}),
  });
  const T = BLOCK_TEXT_METRICS;
  const A = T.around + T.perEdge * Math.min(model.edges.length, T.edges);
  const sc: Scene = {
    glyphs,
    canvas: new Canvas(),
    board: new Board(grid.width + 2 * A, grid.height + 2 * A),
    grid,
    rects: grid.boxes.map((b) => shift(b.rect, A)),
    marks: grid.boxes.map(() => new Set<number>()),
  };
  const directions = directionsOf(model);
  // Pre-order: each frame before what is inside it.
  grid.boxes.forEach((box, i) =>
    box.frame ? drawFrame(sc, box, i) : drawLeaf(sc, box, i, directions.get(box.id))
  );
  const { routed, forced } = routeEdges(sc, model);
  for (const edge of routed) drawLine(sc, edge);
  const labels = new Labels(sc);
  for (const edge of routed) {
    if (edge.e.label === '') continue;
    const line = textLabel(edge.e.label, options.inline).lines.join(' ');
    labels.place(edge, cut(line, T.labelCap, mark));
  }

  const { text, top, left } = trimmed(sc.canvas);
  const back = (p: Point): Point => ({ x: p.x - A, y: p.y - A });
  const routes = new Map<AstId, Route>(
    routed.map(({ e, r }) => [e.ast, { ...r, cells: r.cells.map(back) }])
  );
  return { text, grid, routes, origin: { x: A - left, y: A - top }, forced };
}

/** The canvas as text without its empty margin, and how many lines and columns that took. */
function trimmed(canvas: Canvas): { text: string; top: number; left: number } {
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
  return { text: lines.join('\n'), top, left };
}
