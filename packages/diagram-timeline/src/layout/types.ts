/**
 * TimelineLayout: the plain-data result of the timeline custom layout (`layoutKind: 'custom'`,
 * spec #291 §Layout). Both directions emit it, so one drawing module serves both (D250).
 * Lengths are px; rectangles have their top-left corner at `x`, `y`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';
import type { TimelineDirection } from '../model.ts';

export type { Rect };

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A measured label and the box it takes: the label's own size, at its place. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

/**
 * A section, period or event box. Its label is drawn centred across the box, a family's offset
 * below its top (v12: `padding / 2` classic, `padding` redux); the renderer picks the offset.
 */
export interface TimelineBox extends Rect {
  readonly ast: AstId;
  /**
   * The colour slot: a section's ordinal (0-based); a period and its events take their
   * section's, periods before the first section 0 (D251); with no sections each period its own
   * index, or 0 under `disableMulticolor`. Unbounded: the renderer wraps it to the palette.
   */
  readonly slot: number;
  /**
   * The label, measured and wrapped to the box's width less its padding. A word wider than the
   * wrap width stays whole and the box is widened to hold it (D558).
   */
  readonly label: MeasuredLabel;
  /** The box's padding (v12 `node.padding`): LR 20, TD 5. */
  readonly padding: number;
}

export interface TimelineSectionLayout extends TimelineBox {
  /** Index into `TimelineModel.sections`. */
  readonly section: number;
  /** What the section takes: its box, its periods, their events and connectors. */
  readonly band: Rect;
}

export interface TimelinePeriodLayout extends TimelineBox {
  /** Index into `TimelineModel.periods`. */
  readonly period: number;
  /** Index into `TimelineModel.sections`; undefined before the first section. */
  readonly section?: number;
  /** In source order. */
  readonly events: readonly TimelineBox[];
}

/** A filled triangle at the end of a line: the inline arrowhead (D253). */
export interface Arrowhead {
  readonly tip: Point;
  readonly left: Point;
  readonly right: Point;
}

/** A straight line from (x1, y1) to (x2, y2) with an arrowhead at its end. */
export interface TimelineLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** The stroke width the arrowhead is sized for. */
  readonly width: number;
  readonly arrow: Arrowhead;
}

/**
 * A dashed connector. LR: one per period, from its bottom down past its events (v12 draws one
 * for a period with no events too). TD: one per event, from the axis to the event's left edge.
 */
export interface TimelineConnector extends TimelineLine {
  /** Index into `TimelineLayout.periods`. */
  readonly period: number;
  /** Index into that period's `events` (TD only). */
  readonly event?: number;
  readonly slot: number;
}

export interface TimelineLayout {
  readonly direction: TimelineDirection;
  /** One per model section, in order. */
  readonly sections: readonly TimelineSectionLayout[];
  /** One per model period, in order. */
  readonly periods: readonly TimelinePeriodLayout[];
  /** LR in period order; TD in period, then event order. */
  readonly connectors: readonly TimelineConnector[];
  readonly axis: TimelineLine;
  /** Left-aligned at `x`, its first baseline at `y + text.baseline` (D254). */
  readonly title?: PlacedLabel;
  /** The drawing's box, `timeline.padding` included: the SVG `viewBox` (D224). */
  readonly bounds: Rect;
}
