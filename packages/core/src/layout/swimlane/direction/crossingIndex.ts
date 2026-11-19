// v13 (#687): indexes over one round's route segments for the crossing cleanup
// (`resolveRenderedOrthogonalCrossings`), so scoring a candidate reroute does not walk every
// other edge. Each answers exactly what the walk it replaces answered: the same predicates on
// the same numbers, only fewer of them.
import {
  distanceToSegment,
  orthogonalSegmentsStrictlyCross,
  sameAxisSegmentOverlapLength,
  segmentBoundsOverlapRect,
} from './geometry.ts';
import type { Point } from '../../types.ts';
import type { OrthogonalSegment, RectEntry } from './geometry.ts';

/** How many of the sorted `values` are below `limit` (or equal to it, with `orEqual`). */
function countBelow(values: Float64Array, limit: number, orEqual: boolean): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const value = values[mid]!;
    if (value < limit || (orEqual && value === limit)) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/** A segment as the segments at right angles to it see it: where it is, and what it spans. */
interface Span {
  /** Its place on the axis it does not run along. */
  at: number;
  /** Its extent along its own axis, already narrowed by the tolerance on both ends. */
  from: number;
  to: number;
}

/**
 * Counts the spans a query stabs: those with `after < at < before` and `from < through < to`.
 * The spans are sorted by `at`, and a Fenwick tree over that order keeps each node's `from`
 * and `to` values sorted, so a count is O(log² n) however many spans it finds.
 */
class StabCounter {
  private readonly at: Float64Array;
  /** Fenwick nodes, 1-based: node `i` holds the spans `i - (i & -i) .. i - 1`. */
  private readonly from: Float64Array[] = [new Float64Array(0)];
  private readonly to: Float64Array[] = [new Float64Array(0)];

  constructor(spans: Span[]) {
    // A span no wider than the tolerances is crossed by nothing. With those gone, `to <=
    // through` implies `from < through`, which `below` relies on.
    const kept = spans.filter((s) => s.from < s.to && !Number.isNaN(s.at));
    kept.sort((a, b) => a.at - b.at);
    this.at = Float64Array.from(kept, (s) => s.at);
    for (let node = 1; node <= kept.length; node++) {
      const held = kept.slice(node - (node & -node), node);
      this.from.push(Float64Array.from(held, (s) => s.from).sort());
      this.to.push(Float64Array.from(held, (s) => s.to).sort());
    }
  }

  /** Of the first `end` spans, those with `from < through < to`. */
  private below(end: number, through: number): number {
    let count = 0;
    for (let node = end; node > 0; node -= node & -node) {
      count +=
        countBelow(this.from[node]!, through, false) - countBelow(this.to[node]!, through, true);
    }
    return count;
  }

  count(after: number, before: number, through: number): number {
    if (!(after < before)) {
      return 0;
    }
    const start = countBelow(this.at, after, true);
    const end = countBelow(this.at, before, false);
    return end > start ? this.below(end, through) - this.below(start, through) : 0;
  }
}

export interface SegmentCrossingIndex {
  /**
   * The number of pairs of one of `segments` and one indexed segment that
   * `orthogonalSegmentsStrictlyCross` holds for, with the index's tolerance.
   */
  count(segments: readonly OrthogonalSegment[]): number;
}

/**
 * Indexes `segments` for crossing counts. They, and every segment later counted against them,
 * come from `orthogonalSegmentsForPoints` with the same `epsilon`: each is horizontal or
 * vertical and never both, which is what `orthogonalSegmentsStrictlyCross` then derives too.
 */
export function buildSegmentCrossingIndex(
  segments: Iterable<OrthogonalSegment>,
  epsilon: number
): SegmentCrossingIndex {
  const horizontal: Span[] = [];
  const vertical: Span[] = [];
  for (const { a, b, horizontal: isHorizontal } of segments) {
    if (isHorizontal) {
      horizontal.push({
        at: a.y,
        from: Math.min(a.x, b.x) + epsilon,
        to: Math.max(a.x, b.x) - epsilon,
      });
    } else {
      vertical.push({
        at: a.x,
        from: Math.min(a.y, b.y) + epsilon,
        to: Math.max(a.y, b.y) - epsilon,
      });
    }
  }
  const horizontals = new StabCounter(horizontal);
  const verticals = new StabCounter(vertical);
  return {
    count(queried) {
      let count = 0;
      for (const { a, b, horizontal: isHorizontal } of queried) {
        count += isHorizontal
          ? verticals.count(Math.min(a.x, b.x) + epsilon, Math.max(a.x, b.x) - epsilon, a.y)
          : horizontals.count(Math.min(a.y, b.y) + epsilon, Math.max(a.y, b.y) - epsilon, a.x);
      }
      return count;
    },
  };
}

