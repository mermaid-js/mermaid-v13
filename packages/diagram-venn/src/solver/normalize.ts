// cspell:ignore Gratzl setid
/**
 * Normalising and scaling a venn solution (spec #429 T3, D411): each cluster of overlapping
 * circles turned so the second largest circle sits at `orientation` from the largest (and the
 * third below the line through them), the clusters packed largest first, then the whole scaled
 * and centred into a box.
 *
 * Ported from venn.js 2.0.0 (https://github.com/upsetjs/venn.js, `src/layout.js`:
 * `orientateCircles`, `disjointCluster`, `getBoundingBox`, `normalizeSolution`,
 * `scaleSolution`), MIT License, Copyright (c) 2013 Ben Frederickson,
 * Copyright (c) 2021 Samuel Gratzl. The arithmetic and its order are venn.js's, with the options
 * mermaid passes (venn.js's own order of circles, no `scaleToFit`); the union-find keeps its
 * parents in a map instead of on the circles.
 */
import { distance, type Circle } from './circles.ts';
import { nullRecord } from '../model.ts';
import type { Solution } from './solve.ts';

/** A circle and the set it is for. */
export interface SetCircle extends Circle {
  setid: string;
}

/** venn.js's default orientation: the second circle straight below the first (y down). */
export const ORIENTATION = Math.PI / 2;

interface Range {
  readonly min: number;
  readonly max: number;
}

interface Bounds {
  readonly xRange: Range;
  readonly yRange: Range;
}

type Cluster = SetCircle[] & { size?: number; bounds?: Bounds };

/** Turns one cluster in place: the largest circle at the origin, the second at `orientation`. */
function orientateCircles(circles: SetCircle[], orientation: number): void {
  circles.sort((a, b) => b.radius - a.radius);

  // shift circles so largest circle is at (0, 0)
  if (circles.length > 0) {
    const largestX = circles[0]!.x;
    const largestY = circles[0]!.y;

    for (const circle of circles) {
      circle.x -= largestX;
      circle.y -= largestY;
    }
  }

  if (circles.length === 2) {
    // if the second circle is a subset of the first, arrange so that
    // it is off to one side. hack for https://github.com/benfred/venn.js/issues/120
    const [first, second] = circles as [SetCircle, SetCircle];
    const dist = distance(first, second);
    if (dist < Math.abs(second.radius - first.radius)) {
      second.x = first.x + first.radius - second.radius - 1e-10;
      second.y = first.y;
    }
  }

  // rotate circles so that second largest is at an angle of 'orientation'
  // from largest
  if (circles.length > 1) {
    const rotation = Math.atan2(circles[1]!.x, circles[1]!.y) - orientation;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);

    for (const circle of circles) {
      const x = circle.x;
      const y = circle.y;
      circle.x = c * x - s * y;
      circle.y = s * x + c * y;
    }
  }

  // mirror solution if third solution is above plane specified by
  // first two circles
  if (circles.length > 2) {
    let angle = Math.atan2(circles[2]!.x, circles[2]!.y) - orientation;
    while (angle < 0) angle += 2 * Math.PI;
    while (angle > 2 * Math.PI) angle -= 2 * Math.PI;
    if (angle > Math.PI) {
      const slope = circles[1]!.y / (1e-10 + circles[1]!.x);
      for (const circle of circles) {
        const d = (circle.x + slope * circle.y) / (1 + slope * slope);
        circle.x = 2 * d - circle.x;
        circle.y = 2 * d * slope - circle.y;
      }
    }
  }
}

/** The clusters of circles that overlap one another (union-find). */
function disjointCluster(circles: readonly SetCircle[]): Cluster[] {
  const parent = new Map<SetCircle, SetCircle>(circles.map((c) => [c, c]));

  // path compression step in union find
  function find(circle: SetCircle): SetCircle {
    const p = parent.get(circle)!;
    if (p !== circle) parent.set(circle, find(p));
    return parent.get(circle)!;
  }

  const union = (x: SetCircle, y: SetCircle): void => {
    parent.set(find(x), find(y));
  };

  // get the union of all overlapping sets
  for (let i = 0; i < circles.length; ++i) {
    for (let j = i + 1; j < circles.length; ++j) {
      const maxDistance = circles[i]!.radius + circles[j]!.radius;
      if (distance(circles[i]!, circles[j]!) + 1e-10 < maxDistance) {
        union(circles[j]!, circles[i]!);
      }
    }
  }

  // find all the disjoint clusters and group them together
  const disjointClusters = new Map<string, Cluster>();
  for (const circle of circles) {
    const setid = find(circle).setid;
    let cluster = disjointClusters.get(setid);
    if (!cluster) disjointClusters.set(setid, (cluster = []));
    cluster.push(circle);
  }

  return [...disjointClusters.values()];
}

