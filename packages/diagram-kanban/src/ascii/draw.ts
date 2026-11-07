// Draws a kanban layout computed in cells onto the text grid (#466, D76, D82): each column a box
// with its title on the top border (`┌─ Todo ─┐`, as flowchart groups), its cards boxes inside,
// and every label last so no border cuts through text. A card's priority is its left edge: heavy
// for Very High and High, dashed for Low and Very Low, and in the `ascii` charset a tag on the
// card's top border (`+- !! ---+`), since `I` and `:` alone do not tell the four apart.
import {
  armOf,
  Canvas,
  DOWN,
  drawBox,
  drawText,
  glyphFor,
  RIGHT,
  UP,
  type CellRect,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { KanbanLayout, KanbanPriority, PlacedLabel, Rect } from '../layout/index.ts';

/** The tag a priority puts on a card's top border in the `ascii` charset. */
export const PRIORITY_TAGS: Readonly<Record<KanbanPriority, string>> = {
  'Very High': '!!',
  High: '!',
  Low: '-',
  'Very Low': '--',
};

const HEAVY: ReadonlySet<KanbanPriority> = new Set(['Very High', 'High']);

/** Layout units to a text cell: the layout is in whole cells from its bounds' corner. */
const at = (v: number, origin: number): number => Math.floor(v - origin + 1e-9);

function cellRect(r: Rect, layout: KanbanLayout): CellRect {
  const x = at(r.x, layout.bounds.x);
  const y = at(r.y, layout.bounds.y);
  return {
    x,
    y,
    width: at(r.x + r.width, layout.bounds.x) - x,
    height: at(r.y + r.height, layout.bounds.y) - y,
  };
}

/**
 * Writes a label's lines from its top-left cell, each at its indent. `centre` centres each line
 * in `width` cells instead (a column title), unless the label is a list, which stays a block.
 */
function writeLabel(
  canvas: Canvas,
  label: PlacedLabel,
  x: number,
  y: number,
  glyphs: GlyphSet,
  centre?: number
): void {
  const { text } = label;
  text.lines.forEach((runs, i) => {
    let line = runs.map((r) => r.text).join('');
    // Only a list item's own marker: a bullet written in the text stays as written.
    if (glyphs.name === 'ascii' && text.left) line = line.replace(/^(\s*)[•◦]/, '$1-');
    const indent = text.indents[i] ?? 0;
    const lineX =
      centre === undefined || text.left
        ? x + indent
        : x + Math.floor((centre - (text.widths[i] ?? 0)) / 2);
    drawText(canvas, lineX, y + i, line);
  });
}

/** A card's left edge in its priority's stroke, corners included. */
function priorityEdge(
  canvas: Canvas,
  glyphs: GlyphSet,
  r: CellRect,
  priority: KanbanPriority
): void {
  const heavy = HEAVY.has(priority);
  const bottom = r.y + r.height - 1;
  const side = heavy ? glyphs.thick.v : glyphs.dotted.v;
  for (let j = r.y + 1; j < bottom; j++) canvas.set(r.x, j, side);
  if (heavy && glyphs.name === 'unicode') {
    canvas.set(r.x, r.y, glyphFor(armOf(DOWN, 2) | armOf(RIGHT, 1), glyphs) as string);
    canvas.set(r.x, bottom, glyphFor(armOf(UP, 2) | armOf(RIGHT, 1), glyphs) as string);
  }
  if (glyphs.name !== 'ascii') return;
  // On the top border, a rule and a space before it and a space after where the card has room.
  const tag = PRIORITY_TAGS[priority];
  if (r.width >= tag.length + 6) drawText(canvas, r.x + 2, r.y, ` ${tag} `);
  else if (r.width >= tag.length + 2) drawText(canvas, r.x + 1, r.y, tag);
}

/**
 * Draws a cell layout: `\n` line ends, no trailing spaces, the empty margin around the drawing
 * trimmed. An empty board is the empty string.
 */
export function drawKanban(layout: KanbanLayout, glyphs: GlyphSet): string {
  const canvas = new Canvas();
  const ox = layout.bounds.x;
  const oy = layout.bounds.y;
  for (const column of layout.columns) drawBox(canvas, glyphs, cellRect(column, layout));
  for (const card of layout.cards) {
    const r = cellRect(card, layout);
    drawBox(canvas, glyphs, r);
    if (card.bar) priorityEdge(canvas, glyphs, r, card.bar.priority);
  }
  for (const column of layout.columns) {
    if (!column.title) continue;
    const r = cellRect(column, layout);
    const y = at(column.title.y, oy);
    // A space either side of the first line, where it sits on the border (`┌─ Todo ─┐`).
    const first = column.title.text.widths[0] ?? 0;
    const x = column.title.text.left
      ? at(column.title.x, ox)
      : r.x + Math.floor((r.width - first) / 2);
    if (y === r.y) {
      canvas.set(x - 1, y, ' ');
      canvas.set(x + first, y, ' ');
    }
    if (column.title.text.left) writeLabel(canvas, column.title, x, y, glyphs);
    else writeLabel(canvas, column.title, r.x, y, glyphs, r.width);
  }
  for (const card of layout.cards)
    for (const label of [card.title, card.ticket, card.assignee])
      if (label) writeLabel(canvas, label, at(label.x, ox), at(label.y, oy), glyphs);
  return trimmed(canvas);
}

/** The canvas as text without its empty margin. */
function trimmed(canvas: Canvas): string {
  let lines = canvas.toString().split('\n');
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const margin = Math.min(...lines.filter((l) => l !== '').map((l) => l.search(/\S/)));
  if (margin > 0 && Number.isFinite(margin)) lines = lines.map((l) => l.slice(margin));
  return lines.join('\n');
}
