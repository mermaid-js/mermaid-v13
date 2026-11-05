import type { LayoutModel } from '../types.ts';
import type { Rect } from './end-markers.ts';

/**
 * What a grid drawing puts in cells an edge-end label must move past (D102): each route's end
 * cell (an arrowhead, or the line's last cell), and each group's border rows (which a label
 * moving up or down crosses) and border columns (moving sideways).
 */
export interface GridObstacles {
  ends: Rect[];
  rows: Rect[];
  columns: Rect[];
}

export type GridBorders = Pick<GridObstacles, 'rows' | 'columns'>;

export function gridObstacles(model: LayoutModel, grid: number): GridObstacles {
  const out: GridObstacles = { ends: [], rows: [], columns: [] };
  if (!grid) return out;
  const h = grid / 2;
  for (const { points } of model.edges.values()) {
    for (const p of [points[0], points.at(-1)])
      if (p) out.ends.push({ x0: p.x - h, y0: p.y - h, x1: p.x + h, y1: p.y + h });
  }
  for (const g of model.groups.values()) {
    const x0 = g.x - g.width / 2;
    const y0 = g.y - g.height / 2;
    const x1 = x0 + g.width;
    const y1 = y0 + g.height;
    out.rows.push({ x0, y0, x1, y1: y0 + grid }, { x0, y0: y1 - grid, x1, y1 });
    out.columns.push({ x0, y0, x1: x0 + grid, y1 }, { x0: x1 - grid, y0, x1, y1 });
  }
  return out;
}
