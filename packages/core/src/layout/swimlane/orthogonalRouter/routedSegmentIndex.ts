/** The index of the first of the sorted `values` that is not below `limit`. */
function firstAtLeast(values: readonly number[], limit: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid]! < limit) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export type RoutedOrientation = 'horizontal' | 'vertical';

/** What the index reads of a routed segment: the line it runs on and its span along it. */
export interface IndexedSegment {
  edgeIndex: number;
  orientation: RoutedOrientation;
  /** The coordinate of the line, as the router set it when the segment was added. */
  coord: number;
  from: number;
  to: number;
}

/**
 * The routed segments by the line they run on, for the router's crossing penalty (#843): of the
 * segments of one orientation, those on lines within a range, one range at a time, instead of
 * all of them. Segments only join, in any order.
 */
export class RoutedSegmentIndex {
  private readonly lines: Record<RoutedOrientation, { coords: number[]; items: IndexedSegment[] }> =
    {
      horizontal: { coords: [], items: [] },
      vertical: { coords: [], items: [] },
    };

  add(segment: IndexedSegment): void {
    const { coords, items } = this.lines[segment.orientation];
    const at = firstAtLeast(coords, segment.coord);
    coords.splice(at, 0, segment.coord);
    items.splice(at, 0, segment);
  }

  /**
   * How many segments of `orientation`, none of edge `except`, run on a line within
   * `low .. high` and span `through` within `tolerance` of their ends.
   */
  countAcross(
    orientation: RoutedOrientation,
    except: number,
    [low, high]: readonly [number, number],
    through: number,
    tolerance: number
  ): number {
    const { coords, items } = this.lines[orientation];
    let count = 0;
    for (let i = firstAtLeast(coords, low); i < items.length && coords[i]! <= high; i++) {
      const seg = items[i]!;
      if (
        seg.edgeIndex !== except &&
        seg.from - tolerance <= through &&
        seg.to + tolerance >= through
      ) {
        count++;
      }
    }
    return count;
  }
}