/** The strict crossings between two routes' segments, pair by pair. */
export function countSegmentCrossings(
  first: readonly OrthogonalSegment[],
  second: readonly OrthogonalSegment[],
  epsilon: number
): number {
  let count = 0;
  for (const one of first) {
    for (const other of second) {
      if (orthogonalSegmentsStrictlyCross(one.a, one.b, other.a, other.b, epsilon)) {
        count++;
      }
    }
  }
  return count;
}

/** Items in the order of a number each has, for "every item within a range" lookups. */
class Sorted<T> {
  private readonly keys: Float64Array;
  private readonly items: T[];

  constructor(items: T[], key: (item: T) => number) {
    this.items = items.filter((item) => !Number.isNaN(key(item)));
    this.items.sort((a, b) => key(a) - key(b));
    this.keys = Float64Array.from(this.items, key);
  }

  /** The items whose key is in `low .. high`, both ends included. */
  *within(low: number, high: number): Generator<T> {
    for (let i = countBelow(this.keys, low, false); i < this.keys.length; i++) {
      if (this.keys[i]! > high) {
        return;
      }
      yield this.items[i]!;
    }
  }

  /** How many items `within(low, high)` yields. */
  countWithin(low: number, high: number): number {
    return Math.max(0, countBelow(this.keys, high, true) - countBelow(this.keys, low, false));
  }
}

/** A route as the conflict tests read it. */
export interface RouteShape {
  /** `orthogonalSegmentsForPoints` of the route's points as they are. */
  segments: readonly OrthogonalSegment[];
  /** The same, of the points without consecutive duplicates: what `routesTouchAtBend` reads. */
  touchSegments: readonly OrthogonalSegment[];
  /** `bendPoints` of the route. */
  bends: readonly Point[];
}

interface Owned<T, V> {
  owner: T;
  value: V;
}

export interface TrackConflictIndex<T> {
  /**
   * The owners of the indexed routes, other than `except`, that `path` shares a track with
   * (two segments on one line, within `lineTolerance`, overlapping by `minShared` or more) or
   * touches at a bend (`routesTouchAtBend` with `touchTolerance`). It stops looking once it
   * has `limit` of them.
   */
  conflicts(path: RouteShape, except: T, limit: number): Set<T>;
}

export interface TrackConflictOptions {
  lineTolerance: number;
  minShared: number;
  touchTolerance: number;
}

/** True when a bend of one route lies within `tolerance` of the other: `routesTouchAtBend`. */
export function shapesTouchAtBend(
  first: RouteShape,
  second: RouteShape,
  tolerance: number
): boolean {
  const touches = (bends: readonly Point[], segments: readonly OrthogonalSegment[]): boolean =>
    bends.some((bend) => segments.some((segment) => distanceToSegment(bend, segment) < tolerance));
  return touches(first.bends, second.touchSegments) || touches(second.bends, first.touchSegments);
}

/** The place of a segment on the axis it does not run along. */
const lineOf = (segment: OrthogonalSegment): number =>
  segment.horizontal ? segment.a.y : segment.a.x;

/**
 * Indexes routes for {@link TrackConflictIndex.conflicts}. Lookups take every indexed segment
 * or bend near enough to matter (a wider range than the tests accept), and the tests
 * themselves then decide, so the answer is the one a walk over all routes gives.
 */
export function buildTrackConflictIndex<T>(
  routes: Iterable<[T, RouteShape]>,
  { lineTolerance, minShared, touchTolerance }: TrackConflictOptions
): TrackConflictIndex<T> {
  type Segment = Owned<T, OrthogonalSegment>;
  type Bend = Owned<T, Point>;
  const segments: Segment[] = [];
  const bends: Bend[] = [];
  for (const [owner, shape] of routes) {
    // An indexed route's points have no consecutive duplicates: these are all its segments.
    for (const value of shape.touchSegments) {
      segments.push({ owner, value });
    }
    for (const value of shape.bends) {
      bends.push({ owner, value });
    }
  }
  const horizontals = new Sorted(
    segments.filter((s) => s.value.horizontal),
    (s) => s.value.a.y
  );
  const verticals = new Sorted(
    segments.filter((s) => !s.value.horizontal),
    (s) => s.value.a.x
  );
  const bendsByX = new Sorted(bends, (bend) => bend.value.x);
  const bendsByY = new Sorted(bends, (bend) => bend.value.y);
  // Wider than either tolerance, and than the width a "horizontal" segment may have in y.
  const lineReach = lineTolerance + 1;
  const touchReach = touchTolerance + 1;

  /** Every indexed owner in conflict with `path`; an owner may come more than once. */
  function* conflicting(path: RouteShape): Generator<T> {
    for (const segment of path.segments) {
      const line = lineOf(segment);
      const sameAxis = segment.horizontal ? horizontals : verticals;
      for (const other of sameAxis.within(line - lineReach, line + lineReach)) {
        if (sameAxisSegmentOverlapLength(segment, other.value, lineTolerance) >= minShared) {
          yield other.owner;
        }
      }
    }
    for (const bend of path.bends) {
      for (const other of horizontals.within(bend.y - touchReach, bend.y + touchReach)) {
        if (distanceToSegment(bend, other.value) < touchTolerance) {
          yield other.owner;
        }
      }
      for (const other of verticals.within(bend.x - touchReach, bend.x + touchReach)) {
        if (distanceToSegment(bend, other.value) < touchTolerance) {
          yield other.owner;
        }
      }
    }
    for (const segment of path.touchSegments) {
      const line = lineOf(segment);
      const near = segment.horizontal ? bendsByY : bendsByX;
      for (const other of near.within(line - touchReach, line + touchReach)) {
        if (distanceToSegment(other.value, segment) < touchTolerance) {
          yield other.owner;
        }
      }
    }
  }

  return {
    conflicts(path, except, limit) {
      const found = new Set<T>();
      for (const owner of conflicting(path)) {
        if (owner !== except && found.add(owner).size >= limit) {
          break;
        }
      }
      return found;
    },
  };
}

