/**
 * The five C4 shapes as the layout sees them (D446): which one an element is drawn as, its size
 * around its text, and its outline as a union of rectangles and ellipses, which the router clips
 * relations to (the reference implementation's `route.ts` `hit()` at commit 3a2f075, here with the
 * rounded corners as well) and the invariants check ends against.
 *
 * Sizes follow v12's shapes with `c4.c4ShapePadding` as their padding and `c4.width` as their
 * least width (`c4ShapeAdapter.ts`, `drawRect`): a rounded box `max(width, text + 2·pad)` by
 * `text + 2·pad`; the person a head over a body in c4model.com's proportions (#683; on the cell
 * profile 26 taller for its head); the cylinder `3·ry` taller for its caps; the
 * queue `2·rx` wider; `fr-rect` 16 wider for its frame lines. The cylinder, the queue and
 * `fr-rect` take their padding from the theme's shape rows instead (v12 `look: neo`, D152): the
 * cylinder `cylinderPadding*`, the queue half of it (v12's tilted cylinder padded half what its
 * cylinder did, in both looks), `fr-rect` `subroutinePadding*`; in the classic themes each is
 * `2·pad`, as the others.
 */
import {
  capRy,
  cylinderSize,
  personHead,
  personNeck,
  personSize,
  queueRx,
  type PadXY,
} from '@mermaid-js/shared/shapes/kit';
import { clipSegment } from '@mermaid-js/shared/layout/segment-clip';
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

/** A person's head (a circle) and body (a box the head overlaps), in its laid-out box. */
export interface PersonParts {
  readonly head: { readonly cx: number; readonly cy: number; readonly r: number };
  readonly body: Rect;
}

/**
 * The person's head and body in `box`. As a figure (the SVG, #683): the shared person figure's
 * head, its radius from the width, at the top and overlapping the body. As a box (`figure`
 * false, the text output's cell layout): 12.2.0's head of radius 13 in a 26 px row.
 */
export function personParts({ x, y, width: w, height: h }: Rect, figure = true): PersonParts {
  if (!figure) {
    return {
      head: { cx: x + w / 2, cy: y + M.personHeadCentre, r: M.personHeadRadius },
      body: { x, y: y + M.personHead, width: w, height: h - M.personHead },
    };
  }
  const r = personHead(w);
  const top = personNeck(r);
  return {
    head: { cx: x + w / 2, cy: y + r, r },
    body: { x, y: y + top, width: w, height: h - top },
  };
}

/**
 * What of a shape a relation label must not cover: its box, or for a person drawn as a figure
 * its head's square and its body, so that a label may sit in the empty corners beside the head
 * (#955 review). On the cell profile a person is a box with a head row (`person-box`) and blocks
 * its whole box, as text output frames it.
 */
export function labelBlockers(box: Outline): Rect[] {
  if (box.form !== 'person') return [box];
  const { head, body } = personParts(box);
  return [
    { x: head.cx - head.r, y: head.cy - head.r, width: 2 * head.r, height: 2 * head.r },
    body,
  ];
}

/**
 * The part of a shape relations leave and reach from the side (D679): a person drawn as a
 * figure offers its body, so that a line beside it ends on the body, not the head; any other
 * shape (and a person on the cell profile, a box) offers its whole box. Ends are still clipped to
 * the real outline.
 */
export function portBox(box: Outline): Outline {
  if (box.form !== 'person') return box;
  return { ...personParts(box).body, form: 'rounded' };
}

/**
 * How far below a shape's top the middle of its {@link portBox} lies, for a shape `h` high and
 * `w` wide drawn as `form`: the line a row of shapes holding a person lines up on (D679).
 */
export function portMiddle(form: Outline['form'], w: number, h: number): number {
  const port = portBox({ x: 0, y: 0, width: w, height: h, form });
  return port.y + port.height / 2;
}

