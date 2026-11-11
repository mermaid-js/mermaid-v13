// Draws a usecase diagram laid out in cells onto the text grid (D478, DESIGN §6.3): boundary
// frames with the title on the top border, relationship and note lines (include, extend and note
// lines dotted), their labels, then the nodes: actors as a three-line figure with the labels
// under it, use cases as boxes whose label rows read `( label )` (`[ label ]` for rect), the
// oval's corners rounded, notes as boxes and JSON tables as
// key/value boxes; then each end's marker (a generalization's `▷`, `|>` in the `ascii`
// charset), tees where a line leaves a box, and the front-matter title on the first line.
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
  UP,
  type CellRect,
  type Dir,
  type GlyphSet,
  type Sides,
} from '@mermaid-js/core/ascii';
import type { LayoutModel, Point, Side } from '@mermaid-js/core/layout';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type {
  ActorView,
  JsonTableView,
  MarkerType,
  UsecaseEdgeView,
  UsecaseNodeView,
  UsecasePrepared,
  UseCaseView,
} from '../layout/prepare.ts';
import type { Centred } from '@mermaid-js/shared/ascii';
import { cellRect } from '@mermaid-js/shared/ascii';
import { dirOf } from '@mermaid-js/shared/ascii';
import { cellsOf } from '@mermaid-js/shared/ascii';
import { wrapTitle } from '@mermaid-js/shared/ascii';
import { finish } from '@mermaid-js/shared/ascii';
import { writeLabel } from '@mermaid-js/shared/ascii';
import { drawLineCells } from '@mermaid-js/shared/ascii';

/** The actor's figure (D478), the same in both charsets. */
const FIGURE = [' O ', '/|\\', '/ \\'] as const;

/** What usecase draws differently in each charset (D478), beside core's glyph set. */
interface UsecaseGlyphs {
  /**
   * A generalization's head, by the direction it points: the hollow triangle, or core's
   * arrowhead with a bar before it, across the line (`|>`), in the stroke the line runs in.
   */
  readonly triangle?: Sides;
  /** A Markdown list's bullet as written; undefined keeps the label's own. */
  readonly bullet?: string;
  /** Where a line leaves a box, the tee merges into a border junction already drawn there. */
  readonly mergeTees: boolean;
}

const USECASE_GLYPHS: Readonly<Record<GlyphSet['name'], UsecaseGlyphs>> = {
  unicode: { triangle: { up: '△', down: '▽', left: '◁', right: '▷' }, mergeTees: true },
  ascii: { bullet: '-', mergeTees: false },
};

interface End {
  /** The layout node the line ends at. */
  node: string;
  /** The end cell, next to the node. */
  cell: Point;
  /** The cell before it on the line, unless that is the other end's. */
  before?: Point;
  /** Direction from the end cell into its node. */
  into: Dir;
  marker: MarkerType;
  dotted: boolean;
}

function drawLine(
  canvas: Canvas,
  glyphs: GlyphSet,
  e: UsecaseEdgeView,
  route: readonly Point[],
  ports: { source: Side; target: Side },
  ends: End[]
): void {
  const cells = cellsOf(route);
  if (cells.length === 0) return;
  const dotted = e.dotted ? glyphs.dotted : undefined;
  const last = cells.length - 1;
  const into = { source: INTO[ports.source], target: INTO[ports.target] };
  drawLineCells(canvas, glyphs, cells, into.source, into.target, { dotted });
  // The cell before the end, where a two-cell head (`|>`) puts its bar: not the other end's.
  const end = (i: number, step: number, d: Dir, node: string, marker: MarkerType): End => {
    const b = cells[i + 2 * step] ? cells[i + step] : undefined;
    const cell = cells[i]!;
    return { node, cell, into: d, marker, dotted: e.dotted, ...(b ? { before: b } : {}) };
  };
  ends.push(end(0, 1, into.source, e.source, e.markers.start));
  ends.push(end(last, -1, into.target, e.target, e.markers.end));
}