export interface RectHitIndex {
  /** `segmentHitsAnyRect(a, b, rects, excludeIds, -buffer)`. */
  hits(a: Point, b: Point, excludeIds: readonly string[]): boolean;
}

/**
 * Indexes node boxes for "does this segment run through a box grown by `buffer`". A lookup
 * reads the boxes that reach the segment's span in x or in y, whichever are fewer.
 */
export function buildRectHitIndex(rects: readonly RectEntry[], buffer: number): RectHitIndex {
  const byLeft = new Sorted([...rects], (entry) => entry.rect.left);
  const byTop = new Sorted([...rects], (entry) => entry.rect.top);
  const widest = Math.max(0, ...rects.map((entry) => entry.rect.right - entry.rect.left));
  const tallest = Math.max(0, ...rects.map((entry) => entry.rect.bottom - entry.rect.top));
  // A box overlaps a span only if its near edge is within the span, grown by the largest box.
  const reach = buffer + 1;

  return {
    hits(a, b, excludeIds) {
      const x: [number, number] = [Math.min(a.x, b.x) - widest - reach, Math.max(a.x, b.x) + reach];
      const y: [number, number] = [
        Math.min(a.y, b.y) - tallest - reach,
        Math.max(a.y, b.y) + reach,
      ];
      const near =
        byLeft.countWithin(...x) <= byTop.countWithin(...y)
          ? byLeft.within(...x)
          : byTop.within(...y);
      for (const entry of near) {
        if (!excludeIds.includes(entry.id) && segmentBoundsOverlapRect(a, b, entry.rect, buffer)) {
          return true;
        }
      }
      return false;
    },
  };
}

/** An indexed segment and whose it is. */
export interface OwnedSegment<T> {
  owner: T;
  segment: OrthogonalSegment;
}

export interface SegmentLineIndex<T> {
  /**
   * The indexed segments on the axis of `segment` whose line is within `reach` of its line,
   * both ends included: the only ones that can share or crowd its track.
   */
  sameAxisNear(segment: OrthogonalSegment, reach: number): Iterable<OwnedSegment<T>>;
}

/** Indexes segments by the line they run on, for the "same track" tests of the passes. */
export function buildSegmentLineIndex<T>(segments: Iterable<OwnedSegment<T>>): SegmentLineIndex<T> {
  const all = [...segments];
  const horizontals = new Sorted(
    all.filter((entry) => entry.segment.horizontal),
    (entry) => entry.segment.a.y
  );
  const verticals = new Sorted(
    all.filter((entry) => !entry.segment.horizontal),
    (entry) => entry.segment.a.x
  );
  return {
    sameAxisNear(segment, reach) {
      const line = lineOf(segment);
      return (segment.horizontal ? horizontals : verticals).within(line - reach, line + reach);
    },
  };
}

/**
 * The crossings of each route with all the others, and their sum: every crossing pair once.
 * `segmentsOf` are the routes' segments, and `index` holds all of them.
 */
export function countCrossingsPerRoute<T>(
  segmentsOf: ReadonlyMap<T, readonly OrthogonalSegment[]>,
  index: SegmentCrossingIndex,
  epsilon: number
): { byRoute: Map<T, number>; total: number } {
  const byRoute = new Map<T, number>();
  let twice = 0;
  for (const [route, segments] of segmentsOf) {
    const count = index.count(segments) - countSegmentCrossings(segments, segments, epsilon);
    byRoute.set(route, count);
    twice += count;
  }
  return { byRoute, total: twice / 2 };
}
