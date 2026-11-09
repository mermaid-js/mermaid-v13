// Edge-end labels (D102), as `layered` places them (`layout/layered/index.ts` `endLabels`), in px
// only: each sits beside the segment that leaves its end's side, `endLabelAlong` out from the side
// (the target's also past `headRoom`) and `endLabelAcross` off the line, on the side the route
// does not turn towards. Where that covers a label already placed or an end marker it takes the
// other side, or moves further out along the segment past what is in the way; it never covers a
// node or a group's title. A local copy: importing layered's would pull layered into this chunk.
import type { LayoutGraph, LayoutModel, Point, RoutePoint, Side, Size } from '../types.ts';
import { pxProfile } from '../units.ts';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const OUTWARD: Readonly<Record<Side, { axis: 'x' | 'y'; sign: number }>> = {
  top: { axis: 'y', sign: -1 },
  bottom: { axis: 'y', sign: 1 },
  left: { axis: 'x', sign: -1 },
  right: { axis: 'x', sign: 1 },
};

function rectOf(c: Point, s: Size): Rect {
  return {
    x0: c.x - s.width / 2,
    y0: c.y - s.height / 2,
    x1: c.x + s.width / 2,
    y1: c.y + s.height / 2,
  };
}

// Overlap by more than float noise; boxes that share an edge are clear.
function hits(a: Rect, b: Rect): boolean {
  const e = 1e-6;
  return a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.y0 < b.y1 - e && b.y0 < a.y1 - e;
}

/** The room an end marker takes: `length` out along the route from its end, `width` across. */
function markerRect(end: Point, side: Side, m: { length: number; width: number }): Rect {
  const { axis, sign } = OUTWARD[side];
  const centre = { ...end, [axis]: end[axis] + (sign * m.length) / 2 };
  const size =
    axis === 'x' ? { width: m.length, height: m.width } : { width: m.width, height: m.length };
  return rectOf(centre, size);
}

interface Around {
  walls: readonly Rect[];
  taken: readonly Rect[];
}

// The centre of a label of `size` at the end `points[0]`, whose route leaves through `side`.
function endLabelAt(
  points: readonly RoutePoint[],
  side: Side,
  size: Size,
  room: { along: number; across: number },
  { walls, taken }: Around
): Point {
  const p = points[0]!;
  const { axis, sign } = OUTWARD[side];
  const cross = axis === 'x' ? 'y' : 'x';
  let lean = 0;
  for (const q of points) {
    const d = q[cross] - p[cross];
    if (Math.abs(d) > 1e-6) {
      lean = Math.sign(d);
      break;
    }
  }
  const deep = axis === 'x' ? size.width : size.height;
  const wide = axis === 'x' ? size.height : size.width;
  const at = (away: number, push: number): Point => {
    const out = p[axis] + sign * (room.along + push + deep / 2);
    const off = p[cross] + away * (room.across + wide / 2);
    return axis === 'x' ? { x: out, y: off } : { x: off, y: out };
  };
  // How far out the label must move on side `away` to clear what is taken, or undefined where
  // that runs into a wall.
  const pushFor = (away: number): number | undefined => {
    let push = 0;
    for (let tries = 0; tries <= taken.length; tries++) {
      const r = rectOf(at(away, push), size);
      if (walls.some((w) => hits(r, w))) return undefined;
      const hit = taken.find((t) => hits(r, t));
      if (!hit) return push;
      const lo = axis === 'x' ? 'x0' : 'y0';
      const hi = axis === 'x' ? 'x1' : 'y1';
      push += sign > 0 ? hit[hi] - r[lo] : r[hi] - hit[lo];
    }
    return undefined;
  };
  const first = lean > 0 ? -1 : 1;
  const a = pushFor(first);
  const b = pushFor(-first);
  if (a !== undefined && (b === undefined || a <= b)) return at(first, a);
  if (b !== undefined) return at(-first, b);
  return at(first, 0);
}

/** Places every edge's `startLabel` and `endLabel` on `model`, whose routes are final. */
export function placeEndLabels(graph: LayoutGraph, model: LayoutModel): void {
  if (!graph.edges.some((e) => e.startLabel ?? e.endLabel)) return;
  const M = graph.metrics ?? pxProfile.engine;
  const headRoom = graph.headRoom ?? 0;
  const walls: Rect[] = [...model.nodes.values()].map((b) => rectOf(b, b));
  for (const g of graph.groups) {
    const placed = model.groups.get(g.id);
    if (g.title && placed) walls.push(rectOf(placed.title, g.title));
  }
  const taken: Rect[] = [];
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id);
    if (!placed || placed.points.length < 2) continue;
    if (e.label && placed.label) taken.push(rectOf(placed.label, e.label));
    const { points, ports } = placed;
    if (e.startMarker) taken.push(markerRect(points[0]!, ports.source, e.startMarker));
    if (e.endMarker) taken.push(markerRect(points.at(-1)!, ports.target, e.endMarker));
  }
  const around = { walls, taken };
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id);
    if (!placed || placed.points.length < 2) continue;
    const { points, ports } = placed;
    const room = { along: M.endLabelAlong, across: M.endLabelAcross };
    if (e.startLabel) {
      placed.startLabel = endLabelAt(points, ports.source, e.startLabel, room, around);
      taken.push(rectOf(placed.startLabel, e.startLabel));
    }
    if (e.endLabel) {
      const head = { ...room, along: room.along + headRoom };
      placed.endLabel = endLabelAt([...points].reverse(), ports.target, e.endLabel, head, around);
      taken.push(rectOf(placed.endLabel, e.endLabel));
    }
  }
}
