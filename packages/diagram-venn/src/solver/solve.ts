// cspell:ignore setids fxprime setid fmin Gratzl
/**
 * The venn solver (spec #429 T3, D411): circles whose areas are the set sizes and whose overlaps
 * come as close as they can to the overlap sizes. A greedy start (and, from eight areas on, a
 * constrained MDS start when it does better), then Nelder–Mead on the loss.
 *
 * Ported from venn.js 2.0.0 (https://github.com/upsetjs/venn.js, `src/layout.js`), MIT
 * License, Copyright (c) 2013 Ben Frederickson, Copyright (c) 2021 Samuel Gratzl. The
 * arithmetic and its order are venn.js's, with the options mermaid passes (the default loss,
 * no `distinct`). The MDS start draws from the given generator, not `Math.random` (D413).
 * Solutions are prototype-free records in venn.js's key order, so a set named `__proto__` is a
 * set like any other.
 */
import {
  circleCircleIntersection,
  circleOverlap,
  distance,
  intersectionArea,
  type Circle,
  type Point,
} from './circles.ts';
import { nullRecord } from '../model.ts';
import { bisect, conjugateGradient, nelderMead, norm2, zeros, zerosM } from './fmin.ts';

/** A set (one id) or an overlap (two or more) and its size (venn.js's area datum). */
export interface Area {
  readonly sets: readonly string[];
  readonly size: number;
  readonly weight?: number;
}

/** A circle per set id, in venn.js's key order. */
export type Solution = Record<string, Circle>;

export interface SolveOptions {
  /** Numbers in [0, 1) for the MDS start (D413: a fixed-seed generator). */
  readonly random: () => number;
}

/** What venn.js's `venn()` passes on to its optimisers. */
const MAX_ITERATIONS = 500;
const SMALL = 1e-10;

/** The circles for `areas` (venn.js `venn`), before normalising and scaling. */
export function fitCircles(areas: readonly Area[], options: SolveOptions): Solution {
  // add in missing pairwise areas as having 0 size
  const all = addMissingAreas(areas);

  // initial layout is done greedily
  const circles = bestInitialLayout(all, options);

  // transform x/y coordinates to a vector to optimize
  const setids = Object.keys(circles);
  const initial: number[] = [];
  for (const setid of setids) {
    initial.push(circles[setid]!.x);
    initial.push(circles[setid]!.y);
  }

  // optimize initial layout from our loss function
  const solution = nelderMead(
    (values) => {
      const current = nullRecord<Circle>();
      for (let i = 0; i < setids.length; ++i) {
        const setid = setids[i]!;
        current[setid] = {
          x: values[2 * i]!,
          y: values[2 * i + 1]!,
          radius: circles[setid]!.radius,
        };
      }
      return lossFunction(current, all);
    },
    initial,
    { maxIterations: MAX_ITERATIONS }
  );

  // transform solution vector back to x/y points
  const positions = solution.x;
  for (let i = 0; i < setids.length; ++i) {
    const setid = setids[i]!;
    circles[setid]!.x = positions[2 * i]!;
    circles[setid]!.y = positions[2 * i + 1]!;
  }

  return circles;
}

/** The distance two circles of radius `r1` and `r2` need for their overlap to be `overlap`. */
export function distanceFromIntersectArea(r1: number, r2: number, overlap: number): number {
  // handle complete overlapped circles
  if (Math.min(r1, r2) * Math.min(r1, r2) * Math.PI <= overlap + SMALL) {
    return Math.abs(r1 - r2);
  }

  return bisect((d) => circleOverlap(r1, r2, d) - overlap, 0, r1 + r2);
}

/**
 * `areas` with every pair of sets that has no overlap of its own added at size 0, so sets with
 * no overlap given are laid out apart.
 */
export function addMissingAreas(areas: readonly Area[]): Area[] {
  const r = areas.map((s) => ({ ...s }));
  const toKey = (arr: readonly string[]): string => arr.join(';');

  // two circle intersections that aren't defined
  const ids: string[] = [];
  const pairs = new Set<string>();
  for (const area of r) {
    if (area.sets.length === 1) {
      ids.push(area.sets[0]!);
    } else if (area.sets.length === 2) {
      const a = area.sets[0]!;
      const b = area.sets[1]!;
      pairs.add(toKey(area.sets));
      pairs.add(toKey([b, a]));
    }
  }

  ids.sort((a, b) => {
    if (a === b) return 0;
    return a < b ? -1 : +1;
  });

  for (let i = 0; i < ids.length; ++i) {
    const a = ids[i]!;
    for (let j = i + 1; j < ids.length; ++j) {
      const b = ids[j]!;
      if (!pairs.has(toKey([a, b]))) r.push({ sets: [a, b], size: 0 });
    }
  }
  return r;
}

/**
 * The distances the pairs of sets want, and whether each pair is a subset (1), disjoint (−1) or
 * neither (0).
 */
