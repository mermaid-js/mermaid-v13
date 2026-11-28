/**
 * Where an edge label's tag goes (#1362). The tag is centred on the centres' midpoint, where
 * v12 put the label (D441). Where the tag there would sit on a block's border, or wholly inside
 * a block it does not belong to, it slides along its edge to the nearest spot where it is clear
 * of both and leaves both arrowheads in view. Where no such spot exists, it stays at the
 * midpoint, as before.
 */
import { clipOutline, type Outline, type Point } from '../shapes/outline.ts';
import {
  markerReach,
  markerTrim,
  type Arrowheads,
  type MarkerReach,
} from '@mermaid-js/shared/svg/arrowheads';
import { BLOCK_METRICS } from './metrics.ts';
import type { BlockEdgeLayout, BlockNodeLayout, Rect } from './types.ts';

/**
 * Whether `p` is inside `b`'s outline: every block shape is star-shaped about its centre, so
 * the centre itself is inside.
 */
function inside(outline: Outline, centre: Point, p: Point): boolean {
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  if (dx === 0 && dy === 0) return true;
  const exit = clipOutline(outline, dx, dy);
  return Math.hypot(dx, dy) < Math.hypot(exit.x, exit.y);
}

const meets = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Whether `a` lies within `b`. */
const within = (a: Rect, b: Rect): boolean =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

/** The points around `r`'s rim, at most `step` apart. */
function rim(r: Rect, step: number): Point[] {
  const nx = Math.max(1, Math.ceil(r.width / step));
  const ny = Math.max(1, Math.ceil(r.height / step));
  const out: Point[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = r.x + (r.width * i) / nx;
    out.push({ x, y: r.y }, { x, y: r.y + r.height });
  }
  for (let j = 1; j < ny; j++) {
    const y = r.y + (r.height * j) / ny;
    out.push({ x: r.x, y }, { x: r.x + r.width, y });
  }
  return out;
}

/**
 * Where `r` is against `b`'s outline: `cross` when part of its rim is inside and part outside,
 * or the whole block is under it; `in` when all of its rim is inside; `out` otherwise.
 */
function against(b: BlockNodeLayout, r: Rect): 'cross' | 'in' | 'out' {
  const { outline, box } = b;
  if (!outline || !meets(r, box)) return 'out';
  if (within(box, r)) return 'cross';
  let seen: boolean | undefined;
  for (const p of rim(r, BLOCK_METRICS.labelRimStep)) {
    const now = inside(outline, b.centre, p);
    if (seen === undefined) seen = now;
    else if (now !== seen) return 'cross';
  }
  return seen ? 'in' : 'out';
}

/**
 * The blocks a tag is placed among, and the ones it may sit inside: its edge's ends and the
 * composites that hold both.
 */
export interface TagField {
  readonly blocks: readonly BlockNodeLayout[];
  readonly homes: ReadonlySet<BlockNodeLayout>;
}

/** `r` grown by `g` on every side. */
const grown = (r: Rect, g: number): Rect => ({
  x: r.x - g,
  y: r.y - g,
  width: r.width + 2 * g,
  height: r.height + 2 * g,
});

/**
 * Whether the tag at `r`, kept `g` from every border, crosses none and is inside no block but
 * its homes.
 */
const clear = (r: Rect, g: number, field: TagField): boolean => {
  const room = grown(r, g);
  return !field.blocks.some((b) => {
    const where = against(b, room);
    return where === 'cross' || (where === 'in' && !field.homes.has(b));
  });
};

/**
 * The edge `s → t` a tag slides on, how much of each end its arrowhead takes along the line, and
 * the box each arrowhead is drawn in.
 */
export interface TagTrack {
  readonly s: Point;
  readonly t: Point;
  readonly headStart: number;
  readonly headEnd: number;
  readonly reachStart: MarkerReach;
  readonly reachEnd: MarkerReach;
}

/**
 * Whether `r` overlaps the box an arrowhead is drawn in: `reach` from `end` along the unit `u`
 * (pointing into the line), and its side each way across it. Tested on the four axes of the two
 * boxes.
 */
