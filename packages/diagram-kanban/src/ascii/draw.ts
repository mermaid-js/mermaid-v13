// Draws a kanban layout computed in cells onto the text grid (#466, D76, D82): each column a box
// with its title on the top border (`┌─ Todo ─┐`, as flowchart groups), its cards boxes inside,
// and every label last so no border cuts through text. A card's priority is its left edge: heavy
// for Very High and High, dashed for Low and Very Low, and in the `ascii` charset a bracketed tag
// on the card's top border (`+-[!!]---+`), since `I` and `:` alone do not tell the four apart.
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
import type { KanbanLayout, PlacedLabel, Rect } from '../layout/index.ts';
import type { KanbanPriority } from '../priority.ts';

/** The tag a priority puts on a card's top border in the `ascii` charset, in brackets. */
const PRIORITY_TAGS: Readonly<Record<KanbanPriority, string>> = {
  'Very High': '!!',
  High: '!',
  Low: '-',
  'Very Low': '--',
};

const HEAVY: ReadonlySet<KanbanPriority> = new Set(['Very High', 'High']);

/** A box's corner and a border's rule are a cell each; so is the space beside a border title. */
const CORNER = 1;
const RULE = 1;
const BESIDE = 1;

/**
 * Every layout value in cells is a whole cell or a half (`W / 2` for an odd `W`) from the
 * bounds' corner, so `floor` is exact; the slack keeps a sum that comes out a hair under a whole
 * cell in floating point on that cell rather than the one before.
 */
const SLACK = 1e-9;

/** Layout units to a text cell, counted from the bounds' corner. */
const at = (v: number, origin: number): number => Math.floor(v - origin + SLACK);

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

/** How a label's lines sit in its box: from its left, against its right, or centred in `width`. */
type Align = 'left' | 'right' | { readonly centre: number };

/**
 * Writes a label's lines from its box's top-left cell, as `align` says. A list (bullets) stays a
 * left-aligned block at its indents whatever `align` is.
 */
function writeLabel(
  canvas: Canvas,
  label: PlacedLabel,
  x: number,
  y: number,
  glyphs: GlyphSet,
  align: Align
): void {
  const { text } = label;
  text.lines.forEach((runs, i) => {
    let line = runs.map((r) => r.text).join('');
    // Only a list item's own marker: a bullet written in the text stays as written.
    if (glyphs.name === 'ascii' && text.left) line = line.replace(/^(\s*)[•◦]/, '$1-');
    const width = text.widths[i] ?? 0;
    let lineX = x + (text.indents[i] ?? 0);
    if (!text.left && align === 'right') lineX = x + text.width - width;
    else if (!text.left && typeof align === 'object')
      lineX = x + Math.floor((align.centre - width) / 2);
    drawText(canvas, lineX, y + i, line);
  });
}

/** A card's left edge in its priority's stroke, corners included, and its `ascii` tag. */
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
  // `+-[!!]---+`: after the corner and a rule, with a rule and the corner still after it; on a
  // card too narrow for the rules, straight after the corner (`+[!!]+`).
  const tag = `[${PRIORITY_TAGS[priority]}]`;
  const room = r.width - 2 * CORNER;
  if (room >= tag.length + 2 * RULE) drawText(canvas, r.x + CORNER + RULE, r.y, tag);
  else if (room >= tag.length) drawText(canvas, r.x + CORNER, r.y, tag);
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
    const { title } = column;
    if (!title) continue;
    const r = cellRect(column, layout);
    const y = at(title.y, oy);
    const first = title.text.widths[0] ?? 0;
    const x = title.text.left ? at(title.x, ox) : r.x + Math.floor((r.width - first) / 2);
    // A space either side of the first line, where it sits on the border (`┌─ Todo ─┐`).
    if (y === r.y) {
      canvas.set(x - BESIDE, y, ' ');
      canvas.set(x + first, y, ' ');
    }
    if (title.text.left) writeLabel(canvas, title, x, y, glyphs, 'left');
    else writeLabel(canvas, title, r.x, y, glyphs, { centre: r.width });
  }
  for (const card of layout.cards)
    for (const [label, align] of [
      [card.title, 'left'],
      [card.ticket, 'left'],
      [card.assignee, 'right'],
    ] as const)
      if (label) writeLabel(canvas, label, at(label.x, ox), at(label.y, oy), glyphs, align);
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
