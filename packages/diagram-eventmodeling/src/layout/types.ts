/**
 * `EventModelLayout`: the plain-data result of the event modeling custom layout
 * (`layoutKind: 'custom'`, spec #527 T3), in px, absolute. Rectangles have their top-left corner
 * at `x`, `y`. Colours are left to the renderer (#606).
 */
import type { Point as CorePoint } from '@mermaid-js/core/layout';
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';
import type { PlacedLabel, Rect } from '@mermaid-js/shared/layout';
import type { EventModelKind } from '../model.ts';
import type { EventModelBand } from '../structure.ts';

export type { PlacedLabel, Rect };

export type Point = Readonly<CorePoint>;

export interface EventModelLaneLayout extends Rect {
  /** v12's swimlane index (0, 100, 200, or a namespace lane's after them). */
  readonly index: number;
  readonly band: EventModelBand;
  readonly namespace?: string;
  /** `lane:<index>`: the lane's `data-id` (D528; lanes are inferred, so no `data-ast`). */
  readonly id: string;
  /** Where v12 started the label's first baseline: `(30, y + 30)`. */
  readonly labelAt: Point;
  /** The label, bold, not wrapped; its first baseline at `labelAt`. */
  readonly label: PlacedLabel;
}

export interface EventModelBoxLayout extends Rect {
  /** The frame's index in `model.frames`. */
  readonly frame: number;
  /** `frame:<id>` (D528). */
  readonly ast: AstId;
  readonly kind: EventModelKind;
  /** Index into {@link EventModelLayout.lanes}. */
  readonly lane: number;
  /** The bold name, centred on the box's text area. */
  readonly name: PlacedLabel;
  /**
   * The data in mono (D523), left-aligned (`text.left`, line indents kept in `text.indents`)
   * one line under the name; absent without data or when none of it fits.
   */
  readonly data?: PlacedLabel;
  /**
   * Lines left out because the box is at its greatest height (v12 clipped them in its
   * `foreignObject`); absent when everything fits.
   */
  readonly clipped?: true;
}

/**
 * How a relation runs: `down`/`up` between lanes (v12's segment from ⅔ of the source's width to
 * ⅓ of the target's), `along` a lane to the next box of the lane (D521: source's right edge to
 * target's left edge), `under` the row to a box further along the lane (D659: down from the
 * source's bottom, across, up into the target's bottom), or `self`, a loop under the bottom
 * right corner of a box that names itself as its source (D659).
 */
export type EventModelRoute = 'down' | 'up' | 'along' | 'under' | 'self';

export interface EventModelRelationLayout {
  /** Frame indices in `model.frames`. */
  readonly source: number;
  readonly target: number;
  readonly inferred: boolean;
  /** `relation:<source>-><target>`: the path's `data-id` (D528). */
  readonly id: string;
  /** The `->>`'s AST id; absent on an inferred relation. */
  readonly astId?: AstId;
  readonly route: EventModelRoute;
  /**
   * The line, on the source box's edge first and on the target box's edge last: two points, or
   * four for `under` and `self`. The line runs to the arrowhead's tip, as v12's marker did (`refX 10`).
   */
  readonly points: readonly Point[];
  /** The arrowhead polygon, base corner, tip (the last point), base corner (10 × 7). */
  readonly head: readonly [Point, Point, Point];
  /**
   * A relation between lanes whose segment meets a box other than its two, where no detour fits
   * (D743): it keeps v12's segment. Absent on every other relation.
   */
  readonly noDetour?: true;
}

export interface EventModelLayout {
  /** The font every text was measured in and is drawn in (pitfall 16). */
  readonly font: FontKey;
  /** Corner radius of lanes and boxes. */
  readonly radius: number;
  /** In index order, top to bottom. */
  readonly lanes: readonly EventModelLaneLayout[];
  /** One per frame, in frame order (left to right). */
  readonly boxes: readonly EventModelBoxLayout[];
  /** In v12's order (`eventModelStructure`). */
  readonly relations: readonly EventModelRelationLayout[];
  /** The margin around the content (`eventmodeling.padding`). */
  readonly padding: number;
  /** What is drawn, `padding` around it: the SVG `viewBox` (D224, v12's `setupGraphViewbox`). */
  readonly bounds: Rect;
}