function overHead(r: Rect, end: Point, u: Point, reach: MarkerReach): boolean {
  if (!(reach.back > 0)) return false;
  const along = reach.back / 2;
  const c = { x: end.x + u.x * along, y: end.y + u.y * along };
  const hw = r.width / 2;
  const hh = r.height / 2;
  const dx = r.x + hw - c.x;
  const dy = r.y + hh - c.y;
  const ax = Math.abs(u.x);
  const ay = Math.abs(u.y);
  return (
    Math.abs(dx) < hw + ax * along + ay * reach.side &&
    Math.abs(dy) < hh + ay * along + ax * reach.side &&
    Math.abs(dx * u.x + dy * u.y) < along + hw * ax + hh * ay &&
    Math.abs(dy * u.x - dx * u.y) < reach.side + hw * ay + hh * ax
  );
}

/**
 * The spot nearest `home` among `hi` and `lo`, `lo + 1`, … below `hi` where `ok` holds; ties go
 * to `hi`, then to the lower spot. Every `labelSlideStride`th spot is tried first; spot by spot
 * is tried only where a spot as near as the first that held can be. A clear stretch narrower
 * than the stride, with tried spots that do not hold on both sides, is not found.
 */
function nearestSpot(
  lo: number,
  hi: number,
  home: number,
  ok: (k: number) => boolean
): number | undefined {
  const spots: number[] = [hi];
  for (let k = lo; k < hi; k += BLOCK_METRICS.labelRimStep) spots.push(k);
  const away = (k: number): number => Math.abs(k - home);
  spots.sort((a, b) => away(a) - away(b));
  const stride = BLOCK_METRICS.labelSlideStride;
  const step = BLOCK_METRICS.labelRimStep;
  const first = spots.find(
    (k) => (k === hi || Math.round((k - lo) / step) % stride === 0) && ok(k)
  );
  if (first === undefined) return undefined;
  // A clear spot nearer than `first` and not in a stretch narrower than the stride is less than
  // a stride nearer: the stretch reaches a tried spot no nearer than `first`.
  const d = away(first);
  return spots.find((k) => away(k) > d - stride * step && (k === first || ok(k)));
}

/** Where a tag goes against its line: centred on it (0), or beside it on either side. */
type Side = -1 | 0 | 1;

/**
 * The tag at `room` slid along `track` to the spot nearest where it is that keeps `g` from
 * every border, is inside no block but its homes, and is over neither head; undefined when
 * there is none. On `side` 0 its centre stays on the line; on -1 or 1 it is moved across the
 * line, to that side of it, until it keeps `g` from it.
 */
function slide<R extends Rect>(
  room: R,
  track: TagTrack,
  g: number,
  field: TagField,
  side: Side = 0
): R | undefined {
  const { s, t, headStart, headEnd } = track;
  const len = Math.hypot(t.x - s.x, t.y - s.y);
  if (!(len > 0)) return undefined;
  const u = { x: (t.x - s.x) / len, y: (t.y - s.y) / len };
  const ax = Math.abs(u.x);
  const ay = Math.abs(u.y);
  // How far the grown tag on the line reaches along it each side of its centre; beside the
  // line it covers neither tip, so its centre may go anywhere along it.
  const half =
    side === 0
      ? Math.min(
          ax > 0 ? (room.width / 2 + g) / ax : Infinity,
          ay > 0 ? (room.height / 2 + g) / ay : Infinity
        )
      : 0;
  const lo = side === 0 ? half + headStart : 0;
  const hi = side === 0 ? len - half - headEnd : len;
  if (lo > hi) return undefined;
  const home = (room.x + room.width / 2 - s.x) * u.x + (room.y + room.height / 2 - s.y) * u.y;
  // How far the centre moves across the line: the grown tag's reach across it.
  const off = side * ((room.width / 2 + g) * ay + (room.height / 2 + g) * ax);
  const at = (k: number): R => ({
    ...room,
    x: s.x + u.x * k - u.y * off - room.width / 2,
    y: s.y + u.y * k + u.x * off - room.height / 2,
  });
  const back = { x: -u.x, y: -u.y };
  const ok = (r: Rect): boolean =>
    !overHead(grown(r, g), s, u, track.reachStart) &&
    !overHead(grown(r, g), t, back, track.reachEnd) &&
    clear(r, g, field);
  const k = nearestSpot(lo, hi, home, (spot) => ok(at(spot)));
  return k === undefined ? undefined : at(k);
}