/** The box around `circles`. */
function getBoundingBox(circles: readonly Circle[]): Bounds {
  const minMax = (d: 'x' | 'y'): Range => {
    const hi = circles.reduce((acc, c) => Math.max(acc, c[d] + c.radius), Number.NEGATIVE_INFINITY);
    const lo = circles.reduce((acc, c) => Math.min(acc, c[d] - c.radius), Number.POSITIVE_INFINITY);
    return { max: hi, min: lo };
  };
  return { xRange: minMax('x'), yRange: minMax('y') };
}

/** Turns and packs `solution` (venn.js `normalizeSolution`); `solution` gains each `setid`. */
export function normalizeSolution(
  solution: Solution,
  orientation: number = ORIENTATION
): Record<string, SetCircle> {
  // work with a list instead of a dictionary, and take a copy so we
  // don't mutate input
  let circles: Cluster = fromObjectNotation(solution).map((d) => ({ ...d }));

  // get all the disjoint clusters
  const clusters = disjointCluster(circles);

  // orientate all disjoint sets, get sizes
  for (const cluster of clusters) {
    orientateCircles(cluster, orientation);
    const bounds = getBoundingBox(cluster);
    cluster.size =
      (bounds.xRange.max - bounds.xRange.min) * (bounds.yRange.max - bounds.yRange.min);
    cluster.bounds = bounds;
  }
  clusters.sort((a, b) => b.size! - a.size!);

  // orientate the largest at 0,0, and get the bounds
  circles = clusters[0]!;
  let returnBounds = circles.bounds!;
  const spacing = (returnBounds.xRange.max - returnBounds.xRange.min) / 50;

  function addCluster(cluster: Cluster | undefined, right: boolean, bottom: boolean): void {
    if (!cluster) return;

    const bounds = cluster.bounds!;
    let xOffset: number;
    let yOffset: number;

    if (right) {
      xOffset = returnBounds.xRange.max - bounds.xRange.min + spacing;
    } else {
      xOffset = returnBounds.xRange.max - bounds.xRange.max;
      const centreing =
        (bounds.xRange.max - bounds.xRange.min) / 2 -
        (returnBounds.xRange.max - returnBounds.xRange.min) / 2;
      if (centreing < 0) xOffset += centreing;
    }

    if (bottom) {
      yOffset = returnBounds.yRange.max - bounds.yRange.min + spacing;
    } else {
      yOffset = returnBounds.yRange.max - bounds.yRange.max;
      const centreing =
        (bounds.yRange.max - bounds.yRange.min) / 2 -
        (returnBounds.yRange.max - returnBounds.yRange.min) / 2;
      if (centreing < 0) yOffset += centreing;
    }

    for (const c of cluster) {
      c.x += xOffset;
      c.y += yOffset;
      circles.push(c);
    }
  }

  let index = 1;
  while (index < clusters.length) {
    addCluster(clusters[index], true, false);
    addCluster(clusters[index + 1], false, true);
    addCluster(clusters[index + 2], true, true);
    index += 3;

    // have one cluster (in top left). lay out next three relative
    // to it in a grid
    returnBounds = getBoundingBox(circles);
  }

  // convert back to solution form
  return toObjectNotation(circles);
}

/**
 * Scales `solution` to fit `width × height` less `padding` on every side, centred (venn.js
 * `scaleSolution`). A solution with no extent is returned as it is.
 */
export function scaleSolution(
  solution: Record<string, Circle>,
  boxWidth: number,
  boxHeight: number,
  padding: number
): Record<string, SetCircle> {
  const circles = fromObjectNotation(solution);

  const width = boxWidth - 2 * padding;
  const height = boxHeight - 2 * padding;

  const { xRange, yRange } = getBoundingBox(circles);

  if (xRange.max === xRange.min || yRange.max === yRange.min) {
    return solution as Record<string, SetCircle>;
  }

  const xScaling = width / (xRange.max - xRange.min);
  const yScaling = height / (yRange.max - yRange.min);

  const scaling = Math.min(yScaling, xScaling);
  // while we're at it, center the diagram too
  const xOffset = (width - (xRange.max - xRange.min) * scaling) / 2;
  const yOffset = (height - (yRange.max - yRange.min) * scaling) / 2;

  return toObjectNotation(
    circles.map((circle) => ({
      radius: scaling * circle.radius,
      x: padding + xOffset + (circle.x - xRange.min) * scaling,
      y: padding + yOffset + (circle.y - yRange.min) * scaling,
      setid: circle.setid,
    }))
  );
}

function toObjectNotation(circles: readonly SetCircle[]): Record<string, SetCircle> {
  const r = nullRecord<SetCircle>();
  for (const circle of circles) r[circle.setid] = circle;
  return r;
}

/** The circles of `solution` in key order, each given its `setid` (in place, as venn.js). */
function fromObjectNotation(solution: Record<string, Circle>): SetCircle[] {
  return Object.keys(solution).map((id) => Object.assign(solution[id]!, { setid: id }));
}
