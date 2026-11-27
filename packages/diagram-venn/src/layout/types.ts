/**
 * VennLayout: the plain-data result of the venn custom layout (`layoutKind: 'custom'`, spec
 * #429 §Layout, D224). Every length is in px (venn draws SVG only, D320). Two frames, as v12
 * drew: the title and `bounds` are in the diagram's coordinates; areas, text areas and debug
 * shapes are in the chart's, the group v12 translated down by the title row (`offset`).
 * Rectangles have their top-left corner at `x`, `y`; circles are `{ x, y, radius }` about their
 * centre, as venn.js's.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { Circle, Point, RegionPath } from '../solver/index.ts';

export type { Circle, Point, RegionArc, RegionPath } from '../solver/index.ts';

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/** A measured label and its box; its first baseline is at `y + text.baseline`. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

/** A drawn set's circle. */
export interface VennCircle extends Readonly<Circle> {
  /** The stroke the bounds allow for: the style's `stroke-width` as a number, else `5s`. */
  readonly strokeWidth: number;
}

/** The merged `style` properties of a target (v12 `buildStyleByKey`), as written. */
export type VennStyleProperties = Readonly<Record<string, string>>;

/** What a drawn set and a drawn overlap both have. */
interface VennAreaCommon {
  /** The member ids, sorted (v12's `data-venn-sets` joins them with `_`). */
  readonly sets: readonly string[];
  /** The model's entry; absent for a pair v12 adds (`ensurePairwiseSubsets`). */
  readonly ast?: AstId;
  /**
   * The size it was laid out at: 0 for a negative or too large one (D417), `min(a, b) / 4` for
   * an added pair.
   */
  readonly size: number;
  /** The outline; absent when the circles have no area in common (v12's `M 0 0`). */
  readonly path?: RegionPath;
  /**
   * venn.js's text centre (margin maximisation); absent when the area is not on the chart, where
   * venn.js put it at y −1000.
   */
  readonly centre?: Point;
  /**
   * The label, at most three lines (D414), its box centred on the floored centre as v12 drew it
   * (moved down below an earlier area's label it would lie on): the last non-empty `[label]` of
   * this area's sets, else a set's own id; absent for an overlap without one, and for an area
   * not on the chart.
   */
  readonly label?: PlacedLabel;
  /** The merged properties of every `style` naming exactly these sets; absent when none does. */
  readonly style?: VennStyleProperties;
}

/** A drawn set (`venn-circle`). */
export interface VennSetLayout extends VennAreaCommon {
  readonly kind: 'set';
  /** Its circle (a repeat shares the last copy's size, as in v12). */
  readonly circle: VennCircle;
  /** Its place among the drawn sets (0, 1, …), for the palette. */
  readonly index: number;
  /** Its class slot: `index mod 8` (`venn-set-<slot>`). */
  readonly slot: number;
}

/** A drawn overlap (`venn-intersection`): no circle, index or slot of its own. */
export interface VennOverlapLayout extends VennAreaCommon {
  readonly kind: 'overlap';
  readonly circle?: never;
  readonly index?: never;
  readonly slot?: never;
}

/**
 * One drawn area (v12's `g.venn-area`), in v12's order: the model's sets and overlaps in source
 * order, a repeat drawn again, then the pairs v12 adds for a three-or-more overlap.
 */
export type VennAreaLayout = VennSetLayout | VennOverlapLayout;

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
  /** The merged properties of every one-id `style` naming its id; absent when none does. */
  readonly style?: VennStyleProperties;
}

/** The text nodes of one drawn area, in a grid about its text centre. */
export interface VennTextArea {
  /** The area's sets, sorted. */
  readonly sets: readonly string[];
  /**
   * The inner circle: about venn.js's text centre, the room inside every circle of the area,
   * or `0.6 · minR` when there is none.
   */
  readonly inner: Readonly<Circle>;
  /**
   * The grid. v12's, `max(80s, 1.9 · r)` by `max(60s, 1.9 · r)` about the centre, moved down by
   * the label offset, where the area has no label and its nodes meet none; else below the labels
   * and inside the inner circle where the nodes fit (D750).
   */
  readonly grid: Rect;
  /** In source order. */
  readonly nodes: readonly VennTextNodeLayout[];
}

/** `venn.useDebugLayout`'s plain shapes (v12's purple circles and teal cells). */
export interface VennDebugShapes {
  readonly circles: readonly Readonly<Circle>[];
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
  /** The one solve's padding (D412): `venn.padding`, 15 by default. */
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
