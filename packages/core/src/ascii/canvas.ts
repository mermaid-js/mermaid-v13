// cspell:words Grooff
// The text-grid canvas (DESIGN §6.3, D76). Ported from mermaid-ascii's `drawing`
// (pkg/graph/draw.go at 5a9df15: `mkDrawing`, `increaseSize`, `drawTextCells`,
// `drawingToString`; https://github.com/AlexanderGrooff/mermaid-ascii, MIT, (c) 2023
// Alexander Grooff). Changed: row-major, grows on write, keeps wide graphemes whole when
// overwritten, merges line glyphs through `junction`, and trims trailing spaces.
import { junction } from './glyphs.ts';

/** The content of a cell covered by the right half of a wide grapheme. */
const CONTINUATION = '';

/** Rows × columns of cells, addressed (x = column, y = row) from the top left. */
export class Canvas {
  private readonly grid: string[][] = [];
  private width = 0;

  constructor(columns = 0, rows = 0) {
    this.grow(columns, rows);
  }

  get columns(): number {
    return this.width;
  }

  get rows(): number {
    return this.grid.length;
  }

  /** The grapheme at a cell: a space when empty or outside, `''` in a continuation cell. */
  get(x: number, y: number): string {
    return this.grid[y]?.[x] ?? ' ';
  }

  /**
   * Writes one grapheme `width` cells wide, growing the canvas to fit. A wide grapheme
   * partly overwritten is blanked rather than left torn. Cells left of or above the
   * origin are dropped.
   */
  set(x: number, y: number, grapheme: string, width = 1): void {
    if (x < 0 || y < 0) return;
    this.grow(x + Math.max(width, 1), y + 1);
    const row = this.grid[y] as string[];
    let head = x;
    while (head > 0 && row[head] === CONTINUATION) head--;
    row.fill(' ', head, x);
    row[x] = grapheme;
    for (let k = 1; k < width; k++) row[x + k] = CONTINUATION;
    for (let k = x + Math.max(width, 1); row[k] === CONTINUATION; k++) row[k] = ' ';
  }

  /** Draws a line glyph, merging it with the one already there (`junction`). */
  draw(x: number, y: number, glyph: string): void {
    this.set(x, y, junction(this.get(x, y), glyph));
  }

  /** Rows joined with `\n`, trailing spaces trimmed from each. */
  toString(): string {
    // A loop from the end: `/ +$/` backtracks quadratically on wide rows with many space runs.
    // Empty cells (the right half of a wide character) join to nothing, so they trim too.
    return this.grid
      .map((row) => {
        let end = row.length;
        while (end > 0 && (row[end - 1] === ' ' || row[end - 1] === '')) end--;
        return row.slice(0, end).join('');
      })
      .join('\n');
  }

  private grow(columns: number, rows: number): void {
    if (columns > this.width) {
      for (const row of this.grid) while (row.length < columns) row.push(' ');
      this.width = columns;
    }
    while (this.grid.length < rows) this.grid.push(Array<string>(this.width).fill(' '));
  }
}
