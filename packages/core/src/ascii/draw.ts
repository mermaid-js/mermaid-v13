// cspell:words Grooff
// Cell text and box drawing (DESIGN §6.3, D76, D82). Ported from mermaid-ascii's
// `drawTextCells`, `drawText` and `drawBox` (pkg/graph/draw.go at 5a9df15,
// https://github.com/AlexanderGrooff/mermaid-ascii, MIT, (c) 2023 Alexander Grooff).
// Changed: the box takes its rectangle instead of reading grid columns, draws the label-free
// frame only, merges its border with what is already drawn, and has the D82 forms.
import type { Canvas } from './canvas.ts';
import { glyphFor, type GlyphSet, type Stroke } from './glyphs.ts';
import { graphemes } from './measurer.ts';

/**
 * Writes `text` from (x, y), one row per line. Wide graphemes take two cells; a zero-width
 * cluster joins the cell before it. Returns the column after the longest line.
 */
export function drawText(canvas: Canvas, x: number, y: number, text: string): number {
  let end = x;
  text.split(/\r?\n/).forEach((line, row) => {
    let col = x;
    let last: { col: number; text: string; width: number } | undefined;
    for (const g of graphemes(line)) {
      if (g.width === 0) {
        if (last) canvas.set(last.col, y + row, (last.text += g.text), last.width);
        continue;
      }
      canvas.set(col, y + row, g.text, g.width);
      last = { col, text: g.text, width: g.width };
      col += g.width;
    }
    end = Math.max(end, col);
  });
  return end;
}

/** A rectangle in cells; `width` and `height` count the border cells. */
export interface CellRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BoxOptions {
  /**
   * `square` (default), `rounded` corners, `double-side` (subroutine: double left and
   * right sides) or `caps` (cylinder: double top and bottom).
   */
  readonly form?: 'square' | 'rounded' | 'double-side' | 'caps';
  /** Glyphs placed at the side midpoints, such as `◇` for a diamond. */
  readonly marks?: Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>;
  /** A marker one cell right of the top-left corner, such as `+` for a collapsed group. */
  readonly marker?: string;
}

/**
 * Draws `rect`'s border in the one `stroke` (its `h` along the top and bottom, `v` down the
 * sides, then the four corners), merging with what is drawn. Unlike {@link drawBox} it takes
 * any stroke, such as a dotted one, and has no forms or size floor.
 */
export function drawFrame(canvas: Canvas, stroke: Stroke, rect: CellRect): void {
  const { x, y } = rect;
  const right = x + rect.width - 1;
  const bottom = y + rect.height - 1;
  for (let i = x + 1; i < right; i++) {
    canvas.draw(i, y, stroke.h);
    canvas.draw(i, bottom, stroke.h);
  }
  for (let j = y + 1; j < bottom; j++) {
    canvas.draw(x, j, stroke.v);
    canvas.draw(right, j, stroke.v);
  }
  canvas.draw(x, y, stroke.tl);
  canvas.draw(right, y, stroke.tr);
  canvas.draw(x, bottom, stroke.bl);
  canvas.draw(right, bottom, stroke.br);
}

/**
 * Draws a box frame. The border merges with glyphs already on the canvas (`junction`), so
 * a line drawn up to it becomes a tee. Boxes smaller than 2 × 2 are not drawn.
 */
export function drawBox(
  canvas: Canvas,
  glyphs: GlyphSet,
  rect: CellRect,
  options: BoxOptions = {}
): void {
  const { x, y, width, height } = rect;
  if (width < 2 || height < 2) return;
  const form = options.form ?? 'square';
  const right = x + width - 1;
  const bottom = y + height - 1;
  // Arm weights (glyphs.ts): 1 light, 3 double.
  const h = form === 'caps' ? 3 : 1;
  const v = form === 'double-side' ? 3 : 1;
  const hGlyph = glyphFor(h * 0x11, glyphs) as string;
  const vGlyph = glyphFor(v * 0x44, glyphs) as string;
  for (let i = x + 1; i < right; i++) {
    canvas.draw(i, y, hGlyph);
    canvas.draw(i, bottom, hGlyph);
  }
  for (let j = y + 1; j < bottom; j++) {
    canvas.draw(x, j, vGlyph);
    canvas.draw(right, j, vGlyph);
  }
  const round = form === 'rounded' ? glyphs.rounded : undefined;
  // Each corner has the side's arm vertically and the top or bottom's arm horizontally.
  canvas.draw(x, y, round?.tl ?? (glyphFor(h * 0x10 + v * 0x04, glyphs) as string));
  canvas.draw(right, y, round?.tr ?? (glyphFor(h * 0x01 + v * 0x04, glyphs) as string));
  canvas.draw(x, bottom, round?.bl ?? (glyphFor(v * 0x40 + h * 0x10, glyphs) as string));
  canvas.draw(right, bottom, round?.br ?? (glyphFor(v * 0x40 + h * 0x01, glyphs) as string));
  const { marks = {}, marker } = options;
  const midX = x + Math.floor((width - 1) / 2);
  const midY = y + Math.floor((height - 1) / 2);
  if (marks.top) canvas.set(midX, y, marks.top);
  if (marks.bottom) canvas.set(midX, bottom, marks.bottom);
  if (marks.left) canvas.set(x, midY, marks.left);
  if (marks.right) canvas.set(right, midY, marks.right);
  if (marker && width > 2) canvas.set(x + 1, y, marker);
}
