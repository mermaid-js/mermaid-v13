// `LayoutEdge.sides` as hints (D327, D503): once `layered` has placed and routed everything, an
// end whose route does not already use its named side is moved onto that side: to the side's
// middle (`anchorY` on `left`/`right`), a stub straight out, then right angles to the rest of
// the route. Ranks, order, boxes and the label stay. Known limits are in the #525 GAPS (T0b).
import type { LayoutGraph, LayoutModel, Point, RoutePoint, Side } from '../types.ts';
import type { LayoutMetrics } from '../units.ts';

const vertical = (side: Side): boolean => side === 'top' || side === 'bottom';
const sign = (side: Side): number => (side === 'top' || side === 'left' ? -1 : 1);

interface Box extends Point {
  width: number;
  height: number;
}

// A point `c` across a side and `l` along its normal.
const at = (v: boolean, c: number, l: number): Point => (v ? { x: c, y: l } : { x: l, y: c });

// An end on `side` of box `b` (on its middle, or `anchor` down a `left`/`right` side), its stub's
// outer point `by` out, and the corners on to `to`: out along the stub first where `to` lies
// ahead; else across to a lane `by` past the box's edge and on along it.
function leave(b: Box, anchor: number | undefined, side: Side, by: number, to: Point): Point[] {
  const k = sign(side);
  const v = vertical(side);
  const [c, l, half, wide] = v
    ? [b.x, b.y, b.height / 2, b.width / 2]
    : [anchor === undefined ? b.y : b.y - b.height / 2 + anchor, b.x, b.width / 2, b.height / 2];
  const [tc, tl] = v ? [to.x, to.y] : [to.y, to.x];
  const out = l + k * (half + by);
  const ends = [at(v, c, l + k * half), at(v, c, out)];
  if ((tl - out) * k >= 0) return [...ends, at(v, c, tl)];
  const lane = (v ? b.x : b.y) + (tc < (v ? b.x : b.y) ? -1 : 1) * (wide + by);
  return [...ends, at(v, lane, out), at(v, lane, tl)];
}

/** Moves sided ends of `model`'s routes onto their named sides (D503), in place. */
export function honourSides(
  graph: LayoutGraph,
  model: LayoutModel,
  M: LayoutMetrics,
  margin: number
): LayoutModel {
  const room = (marker?: { length: number }): number =>
    M.corner + (graph.headRoom ?? 0) + (marker?.length ?? 0);
  // New points stay halfway into the drawing's margin rather than run off it.
  const clamp = (u: number, size: number): number =>
    Math.min(Math.max(u, margin / 2), size - margin / 2);
  const box = (id: string): Box => (model.nodes.get(id) ?? model.groups.get(id))!;
  const anchor = (id: string): number | undefined => graph.nodes.find((n) => n.id === id)?.anchorY;
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id)!;
    const pts = placed.points;
    const { source = placed.ports.source, target = placed.ports.target } = e.sides ?? {};
    let sMove = source !== placed.ports.source;
    let tMove = target !== placed.ports.target;
    if (!sMove && !tMove) continue;
    // With no middle points, both ends get stubs, so the kept one too leaves square.
    if (pts.length < 3) sMove = tMove = true;
    const middle = pts.slice(1, -1);
    const head = sMove
      ? leave(
          box(e.source),
          anchor(e.source),
          source,
          room(e.startMarker),
          middle[0] ?? pts.at(-1)!
        )
      : [pts[0]!];
    const route = [...head, ...middle];
    route.push(
      ...(tMove
        ? leave(box(e.target), anchor(e.target), target, room(e.endMarker), route.at(-1)!).reverse()
        : [pts.at(-1)!])
    );
    // Repeats go. New points, and the one a new leg leads into, take that leg's `axis` (the
    // first, its side's); the rest are kept as they are.
    const points: RoutePoint[] = [];
    for (const p of route) {
      const prev = points.at(-1) ?? { x: p.x, y: p.y + (vertical(source) ? 1 : 0) };
      if (prev.x === p.x && prev.y === p.y && points.length) continue;
      const axis = prev.y === p.y ? 'h' : 'v';
      const kept = (pts as Point[]).includes(p) && !(sMove && p === middle[0]);
      points.push(
        kept ? (p as RoutePoint) : { x: clamp(p.x, model.width), y: clamp(p.y, model.height), axis }
      );
    }
    model.edges.set(e.id, { ...placed, points, ports: { source, target } });
  }
  return model;
}
