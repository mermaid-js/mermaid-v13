// cspell:ignore Gratzl areaids circleid circleids fmin setid
/**
 * Where each area of a venn solution is (spec #429 T3, D411): its label point, the one with the
 * widest margin inside its circles and outside the others, and its outline as arcs.
 *
 * Ported from venn.js 2.0.0 (https://github.com/upsetjs/venn.js, `src/diagram.js`:
 * `circleMargin`, `computeTextCentre`, `getOverlappingCircles`, `computeTextCentres`,
 * `intersectionAreaArcs`, `circlePath`, `arcsToPath`, `intersectionAreaPath`), MIT License,
 * Copyright (c) 2013 Ben Frederickson, Copyright (c) 2021 Samuel Gratzl. The arithmetic and its
 * order are venn.js's (no `symmetricalTextCentre`, which mermaid leaves off); the outline is
 * plain data where venn.js wrote an SVG path string, and the centres are keyed by a key that
 * keeps ids holding a comma apart.
 */
import { distance, getCenter, intersectionStats, type Circle, type Point } from './circles.ts';
import { nelderMead } from './fmin.ts';
import { nullRecord, type Area } from './solve.ts';

/** A label point; `disjoint` when the area is not on the chart (venn.js puts it at y −1000). */
export interface TextCentre extends Point {
  readonly disjoint?: true;
}

/** The smallest margin of `current` inside `interior` and outside `exterior`. */
function circleMargin(
  current: Point,
  interior: readonly Circle[],
  exterior: readonly Circle[]
): number {
  let margin = interior[0]!.radius - distance(interior[0]!, current);

  for (let i = 1; i < interior.length; ++i) {
    const m = interior[i]!.radius - distance(interior[i]!, current);
    if (m <= margin) margin = m;
  }

  for (const e of exterior) {
    const m = distance(e, current) - e.radius;
    if (m <= margin) margin = m;
  }
  return margin;
}

/**
 * The centre of the area inside `interior` and outside `exterior`: the point of widest margin,
 * from the best of a few samples, refined by Nelder–Mead.
 */
export function computeTextCentre(
  interior: readonly Circle[],
  exterior: readonly Circle[]
): TextCentre {
  // get an initial estimate by sampling around the interior circles
  // and taking the point with the biggest margin
  const points: Point[] = [];
  for (const c of interior) {
    points.push({ x: c.x, y: c.y });
    points.push({ x: c.x + c.radius / 2, y: c.y });
    points.push({ x: c.x - c.radius / 2, y: c.y });
    points.push({ x: c.x, y: c.y + c.radius / 2 });
    points.push({ x: c.x, y: c.y - c.radius / 2 });
  }

  let initial = points[0]!;
  let margin = circleMargin(points[0]!, interior, exterior);

  for (let i = 1; i < points.length; ++i) {
    const m = circleMargin(points[i]!, interior, exterior);
    if (m >= margin) {
      initial = points[i]!;
      margin = m;
    }
  }

  // maximize the margin numerically
  const solution = nelderMead(
    (p) => -1 * circleMargin({ x: p[0]!, y: p[1]! }, interior, exterior),
    [initial.x, initial.y],
    { maxIterations: 500, minErrorDelta: 1e-10 }
  ).x;

  const ret = { x: solution[0]!, y: solution[1]! };

  // check solution, fallback as needed (happens if fully overlapped
  // etc)
  let valid = true;
  for (const i of interior) {
    if (distance(ret, i) > i.radius) {
      valid = false;
      break;
    }
  }

  for (const e of exterior) {
    if (distance(ret, e) < e.radius) {
      valid = false;
      break;
    }
  }
  if (valid) return ret;

  if (interior.length === 1) return { x: interior[0]!.x, y: interior[0]!.y };
  const { arcs } = intersectionStats(interior);

  if (arcs.length === 0) return { x: 0, y: -1000, disjoint: true };
  if (arcs.length === 1) return { x: arcs[0]!.circle.x, y: arcs[0]!.circle.y };
  // try again without other circles
  if (exterior.length) return computeTextCentre(interior, []);
  // take average of all the points in the intersection
  // polygon. this should basically never happen
  // and has some issues:
  // https://github.com/benfred/venn.js/issues/48#issuecomment-146069777
  return getCenter(arcs.map((a) => a.p1));
}

