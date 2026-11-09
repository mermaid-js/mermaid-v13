/**
 * The five C4 shapes as the layout sees them (D446): which one an element is drawn as, its size
 * around its text, and its outline as a union of rectangles and ellipses, which the router clips
 * relations to (Pele `route.ts` `hit()`, https://github.com/obsidianmd/pele at commit 3a2f075, MIT,
 * (c) 2026 kepano, here with the rounded corners as well) and the invariants check ends against.
 *
 * Sizes follow v12's shapes with `c4.c4ShapePadding` as their padding and `c4.width` as their
 * least width (`c4ShapeAdapter.ts`, `drawRect`): a rounded box `max(width, text + 2·pad)` by
 * `text + 2·pad`; the person 26 taller for its head; the cylinder `3·ry` taller for its caps; the
 * queue `2·rx` wider; `fr-rect` 16 wider for its frame lines.
 */
// cspell:ignore kepano
import type { C4Element } from '../model.ts';
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
  const kind = element.kind;
  if (kind.endsWith('person')) return 'person';
  if (kind.endsWith('_db')) return 'cyl';
  if (kind.endsWith('_queue')) return 'h-cyl';
  return 'rounded';
}

/** The cylinder's cap radius for a width, and the queue's for a height. */
export const capRy = (w: number): number =>
  Math.min(M.capMax, Math.max(M.capMin, w / M.capDivisor));
export const queueRx = (h: number): number => Math.min(M.capMax, h / M.queueDivisor);

/** A shape's size around a text block `tw` × `th`, and where the text's centre sits from the box's. */
export interface ShapeSize {
  readonly w: number;
  readonly h: number;
  readonly dx: number;
  readonly dy: number;
}

export function shapeSize(
  shape: C4ShapeId,
  tw: number,
  th: number,
  pad: number,
  least: number
): ShapeSize {
  const w = Math.max(least, tw + 2 * pad);
  const h = th + 2 * pad;
  switch (shape) {
    case 'person':
      return { w, h: h + M.personHead, dx: 0, dy: M.personHead / 2 };
    case 'cyl': {
      const ry = capRy(w);
      return { w, h: h + 3 * ry, dx: 0, dy: ry / 2 };
    }
    case 'h-cyl': {
      const rx = queueRx(h);
      return { w: Math.max(least, tw + 2 * pad + 2 * rx), h, dx: -rx / 2, dy: 0 };
    }
    case 'fr-rect':
      return { w: Math.max(least, tw + 2 * pad + 2 * M.frameInset), h, dx: 0, dy: 0 };
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
function roundedPieces(x: number, y: number, w: number, h: number, radius: number): Piece[] {
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
        ...roundedPieces(x, y + M.personHead, w, h - M.personHead, M.shapeRadius),
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
      return roundedPieces(x, y, w, h, M.boundaryRadius);
    case 'rounded':
    case 'fr-rect':
      return roundedPieces(x, y, w, h, M.shapeRadius);
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

/** How far along the segment from (px, py) by (dx, dy) it first meets the rectangle; Infinity when it misses. */
export function hitRect(
  { x0, y0, x1, y1 }: Sides,
  px: number,
  py: number,
  dx: number,
  dy: number
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
  px: number,
  py: number,
  dx: number,
  dy: number
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

/** Where the segment from (px, py) to (qx, qy), from outside, first meets `box`'s outline, as a fraction of it. */
export function hit(box: Outline, px: number, py: number, qx: number, qy: number): number {
  const dx = qx - px;
  const dy = qy - py;
  let t = Infinity;
  for (const p of piecesOf(box)) {
    const at = p.kind === 'rect' ? hitRect(p, px, py, dx, dy) : hitEllipse(p, px, py, dx, dy);
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