/** The glyph an end's marker puts in its cell, if any. */
function markerGlyph(glyphs: GlyphSet, end: End): string | undefined {
  switch (end.marker) {
    case 'point':
      return sideOf(glyphs.head, end.into);
    case 'circle':
      return glyphs.circle;
    case 'cross':
      return glyphs.cross;
    case 'extension':
      return sideOf(USECASE_GLYPHS[glyphs.name].triangle ?? glyphs.head, end.into);
    case 'none':
      return undefined;
  }
}

/**
 * An end's marker. In the `ascii` charset a generalization is `|>` (`<|`; `-` over `v`, `^`
 * over `-` across a vertical line): the bar goes in the cell before the head, where the line
 * runs straight into it.
 */
function drawMarker(canvas: Canvas, glyphs: GlyphSet, end: End): void {
  const head = markerGlyph(glyphs, end);
  if (!head) return;
  canvas.set(end.cell.x, end.cell.y, head);
  const b = end.before;
  if (end.marker !== 'extension' || USECASE_GLYPHS[glyphs.name].triangle || !b) return;
  if (b.x + DX[end.into] !== end.cell.x || b.y + DY[end.into] !== end.cell.y) return;
  // Across the line: a bar of the stroke that runs the other way.
  canvas.set(b.x, b.y, end.into === LEFT || end.into === RIGHT ? glyphs.solid.v : glyphs.solid.h);
}

/**
 * The border glyph where a line leaves a box: a tee with its stem towards the line. A use case's
 * `(` or `)` (`[`, `]`) stays: the line ends next to it.
 */
function tee(canvas: Canvas, glyphs: GlyphSet, end: End): void {
  const x = end.cell.x + DX[end.into];
  const y = end.cell.y + DY[end.into];
  const was = canvas.get(x, y);
  if ('()[]'.includes(was)) return;
  const out = opposite(end.into);
  const fallback = sideOf(glyphs.tee, out);
  if (!USECASE_GLYPHS[glyphs.name].mergeTees) return void canvas.set(x, y, fallback);
  const stub = glyphFor(armOf(out, 1), glyphs)!;
  const merged = junction(was, stub);
  canvas.set(x, y, merged === stub ? fallback : merged);
}

/**
 * An end beside an actor, across: an actor has no border, and its box is as wide as its widest
 * label, so the line runs on through the blank cells of its row up to the figure or the label it
 * meets, and the end (its marker) moves there. A row with nothing drawn in the box keeps the end.
 */
function runOnToActor(canvas: Canvas, glyphs: GlyphSet, end: End, r: CellRect): End {
  if (end.into !== LEFT && end.into !== RIGHT) return end;
  const { y } = end.cell;
  let blank = true;
  for (let x = r.x; x < r.x + r.width && blank; x++) blank = canvas.get(x, y) === ' ';
  if (blank) return end;
  const dx = DX[end.into];
  const glyph = end.dotted ? glyphs.dotted.h : glyphs.solid.h;
  let cell = end.cell;
  let before = end.before;
  while (canvas.get(cell.x + dx, y) === ' ') {
    before = cell;
    cell = { x: cell.x + dx, y };
    canvas.set(cell.x, y, glyph);
  }
  return { ...end, cell, ...(before ? { before } : {}) };
}

/** Where a node's measured block starts in its laid-out box (D140: a grown box keeps it centred). */
const offsetIn = (r: CellRect, v: UsecaseNodeView): Point => ({
  x: r.x + Math.floor((r.width - v.width) / 2),
  y: r.y + Math.floor((r.height - v.height) / 2),
});

/** The figure, then the stereotype and the name under it, each centred on the box. */
function drawActor(canvas: Canvas, glyphs: GlyphSet, v: ActorView, r: CellRect): void {
  const at = offsetIn(r, v);
  // Rounded as the engine rounds a lone end on the box's middle.
  const figure = r.x + Math.round((r.width - FIGURE[0].length) / 2);
  FIGURE.forEach((row, i) => drawText(canvas, figure, at.y + v.glyphTop + i, row));
  if (v.stereotype)
    writeLabel(
      canvas,
      v.stereotype,
      r.x,
      at.y + v.stereotypeTop,
      r.width,
      USECASE_GLYPHS[glyphs.name].bullet
    );
  writeLabel(canvas, v.label, r.x, at.y + v.labelTop, r.width, USECASE_GLYPHS[glyphs.name].bullet);
}