/** For each set id, the ids of the circles that hold its circle whole. */
function getOverlappingCircles(
  circles: Readonly<Record<string, Circle>>
): Record<string, string[]> {
  const ret = nullRecord<string[]>();
  const circleids = Object.keys(circles);
  for (const circleid of circleids) ret[circleid] = [];
  for (let i = 0; i < circleids.length; i++) {
    const ci = circleids[i]!;
    const a = circles[ci]!;
    for (let j = i + 1; j < circleids.length; ++j) {
      const cj = circleids[j]!;
      const b = circles[cj]!;
      const d = distance(a, b);

      if (d + b.radius <= a.radius + 1e-10) ret[cj]!.push(ci);
      else if (d + a.radius <= b.radius + 1e-10) ret[ci]!.push(cj);
    }
  }
  return ret;
}

/** The key of an area's sets in {@link computeTextCentres}' result. */
export const areaKey = (sets: readonly string[]): string => JSON.stringify(sets);

/** The label point of every area, by {@link areaKey}. */
export function computeTextCentres(
  circles: Readonly<Record<string, Circle>>,
  areas: readonly Area[]
): Map<string, TextCentre> {
  const ret = new Map<string, TextCentre>();
  const overlapped = getOverlappingCircles(circles);
  for (const { sets: area } of areas) {
    const areaids = nullRecord<true>();
    const exclude = nullRecord<true>();

    for (const id of area) {
      areaids[id] = true;
      // keep track of any circles that overlap this area,
      // and don't consider for purposes of computing the text
      // centre
      for (const o of overlapped[id]!) exclude[o] = true;
    }

    const interior: Circle[] = [];
    const exterior: Circle[] = [];
    for (const setid in circles) {
      if (setid in areaids) interior.push(circles[setid]!);
      else if (!(setid in exclude)) exterior.push(circles[setid]!);
    }
    ret.set(areaKey(area), computeTextCentre(interior, exterior));
  }
  return ret;
}

/** One arc of an outline, from the point before it to `to` (SVG's `A`). */
export interface RegionArc {
  readonly radius: number;
  readonly large: boolean;
  readonly sweep: boolean;
  readonly to: Point;
}

/** An area's outline: from `start`, along each arc in turn; it ends where it started. */
export interface RegionPath {
  readonly start: Point;
  readonly arcs: readonly RegionArc[];
}

/**
 * The outline of the area inside every circle of `circles` (venn.js `intersectionAreaPath`,
 * unrounded as mermaid drew it); undefined when they have no area in common (venn.js's
 * `M 0 0`). A whole circle is two half-circle arcs, as venn.js's `circlePath`.
 */
export function intersectionAreaPath(circles: readonly Circle[]): RegionPath | undefined {
  if (circles.length === 0) return undefined;
  const { arcs } = intersectionStats(circles);
  if (arcs.length === 0) return undefined;
  if (arcs.length === 1) {
    const { x, y, radius: r } = arcs[0]!.circle;
    return {
      start: { x: x - r, y },
      arcs: [
        { radius: r, large: true, sweep: false, to: { x: x - r + r * 2, y } },
        { radius: r, large: true, sweep: false, to: { x: x - r, y } },
      ],
    };
  }
  // draw path around arcs
  return {
    start: { x: arcs[0]!.p2.x, y: arcs[0]!.p2.y },
    arcs: arcs.map((arc) => ({
      radius: arc.circle.radius,
      large: arc.large,
      sweep: arc.sweep,
      to: { x: arc.p1.x, y: arc.p1.y },
    })),
  };
}
