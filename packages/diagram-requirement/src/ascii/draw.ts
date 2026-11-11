// Draws a requirement diagram laid out in cells onto the text grid (#588, D438), after ER's
// (`diagram-er/src/ascii/draw.ts`, copied, not imported): relation lines (solid for
// `contains`, dotted for the rest) with their `<<kind>>` labels, the boxes with the kind and
// the name above a divider and the body lines below it, a tee where a line leaves a box, the
// `contains` mark at the source (`⊕`, `(+)` in ascii: {@link RequirementGlyphs}), the arrowhead
// at the target, and the front-matter title on the first line.
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
import type { Centred } from '@mermaid-js/shared/ascii';
import { cellRect } from '@mermaid-js/shared/ascii';
import { dirOf } from '@mermaid-js/shared/ascii';
import { cellsOf } from '@mermaid-js/shared/ascii';
import { wrapTitle } from '@mermaid-js/shared/ascii';
import { finish } from '@mermaid-js/shared/ascii';
import { tee } from '@mermaid-js/shared/ascii';
import { cut } from '@mermaid-js/shared/ascii';
import { drawLineCells } from '@mermaid-js/shared/ascii';

/** A charset's glyphs and requirement's own marks in it, picked once (`glyphsFor`, `../ascii.ts`). */
export interface RequirementGlyphs {
  readonly set: GlyphSet;
  /**
   * The last cell of a cut value (D438): `…`, or `~` in ascii (packet's precedent: core's glyph
   * sets have no ellipsis, and `ascii` stays pure ASCII).
   */
  readonly ellipsis: string;
  /** The `contains` mark: one cell (`⊕`) on the end cell, or wider (`(+)`) beside it. */
  readonly contains: string;
  /** Whether a tee joins what the border already has there (the unicode box glyphs do). */
  readonly joins: boolean;
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
  drawLineCells(canvas, glyphs, cells, into.source, into.target, { dotted });
  ends.push({ relation: r, cell: cells[0]!, into: into.source, source: true });
  ends.push({ relation: r, cell: cells[last]!, into: into.target, source: false });
}

/**
 * The `contains` mark on the end cell: one cell on it; a wider one (`(+)`) centred across a
 * vertical line and along a horizontal one, outwards from the box.
 */
function containsMark(canvas: Canvas, mark: string, end: End): void {
  const { x, y } = end.cell;
  const width = cellWidth(mark);
  if (width === 1) return void canvas.set(x, y, mark);
  if (end.into === UP || end.into === DOWN) {
    return void drawText(canvas, x - Math.floor(width / 2), y, mark);
  }
  drawText(canvas, end.into === RIGHT ? x - width + 1 : x, y, mark);
}

/**
 * A box: the outline, the kind and the name centred, and with a body the divider row and the
 * body lines, each line cut to its `cuts` cells with `mark`.
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
      const most = line.cuts?.[i];
      const shown = most === undefined ? text : cut(text, most, mark);
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
  marks: RequirementGlyphs,
  options: DrawOptions
): string {
  const canvas = new Canvas();
  const glyphs = marks.set;

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
    if (box) drawBoxView(canvas, glyphs, view, cellRect(box), marks.ellipsis);
  }

  for (const end of ends) {
    if (end.source) {
      tee(canvas, marks.set.tee, marks.joins, end);
      if (end.relation.marker === 'contains') containsMark(canvas, marks.contains, end);
    } else if (end.relation.marker === 'arrow') {
      canvas.set(end.cell.x, end.cell.y, sideOf(glyphs.head, end.into));
    }
  }

  return finish(canvas, options.title, options.maxWidth);
}