/** The squared distance between the centres of `a` and `b`. */
const apart = (a: Rect, b: Rect): number =>
  (a.x + a.width / 2 - b.x - b.width / 2) ** 2 + (a.y + a.height / 2 - b.y - b.height / 2) ** 2;

/** The tag slid beside its line, on the side where it moves least (the first on a tie). */
function beside<R extends Rect>(room: R, track: TagTrack, field: TagField): R | undefined {
  const g = BLOCK_METRICS.labelClearance;
  const one = slide(room, track, g, field, -1);
  const other = slide(room, track, g, field, 1);
  if (!one || !other) return one ?? other;
  return apart(other, room) < apart(one, room) ? other : one;
}

const NO_HEAD: MarkerReach = { back: 0, side: 0 };

/**
 * The tag `room` (centred on the edge) as placed: where it is when it crosses no block border
 * and is inside no block but its homes. Else slid along the edge to the nearest spot that is
 * and is over neither arrowhead, keeping the clearance from the borders where the edge has room
 * for it; else beside the line; else slid as far only as leaves the heads' tips in view (it may
 * then cover a corner of a head); else where it is.
 */
export function clearTag<R extends Rect>(room: R, track: TagTrack, field: TagField): R {
  if (clear(room, 0, field)) return room;
  const g = BLOCK_METRICS.labelClearance;
  const tips = { ...track, reachStart: NO_HEAD, reachEnd: NO_HEAD };
  return (
    slide(room, track, g, field) ??
    slide(room, track, 0, field) ??
    beside(room, track, field) ??
    slide(room, tips, g, field) ??
    slide(room, tips, 0, field) ??
    room
  );
}

/** `i` and the blocks that hold it, innermost first. */
function lineage(blocks: readonly BlockNodeLayout[], i: number): BlockNodeLayout[] {
  const out: BlockNodeLayout[] = [];
  for (let at: number | undefined = i; at !== undefined && blocks[at]; at = blocks[at]!.parent) {
    out.push(blocks[at]!);
  }
  return out;
}

/** The blocks `e`'s tag may sit inside: its ends and the composites that hold both. */
function homesOf(e: BlockEdgeLayout, blocks: readonly BlockNodeLayout[]): Set<BlockNodeLayout> {
  const from = lineage(
    blocks,
    blocks.findIndex((b) => b.id === e.start)
  );
  const to = lineage(
    blocks,
    blocks.findIndex((b) => b.id === e.end)
  );
  const homes = new Set(from.filter((b) => to.includes(b)));
  for (const b of [from[0], to[0]]) if (b) homes.add(b);
  return homes;
}

/** Every straight edge's tag placed by {@link clearTag}; loops and edges without one as they are. */
export function clearTags(
  edges: readonly BlockEdgeLayout[],
  blocks: readonly BlockNodeLayout[],
  heads: Arrowheads
): BlockEdgeLayout[] {
  return edges.map((e) => {
    if (e.kind !== 'line' || !e.label) return e;
    const track: TagTrack = {
      s: e.points[0]!,
      t: e.points[e.points.length - 1]!,
      headStart: markerTrim(e.arrowTypeStart, heads),
      headEnd: markerTrim(e.arrowTypeEnd, heads),
      reachStart: markerReach(e.arrowTypeStart, heads),
      reachEnd: markerReach(e.arrowTypeEnd, heads),
    };
    const label = clearTag(e.label, track, { blocks, homes: homesOf(e, blocks) });
    return label === e.label ? e : { ...e, label };
  });
}
