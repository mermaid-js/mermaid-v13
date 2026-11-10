/**
 * IshikawaLayout: the plain-data result of the ishikawa custom layout (`layoutKind: 'custom'`,
 * spec #519 §Layout). Every length is in px (ishikawa draws SVG; the text output, `ascii.ts`,
 * draws from the model), in the diagram's coordinates, v12's: the head's back is at
 * `(0, spineY)` and the causes reach left into negative x. The renderer draws them as they are. Rectangles have their
 * top-left corner at `x`, `y`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { IshikawaSide } from '../model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/** A line from `(x1, y1)`, where a bone starts, to `(x2, y2)`. */
export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * How v12 anchored a label's text: `cause` centred on its point (middle, middle); `align` (a
 * horizontal sub-cause bone) end-anchored, centred on the point's y; `up` (a diagonal on the
 * upper side) end-anchored, its first baseline on the point; `down` (a diagonal on the lower
 * side) end-anchored, hanging from the point. With several lines, v12 moved the first line up by
 * half the extra lines, so `up` and `down` labels are centred on the point by their extra lines.
 */
export type IshikawaLabelKind = 'cause' | 'align' | 'up' | 'down';

/** A measured label and the box its text takes. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
  /** v12's text point: the centre of a cause label, the right end of a sub-cause label. */
  readonly anchor: Point;
}

/** A filled triangle (v12's arrow marker): its tip at a bone's start, its base along the bone. */
export interface IshikawaArrow {
  readonly tip: Point;
  readonly left: Point;
  readonly right: Point;
}

export interface IshikawaBone extends Segment {
  /** 1 for a cause, 2 and on for the sub-causes below it. */
  readonly depth: number;
  readonly side: IshikawaSide;
  readonly stroke: number;
  /** At the start, `arrowSize × stroke` long and wide. */
  readonly arrow: IshikawaArrow;
}

export interface IshikawaHead {
  readonly ast: AstId;
  /** The middle of the head's back, the spine's end: `(0, spineY)`. */
  readonly x: number;
  readonly y: number;
  /** v12's `w` and `h`: the path is `M top L bottom Q control top Z`. */
  readonly width: number;
  readonly height: number;
  readonly top: Point;
  readonly bottom: Point;
  readonly control: Point;
  readonly stroke: number;
  readonly label: PlacedLabel;
}

export interface IshikawaSubCauseLayout {
  readonly ast: AstId;
  /** The cause or sub-cause it hangs from. */
  readonly parent: AstId;
  readonly depth: number;
  readonly kind: Exclude<IshikawaLabelKind, 'cause'>;
  /** Its slot on the cause's bone, 0 nearest the spine (v12's `flattenTree` order). */
  readonly slot: number;
  /** Even depths are horizontal; odd depths run parallel to the cause bone. */
  readonly bone: IshikawaBone;
  readonly label: PlacedLabel;
}

export interface IshikawaCauseLayout {
  readonly ast: AstId;
  /** Its index among the effect's causes. */
  readonly index: number;
  readonly side: IshikawaSide;
  readonly bone: IshikawaBone;
  readonly label: PlacedLabel;
  /** The label's box: the text grown by the metrics' `boxPadX` and `boxPadY`. */
  readonly box: Rect;
  readonly boxStroke: number;
  /** Every cause below it, in the order v12 drew them (`flattenTree`). */
  readonly subCauses: readonly IshikawaSubCauseLayout[];
}

/** Causes `2p` (upper) and `2p + 1` (lower), sharing a start on the spine. */
export interface IshikawaPairLayout {
  /** Where both bones start: `firstPairX` for the first, else the previous pair's leftmost text x. */
  readonly x: number;
  readonly causes: readonly IshikawaCauseLayout[];
}

export interface IshikawaLayout {
  /** The spine's y: `max(upper side, spineBase)`. */
  readonly spineY: number;
  /** From the last pair's leftmost text x to the head; absent with no effect. */
  readonly spine?: Segment & { readonly stroke: number };
  /** Absent for an empty body (no effect, D496). */
  readonly head?: IshikawaHead;
  readonly pairs: readonly IshikawaPairLayout[];
  /** Each side's length: what a cause with descendants reaches along its bone. */
  readonly sides: { readonly upper: number; readonly lower: number };
  /** The fonts the labels were measured in, and so are drawn in (D493). */
  readonly fonts: { readonly head: FontKey; readonly label: FontKey };
  /** `ishikawa.diagramPadding`. */
  readonly padding: number;
  /** Everything drawn, strokes included, and `padding` around it (D224). */
  readonly bounds: Rect;
}