function getDistanceMatrices(
  areas: readonly Area[],
  sets: readonly Area[],
  setids: Readonly<Record<string, number>>
): { distances: number[][]; constraints: number[][] } {
  // initialize an empty distance matrix between all the points
  const distances = zerosM(sets.length, sets.length);
  const constraints = zerosM(sets.length, sets.length);

  // compute required distances between all the sets such that
  // the areas match
  for (const current of areas.filter((x) => x.sets.length === 2)) {
    const left = setids[current.sets[0]!]!;
    const right = setids[current.sets[1]!]!;
    const r1 = Math.sqrt(sets[left]!.size / Math.PI);
    const r2 = Math.sqrt(sets[right]!.size / Math.PI);
    const d = distanceFromIntersectArea(r1, r2, current.size);

    distances[left]![right] = distances[right]![left] = d;

    // also update constraints to indicate if its a subset or disjoint
    // relationship
    let c = 0;
    if (current.size + 1e-10 >= Math.min(sets[left]!.size, sets[right]!.size)) {
      c = 1;
    } else if (current.size <= 1e-10) {
      c = -1;
    }
    constraints[left]![right] = constraints[right]![left] = c;
  }

  return { distances, constraints };
}

/** The loss and gradient of the constrained MDS. */
function constrainedMDSGradient(
  x: readonly number[],
  fxprime: number[],
  distances: readonly (readonly number[])[],
  constraints: readonly (readonly number[])[]
): number {
  for (let i = 0; i < fxprime.length; ++i) fxprime[i] = 0;

  let loss = 0;
  for (let i = 0; i < distances.length; ++i) {
    const xi = x[2 * i]!;
    const yi = x[2 * i + 1]!;
    for (let j = i + 1; j < distances.length; ++j) {
      const xj = x[2 * j]!;
      const yj = x[2 * j + 1]!;
      const dij = distances[i]![j]!;
      const constraint = constraints[i]![j]!;

      const squaredDistance = (xj - xi) * (xj - xi) + (yj - yi) * (yj - yi);
      const d = Math.sqrt(squaredDistance);
      const delta = squaredDistance - dij * dij;

      if ((constraint > 0 && d <= dij) || (constraint < 0 && d >= dij)) continue;

      loss += 2 * delta * delta;

      fxprime[2 * i]! += 4 * delta * (xi - xj);
      fxprime[2 * i + 1]! += 4 * delta * (yi - yj);

      fxprime[2 * j]! += 4 * delta * (xj - xi);
      fxprime[2 * j + 1]! += 4 * delta * (yj - yi);
    }
  }
  return loss;
}

/**
 * The greedy start, or the constrained MDS start when there are eight areas or more and it has
 * the lower loss (greedy is better looking on two and three circles, since it aligns them).
 */
function bestInitialLayout(areas: readonly Area[], options: SolveOptions): Solution {
  let initial = greedyLayout(areas);

  if (areas.length >= 8) {
    const constrained = constrainedMDSLayout(areas, options);
    const constrainedLoss = lossFunction(constrained, areas);
    const greedyLoss = lossFunction(initial, areas);

    if (constrainedLoss + 1e-8 < greedyLoss) initial = constrained;
  }
  return initial;
}

/** The constrained MDS start: the best of ten conjugate-gradient runs from random points. */
function constrainedMDSLayout(areas: readonly Area[], options: SolveOptions): Solution {
  const restarts = 10;

  // bidirectionally map sets to a rowid  (so we can create a matrix)
  const sets: Area[] = [];
  const setids = nullRecord<number>();
  for (const area of areas) {
    if (area.sets.length === 1) {
      setids[area.sets[0]!] = sets.length;
      sets.push(area);
    }
  }

  const matrices = getDistanceMatrices(areas, sets, setids);
  const { constraints } = matrices;

  // keep distances bounded, things get messed up otherwise.
  const norm = norm2(matrices.distances.map(norm2)) / matrices.distances.length;
  const distances = matrices.distances.map((row) => row.map((value) => value / norm));

  const obj = (x: readonly number[], fxprime: number[]): number =>
    constrainedMDSGradient(x, fxprime, distances, constraints);

  let best: { x: number[]; fx: number } | null = null;
  for (let i = 0; i < restarts; ++i) {
    const initial = zeros(distances.length * 2).map(() => options.random());

    const current = conjugateGradient(obj, initial, { maxIterations: MAX_ITERATIONS });
    if (!best || current.fx < best.fx) best = current;
  }

  const positions = best!.x;

  // translate rows back to (x,y,radius) coordinates
  const circles = nullRecord<Circle>();
  for (let i = 0; i < sets.length; ++i) {
    const set = sets[i]!;
    circles[set.sets[0]!] = {
      x: positions[2 * i]! * norm,
      y: positions[2 * i + 1]! * norm,
      radius: Math.sqrt(set.size / Math.PI),
    };
  }
  return circles;
}

/** A set's circle while the greedy start places it. */
interface GreedyCircle extends Circle {
  readonly size: number;
}

/** Another set a set overlaps, by how much, and how much it counts. */
interface Overlap {
  readonly set: string;
  readonly size: number;
  readonly weight: number;
}

