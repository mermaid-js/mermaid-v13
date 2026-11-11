/**
 * The five C4 shapes as the layout sees them (D446): which one an element is drawn as, its size
 * around its text, and its outline as a union of rectangles and ellipses, which the router clips
 * relations to (Pele `route.ts` `hit()`, https://github.com/obsidianmd/pele at commit 3a2f075, MIT,
 * (c) 2026 kepano, here with the rounded corners as well) and the invariants check ends against.
 *
 * Sizes follow v12's shapes with `c4.c4ShapePadding` as their padding and `c4.width` as their
 * least width (`c4ShapeAdapter.ts`, `drawRect`): a rounded box `max(width, text + 2·pad)` by
 * `text + 2·pad`; the person 26 taller for its head; the cylinder `3·ry` taller for its caps; the
 * queue `2·rx` wider; `fr-rect` 16 wider for its frame lines. The cylinder, the queue and
 * `fr-rect` take their padding from the theme's shape rows instead (v12 `look: neo`, D152): the
 * cylinder `cylinderPadding*`, the queue half of it (v12's tilted cylinder padded half what its
 * cylinder did, in both looks), `fr-rect` `subroutinePadding*`; in the classic themes each is
 * `2·pad`, as the others.
 */
// cspell:ignore kepano
import { capRy, cylinderSize, queueRx } from '@mermaid-js/shared/shapes/kit';
import { kindParts, type C4Element } from '../model.ts';
import { C4_METRICS as M } from './metrics.ts';
import type { C4ShapeId, Point, Rect } from './types.ts';

/** v12 `c4ShapeAdapter.ts` `SHAPE_KEYWORDS`: `$shape`, `$sprite` and `$tags` words, any case. */
const KEYWORDS: ReadonlyMap<string, C4ShapeId> = new Map([
  ['person', 'person'],
  ['box', 'rounded'],
  ['rounded', 'rounded'],
  ['cylinder', 'cyl'],
  ['database', 'cyl'],
  ['db', 'cyl'],
  ['queue', 'h-cyl'],
  ['pipe', 'h-cyl'],
  ['component', 'fr-rect'],
]);

const keyword = (value: string | undefined): C4ShapeId | undefined =>
  value === undefined ? undefined : KEYWORDS.get(value.toLowerCase());

/** v12 `resolveNodeShape`: `$shape`, else `$sprite`, else a `$tags` word, else the kind. */
export function shapeOf(element: Pick<C4Element, 'shape' | 'sprite' | 'tags' | 'kind'>): C4ShapeId {
  const explicit = keyword(element.shape) ?? keyword(element.sprite);
  if (explicit) return explicit;
  for (const tag of element.tags?.split(',') ?? []) {
    const tagged = keyword(tag.trim());
    if (tagged) return tagged;
  }
  const { family, store } = kindParts(element.kind);
  if (family === 'person') return 'person';
  if (store === 'db') return 'cyl';
  if (store === 'queue') return 'h-cyl';
  return 'rounded';
}

/** A shape's size around a text block `tw` × `th`, and where the text's centre sits from the box's. */
export interface ShapeSize {
  readonly w: number;
  readonly h: number;
  readonly dx: number;
  readonly dy: number;
}

/** Padding totals across (`x`) and down (`y`). */
export interface PadXY {
  readonly x: number;
  readonly y: number;
}

/**
 * How a shape is sized: its padding all round and its least width (`c4ShapePadding`,
 * `c4.width`), and the totals the cylinder, the queue and `fr-rect` take from the theme.
 */
export interface ShapeRoom {
  readonly pad: number;
  readonly least: number;
  readonly cylinder: PadXY;
  readonly queue: PadXY;
  readonly subroutine: PadXY;
}

export function shapeSize(
  shape: C4ShapeId,
  tw: number,
  th: number,
  { pad, least, cylinder, queue, subroutine }: ShapeRoom
): ShapeSize {
  const w = Math.max(least, tw + 2 * pad);
  const h = th + 2 * pad;
  switch (shape) {
    case 'person':
      return { w, h: h + M.personHead, dx: 0, dy: M.personHead / 2 };
    case 'cyl':
      return { ...cylinderSize(tw, th, cylinder, 0, least), dx: 0 };
    case 'h-cyl': {
      const qh = th + queue.y;
      const rx = queueRx(qh);
      return { w: Math.max(least, tw + queue.x + 2 * rx), h: qh, dx: -rx / 2, dy: 0 };
    }
    case 'fr-rect':
      return {
        w: Math.max(least, tw + subroutine.x + 2 * M.frameInset),
        h: th + subroutine.y,
        dx: 0,
        dy: 0,
      };
    case 'rounded':
      return { w, h, dx: 0, dy: 0 };
  }
}

/** What an outline is made of: rectangles and ellipses, overlapping. */
export type Piece =
  | {
      readonly kind: 'rect';
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
    }
  | {
      readonly kind: 'ellipse';
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
    };

const rectPiece = (x0: number, y0: number, x1: number, y1: number): Piece => ({
  kind: 'rect',
  x0,
  y0,
  x1,
  y1,
});
const ellipse = (cx: number, cy: number, rx: number, ry: number): Piece => ({
  kind: 'ellipse',
  cx,
  cy,
  rx,
  ry,
});

