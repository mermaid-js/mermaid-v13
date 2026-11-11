/**
 * What the text renderers of the graph diagrams (flowchart, agentflow, ER) share (DESIGN §6.3,
 * D76): group frames with their titles, edge labels, a label centred in its box, and whether a
 * line ends on a group's frame. How a label is written is the diagram's (a parameter).
 */
import { type Canvas, type CellRect, drawBox, type GlyphSet } from '@mermaid-js/core/ascii';
import type { LayoutModel, Point } from '@mermaid-js/core/layout';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import { cellRect, writeLabel } from './diagram.ts';

/** Writes a label's lines in a `width`-cell-wide block from (x, y). */
export type LabelWriter = (
  canvas: Canvas,
  label: MeasuredLabel,
  x: number,
  y: number,
  width: number
) => void;

/** {@link writeLabel} with a list item's marker as the glyph set has it (ASCII has no `•`). */
export const listWriter =
  (glyphs: GlyphSet): LabelWriter =>
  (canvas, label, x, y, width) =>
    writeLabel(canvas, label, x, y, width, glyphs.name === 'ascii' ? '-' : undefined);

/** What a frame or an edge label is drawn from. */
interface Labelled {
  readonly id: string;
  readonly label: MeasuredLabel;
}

/**
 * Draws each group's frame, in the order given (outermost first), its title on the top border.
 * Returns the cell either side of each title, for {@link clearGaps}.
 */
export function drawFrames(
  canvas: Canvas,
  glyphs: GlyphSet,
  groups: readonly Labelled[],
  layout: LayoutModel,
  write: LabelWriter
): Point[] {
  const gaps: Point[] = [];
  for (const g of groups) {
    const box = layout.groups.get(g.id);
    if (!box) continue;
    drawBox(canvas, glyphs, cellRect(box));
    if (g.label.width === 0) continue;
    // The repair router walled these cells off: round(x − w/2 + ½) from the title's centre.
    const at = cellRect({
      ...box.title,
      width: g.label.width,
      height: Math.max(g.label.height, 1),
    });
    write(canvas, g.label, at.x, at.y, at.width);
    gaps.push({ x: at.x - 1, y: at.y }, { x: at.x + at.width, y: at.y });
  }
  return gaps;
}

/** A space either side of a title, where the border is still plain (`┌─ one ───┐`). */
export function clearGaps(canvas: Canvas, glyphs: GlyphSet, gaps: readonly Point[]): void {
  for (const { x, y } of gaps) if (canvas.get(x, y) === glyphs.solid.h) canvas.set(x, y, ' ');
}

/** Writes each edge's label where the layout put it, over a blank patch a cell wider each side. */
export function drawEdgeLabels(
  canvas: Canvas,
  edges: readonly Labelled[],
  layout: LayoutModel,
  write: LabelWriter
): void {
  for (const e of edges) {
    const at = layout.edges.get(e.id)?.label;
    if (!at || e.label.width === 0) continue;
    const r = cellRect({ ...at, width: e.label.width, height: Math.max(e.label.height, 1) });
    // The patch around the text is the edge's own (repair keeps other lines out of it).
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x - 1; x <= r.x + r.width; x++) canvas.set(x, y, ' ');
    write(canvas, e.label, r.x, r.y, r.width);
  }
}

/** Writes a label inside the border of box `r`; a box grown past its label keeps it centred (D140). */
export function writeBoxLabel(
  canvas: Canvas,
  label: MeasuredLabel,
  r: CellRect,
  write: LabelWriter
): void {
  const top = r.y + Math.floor((r.height - label.lines.length) / 2);
  write(canvas, label, r.x + 1, top, r.width - 2);
}

/**
 * Whether a line's end is on the frame of the group it ends at: an edge between a group and its
 * own member. The line already joins the border there, so there is no tee to add, and it
 * reaches the frame from inside the group, so a marker there points the other way.
 */
export function onFrame(
  layout: LayoutModel,
  end: { readonly at: string; readonly cell: Point }
): boolean {
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
}
