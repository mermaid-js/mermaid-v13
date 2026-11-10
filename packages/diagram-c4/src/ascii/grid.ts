// The cell grid C4's text output draws on (#545, D459): the layout's px divided by its cell size
// (`C4Layout.cell`, the cell profile's), and sets of cells.
import type { CellRect } from '@mermaid-js/core/ascii';
import type { C4Layout, Rect } from '../layout/index.ts';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

/** The layout's px on the cell grid. */
export class Grid {
  private readonly sx: number;
  private readonly sy: number;

  /** Throws for a layout not laid out on the cell profile (no `cell`): text has no grid then. */
  constructor(layout: C4Layout) {
    if (!layout.cell)
      throw new Error('C4 text output draws a layout laid out on the cell profile (C4Layout.cell)');
    this.sx = layout.cell.x;
    this.sy = layout.cell.y;
  }

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

/** A set of cells. */
export class CellSet {
  private readonly cells = new Set<number>();

  static key(x: number, y: number): number {
    return y * 0x100000 + x;
  }

  add(x: number, y: number): void {
    this.cells.add(CellSet.key(x, y));
  }

  has(x: number, y: number): boolean {
    return this.cells.has(CellSet.key(x, y));
  }

  /** Every cell of `r`, its border included. */
  rect(r: CellRect): void {
    for (let j = r.y; j < r.y + r.height; j++)
      for (let i = r.x; i < r.x + r.width; i++) this.add(i, j);
  }

  /** The border cells of `r`. */
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

  /** Whether none of the `w` × `h` cells from (x, y) is in the set, and all are on the canvas. */
  free(x: number, y: number, w: number, h: number): boolean {
    if (x < 0 || y < 0) return false;
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.has(i, j)) return false;
    return true;
  }
}
