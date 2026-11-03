// Checks on a LayoutModel laid out with `LayoutGraph.grid` (D78, D140), for DDLT-style tests of
// the text path. In grid mode a coordinate is a cell index: route point (c, r) is cell (c, r),
// and a box of width w centred at x covers the cells from x − w/2 + ½ to x + w/2 − ½. On top
// of `validateLayout`: boxes and routes on whole cells inside the drawing, square segments, and
// every edge end in a cell of its own, just outside a non-corner cell of its node's side.
import type { LayoutGraph, LayoutModel, Point, Side } from './types.ts';
import { validateLayout } from './validate.ts';

interface Cells {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function cells(b: { x: number; y: number; width: number; height: number }, grid: number): Cells {
  return {
    left: b.x - b.width / 2 + grid / 2,
    top: b.y - b.height / 2 + grid / 2,
    right: b.x + b.width / 2 - grid / 2,
    bottom: b.y + b.height / 2 - grid / 2,
  };
}

function inside(c: Cells, p: Point): boolean {
  return p.x >= c.left && p.x <= c.right && p.y >= c.top && p.y <= c.bottom;
}

// Whether `p` is the cell just outside `side` of `c`, next to one of the side's non-corner cells.
function offSide(c: Cells, side: Side, p: Point, grid: number): boolean {
  if (side === 'top' || side === 'bottom') {
    const row = side === 'top' ? c.top - grid : c.bottom + grid;
    return p.y === row && p.x > c.left && p.x < c.right;
  }
  const column = side === 'left' ? c.left - grid : c.right + grid;
  return p.x === column && p.y > c.top && p.y < c.bottom;
}

/** Returns one message per problem; an empty list means the model lies on the graph's grid. */
export function validateGrid(graph: LayoutGraph, model: LayoutModel): string[] {
  const out = validateLayout(graph, model);
  const grid = graph.grid ?? 1;
  const whole = (v: number): boolean => Number.isInteger(v / grid);
  const page: Cells = {
    left: 0,
    top: 0,
    right: model.width - grid,
    bottom: model.height - grid,
  };
  const boxes = new Map<string, Cells>();
  for (const [id, b] of [...model.nodes, ...model.groups]) {
    const c = cells(b, grid);
    if (![c.left, c.top, c.right, c.bottom].every(whole)) out.push(`box '${id}' is off the grid`);
    if (!inside(page, { x: c.left, y: c.top }) || !inside(page, { x: c.right, y: c.bottom }))
      out.push(`box '${id}' lies outside the drawing's cells`);
    boxes.set(id, c);
  }
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const ends = new Map<string, string>();
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id);
    if (!placed) continue;
    const pts = placed.points;
    if (pts.some((p) => !whole(p.x) || !whole(p.y))) out.push(`edge '${e.id}' is off the grid`);
    if (pts.some((p) => !inside(page, p))) out.push(`edge '${e.id}' leaves the drawing's cells`);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (a.x !== b.x && a.y !== b.y) out.push(`edge '${e.id}' has a diagonal segment`);
    }
    if (e.label && placed.label) {
      const c = cells({ ...placed.label, ...e.label }, grid);
      if (![c.left, c.top].every(whole)) out.push(`label of '${e.id}' is off the grid`);
    }
    const end = (id: string, side: Side, p: Point | undefined): void => {
      if (!p) return;
      const key = `${p.x},${p.y}`;
      const other = ends.get(key);
      if (other !== undefined) out.push(`edges '${other}' and '${e.id}' end in one cell ${key}`);
      ends.set(key, e.id);
      if (nodeIds.has(id) && !offSide(boxes.get(id)!, side, p, grid))
        out.push(`edge '${e.id}' does not end off a ${side} side of '${id}' (${key})`);
    };
    end(e.source, placed.ports.source, pts[0]);
    end(e.target, placed.ports.target, pts[pts.length - 1]);
  }
  return out;
}