/** A rounded rectangle: two rectangles across and down, and a circle in each corner. */
function roundedPieces({ x, y, width: w, height: h }: Rect, radius: number): Piece[] {
  const r = Math.min(radius, w / 2, h / 2);
  if (!(r > 0)) return [rectPiece(x, y, x + w, y + h)];
  return [
    rectPiece(x + r, y, x + w - r, y + h),
    rectPiece(x, y + r, x + w, y + h - r),
    ellipse(x + r, y + r, r, r),
    ellipse(x + w - r, y + r, r, r),
    ellipse(x + r, y + h - r, r, r),
    ellipse(x + w - r, y + h - r, r, r),
  ];
}

/** What the router knows of a box: where it is and how its outline runs. */
export interface Outline extends Rect {
  /** The shape it is drawn as; a boundary's frame is `frame`. */
  readonly form: C4ShapeId | 'frame';
}

/** The pieces of `box`'s outline. */
export function piecesOf(box: Outline): Piece[] {
  const { x, y, width: w, height: h } = box;
  switch (box.form) {
    case 'person':
      return [
        ...roundedPieces(
          { x, y: y + M.personHead, width: w, height: h - M.personHead },
          M.shapeRadius
        ),
        ellipse(x + w / 2, y + M.personHeadCentre, M.personHeadRadius, M.personHeadRadius),
      ];
    case 'cyl': {
      const ry = capRy(w);
      return [
        rectPiece(x, y + ry, x + w, y + h - ry),
        ellipse(x + w / 2, y + ry, w / 2, ry),
        ellipse(x + w / 2, y + h - ry, w / 2, ry),
      ];
    }
    case 'h-cyl': {
      const rx = queueRx(h);
      return [
        rectPiece(x + rx, y, x + w - rx, y + h),
        ellipse(x + rx, y + h / 2, rx, h / 2),
        ellipse(x + w - rx, y + h / 2, rx, h / 2),
      ];
    }
    case 'frame':
      return roundedPieces(box, M.boundaryRadius);
    case 'fr-rect':
      // v12's subroutine is a square polygon (its `rx` style does not round one).
      return [rectPiece(x, y, x + w, y + h)];
    case 'rounded':
      return roundedPieces(box, M.shapeRadius);
  }
}

/** A rectangle by its sides. */
export interface Sides {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The sides of a box. */
export const sidesOf = (r: Rect): Sides => ({
  x0: r.x,
  y0: r.y,
  x1: r.x + r.width,
  y1: r.y + r.height,
});

/** How far along the segment from `p` by `d` it first meets the rectangle; Infinity when it misses. */
export function hitRect(
  { x0, y0, x1, y1 }: Sides,
  { x: px, y: py }: Point,
  { x: dx, y: dy }: Point
): number {
  let enter = 0;
  let leave = 1;
  if (dx === 0) {
    if (px < x0 || px > x1) return Infinity;
  } else {
    const a = (x0 - px) / dx;
    const b = (x1 - px) / dx;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  if (dy === 0) {
    if (py < y0 || py > y1) return Infinity;
  } else {
    const a = (y0 - py) / dy;
    const b = (y1 - py) / dy;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  return enter <= leave ? enter : Infinity;
}

function hitEllipse(
  p: Extract<Piece, { kind: 'ellipse' }>,
  { x: px, y: py }: Point,
  { x: dx, y: dy }: Point
): number {
  const ux = dx / p.rx;
  const uy = dy / p.ry;
  const vx = (px - p.cx) / p.rx;
  const vy = (py - p.cy) / p.ry;
  const a = ux * ux + uy * uy;
  const b = 2 * (ux * vx + uy * vy);
  const c = vx * vx + vy * vy - 1;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t >= 0 && t <= 1) return t;
  // The segment starts inside the ellipse: it meets the outline at once.
  return c <= 0 ? 0 : Infinity;
}

/** Where the segment from `p` to `q`, from outside, first meets `box`'s outline, as a fraction of it. */
export function hit(box: Outline, p: Point, q: Point): number {
  const d = { x: q.x - p.x, y: q.y - p.y };
  let t = Infinity;
  for (const piece of piecesOf(box)) {
    const at = piece.kind === 'rect' ? hitRect(piece, p, d) : hitEllipse(piece, p, d);
    if (at < t) t = at;
  }
  return t;
}

/** Whether `p` lies inside the piece grown by `by` (shrunk when `by` is negative). */
function inPiece(piece: Piece, p: Point, by: number): boolean {
  if (piece.kind === 'rect')
    return (
      p.x >= piece.x0 - by && p.x <= piece.x1 + by && p.y >= piece.y0 - by && p.y <= piece.y1 + by
    );
  const rx = piece.rx + by;
  const ry = piece.ry + by;
  if (!(rx > 0 && ry > 0)) return false;
  const u = (p.x - piece.cx) / rx;
  const v = (p.y - piece.cy) / ry;
  return u * u + v * v <= 1;
}

/** Whether `p` is on `box`'s outline, within `tol`: inside it grown by `tol`, not inside it shrunk by `tol`. */
export function onOutline(box: Outline, p: Point, tol: number): boolean {
  const pieces = piecesOf(box);
  return pieces.some((q) => inPiece(q, p, tol)) && !pieces.some((q) => inPiece(q, p, -tol));
}
