// Shared conversion from flat/compound layout coordinates to public routes and self-loops.
import type { Dir, LayoutModelEdge, LayoutModelNode, RoutePoint, Side } from '../types.ts';
import type { LayoutMetrics } from '../units.ts';
import { edgeOn, floorTo } from './layered.ts';

const FLOW_START: Readonly<Record<Dir, Side>> = {
  TB: 'top',
  BT: 'bottom',
  LR: 'left',
  RL: 'right',
};
const FLOW_END: Readonly<Record<Dir, Side>> = { TB: 'bottom', BT: 'top', LR: 'right', RL: 'left' };

export function flowStart(dir: Dir): Side {
  return FLOW_START[dir];
}

export function flowEnd(dir: Dir): Side {
  return FLOW_END[dir];
}

// The side of a box that a route end lies on, or the nearest one.
export function sideOf(b: LayoutModelNode, p: RoutePoint | undefined, fallback: Side): Side {
  if (!p) return fallback;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const rx = b.width > 0 ? Math.abs(dx) / (b.width / 2) : Math.abs(dx);
  const ry = b.height > 0 ? Math.abs(dy) / (b.height / 2) : Math.abs(dy);
  if (rx < 1e-6 && ry < 1e-6) return fallback;
  if (ry >= rx) return dy < 0 ? 'top' : 'bottom';
  return dx < 0 ? 'left' : 'right';
}

// A route on the grid, in cells: each end moves half a cell out of its box, onto the cell just
// outside its side, and points that repeat or sit midway along a straight run are dropped.
export function ontoCells(points: RoutePoint[], from: Side, to: Side, grid: number): RoutePoint[] {
  if (points.length === 0) return points;
  const out = (p: RoutePoint, side: Side): RoutePoint => {
    const h = grid / 2;
    if (side === 'top') return { ...p, y: p.y - h };
    if (side === 'bottom') return { ...p, y: p.y + h };
    if (side === 'left') return { ...p, x: p.x - h };
    return { ...p, x: p.x + h };
  };
  const pts = points.map((p) => ({ ...p }));
  pts[0] = out(pts[0]!, from);
  pts[pts.length - 1] = out(pts[pts.length - 1]!, to);
  const kept: RoutePoint[] = [];
  for (const p of pts) {
    const last = kept[kept.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const before = kept[kept.length - 2];
    if (
      last &&
      before &&
      ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))
    )
      kept.pop();
    kept.push(p);
  }
  if (kept.length === 1) kept.push({ ...kept[0]! });
  return kept;
}

// A self-loop on the grid, in cells (research/ascii-snapping.md §6): out of one side and back
// into it two cells further along, so the box needs room for two ends there (D140). Beside the
// node across the flow, `loop` cells out; its label sits `loopGap` past the loop.
export function gridLoop(
  b: LayoutModelNode,
  below: boolean,
  label: { width: number; height: number } | undefined,
  M: LayoutMetrics,
  grid: number,
  { nth, count }: { nth: number; count: number }
): LayoutModelEdge {
  const pitch = Math.max(grid, edgeOn(M.portPitch, grid));
  const left = b.x - b.width / 2 + grid / 2;
  const top = b.y - b.height / 2 + grid / 2;
  const right = left + b.width - grid;
  const bottom = top + b.height - grid;
  // The `nth` of `count` pairs of cells, all `pitch` apart, around the middle of a side and off
  // its corners (the side has grown to hold them, D140).
  const pair = (lo: number, hi: number): [number, number] => {
    const first = Math.max(lo + grid, floorTo((lo + hi - (2 * count - 1) * pitch) / 2, grid));
    const a = Math.min(hi - grid, first + 2 * nth * pitch);
    return [a, Math.min(hi - grid, a + pitch)];
  };
  const reach = Math.max(grid, edgeOn(M.loop, grid)) - grid;
  const gap = edgeOn(M.loopGap, grid);
  if (below) {
    const [x0, x1] = pair(left, right);
    const y = bottom + grid;
    const out = y + reach;
    const placed: LayoutModelEdge = {
      points: [
        { x: x0, y, axis: 'v' },
        { x: x0, y: out, axis: 'v' },
        { x: x1, y: out, axis: 'h' },
        { x: x1, y, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'bottom' },
    };
    if (label) {
      const l = left + floorTo((b.width - label.width) / 2, grid);
      placed.label = {
        x: l + label.width / 2 - grid / 2,
        y: out + grid + gap + label.height / 2 - grid / 2,
      };
    }
    return placed;
  }
  const [y0, y1] = pair(top, bottom);
  const x = right + grid;
  const out = x + reach;
  const placed: LayoutModelEdge = {
    points: [
      { x, y: y0, axis: 'h' },
      { x: out, y: y0, axis: 'h' },
      { x: out, y: y1, axis: 'v' },
      { x, y: y1, axis: 'h' },
    ],
    ports: { source: 'right', target: 'right' },
  };
  if (label) {
    const t = floorTo((y0 + y1 + grid - label.height) / 2, grid);
    placed.label = {
      x: out + grid + gap + label.width / 2 - grid / 2,
      y: t + label.height / 2 - grid / 2,
    };
  }
  return placed;
}

// A loop out of one side of a node and back, beside it across the flow.
export function selfLoop(
  b: LayoutModelNode,
  below: boolean,
  label: { width: number; height: number } | undefined,
  M: LayoutMetrics
): LayoutModelEdge {
  if (below) {
    const y = b.y + b.height / 2;
    const out = y + M.loop;
    const x0 = b.x - b.width / 4;
    const x1 = b.x + b.width / 4;
    return {
      points: [
        { x: x0, y, axis: 'v' },
        { x: x0, y: out, axis: 'v' },
        { x: x1, y: out, axis: 'h' },
        { x: x1, y, axis: 'v' },
      ],
      ...(label ? { label: { x: b.x, y: out + M.loopGap + label.height / 2 } } : {}),
      ports: { source: 'bottom', target: 'bottom' },
    };
  }
  const x = b.x + b.width / 2;
  const out = x + M.loop;
  const y0 = b.y - b.height / 4;
  const y1 = b.y + b.height / 4;
  return {
    points: [
      { x, y: y0, axis: 'h' },
      { x: out, y: y0, axis: 'h' },
      { x: out, y: y1, axis: 'v' },
      { x, y: y1, axis: 'h' },
    ],
    ...(label ? { label: { x: out + M.loopGap + label.width / 2, y: b.y } } : {}),
    ports: { source: 'right', target: 'right' },
  };
}