/**
 * A use case: a box, rounded for an oval, whose label rows read `( label )` (`[ label ]` for a
 * rect); the stereotype over the label, the block centred inside.
 */
function drawUseCase(canvas: Canvas, glyphs: GlyphSet, v: UseCaseView, r: CellRect): void {
  const rect = v.shape === 'rect';
  drawBox(canvas, glyphs, r, rect ? {} : { form: 'rounded' });
  const top = r.y + Math.floor((r.height - v.block.height) / 2);
  const right = r.x + r.width - 1;
  for (let y = top; y < top + Math.max(v.block.height, 1); y++) {
    canvas.set(r.x, y, rect ? '[' : '(');
    canvas.set(right, y, rect ? ']' : ')');
  }
  let y = top;
  if (v.stereotype) {
    writeLabel(canvas, v.stereotype, r.x + 1, y, r.width - 2, USECASE_GLYPHS[glyphs.name].bullet);
    y += v.stereotype.height + v.stereotypeGap;
  }
  writeLabel(canvas, v.label, r.x + 1, y, r.width - 2, USECASE_GLYPHS[glyphs.name].bullet);
}

/**
 * A key/value box (as ER's tables): the id centred in the title band, a rule under it, a
 * divider between the key and the value column and one row per key, cell text `pad` cells in.
 */
function drawJson(
  canvas: Canvas,
  glyphs: GlyphSet,
  v: JsonTableView,
  r: CellRect,
  pad: number
): void {
  drawBox(canvas, glyphs, r);
  const right = r.x + r.width - 1;
  const bottom = r.y + r.height - 1;
  const top = r.y + Math.floor((r.height - v.height) / 2);
  const titleTop = top + v.border + Math.floor((v.titleHeight - v.title.height) / 2);
  writeLabel(canvas, v.title, r.x + 1, titleTop, r.width - 2, USECASE_GLYPHS[glyphs.name].bullet);
  if (v.rows.length === 0) return;
  const rule = top + v.border + v.titleHeight;
  // Stubs merged into what is drawn: the sides become tees, the divider crosses the rule.
  for (let x = r.x; x <= right; x++) {
    const arms = (x > r.x ? armOf(LEFT, 1) : 0) | (x < right ? armOf(RIGHT, 1) : 0);
    canvas.draw(x, rule, glyphFor(arms, glyphs)!);
  }
  const divider = r.x + v.border + v.keyWidth;
  for (let y = rule; y <= bottom; y++) {
    const arms = (y > rule ? armOf(UP, 1) : 0) | (y < bottom ? armOf(DOWN, 1) : 0);
    canvas.draw(divider, y, glyphFor(arms, glyphs)!);
  }
  for (const row of v.rows) {
    const y = top + row.top + Math.floor((row.height - Math.max(row.key.height, 1)) / 2);
    row.key.lines.forEach((runs, i) =>
      drawText(canvas, r.x + v.border + pad, y + i, runs.map((t) => t.text).join(''))
    );
    row.value.lines.forEach((runs, i) =>
      drawText(canvas, divider + 1 + pad, y + i, runs.map((t) => t.text).join(''))
    );
  }
}

function drawNode(
  canvas: Canvas,
  glyphs: GlyphSet,
  v: UsecaseNodeView,
  r: CellRect,
  pad: number
): void {
  switch (v.kind) {
    case 'actor':
      return drawActor(canvas, glyphs, v, r);
    case 'usecase':
      return drawUseCase(canvas, glyphs, v, r);
    case 'json':
      return drawJson(canvas, glyphs, v, r, pad);
    case 'note': {
      drawBox(canvas, glyphs, r);
      const top = r.y + Math.floor((r.height - v.label.height) / 2);
      return writeLabel(
        canvas,
        v.label,
        r.x + 1,
        top,
        r.width - 2,
        USECASE_GLYPHS[glyphs.name].bullet
      );
    }
  }
}

/**
 * A canvas shifted by (dx, dy): the layout may put a self-loop or its label left of or above
 * cell 0, which `Canvas` drops. `draw` goes through `get` and `set`, so it shifts once.
 */
