import { describe, expect, it } from 'vitest';
import {
  buildRectHitIndex,
  buildSegmentCrossingIndex,
  buildSegmentLineIndex,
  buildTrackConflictIndex,
  countCrossingsPerRoute,
  countCrossingsWithOthersUpTo,
  countFlaggedSegmentCrossings,
  countSegmentCrossings,
  shapesTouchAtBend,
} from '../direction/crossingIndex.ts';
import type { RouteShape } from '../direction/crossingIndex.ts';
import {
  bendPoints,
  dedupeConsecutivePoints,
  orthogonalSegmentsForPoints,
  routesTouchAtBend,
  sameAxisSegmentOverlapLength,
  segmentHitsAnyRect,
} from '../direction/geometry.ts';
import type { OrthogonalSegment, Point, RectEntry } from '../direction/geometry.ts';

/**
 * The indexes of the crossing cleanup (#687) answer what the walks they replace answer. Each
 * is checked against that walk on routes drawn from a small grid, so that routes share lines,
 * end on each other and lie within the tolerances of each other often.
 */

/** A fixed pseudo-random sequence (a 32-bit LCG). */
function sequence(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

const EPSILON = 1e-3;
/** Offsets from a grid line: on it, inside each tolerance the indexes use, and outside. */
const OFFSETS = [0, 0, 0, 0, 0.0004, 0.002, 0.4, 0.6, 2.5, 3.5];

/** A route of `turns` right-angle turns between grid points, some a little off the grid. */
function route(next: (below: number) => number, turns: number): Point[] {
  const at = (): number => 10 * next(9) + OFFSETS[next(OFFSETS.length)]!;
  const points: Point[] = [{ x: at(), y: at() }];
  let horizontal = next(2) === 0;
  for (let i = 0; i <= turns; i++) {
    const last = points[points.length - 1]!;
    points.push(horizontal ? { x: at(), y: last.y } : { x: last.x, y: at() });
    // Now and then the same point twice, as the routes in the engine have.
    if (next(8) === 0) {
      points.push({ ...points[points.length - 1]! });
    }
    horizontal = !horizontal;
  }
  return points;
}

const routes = (seed: number, count: number): Point[][] => {
  const next = sequence(seed);
  return Array.from({ length: count }, () => route(next, 1 + next(5)));
};

const shapeOf = (points: Point[]): RouteShape => ({
  segments: orthogonalSegmentsForPoints(points),
  touchSegments: orthogonalSegmentsForPoints(dedupeConsecutivePoints(points)),
  bends: bendPoints(points),
});

describe('the crossing cleanup indexes (#687)', () => {
  it('counts the crossings a walk over every segment counts', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const indexed = routes(seed, 60).map((points) =>
        orthogonalSegmentsForPoints(dedupeConsecutivePoints(points))
      );
      const index = buildSegmentCrossingIndex(indexed.flat(), EPSILON);
      let crossings = 0;
      for (const points of routes(seed + 100, 60)) {
        const segments = orthogonalSegmentsForPoints(points);
        const walked = indexed.reduce(
          (sum, other) => sum + countSegmentCrossings(segments, other, EPSILON),
          0
        );
        expect(index.count(segments)).toBe(walked);
        crossings += walked;
      }
      // The routes do cross: the comparison is not of zeros.
      expect(crossings).toBeGreaterThan(100);
    }
  });

  it('counts a segment asked again, alone or in a route, as it did the first time (#843)', () => {
    const indexed = routes(31, 60).map((points) =>
      orthogonalSegmentsForPoints(dedupeConsecutivePoints(points))
    );
    const index = buildSegmentCrossingIndex(indexed.flat(), EPSILON);
    const queried = routes(131, 60).map((points) => orthogonalSegmentsForPoints(points));
    const first = queried.map((segments) => index.count(segments));
    let crossings = 0;
    for (const [i, segments] of queried.entries()) {
      const walked = indexed.reduce(
        (sum, other) => sum + countSegmentCrossings(segments, other, EPSILON),
        0
      );
      expect(first[i]).toBe(walked);
      expect(index.count(segments)).toBe(walked);
      expect(segments.reduce((sum, segment) => sum + index.count([segment]), 0)).toBe(walked);
      crossings += walked;
    }
    expect(crossings).toBeGreaterThan(100);
  });

  it('keeps thousands of answers, both zeros and NaN apart, as asking afresh gives them (#843)', () => {
    const next = sequence(51);
    // Lines on a fine grid, so that thousands of distinct queries fill and grow the table.
    const at = (): number => [0, -0, Number.NaN][next(40)] ?? next(400) / 4;
    const segment = (horizontal: boolean): OrthogonalSegment => {
      const [line, from, to] = [at(), at(), at()];
      const [a, b] = horizontal
        ? [
            { x: from, y: line },
            { x: to, y: line },
          ]
        : [
            { x: line, y: from },
            { x: line, y: to },
          ];
      return { index: 0, a, b, horizontal, vertical: !horizontal };
    };
    const indexed = Array.from({ length: 300 }, (_, i) => segment(i % 2 === 0));
    const index = buildSegmentCrossingIndex(indexed, EPSILON);
    const queried = Array.from({ length: 6000 }, (_, i) => segment(i % 3 !== 0));
    // And many queries on one span at different lines, so keys that differ in one number share
    // the table's probe runs.
    const along = Array.from({ length: 3000 }, (_, i) => ({
      index: 0,
      a: { x: 0, y: i / 30 },
      b: { x: 100, y: i / 30 },
      horizontal: true,
      vertical: false,
    }));
    for (const pass of [1, 2]) {
      for (const [i, one] of [...queried, ...along].entries()) {
        expect(index.count([one]), `pass ${pass}, query ${i}`).toBe(
          countSegmentCrossings([one], indexed, EPSILON)
        );
      }
    }
  });

  it('counts the crossings with the other routes up to a limit as the full count does (#843)', () => {
    let stopped = 0;
    for (const seed of [41, 42, 43, 44]) {
      const indexed = routes(seed, 60).map((points) =>
        orthogonalSegmentsForPoints(dedupeConsecutivePoints(points))
      );
      const index = buildSegmentCrossingIndex(indexed.flat(), EPSILON);
      for (const [i, points] of routes(seed + 100, 60).entries()) {
        const segments = orthogonalSegmentsForPoints(points);
        const own = indexed[i % indexed.length]!;
        const full = index.count(segments) - countSegmentCrossings(segments, own, EPSILON);
        for (const limit of [-1, 0, 1, 2, full - 1, full, full + 1, Infinity]) {
          const counted = countCrossingsWithOthersUpTo(index, segments, own, EPSILON, limit);
          if (full <= limit) {
            expect(counted).toBe(full);
          } else {
            expect(counted).toBeGreaterThan(limit);
            if (counted < full) stopped++;
          }
        }
      }
    }
    // It does stop early, so the comparison is not only of full counts.
    expect(stopped).toBeGreaterThan(100);
  });

  it('counts crossings from the segment flags as the strict test counts them (#843)', () => {
    let crossings = 0;
    for (const seed of [61, 62, 63, 64]) {
      const all = routes(seed, 80).map((points) => orthogonalSegmentsForPoints(points));
      for (const first of all) {
        for (const second of all) {
          const expected = countSegmentCrossings(first, second, EPSILON);
          expect(countFlaggedSegmentCrossings(first, second, EPSILON)).toBe(expected);
          crossings += expected;
        }
      }
    }
    expect(crossings).toBeGreaterThan(1000);
    // And at each tolerance edge: a crossing line exactly the tolerance in from an end.
    const ends = [0, 10];
    const at = [
      ends[0]! + EPSILON,
      ends[1]! - EPSILON,
      ends[0]! + EPSILON + 1e-9,
      ends[1]! - EPSILON - 1e-9,
      5,
    ];
    const horizontals = at.map((y) =>
      orthogonalSegmentsForPoints([
        { x: ends[0]!, y },
        { x: ends[1]!, y },
      ])
    );
    const verticals = at.map((x) =>
      orthogonalSegmentsForPoints([
        { x, y: ends[0]! },
        { x, y: ends[1]! },
      ])
    );
    // And segments shorter than the tolerance both ways, which carry both flags.
    const both = [
      { x: 5, y: 5 },
      { x: 0 + EPSILON / 2, y: 5 },
      { x: 5, y: 10 - EPSILON / 2 },
    ].map((a) => ({
      index: 0,
      a,
      b: { x: a.x + EPSILON / 4, y: a.y + EPSILON / 4 },
      horizontal: true,
      vertical: true,
    }));
    for (const h of [...horizontals, ...both.map((segment) => [segment])]) {
      for (const v of [...verticals, ...both.map((segment) => [segment])]) {
        for (const [first, second] of [
          [h, v],
          [v, h],
        ] as const) {
          expect(countFlaggedSegmentCrossings(first, second, EPSILON)).toBe(
            countSegmentCrossings(first, second, EPSILON)
          );
        }
      }
    }
  });

  it('counts nothing against an empty index, and nothing for an empty route', () => {
    const [points] = routes(9, 1) as [Point[]];
    const segments = orthogonalSegmentsForPoints(points);
    expect(buildSegmentCrossingIndex([], EPSILON).count(segments)).toBe(0);
    expect(buildSegmentCrossingIndex(segments, EPSILON).count([])).toBe(0);
  });

  it('finds the routes a walk over every route finds in conflict', () => {
    const options = { lineTolerance: 0.5, minShared: 8, touchTolerance: 3 };
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const indexed = routes(seed, 40).map((points) => dedupeConsecutivePoints(points));
      const index = buildTrackConflictIndex(
        indexed.map((points, owner) => [owner, shapeOf(points)] as const),
        options
      );
      let conflicts = 0;
      for (const points of routes(seed + 100, 40)) {
        const shape = shapeOf(points);
        const walked = new Set<number>();
        for (const [owner, other] of indexed.entries()) {
          const otherSegments = orthogonalSegmentsForPoints(other);
          const sharesTrack = shape.segments.some((segment) =>
            otherSegments.some(
              (otherSegment) =>
                sameAxisSegmentOverlapLength(segment, otherSegment, options.lineTolerance) >=
                options.minShared
            )
          );
          if (sharesTrack || routesTouchAtBend(points, other, options.touchTolerance)) {
            walked.add(owner);
          }
        }
        const except = indexed.length - 1;
        walked.delete(except);
        const found = index.conflicts(shape, except, Infinity);
        expect([...found].sort((a, b) => a - b)).toEqual([...walked].sort((a, b) => a - b));
        // A limit stops the search; what it has found by then is in conflict.
        const limited = index.conflicts(shape, except, 2);
        expect(limited.size).toBe(Math.min(2, walked.size));
        expect([...limited].every((owner) => walked.has(owner))).toBe(true);
        conflicts += walked.size;
      }
      expect(conflicts).toBeGreaterThan(40);
    }
  });

  it('reads two shapes as touching where routesTouchAtBend reads their routes so', () => {
    const all = routes(21, 80);
    let touching = 0;
    for (let i = 0; i + 1 < all.length; i += 2) {
      const [first, second] = [all[i]!, all[i + 1]!];
      const touch = routesTouchAtBend(first, second, 3);
      expect(shapesTouchAtBend(shapeOf(first), shapeOf(second), 3)).toBe(touch);
      touching += touch ? 1 : 0;
    }
    expect(touching).toBeGreaterThan(0);
    expect(touching).toBeLessThan(all.length / 2);
  });

  it("counts each route's crossings with the others, and every crossing pair once", () => {
    for (const seed of [41, 42, 43]) {
      const segmentsOf = new Map(
        routes(seed, 50).map(
          (points, owner) =>
            [owner, orthogonalSegmentsForPoints(dedupeConsecutivePoints(points))] as const
        )
      );
      const index = buildSegmentCrossingIndex([...segmentsOf.values()].flat(), EPSILON);
      const { byRoute, total } = countCrossingsPerRoute(segmentsOf, index, EPSILON);
      let pairs = 0;
      for (const [owner, segments] of segmentsOf) {
        let walked = 0;
        for (const [other, otherSegments] of segmentsOf) {
          if (other !== owner) {
            walked += countSegmentCrossings(segments, otherSegments, EPSILON);
          }
          if (other > owner) {
            pairs += countSegmentCrossings(segments, otherSegments, EPSILON);
          }
        }
        expect(byRoute.get(owner)).toBe(walked);
      }
      expect(total).toBe(pairs);
      expect(pairs).toBeGreaterThan(100);
    }
  });

  it('finds every segment on the same axis within reach of a line', () => {
    const all = routes(51, 60).flatMap((points, owner) =>
      orthogonalSegmentsForPoints(points).map((segment) => ({ owner, segment }))
    );
    const index = buildSegmentLineIndex(all);
    const lineOf = (s: (typeof all)[number]['segment']): number => (s.horizontal ? s.a.y : s.a.x);
    let found = 0;
    for (const { segment } of all.slice(0, 80)) {
      for (const reach of [0, 1, 8]) {
        const walked = all.filter(
          (other) =>
            other.segment.horizontal === segment.horizontal &&
            Math.abs(lineOf(other.segment) - lineOf(segment)) <= reach
        );
        const near = [...index.sameAxisNear(segment, reach)];
        expect(new Set(near)).toEqual(new Set(walked));
        expect(near).toHaveLength(walked.length);
        found += walked.length;
      }
    }
    expect(found).toBeGreaterThan(240);
  });

  it('finds a node box hit where a walk over every box finds one', () => {
    const next = sequence(31);
    const rects: RectEntry[] = Array.from({ length: 50 }, (_, i) => {
      const left = 10 * next(9) + next(3);
      const top = 10 * next(9) + next(3);
      return {
        id: `n${i}`,
        rect: { left, top, right: left + 1 + next(12), bottom: top + 1 + next(6) },
      };
    });
    const index = buildRectHitIndex(rects, 2);
    let hits = 0;
    for (const points of routes(32, 200)) {
      const exclude = [`n${next(50)}`, `n${next(50)}`];
      for (const { a, b } of orthogonalSegmentsForPoints(points)) {
        const walked = segmentHitsAnyRect(a, b, rects, exclude, -2);
        expect(index.hits(a, b, exclude)).toBe(walked);
        hits += walked ? 1 : 0;
      }
    }
    expect(hits).toBeGreaterThan(50);
    expect(buildRectHitIndex([], 2).hits({ x: 0, y: 0 }, { x: 9, y: 0 }, [])).toBe(false);
  });
});
