// The size of a relationship end (a cardinality mark), per unit profile. The px geometry is
// v12's ER markers (`markers.js` at fa796a943), read in the marker's own frame: `d` runs from
// the entity outline out along the line, `s` across it. `render/edges.ts` draws from these
// numbers and the graph builder sizes self-loops and port pitch from them, so the two agree.
import type { LayoutMetrics, UnitProfile } from '@mermaid-js/core/layout';

/** The px geometry of the ends, as drawn. */
export const PX_END = Object.freeze({
  /** Half the span of a bar and of a crow's foot at the outline. */
  half: 9,
  /** The first bar, from the outline; a second (only one) is `bar2` out. */
  bar: 9,
  bar2: 15,
  /** The bar behind a crow's foot. */
  barMany: 24,
  /** Where the crow's foot meets the line. */
  toe: 18,
  /** The zero circle's radius, and its centre behind a bar (zero or one). */
  circleR: 6,
  circleOne: 21,
  /**
   * The furthest built-in `erZeroOrMoreCircleOffset` (classic 30, neo 28). Layout room is
   * theme-independent (D154), so it is sized for this one, not the theme's.
   */
  circleManyMax: 30,
});

/** Room an end takes along its line and across it, in the profile's units. */
export interface EndSize {
  /** From the outline to the far side of the outermost mark. */
  readonly reach: number;
  /** Across the line, both sides together. */
  readonly span: number;
}

/** Cells one end draws in text output: a bar or crow's foot, then a bar or ring. */
export const END_CELLS = 2;

/** The size of an end in `units`. */
export function endSize(units: UnitProfile): EndSize {
  if (units.grid !== undefined) return { reach: END_CELLS, span: units.grid };
  const e = PX_END;
  return {
    reach: Math.max(e.barMany, e.circleOne + e.circleR, e.circleManyMax + e.circleR),
    span: 2 * e.half,
  };
}

/**
 * The engine metrics for an ER graph. In px every end has a mark, wider than the engine's
 * arrowhead: a self-loop reaches past both of its ends by `loopGap` before it turns (its label
 * sits `loopGap` further out), and edge ends along one side are a mark's span plus `minPitch`
 * apart when the side has room. The cell profile is unchanged: its ends fit its own metrics.
 */
export function erMetrics(units: UnitProfile): LayoutMetrics {
  const m = units.engine;
  if (units.grid !== undefined) return m;
  const end = endSize(units);
  return {
    ...m,
    loop: Math.max(m.loop, end.reach + m.loopGap),
    portPitch: Math.max(m.portPitch, end.span + m.minPitch),
  };
}
