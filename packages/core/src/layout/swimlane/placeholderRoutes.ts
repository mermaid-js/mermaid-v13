// Stand-in routes until the orthogonal router lands (T0b, #595): each edge is one right-angled
// elbow from its source box to its target box, in final coordinates. They start and end on the
// boxes, so `validateLayout` passes, and make no attempt to avoid nodes or each other.
import type { RoutePoint, Side } from '../types.ts';

export interface PlacedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlaceholderRoute {
  points: RoutePoint[];
  ports: { source: Side; target: Side };
}

/** How far a self-loop stands off its node. */
const LOOP = 10;

const sides = (b: PlacedBox) => ({
  left: b.x - b.width / 2,
  right: b.x + b.width / 2,
  top: b.y - b.height / 2,
  bottom: b.y + b.height / 2,
});

function pt(x: number, y: number, axis: 'v' | 'h'): RoutePoint {
  return { x, y, axis };
}

/** Down (or up) from `s` to `t`, turning once halfway across the gap between them. */
function vertical(s: PlacedBox, t: PlacedBox): PlaceholderRoute {
  const a = sides(s);
  const b = sides(t);
  const down = b.top >= a.bottom;
  const y0 = down ? a.bottom : a.top;
  const y1 = down ? b.top : b.bottom;
  const ports = down
    ? ({ source: 'bottom', target: 'top' } as const)
    : ({ source: 'top', target: 'bottom' } as const);
  if (Math.abs(s.x - t.x) < 0.5) return { points: [pt(s.x, y0, 'v'), pt(s.x, y1, 'v')], ports };
  const mid = (y0 + y1) / 2;
  return {
    points: [pt(s.x, y0, 'v'), pt(s.x, mid, 'v'), pt(t.x, mid, 'h'), pt(t.x, y1, 'v')],
    ports,
  };
}

/** Right (or left) from `s` to `t`, turning once halfway across the gap between them. */
function horizontal(s: PlacedBox, t: PlacedBox): PlaceholderRoute {
  const a = sides(s);
  const b = sides(t);
  const right = b.left >= a.right;
  const x0 = right ? a.right : a.left;
  const x1 = right ? b.left : b.right;
  const ports = right
    ? ({ source: 'right', target: 'left' } as const)
    : ({ source: 'left', target: 'right' } as const);
  if (Math.abs(s.y - t.y) < 0.5) return { points: [pt(x0, s.y, 'h'), pt(x1, s.y, 'h')], ports };
  const mid = (x0 + x1) / 2;
  return {
    points: [pt(x0, s.y, 'h'), pt(mid, s.y, 'h'), pt(mid, t.y, 'v'), pt(x1, t.y, 'h')],
    ports,
  };
}

/** A loop off the right side of a box. */
function loop(s: PlacedBox): PlaceholderRoute {
  const { right } = sides(s);
  const dy = s.height / 4;
  return {
    points: [
      pt(right, s.y - dy, 'h'),
      pt(right + LOOP, s.y - dy, 'h'),
      pt(right + LOOP, s.y + dy, 'v'),
      pt(right, s.y + dy, 'h'),
    ],
    ports: { source: 'right', target: 'right' },
  };
}

/**
 * Boxes that overlap (a node and the group around it): up from the inner box's top to the outer
 * box's top, both ends on their boxes.
 */
function nested(s: PlacedBox, t: PlacedBox): PlaceholderRoute {
  const a = sides(s);
  const b = sides(t);
  const inner = s.width * s.height <= t.width * t.height ? s : t;
  const outerTop = Math.min(a.top, b.top);
  const innerTop = Math.max(a.top, b.top);
  const [y0, y1] = inner === s ? [innerTop, outerTop] : [outerTop, innerTop];
  return {
    points: [pt(inner.x, y0, 'v'), pt(inner.x, y1, 'v')],
    ports: { source: 'top', target: 'top' },
  };
}

/**
 * One elbow from `s` to `t`. Boxes apart along the flow (`vertical` for TB/BT) are joined across
 * the gap along it; otherwise across the gap the other way.
 */
export function placeholderRoute(
  s: PlacedBox,
  t: PlacedBox,
  flowVertical: boolean,
  selfLoop: boolean
): PlaceholderRoute {
  if (selfLoop) return loop(s);
  const a = sides(s);
  const b = sides(t);
  const apartY = b.top >= a.bottom || a.top >= b.bottom;
  const apartX = b.left >= a.right || a.left >= b.right;
  if (apartY && (flowVertical || !apartX)) return vertical(s, t);
  if (apartX) return horizontal(s, t);
  return nested(s, t);
}
