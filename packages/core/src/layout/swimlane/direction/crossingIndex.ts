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
import type { OrthogonalSegment, Point, RectEntry } from './geometry.ts';

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

/** The slots a {@link CountTable} starts with: a power of two. */
const COUNT_TABLE_START = 1024;
/** Mixing constants for the slot of a key (32-bit odd multipliers, as in MurmurHash3). */
const MIX_A = 0xcc9e2d51;
const MIX_B = 0x1b873593;
/** Scratch views to read a number's 64 bits. */
const bitsOf = new Float64Array(1);
const wordsOf = new Uint32Array(bitsOf.buffer);

/** Folds the bits of `value` into `hash`; both zeros fold alike, as they count alike. */
function mix(hash: number, value: number): number {
  bitsOf[0] = value === 0 ? 0 : value;
  const low = Math.imul(hash ^ Math.imul(wordsOf[0]!, MIX_A), MIX_B);
  const high = Math.imul(((low << 13) | (low >>> 19)) ^ Math.imul(wordsOf[1]!, MIX_A), MIX_B);
  return (high << 13) | (high >>> 19);
}

/**
 * {@link StabCounter.count}'s answers by `after`, `before` and `through`, in an open-addressed
 * table of typed arrays: a round asks hundreds of thousands of queries, and a table of numbers
 * gives the collector no objects to trace. A key with NaN is never kept (NaN equals nothing),
 * so it is counted each time it is asked, to the same answer.
 */
class CountTable {
  private keys = new Float64Array(3 * COUNT_TABLE_START);
  /** The answer in each slot, or -1 for an empty slot. */
  private counts = new Int32Array(COUNT_TABLE_START).fill(-1);
  private used = 0;
  private readonly counter: StabCounter;

  constructor(counter: StabCounter) {
    this.counter = counter;
  }

  count(after: number, before: number, through: number): number {
    if (hasNaN(after, before, through)) {
      return this.counter.count(after, before, through);
    }
    const slot = this.slotOf(after, before, through);
    const stored = this.counts[slot]!;
    if (stored !== -1) {
      return stored;
    }
    const count = this.counter.count(after, before, through);
    this.store(slot, after, before, through, count);
    return count;
  }

  /** The slot that holds the key, or the empty slot where it goes. */
  private slotOf(after: number, before: number, through: number): number {
    const mask = this.counts.length - 1;
    let slot = mix(mix(mix(0, after), before), through) & mask;
    while (this.counts[slot] !== -1 && !this.holds(slot, after, before, through)) {
      slot = (slot + 1) & mask;
    }
    return slot;
  }

  private holds(slot: number, after: number, before: number, through: number): boolean {
    const k = 3 * slot;
    return this.keys[k] === after && this.keys[k + 1] === before && this.keys[k + 2] === through;
  }

  private store(slot: number, after: number, before: number, through: number, count: number): void {
    this.keys[3 * slot] = after;
    this.keys[3 * slot + 1] = before;
    this.keys[3 * slot + 2] = through;
    this.counts[slot] = count;
    if (++this.used * 2 > this.counts.length) {
      this.grow();
    }
  }

  /** Twice the slots, every answer moved to its slot there. */
  private grow(): void {
    const { keys, counts } = this;
    this.keys = new Float64Array(2 * keys.length);
    this.counts = new Int32Array(2 * counts.length).fill(-1);
    for (let old = 0; old < counts.length; old++) {
      if (counts[old] !== -1) {
        const after = keys[3 * old]!;
        const before = keys[3 * old + 1]!;
        const through = keys[3 * old + 2]!;
        const slot = this.slotOf(after, before, through);
        this.keys[3 * slot] = after;
        this.keys[3 * slot + 1] = before;
        this.keys[3 * slot + 2] = through;
        this.counts[slot] = counts[old]!;
      }
    }
  }
}

/** Whether any of the numbers is NaN, which no key can match. */
const hasNaN = (a: number, b: number, c: number): boolean =>
  Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c);

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
  // A query's count depends on its three numbers alone, so each is counted once (#843).
  const crossingVerticals = new CountTable(verticals);
  const crossingHorizontals = new CountTable(horizontals);
  return {
    count(queried) {
      let count = 0;
      for (const { a, b, horizontal: isHorizontal } of queried) {
        count += isHorizontal
          ? crossingVerticals.count(Math.min(a.x, b.x) + epsilon, Math.max(a.x, b.x) - epsilon, a.y)
          : crossingHorizontals.count(
              Math.min(a.y, b.y) + epsilon,
              Math.max(a.y, b.y) - epsilon,
              a.x
            );
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

/**
 * Whether two segments of `orthogonalSegmentsForPoints` with `epsilon` cross strictly, as
 * `orthogonalSegmentsStrictlyCross` with that `epsilon` decides. The flags the segments carry
 * are the axes it would derive again, so it reads them and allocates nothing.
 */
function flaggedSegmentsCross(
  one: OrthogonalSegment,
  other: OrthogonalSegment,
  epsilon: number
): boolean {
  if (!((one.horizontal && other.vertical) || (one.vertical && other.horizontal))) {
    return false;
  }
  // The roles as orthogonalSegmentsStrictlyCross takes them, also for a segment with both flags.
  const horizontal = one.horizontal ? one : other;
  const vertical = one.horizontal ? other : one;
  return (
    strictlyWithin(vertical.a.x, horizontal.a.x, horizontal.b.x, epsilon) &&
    strictlyWithin(horizontal.a.y, vertical.a.y, vertical.b.y, epsilon)
  );
}

/** Whether `value` lies strictly between `a` and `b`, in either order, `epsilon` in from each. */
const strictlyWithin = (value: number, a: number, b: number, epsilon: number): boolean =>
  value > Math.min(a, b) + epsilon && value < Math.max(a, b) - epsilon;

/**
 * `countSegmentCrossings` for segments of `orthogonalSegmentsForPoints` with `epsilon`, as the
 * cleanup's routes and candidates are (#843): the same pairs, counted from the segments' flags.
 */
export function countFlaggedSegmentCrossings(
  first: readonly OrthogonalSegment[],
  second: readonly OrthogonalSegment[],
  epsilon: number
): number {
  let count = 0;
  for (const one of first) {
    for (const other of second) {
      if (flaggedSegmentsCross(one, other, epsilon)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * The crossings of `segments` with the indexed segments other than `own`, as
 * `index.count(segments) - countSegmentCrossings(segments, own, epsilon)` counts them, when that
 * is at most `limit`; else a number above `limit`. `own` must be indexed too, with `epsilon`. It
 * counts one segment at a time and stops once past `limit`: no segment crosses more of `own`
 * than of the index, so the count only grows.
 */

export function countCrossingsWithOthersUpTo(
  index: SegmentCrossingIndex,
  segments: readonly OrthogonalSegment[],
  own: readonly OrthogonalSegment[],
  epsilon: number,
  limit: number
): number {
  let count = 0;
  for (const segment of segments) {
    const one = [segment];
    count += index.count(one) - countFlaggedSegmentCrossings(one, own, epsilon);
    if (count > limit) {
      return count;
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
