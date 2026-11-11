// Draws an ER diagram laid out in cells onto the text grid (DESIGN §6.3, D76, D109): subgraph
// frames outermost first with the title on the top border, relationship lines (solid when
// identifying, dotted otherwise), their labels, entity tables, tees where lines leave a box,
// the crow's-foot marks at each end and the front-matter title on the first line.
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
import type { ErCardinality } from '../parser/index.ts';
import type { EdgeView, EntityView, ErPrepared } from '../layout/prepare.ts';
import {
  cellRect,
  cellsOf,
  clearGaps,
  drawEdgeLabels,
  drawFrames,
  drawLineCells,
  finish,
  onFrame,
  tee,
  writeBoxLabel,
  type LabelWriter,
} from '@mermaid-js/shared/ascii';

const textOf = (label: MeasuredLabel, line: number): string =>
  (label.lines[line] ?? []).map((r) => r.text).join('');

/** Writes a label's lines centred in a `width`-cell-wide block from (x, y). */
const writeCentred: LabelWriter = (canvas, label, x, y, width) => {
  label.lines.forEach((_, i) => {
    const w = label.widths[i] ?? 0;
    drawText(canvas, x + Math.floor((width - w) / 2), y + i, textOf(label, i));
  });
};

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
  drawLineCells(canvas, glyphs, cells, into.source, into.target, { dotted });
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
    writeBoxLabel(canvas, view.label, r, writeCentred);
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
  const gaps = drawFrames(canvas, glyphs, er.groups, layout, writeCentred);

  const ends: End[] = [];
  for (const e of er.edges) {
    const placed = layout.edges.get(e.id);
    const route = routes.get(e.id);
    if (!placed || !route) continue;
    drawLine(canvas, glyphs, e, route, placed.ports, ends);
  }
  clearGaps(canvas, glyphs, gaps);
  drawEdgeLabels(canvas, er.edges, layout, writeCentred);

  for (const view of er.entities) {
    const box = layout.nodes.get(view.id);
    if (box) drawEntity(canvas, glyphs, view, cellRect(box), options.pad);
  }

  // An end on a group's frame (a group's relationship to its own member) is reached from
  // inside the group: the line already joins the frame, and its marks face the other way.
  for (const end of ends) {
    const framed = onFrame(layout, end);
    if (!framed) tee(canvas, glyphs.tee, glyphs.name === 'unicode', end);
    const [near, far] = marks(glyphs, framed ? { ...end, into: opposite(end.into) } : end);
    canvas.set(end.cell.x, end.cell.y, near);
    if (far && end.before) canvas.set(end.before.x, end.before.y, far);
  }

  return finish(canvas, options.title, options.maxWidth);
}
