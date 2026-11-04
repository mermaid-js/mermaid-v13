// Relationship lines and their crow's-foot ends, drawn inline (no <defs>/<marker>, DESIGN §7.1).
// The end geometry is v12's ER markers (`markers.js` at fa796a943: `only_one`, `zero_or_one`,
// `one_or_more`, `zero_or_more` and their `_neo` copies), read in the marker's own frame: `d`
// runs from the entity outline out along the line, `s` across it.
import type { RoutePoint } from '@mermaid-js/core/layout';
import type { Attrs, PathData, SvgWriter } from '@mermaid-js/core/svg';
import { PX_END } from '../layout/ends.ts';
import type { ErCardinality } from '../parser/index.ts';

// The most a corner of a stepped route is rounded by (v12's ELK routes turn square; v13's
// `rounded` curve uses the same radius).
const RADIUS = 5;
// Bars: the first is `bar` from the outline, a second (only one) at `bar2`; a bar behind a
// crow's foot is at `barMany`. The crow's foot meets the line at `toe`. The zero circle behind
// a bar is centred at `circleOne`; behind a crow's foot at the theme's
// `erZeroOrMoreCircleOffset` (v12 neo 28, classic 30).
const { half: HALF, bar: BAR, bar2: BAR_2, barMany: BAR_MANY, toe: TOE } = PX_END;
const { circleR: CIRCLE_R, circleOne: CIRCLE_ONE } = PX_END;
// Room between two ends on one side at full size; ends drawn narrower keep it in proportion.
const END_GAP = 4;

const near = (a: RoutePoint, b: RoutePoint): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/** Unit vector from a to b, or (0, 0) when they meet. */
function unit(a: RoutePoint, b: RoutePoint): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len < 1e-9 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

/** The route without repeated points and without points part of the way along a straight run. */
function corners(route: readonly RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const p of route) {
    if (out.length > 0 && near(out[out.length - 1]!, p)) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const u = unit(a, b);
      const v = unit(b, p);
      if (Math.abs(u.x * v.y - u.y * v.x) < 1e-6 && u.x * v.x + u.y * v.y > 0) out.pop();
    }
    out.push(p);
  }
  return out;
}

/** Path data along a route: straight legs, each corner rounded by up to {@link RADIUS}. */
export function routePath(w: SvgWriter, route: readonly RoutePoint[]): PathData {
  const pts = corners(route);
  const b = w.path().moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const p = pts[i]!;
    const next = pts[i + 1]!;
    const before = Math.hypot(p.x - prev.x, p.y - prev.y);
    const after = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(RADIUS, before / 2, after / 2);
    const u = unit(prev, p);
    const v = unit(p, next);
    b.lineTo(p.x - u.x * r, p.y - u.y * r).quadTo(p.x, p.y, p.x + v.x * r, p.y + v.y * r);
  }
  const last = pts[pts.length - 1]!;
  return b.lineTo(last.x, last.y).done();
}

/** Where a line meets an entity outline, and the unit direction from there out along the line. */
export interface LineEnd {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  /** The share of the full span the end is drawn across the line at (1 when omitted). */
  readonly scale?: number;
}

/** A line end and the layout id of the box it meets. */
export interface BoxEnd {
  readonly box: string;
  readonly end: LineEnd;
}

/**
 * Each end with the scale it fits at: the ends that leave one side of one box (same box key,
 * same direction) are drawn narrower when a neighbour is closer than a full span plus
 * {@link END_GAP}, so no two overlap. The layout spaces them further apart than that when the
 * side has room (`erMetrics`, #124).
 */
export function fitEnds(ends: readonly BoxEnd[]): LineEnd[] {
  const side = (e: BoxEnd) => `${e.box}|${Math.round(e.end.dx)},${Math.round(e.end.dy)}`;
  const groups = new Map<string, BoxEnd[]>();
  for (const e of ends) {
    const key = side(e);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(e);
  }
  return ends.map((e) => {
    let nearest = Infinity;
    for (const o of groups.get(side(e))!) {
      if (o === e) continue;
      // Distance across the line, along the side.
      const d = Math.abs((o.end.x - e.end.x) * -e.end.dy + (o.end.y - e.end.y) * e.end.dx);
      // Ends the layout puts in one place are drawn over each other, at full size.
      if (d > 0.01) nearest = Math.min(nearest, d);
    }
    const fit = nearest / (2 * HALF + END_GAP);
    return fit >= 1 ? e.end : { ...e.end, scale: fit };
  });
}

/** The end of a route at its first point (`start`) or its last, pointing back along it. */
export function lineEnd(route: readonly RoutePoint[], start: boolean): LineEnd | undefined {
  const pts = corners(route);
  if (pts.length < 2) return undefined;
  const at = start ? pts[0]! : pts[pts.length - 1]!;
  const next = start ? pts[1]! : pts[pts.length - 2]!;
  const u = unit(at, next);
  return { x: at.x, y: at.y, dx: u.x, dy: u.y };
}

/** Geometry and paint of the ends for one render. */
export interface EndPaint {
  /** Stroke of the bars and crow's feet (and the circles' outline). */
  readonly line: Attrs;
  /** Fill of the zero circles (`erMarkerFill`). */
  readonly circleFill: Attrs['fill'];
  /** `erZeroOrMoreCircleOffset`: the zero-or-more circle's centre, out from the outline. */
  readonly manyCircle: number;
}

const CLASS: Readonly<Record<ErCardinality, string>> = {
  onlyOne: 'marker onlyOne',
  zeroOrOne: 'marker zeroOrOne',
  oneOrMore: 'marker oneOrMore',
  zeroOrMore: 'marker zeroOrMore',
  mdParent: 'marker mdParent',
};

/**
 * Draws the end for `card` where the line meets the outline at `end`. `mdParent` draws
 * nothing: v12 has no marker for it.
 */
export function drawEnd(w: SvgWriter, card: ErCardinality, end: LineEnd, paint: EndPaint): void {
  if (card === 'mdParent') return;
  const { x, y, dx, dy } = end;
  const k = end.scale ?? 1;
  // A point `d` out along the line and `s` across it (scaled to the room the end has).
  const px = (d: number, s: number): number => x + dx * d - dy * s * k;
  const py = (d: number, s: number): number => y + dy * d + dx * s * k;
  const b = w.path();
  const bar = (d: number): void =>
    void b.moveTo(px(d, -HALF), py(d, -HALF)).lineTo(px(d, HALF), py(d, HALF));
  // The visible half of v12's lens: from the outline at ±HALF to the toe, bowing out.
  const foot = (): void => {
    for (const s of [-HALF, HALF]) {
      b.moveTo(px(0, s), py(0, s)).quadTo(px(TOE / 2, s), py(TOE / 2, s), px(TOE, 0), py(TOE, 0));
    }
  };
  let circle: number | undefined;
  if (card === 'onlyOne') {
    bar(BAR);
    bar(BAR_2);
  } else if (card === 'zeroOrOne') {
    bar(BAR);
    circle = CIRCLE_ONE;
  } else if (card === 'oneOrMore') {
    foot();
    bar(BAR_MANY);
  } else {
    foot();
    circle = paint.manyCircle;
  }
  w.open('g', { class: CLASS[card] });
  w.leaf('path', { d: b.done(), fill: 'none', ...paint.line });
  if (circle !== undefined) {
    w.leaf('circle', {
      cx: px(circle, 0),
      cy: py(circle, 0),
      r: CIRCLE_R * k,
      fill: paint.circleFill,
      ...paint.line,
    });
  }
  w.close();
}
