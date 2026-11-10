/**
 * The C4 layout on a character grid (#545, D459): text output lays the SVG grid out in px, with
 * every text measured in cells and each cell `pxPerUnit` px (the cell profile's 8 × 16), so the
 * layout divided by the cell size puts each label line on one row and each grapheme on one
 * column. Fonts are ignored (D459): a line is a row whatever its size.
 *
 * Every shape keeps room for its border round its text: two columns each side (the border and a
 * space) and a row above and below; and a shape keeps two cells clear all round, for an
 * arrowhead between it and a frame. The cell profile's node padding (`ascii.padding: roomy` sets
 * one row) is added to `c4ShapePadding` first; a length still under its least is raised, with one
 * `C4_CONFIG_IGNORED` each.
 * Nothing here imports the text kit: the SVG chunk carries this file.
 */
import type { Warning } from '@mermaid-js/core';
import type { UnitProfile } from '@mermaid-js/core/layout';
import type { Measurer } from '@mermaid-js/core/text';
import { C4_CONFIG_IGNORED } from '../codes.ts';
import type { C4LayoutConfig } from '../config.ts';
import type { ShapeRoom } from './shapes.ts';

/** px per cell along each axis. */
export type CellSize = UnitProfile['pxPerUnit'];

/**
 * The least lengths in cells: a shape's padding round its text (its border and a space across,
 * its border down), and the margin round a shape (its border, and a cell for an arrowhead or a
 * line clear of a frame, both ways).
 */
const CELL_LEAST = {
  c4ShapePadding: { x: 2, y: 1 },
  c4ShapeMargin: { x: 2, y: 2 },
} as const;

/** `cells` (a measurer in cells, the API's cell measurer) read as px at `size` a cell. */
export function cellPxMeasurer(cells: Measurer, size: CellSize): Measurer {
  const metrics = { ascent: size.y, descent: 0, lineHeight: size.y };
  return {
    id: `c4-cells-${cells.id}`,
    width: (text, font, style) => cells.width(text, font, style) * size.x,
    metrics: () => metrics,
  };
}

/**
 * `config` on the grid of `units`: the profile's node padding added to `c4ShapePadding`, then
 * each length raised to its least (one `C4_CONFIG_IGNORED` for each value set under it).
 */
export function cellConfig(
  config: C4LayoutConfig,
  units: UnitProfile,
  warn: (w: Warning) => void
): C4LayoutConfig {
  const size = units.pxPerUnit;
  const given = { c4ShapePadding: config.c4ShapePadding, c4ShapeMargin: config.c4ShapeMargin };
  const out = {
    ...config,
    c4ShapePadding: given.c4ShapePadding + units.builder.nodePad.y * size.y,
  };
  for (const key of ['c4ShapePadding', 'c4ShapeMargin'] as const) {
    const least = Math.max(CELL_LEAST[key].x * size.x, CELL_LEAST[key].y * size.y);
    if (out[key] >= least) continue;
    warn({
      code: C4_CONFIG_IGNORED,
      path: `c4.${key}`,
      message: `c4.${key} ${given[key]} leaves too little room in text output; ${least} is used.`,
    });
    out[key] = least;
  }
  return out;
}

/** The shapes' padding totals raised so each keeps its border round its text on the grid. */
export function cellRoom(room: ShapeRoom, size: CellSize): ShapeRoom {
  const x = 2 * CELL_LEAST.c4ShapePadding.x * size.x;
  const y = 2 * CELL_LEAST.c4ShapePadding.y * size.y;
  const least = (p: ShapeRoom['cylinder']) => ({ x: Math.max(p.x, x), y: Math.max(p.y, y) });
  return {
    ...room,
    cylinder: least(room.cylinder),
    queue: least(room.queue),
    subroutine: least(room.subroutine),
  };
}
