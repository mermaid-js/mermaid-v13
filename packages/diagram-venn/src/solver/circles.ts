// cspell:ignore Gratzl circleintersection
/**
 * Circle geometry for the venn solver (spec #429 T3, D411): the area where circles intersect,
 * with the arcs around it, and the two-circle overlap and intersection points.
 *
 * Ported from venn.js 2.0.0 (https://github.com/upsetjs/venn.js, `src/circleintersection.js`),
 * MIT License, Copyright (c) 2013 Ben Frederickson, Copyright (c) 2021 Samuel Gratzl. The
 * arithmetic and its order are venn.js's, so the solve matches it to the last bit; the stats
 * object is a typed result.
 */

/** A circle in solver units (venn.js `{x, y, radius}`). */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A point where two circles cross, with the indexes of the two circles. */
export interface IntersectionPoint extends Point {
  readonly parentIndex: readonly [number, number];
  /** Set while the area is computed: the angle about the inner polygon's centre. */
  angle?: number;
}

/** One arc of an area's outline, from `p2` to `p1` on `circle`. */
export interface Arc {
  readonly circle: Circle;
  readonly width: number;
  readonly p1: Point;
  readonly p2: Point;
  readonly large: boolean;
  readonly sweep: boolean;
}

/** What `intersectionArea` also works out (venn.js's `stats`). */
export interface AreaStats {
  readonly area: number;
  readonly arcs: readonly Arc[];
}

const SMALL = 1e-10;

/** The area inside every circle of `circles`, with its outline. */
export function intersectionStats(circles: readonly Circle[]): AreaStats {
  // get all the intersection points of the circles
  const intersectionPoints = getIntersectionPoints(circles);

  // filter out points that aren't included in all the circles
  const innerPoints = intersectionPoints.filter((p) => containedInCircles(p, circles));

  let arcArea = 0;
  let polygonArea = 0;
  const arcs: Arc[] = [];

  // if we have intersection points that are within all the circles,
  // then figure out the area contained by them
  if (innerPoints.length > 1) {
    // sort the points by angle from the center of the polygon, which lets
    // us just iterate over points to get the edges
    const center = getCenter(innerPoints);
    for (const p of innerPoints) p.angle = Math.atan2(p.x - center.x, p.y - center.y);
    innerPoints.sort((a, b) => b.angle! - a.angle!);

    // iterate over all points, get arc between the points
    // and update the areas
    let p2 = innerPoints[innerPoints.length - 1]!;
    for (const p1 of innerPoints) {
      // polygon area updates easily ...
      polygonArea += (p2.x + p1.x) * (p1.y - p2.y);

      // updating the arc area is a little more involved
      const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const arc = smallestArc(circles, p1, p2, midPoint);

      if (arc !== null) {
        arcs.push(arc);
        arcArea += circleArea(arc.circle.radius, arc.width);
        p2 = p1;
      }
    }
  } else {
    // no intersection points, is either disjoint - or is completely
    // overlapped. figure out which by examining the smallest circle
    let smallest = circles[0]!;
    for (let i = 1; i < circles.length; ++i) {
      if (circles[i]!.radius < smallest.radius) smallest = circles[i]!;
    }

    // make sure the smallest circle is completely contained in all
    // the other circles
    let disjoint = false;
    for (const circle of circles) {
      if (distance(circle, smallest) > Math.abs(smallest.radius - circle.radius)) {
        disjoint = true;
        break;
      }
    }

    if (disjoint) {
      arcArea = polygonArea = 0;
    } else {
      arcArea = smallest.radius * smallest.radius * Math.PI;
      arcs.push({
        circle: smallest,
        p1: { x: smallest.x, y: smallest.y + smallest.radius },
        p2: { x: smallest.x - SMALL, y: smallest.y + smallest.radius },
        width: smallest.radius * 2,
        large: true,
        sweep: true,
      });
    }
  }

  polygonArea /= 2;

  return { area: arcArea + polygonArea, arcs };
}

/**
 * Of the circles both `p1` and `p2` lie on, the one whose arc between them is narrowest: the
 * edge of the intersection there.
 */