/** A shape's size around a text block `tw` × `th`, and where the text's centre sits from the box's. */
export interface ShapeSize {
  readonly w: number;
  readonly h: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * How a shape is sized: its padding all round and its least width (`c4ShapePadding`,
 * `c4.width`), the totals the cylinder, the queue and `fr-rect` take from the theme, and whether
 * the person is a figure (the SVG) or a box with a head row (the text output's cell layout).
 */
export interface ShapeRoom {
  readonly pad: number;
  readonly least: number;
  readonly figure: boolean;
  readonly cylinder: PadXY;
  readonly queue: PadXY;
  readonly subroutine: PadXY;
}

export function shapeSize(
  shape: C4ShapeId,
  tw: number,
  th: number,
  { pad, least, figure, cylinder, queue, subroutine }: ShapeRoom
): ShapeSize {
  const w = Math.max(least, tw + 2 * pad);
  const h = th + 2 * pad;
  switch (shape) {
    case 'person': {
      if (!figure) return { w, h: h + M.personHead, dx: 0, dy: M.personHead / 2 };
      // The text is centred on the part of the body the head does not cover.
      return { w, ...personSize(w, h), dx: 0 };
    }
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
  /**
   * The shape it is drawn as; a boundary's frame is `frame`, and a person on the cell profile,
   * sized as a box with a head row, `person-box`.
   */
  readonly form: C4ShapeId | 'frame' | 'person-box';
}

/**
 * The outline form of an element drawn as `shape`: on the cell profile (`cell`) a person is
 * sized as a box with a head row (`cellRoom`), so its outline is `person-box`.
 */
export const outlineForm = (shape: C4ShapeId, cell: boolean): Outline['form'] =>
  cell && shape === 'person' ? 'person-box' : shape;

/** The pieces of `box`'s outline. */
export function piecesOf(box: Outline): Piece[] {
  const { x, y, width: w, height: h } = box;
  switch (box.form) {
    case 'person':
    case 'person-box': {
      const { head, body } = personParts(box, box.form === 'person');
      return [...roundedPieces(body, M.shapeRadius), ellipse(head.cx, head.cy, head.r, head.r)];
    }
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
export const hitRect = (box: Sides, p: Point, d: Point): number =>
  clipSegment(p, d, box)?.[0] ?? Infinity;

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

/** Where along one axis `at + s·d` lies between lo and hi: every s, none, or an interval of s. */
function axisSpan(lo: number, hi: number, at: number, d: number): [number, number] | undefined {
  if (d === 0) return at >= lo && at <= hi ? [-Infinity, Infinity] : undefined;
  const u = (lo - at) / d;
  const v = (hi - at) / d;
  return [Math.min(u, v), Math.max(u, v)];
}

/** The s for which `p + s·n` is inside `piece`, as an interval; none when the line misses it. */
function spanIn(piece: Piece, p: Point, n: Point): [number, number] | undefined {
  if (piece.kind === 'rect') {
    const x = axisSpan(piece.x0, piece.x1, p.x, n.x);
    const y = axisSpan(piece.y0, piece.y1, p.y, n.y);
    if (!x || !y) return undefined;
    const lo = Math.max(x[0], y[0]);
    const hi = Math.min(x[1], y[1]);
    return lo <= hi ? [lo, hi] : undefined;
  }
  const [ux, uy] = [n.x / piece.rx, n.y / piece.ry];
  const [vx, vy] = [(p.x - piece.cx) / piece.rx, (p.y - piece.cy) / piece.ry];
  const a = ux * ux + uy * uy;
  const b = 2 * (ux * vx + uy * vy);
  const disc = b * b - 4 * a * (vx * vx + vy * vy - 1);
  if (a === 0 || disc < 0) return undefined;
  return [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
}

/** How far up from 0 the intervals cover without a gap; 0 when none holds 0. */
function reach(spans: readonly (readonly [number, number])[]): number {
  let far = 0;
  for (let grown = true; grown; ) {
    grown = false;
    for (const [lo, hi] of spans)
      if (lo <= far && hi > far) {
        far = hi;
        grown = true;
      }
  }
  return far;
}

/**
 * How far `p` can move along the unit vector `n` and stay inside `box`'s outline: against `n`,
 * then along it; 0 each way when `p` is not inside.
 */
export function insideAlong(box: Outline, p: Point, n: Point): [number, number] {
  const spans = piecesOf(box).flatMap((piece) => {
    const s = spanIn(piece, p, n);
    return s ? [s] : [];
  });
  return [reach(spans.map(([lo, hi]) => [-hi, -lo] as const)), reach(spans)];
}

/** Whether `p` is on `box`'s outline, within `tol`: inside it grown by `tol`, not inside it shrunk by `tol`. */
export function onOutline(box: Outline, p: Point, tol: number): boolean {
  const pieces = piecesOf(box);
  return pieces.some((q) => inPiece(q, p, tol)) && !pieces.some((q) => inPiece(q, p, -tol));
}