class Shifted extends Canvas {
  constructor(
    private readonly dx: number,
    private readonly dy: number
  ) {
    super();
  }

  override get(x: number, y: number): string {
    return super.get(x + this.dx, y + this.dy);
  }

  override set(x: number, y: number, grapheme: string, width = 1): void {
    super.set(x + this.dx, y + this.dy, grapheme, width);
  }
}

/** How far the drawing reaches left of and above cell 0: frames, nodes, lines and labels. */
function overhang(
  prepared: UsecasePrepared,
  layout: LayoutModel,
  routes: ReadonlyMap<string, readonly Point[]>
): Point {
  let x = 0;
  let y = 0;
  const see = (r: CellRect): void => {
    x = Math.min(x, r.x);
    y = Math.min(y, r.y);
  };
  for (const b of [...layout.nodes.values(), ...layout.groups.values()]) see(cellRect(b));
  for (const route of routes.values()) for (const p of route) see({ ...p, width: 1, height: 1 });
  for (const e of prepared.edges) {
    const at = layout.edges.get(e.id)?.label;
    if (!at || e.kind !== 'relation' || !e.label) continue;
    const r = cellRect({ ...at, width: e.label.width, height: Math.max(e.label.height, 1) });
    see({ ...r, x: r.x - 1 });
  }
  return { x: -x, y: -y };
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
export function drawUsecase(
  prepared: UsecasePrepared,
  layout: LayoutModel,
  routes: ReadonlyMap<string, readonly Point[]>,
  glyphs: GlyphSet,
  options: DrawOptions
): string {
  const shift = overhang(prepared, layout, routes);
  const canvas = new Shifted(shift.x, shift.y);

  // A space either side of a title, where the border is still plain (`┌─ one ───┐`).
  const gaps: Point[] = [];
  for (const g of prepared.boundaries) {
    const box = layout.groups.get(g.id);
    if (!box) continue;
    drawBox(canvas, glyphs, cellRect(box));
    if (g.label.width === 0) continue;
    const at = cellRect({
      ...box.title,
      width: g.label.width,
      height: Math.max(g.label.height, 1),
    });
    writeLabel(canvas, g.label, at.x, at.y, at.width, USECASE_GLYPHS[glyphs.name].bullet);
    gaps.push({ x: at.x - 1, y: at.y }, { x: at.x + at.width, y: at.y });
  }

  const ends: End[] = [];
  for (const e of prepared.edges) {
    const placed = layout.edges.get(e.id);
    const route = routes.get(e.id);
    if (!placed || !route) continue;
    drawLine(canvas, glyphs, e, route, placed.ports, ends);
  }
  for (const { x, y } of gaps) if (canvas.get(x, y) === glyphs.solid.h) canvas.set(x, y, ' ');

  for (const e of prepared.edges) {
    const at = layout.edges.get(e.id)?.label;
    const label = e.kind === 'relation' ? e.label : undefined;
    if (!at || !label || label.width === 0) continue;
    const r = cellRect({ ...at, width: label.width, height: Math.max(label.height, 1) });
    // The patch around the text is the edge's own (repair keeps other lines out of it).
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x - 1; x <= r.x + r.width; x++) canvas.set(x, y, ' ');
    writeLabel(canvas, label, r.x, r.y, r.width, USECASE_GLYPHS[glyphs.name].bullet);
  }

  for (const v of prepared.nodes.values()) {
    const box = layout.nodes.get(v.id);
    if (box) drawNode(canvas, glyphs, v, cellRect(box), options.pad);
  }

  // An actor has no border for a line to leave through; the other nodes have one.
  for (const placed of ends) {
    const box = layout.nodes.get(placed.node);
    const actor = prepared.nodes.get(placed.node)?.kind === 'actor';
    const end = actor && box ? runOnToActor(canvas, glyphs, placed, cellRect(box)) : placed;
    if (end.marker !== 'none') drawMarker(canvas, glyphs, end);
    else if (!actor) tee(canvas, glyphs, end);
  }

  return finish(canvas, options.title, options.maxWidth);
}
