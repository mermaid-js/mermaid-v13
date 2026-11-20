/**
 * RadarLayout: the plain-data result of the radar custom layout (`layoutKind: 'custom'`, spec
 * #422 §Layout). Every length is in px (radar draws SVG only, D320), in the diagram's
 * coordinates: the renderer draws them as they are, with no group transform of its own (v12
 * translated a group to the centre). Rectangles have their top-left corner at `x`, `y`. Angles
 * are radians clockwise from 3 o'clock (SVG's y points down), so spoke 0 is at `−π/2`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';
import type { RadarOptions } from '../model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type { Rect };

/** A measured label and its box; its first baseline is at `y + text.baseline`. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

/** v12's `text-anchor` and `dominant-baseline` for a label at a point. */
export type RadarTextAnchor = 'start' | 'middle' | 'end';
export type RadarBaseline = 'hanging' | 'auto' | 'central';

/** One axis: its line from the centre and its label (v12 `drawAxes`). */
export interface RadarSpoke {
  /** The axis's index in `RadarModel.axes`. */
  readonly index: number;
  readonly ast: AstId;
  /** `2πi/n − π/2`. */
  readonly angle: number;
  /** The line's end, `axisLength` from the centre. */
  readonly end: Point;
  /** v12's text position, `labelRadius` from the centre. */
  readonly anchor: Point;
  readonly textAnchor: RadarTextAnchor;
  readonly baseline: RadarBaseline;
  /**
   * The label's box, placed on `anchor` as v12's `text-anchor` and `dominant-baseline` place
   * one line; a label of several lines (D355) grows away from the chart.
   */
  readonly label: PlacedLabel;
}

/** One graticule ring (v12 `drawGraticule`): a circle, or a polygon through the spokes. */
export interface RadarRing {
  /** `radius · k / ticks` for ring `k` (from 1). */
  readonly radius: number;
  /** The polygon's corners, one per spoke in axis order; empty for a circle. */
  readonly points: readonly Point[];
}

/** One cubic Bézier segment of a closed curve, from the previous segment's end. */
export interface CubicSegment {
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/** A curve that is drawn: its entry count is the axis count (v12 `drawCurves`). */
export interface RadarCurveLayout {
  /** The curve's index in `RadarModel.curves`; a skipped curve keeps its index (D356). */
  readonly index: number;
  readonly ast: AstId;
  /** The colour slot: `index mod 12`, so `radarCurve-${slot}` (D353). */
  readonly slot: number;
  /** One point per entry, point `i` on spoke `i`. */
  readonly points: readonly Point[];
  /**
   * Under a `circle` graticule the closed Catmull-Rom curve through `points` as cubic Bézier segments
   * (segment `i` ends at point `i + 1`, the last back at point 0); empty under `polygon`, which
   * draws `points` as a polygon.
   */
  readonly segments: readonly CubicSegment[];
}

/** One legend row (v12 `drawLegend`): every curve has one, drawn or skipped. */
export interface RadarLegendRow {
  /** The curve's index in `RadarModel.curves`. */
  readonly index: number;
  readonly ast: AstId;
  readonly slot: number;
  /** `radarLegendBoxSize` square at the row's origin. */
  readonly swatch: Rect;
  /** Left edge `legendTextGap` right of the swatch, `hanging` from its top. */
  readonly label: PlacedLabel;
}

export interface RadarLayout {
  /** `(marginLeft + width/2, marginTop + height/2)`. */
  readonly center: Point;
  /** `min(width, height) / 2`. */
  readonly radius: number;
  /** A spoke's length: `radius · axisScaleFactor`. */
  readonly axisLength: number;
  /** A label anchor's distance from the centre: `radius · axisLabelFactor + 4`. */
  readonly labelRadius: number;
  readonly graticule: RadarOptions['graticule'];
  /** The ticks the rings were drawn for: the model's (at most 32), 0 if not finite or negative. */
  readonly ticks: number;
  /** The value at the centre and at `radius` (D356: `max = min` draws every point at the centre). */
  readonly min: number;
  readonly max: number;
  /** `⌈ticks⌉` rings, inner first; none for a polygon graticule without axes. */
  readonly rings: readonly RadarRing[];
  /** One per axis, in axis order. */
  readonly spokes: readonly RadarSpoke[];
  /** The drawn curves, in input order. */
  readonly curves: readonly RadarCurveLayout[];
  /** One row per curve in input order under `showLegend`; none without it. */
  readonly legend: readonly RadarLegendRow[];
  /** Middle-anchored at the canvas top, `hanging`; absent without a title. */
  readonly title?: PlacedLabel;
  /** The stroke widths the bounds allow for. */
  readonly strokes: {
    readonly axis: number;
    readonly curve: number;
    readonly graticule: number;
  };
  /** The fonts the labels were measured in, and so are drawn in. */
  readonly fonts: {
    readonly axis: FontKey;
    readonly legend: FontKey;
    readonly title: FontKey;
  };
  /** v12's canvas, grown to cover everything drawn (D354); it may start at negative x/y. */
  readonly bounds: Rect;
}
