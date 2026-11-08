/**
 * VennLayout: the plain-data result of the venn custom layout (`layoutKind: 'custom'`, spec
 * #429 §Layout, D224). Every length is in px (venn draws SVG only, D320). Two frames, as v12
 * drew: the title and `bounds` are in the diagram's coordinates; areas, text areas and debug
 * shapes are in the chart's, the group v12 translated down by the title row (`offset`).
 * Rectangles have their top-left corner at `x`, `y`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { RegionPath } from '../solver/index.ts';

export type { RegionArc, RegionPath } from '../solver/index.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/** A measured label and its box; its first baseline is at `y + text.baseline`. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

/** A drawn set's circle. */
export interface VennCircle {
  readonly center: Point;
  readonly radius: number;
  /** The stroke the bounds allow for: the style's `stroke-width` as a number, else `5s`. */
  readonly strokeWidth: number;
}

/**
 * One drawn area (v12's `g.venn-area`), in v12's order: the model's sets and overlaps in source
 * order, a repeat drawn again, then the pairs v12 adds for a three-or-more overlap.
 */
export interface VennAreaLayout {
  /** `venn-circle` for one set, `venn-intersection` for an overlap. */
  readonly kind: 'set' | 'overlap';
  /** The member ids, sorted (v12's `data-venn-sets` joins them with `_`). */
  readonly sets: readonly string[];
  /** The model's entry; absent for a pair v12 adds (`ensurePairwiseSubsets`). */
  readonly ast?: AstId;
  /** The size it was laid out at: 0 for a negative one (D417), `min(a, b) / 4` for an added pair. */
  readonly size: number;
  /** A set's circle (a repeat shares the last copy's size, as in v12). */
  readonly circle?: VennCircle;
  /** A set's place among the drawn sets (0, 1, …), for the palette. */
  readonly index?: number;
  /** A set's class slot: `index mod 8` (`venn-set-<slot>`). */
  readonly slot?: number;
  /** The outline; absent when the circles have no area in common (v12's `M 0 0`). */
  readonly path?: RegionPath;
  /**
   * venn.js's text centre (margin maximisation); absent when the area is not on the chart, where
   * venn.js put it at y −1000.
   */
  readonly centre?: Point;
  /**
   * The label, at most three lines (D414), its box centred on the floored centre as v12 drew it:
   * the last non-empty `[label]` of this area's sets, else a set's own id; absent for an overlap
   * without one, and for an area not on the chart.
   */
  readonly label?: PlacedLabel;
}

/** One text node in its cell (v12 `renderTextNodes`). */
export interface VennTextNodeLayout {
  readonly ast: AstId;
  readonly id: string;
  /** Its grid cell. */
  readonly cell: Rect;
  /** The box v12's `foreignObject` had: 90 % of the cell, centred in it. */
  readonly box: Rect;
  /** The label or id, wrapped to the box width and centred on the cell's centre (D414). */
  readonly label: PlacedLabel;
}

/** The text nodes of one drawn area, in a grid about its text centre. */
export interface VennTextArea {
  /** The area's sets, sorted. */
  readonly sets: readonly string[];
  /** venn.js's text centre of the area. */
  readonly centre: Point;
  /** The room about the centre inside every circle of the area, or `0.6 · minR` when none. */
  readonly innerRadius: number;
  /** The grid: `max(80s, 1.9 · innerRadius)` by `max(60s, 1.9 · innerRadius)`, moved down by the label offset. */
  readonly grid: Rect;
  /** In source order. */
  readonly nodes: readonly VennTextNodeLayout[];
}

/** `venn.useDebugLayout`'s plain shapes (v12's purple circles and teal cells). */
export interface VennDebugShapes {
  readonly circles: readonly { readonly center: Point; readonly radius: number }[];
  readonly cells: readonly Rect[];
  readonly circleStroke: number;
  readonly cellStroke: number;
}

export interface VennLayout {
  /** The canvas (`venn.width` × `venn.height`), v12's viewBox. */
  readonly width: number;
  readonly height: number;
  /** `width / 1600`: v12's lengths are given at 1600 px. */
  readonly scale: number;
  /** Where the chart's frame starts in the diagram: `(0, titleHeight)`. */
  readonly offset: Point;
  /** `48s` with a title, else 0. */
  readonly titleHeight: number;
  /** The one solve's padding (D412): `venn.padding`, else 15. */
  readonly padding: number;
  /** Drawn areas, in v12's order (chart frame). */
  readonly areas: readonly VennAreaLayout[];
  /** One per area with text nodes, in first-node order (chart frame). */
  readonly textAreas: readonly VennTextArea[];
  /** Centred on `(width / 2, 32s)`; absent without a title (diagram frame). */
  readonly title?: PlacedLabel;
  /** Present under `venn.useDebugLayout` (chart frame). */
  readonly debug?: VennDebugShapes;
  /** The fonts the text was measured in, and so is drawn in. */
  readonly fonts: {
    readonly label: FontKey;
    readonly text: FontKey;
    readonly title: FontKey;
  };
  /** v12's canvas, grown to cover everything drawn (D224), in the diagram frame. */
  readonly bounds: Rect;
}