/**
 * The greedy start: from the most overlapped set to the least, each at the candidate position
 * (beside, above or below a placed set at the distance their overlap wants, or where two such
 * distances meet) with the lowest loss so far.
 */
function greedyLayout(areas: readonly Area[]): Solution {
  // define a circle for each set
  const circles = nullRecord<GreedyCircle>();
  const setOverlaps = nullRecord<Overlap[]>();
  for (const area of areas) {
    if (area.sets.length === 1) {
      const set = area.sets[0]!;
      circles[set] = { x: 1e10, y: 1e10, size: area.size, radius: Math.sqrt(area.size / Math.PI) };
      setOverlaps[set] = [];
    }
  }

  const pairs = areas.filter((a) => a.sets.length === 2);

  // map each set to a list of all the other sets that overlap it
  for (const current of pairs) {
    let weight = current.weight ?? 1.0;
    const left = current.sets[0]!;
    const right = current.sets[1]!;

    // completely overlapped circles shouldn't be positioned early here
    if (current.size + SMALL >= Math.min(circles[left]!.size, circles[right]!.size)) weight = 0;

    setOverlaps[left]!.push({ set: right, size: current.size, weight });
    setOverlaps[right]!.push({ set: left, size: current.size, weight });
  }

  // get list of most overlapped sets
  const mostOverlapped: { set: string; size: number }[] = [];
  for (const set of Object.keys(setOverlaps)) {
    let size = 0;
    for (const o of setOverlaps[set]!) size += o.size * o.weight;
    mostOverlapped.push({ set, size });
  }

  // sort by size desc
  const sortOrder = (a: { size: number }, b: { size: number }): number => b.size - a.size;
  mostOverlapped.sort(sortOrder);

  // keep track of what sets have been laid out
  const positioned = nullRecord<boolean>();
  const isPositioned = (element: Overlap): boolean => element.set in positioned;

  const positionSet = (point: Point, index: string): void => {
    circles[index]!.x = point.x;
    circles[index]!.y = point.y;
    positioned[index] = true;
  };

  // add most overlapped set at (0,0)
  positionSet({ x: 0, y: 0 }, mostOverlapped[0]!.set);

  for (let i = 1; i < mostOverlapped.length; ++i) {
    const setIndex = mostOverlapped[i]!.set;
    const overlap = setOverlaps[setIndex]!.filter(isPositioned);
    const set = circles[setIndex]!;
    overlap.sort(sortOrder);

    if (overlap.length === 0) {
      // this shouldn't happen anymore with addMissingAreas
      throw new Error('missing pairwise overlap information');
    }

    const points: Point[] = [];
    for (let j = 0; j < overlap.length; ++j) {
      // get appropriate distance from most overlapped already added set
      const p1 = circles[overlap[j]!.set]!;
      const d1 = distanceFromIntersectArea(set.radius, p1.radius, overlap[j]!.size);

      // sample positions at 90 degrees for maximum aesthetics
      points.push({ x: p1.x + d1, y: p1.y });
      points.push({ x: p1.x - d1, y: p1.y });
      points.push({ y: p1.y + d1, x: p1.x });
      points.push({ y: p1.y - d1, x: p1.x });

      // if we have at least 2 overlaps, then figure out where the
      // set should be positioned analytically and try those too
      for (let k = j + 1; k < overlap.length; ++k) {
        const p2 = circles[overlap[k]!.set]!;
        const d2 = distanceFromIntersectArea(set.radius, p2.radius, overlap[k]!.size);

        points.push(
          ...circleCircleIntersection(
            { x: p1.x, y: p1.y, radius: d1 },
            { x: p2.x, y: p2.y, radius: d2 }
          )
        );
      }
    }

    // we have some candidate positions for the set, examine loss
    // at each position to figure out where to put it at
    let bestLoss = 1e50;
    let bestPoint = points[0]!;
    for (const point of points) {
      circles[setIndex]!.x = point.x;
      circles[setIndex]!.y = point.y;
      const localLoss = lossFunction(circles, pairs);
      if (localLoss < bestLoss) {
        bestLoss = localLoss;
        bestPoint = point;
      }
    }

    positionSet(bestPoint, setIndex);
  }

  return circles;
}

/**
 * The squared difference between the overlaps the circles have and the sizes `overlaps` want
 * (sets are skipped), each weighted.
 */
export function lossFunction(circles: Readonly<Solution>, overlaps: readonly Area[]): number {
  let output = 0;

  for (const area of overlaps) {
    if (area.sets.length === 1) continue;
    let overlap: number;
    if (area.sets.length === 2) {
      const left = circles[area.sets[0]!]!;
      const right = circles[area.sets[1]!]!;
      overlap = circleOverlap(left.radius, right.radius, distance(left, right));
    } else {
      overlap = intersectionArea(area.sets.map((d) => circles[d]!));
    }

    const weight = area.weight ?? 1.0;
    output += weight * (overlap - area.size) * (overlap - area.size);
  }

  return output;
}
