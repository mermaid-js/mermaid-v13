/**
 * Where an edge label's tag goes (#1362). The tag is centred on the centres' midpoint, where
 * v12 put the label (D441). Where the tag there would sit on a block's border, it slides along
 * its edge to the nearest spot where it crosses no border and leaves both arrowheads in view.
 * Where no such spot exists, it stays at the midpoint, as before.
 */
import { clipOutline, type Outline, type Point } from '../shapes/outline.ts';
import { markerTrim, type Arrowheads } from '@mermaid-js/shared/svg/arrowheads';
import { BLOCK_METRICS } from './metrics.ts';
import type { BlockEdgeLayout, BlockNodeLayout, Rect } from './types.ts';

/** Whether `p` is inside `b`'s outline: every block shape is star-shaped about its centre. */
function inside(outline: Outline, centre: Point, p: Point): boolean {
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  const exit = clipOutline(outline, dx, dy);
  return Math.hypot(dx, dy) < Math.hypot(exit.x, exit.y);
}

const meets = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Whether `a` lies within `b`. */
const within = (a: Rect, b: Rect): boolean =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

/** The points around `r`'s rim, at most `step` apart, and its centre. */
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
 * Whether `r` crosses `b`'s border: part of its rim is inside the outline and part outside, or
 * the whole block is under it.
 */
function crosses(b: BlockNodeLayout, r: Rect): boolean {
  const { outline, box } = b;
  if (!outline || !meets(r, box)) return false;
  if (within(box, r)) return true;
  let seen: boolean | undefined;
  for (const p of rim(r, BLOCK_METRICS.labelRimStep)) {
    const now = inside(outline, b.centre, p);
    if (seen === undefined) seen = now;
    else if (now !== seen) return true;
  }
  return false;
}

/** `r` grown by `g` on every side. */
const grown = (r: Rect, g: number): Rect => ({
  x: r.x - g,
  y: r.y - g,
  width: r.width + 2 * g,
  height: r.height + 2 * g,
});

/** Whether the tag at `r`, kept `g` from every border, crosses none. */
const clear = (r: Rect, g: number, blocks: readonly BlockNodeLayout[]): boolean => {
  const room = grown(r, g);
  return !blocks.some((b) => crosses(b, room));
};

/** The edge `s → t` a tag slides on, and how much of each end its arrowhead takes. */
export interface TagTrack {
  readonly s: Point;
  readonly t: Point;
  readonly headStart: number;
  readonly headEnd: number;
}

/**
 * The tag at `room` slid along `track` to the spot nearest where it is that keeps `g` from
 * every border and leaves both heads in view; undefined when there is none.
 */
function slide<R extends Rect>(
  room: R,
  track: TagTrack,
  g: number,
  blocks: readonly BlockNodeLayout[]
): R | undefined {
  const { s, t, headStart, headEnd } = track;
  const len = Math.hypot(t.x - s.x, t.y - s.y);
  if (!(len > 0)) return undefined;
  const u = { x: (t.x - s.x) / len, y: (t.y - s.y) / len };
  // How far the grown tag reaches along the edge each side of its centre.
  const half = Math.min(
    Math.abs(u.x) > 0 ? (room.width / 2 + g) / Math.abs(u.x) : Infinity,
    Math.abs(u.y) > 0 ? (room.height / 2 + g) / Math.abs(u.y) : Infinity
  );
  const lo = half + headStart;
  const hi = len - half - headEnd;
  if (lo > hi) return undefined;
  const home = (room.x + room.width / 2 - s.x) * u.x + (room.y + room.height / 2 - s.y) * u.y;
  const tries: number[] = [hi];
  for (let k = lo; k < hi; k += BLOCK_METRICS.labelRimStep) tries.push(k);
  tries.sort((a, b) => Math.abs(a - home) - Math.abs(b - home));
  for (const k of tries) {
    const at = { ...room, x: s.x + u.x * k - room.width / 2, y: s.y + u.y * k - room.height / 2 };
    if (clear(at, g, blocks)) return at;
  }
  return undefined;
}

/**
 * The tag `room` (centred on the edge) as placed: where it is when it crosses no block border;
 * else slid along the edge to the nearest spot that crosses none and leaves both heads in view,
 * keeping the clearance from the borders where the edge has room for it; else where it is.
 */
export function clearTag<R extends Rect>(
  room: R,
  track: TagTrack,
  blocks: readonly BlockNodeLayout[]
): R {
  if (clear(room, 0, blocks)) return room;
  return (
    slide(room, track, BLOCK_METRICS.labelClearance, blocks) ??
    slide(room, track, 0, blocks) ??
    room
  );
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
    };
    const label = clearTag(e.label, track, blocks);
    return label === e.label ? e : { ...e, label };
  });
}