function smallestArc(
  circles: readonly Circle[],
  p1: IntersectionPoint,
  p2: IntersectionPoint,
  midPoint: Point
): Arc | null {
  let arc: Arc | null = null;
  for (const parent of p1.parentIndex) {
    if (!p2.parentIndex.includes(parent)) continue;
    // figure out the angle halfway between the two points
    // on the current circle
    const circle = circles[parent]!;
    const a1 = Math.atan2(p1.x - circle.x, p1.y - circle.y);
    const a2 = Math.atan2(p2.x - circle.x, p2.y - circle.y);

    let angleDiff = a2 - a1;
    if (angleDiff < 0) angleDiff += 2 * Math.PI;

    // and use that angle to figure out the width of the
    // arc
    const a = a2 - angleDiff / 2;
    let width = distance(midPoint, {
      x: circle.x + circle.radius * Math.sin(a),
      y: circle.y + circle.radius * Math.cos(a),
    });

    // clamp the width to the largest is can actually be
    // (sometimes slightly overflows because of FP errors)
    if (width > circle.radius * 2) width = circle.radius * 2;

    // pick the circle whose arc has the smallest width
    if (arc === null || arc.width > width) {
      arc = { circle, width, p1, p2, large: width > circle.radius, sweep: true };
    }
  }
  return arc;
}

/** The area inside every circle of `circles` (venn.js `intersectionArea`). */
export function intersectionArea(circles: readonly Circle[]): number {
  return intersectionStats(circles).area;
}

/** Whether `point` is inside every circle of `circles`. */
function containedInCircles(point: Point, circles: readonly Circle[]): boolean {
  return circles.every((circle) => distance(point, circle) < circle.radius + SMALL);
}

/** Every point where two of `circles` cross. */
function getIntersectionPoints(circles: readonly Circle[]): IntersectionPoint[] {
  const ret: IntersectionPoint[] = [];
  for (let i = 0; i < circles.length; ++i) {
    for (let j = i + 1; j < circles.length; ++j) {
      for (const p of circleCircleIntersection(circles[i]!, circles[j]!)) {
        ret.push({ x: p.x, y: p.y, parentIndex: [i, j] });
      }
    }
  }
  return ret;
}

/** The area of the circular segment of width `width` of a circle of radius `r`. */
export function circleArea(r: number, width: number): number {
  return r * r * Math.acos(1 - width / r) - (r - width) * Math.sqrt(width * (2 * r - width));
}

/** Euclidean distance. */
export function distance(p1: Point, p2: Point): number {
  return Math.sqrt((p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y));
}

/** The overlap area of two circles of radius `r1` and `r2` whose centres are `d` apart. */
export function circleOverlap(r1: number, r2: number, d: number): number {
  // no overlap
  if (d >= r1 + r2) return 0;

  // completely overlapped
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) * Math.min(r1, r2);

  const w1 = r1 - (d * d - r2 * r2 + r1 * r1) / (2 * d);
  const w2 = r2 - (d * d - r1 * r1 + r2 * r2) / (2 * d);
  return circleArea(r1, w1) + circleArea(r2, w2);
}

/**
 * The two points where `p1` and `p2` cross; none when they are apart, one holds the other, or
 * they touch.
 */
export function circleCircleIntersection(p1: Circle, p2: Circle): Point[] {
  const d = distance(p1, p2);
  const r1 = p1.radius;
  const r2 = p2.radius;

  // if to far away, or self contained - can't be done
  if (d >= r1 + r2 || d <= Math.abs(r1 - r2)) return [];

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(r1 * r1 - a * a);
  const x0 = p1.x + (a * (p2.x - p1.x)) / d;
  const y0 = p1.y + (a * (p2.y - p1.y)) / d;
  const rx = -(p2.y - p1.y) * (h / d);
  const ry = -(p2.x - p1.x) * (h / d);

  return [
    { x: x0 + rx, y: y0 - ry },
    { x: x0 - rx, y: y0 + ry },
  ];
}

/** The mean of `points`. */
export function getCenter(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}
