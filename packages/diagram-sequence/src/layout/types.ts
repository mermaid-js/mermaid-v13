/**
 * SequenceLayout: the plain-data result of the sequence custom layout (`layoutKind: 'custom'`,
 * spec #125 §Layout). Every length is in the unit profile's units: px for SVG, character cells
 * for text output (D108). Rectangles have their top-left corner at `x`, `y`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { ArrowKind, FragmentKind, ParticipantKind } from '../model.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A measured label and the box it is drawn in: the label's own size, at its place. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

export interface ParticipantLayout {
  readonly id: string;
  readonly ast: AstId;
  readonly kind: ParticipantKind;
  /** The label, measured; the renderer places it in its symbol. */
  readonly label: MeasuredLabel;
  /** Left edge of the column's box. */
  readonly x: number;
  readonly width: number;
  /** Height of the top (and bottom) box: the row height of the header. */
  readonly height: number;
  /** From the top of a box (`top`, `bottom`) to the centre of its label. */
  readonly labelY: number;
  /** Top of the top box: the header row, or the creating message's row. */
  readonly top: number;
  /** Top of the mirrored bottom box (`mirrorActors`); undefined without one. */
  readonly bottom?: number;
  readonly lifeline: { readonly x: number; readonly y1: number; readonly y2: number };
  readonly created: boolean;
  readonly destroyed: boolean;
}

export interface SelfLoop {
  /** The far x the loop reaches. */
  readonly right: number;
  /** The y where the loop comes back to the lifeline. */
  readonly bottom: number;
}

export interface MessageLayout {
  readonly ast: AstId;
  readonly from: string;
  readonly to: string;
  readonly arrow: ArrowKind;
  /** The y of the line. */
  readonly y: number;
  /** Line start and end, arrowhead room taken off. Equal for a self message. */
  readonly startX: number;
  readonly stopX: number;
  /** Undefined for an empty text. */
  readonly label?: PlacedLabel;
  readonly self?: SelfLoop;
  /** The sequence number and the x of its centre, when numbers are shown. */
  readonly number?: { readonly value: number; readonly x: number };
  readonly central?: 'to' | 'from' | 'both';
}

export interface ActivationLayout {
  readonly participant: string;
  /** The `activate` statement; undefined for a `+` shorthand or central connection. */
  readonly ast?: AstId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Activations already open on the participant when this one started. */
  readonly depth: number;
}

export interface NoteLayout extends Rect {
  readonly ast: AstId;
  readonly placement: 'left' | 'right' | 'over';
  readonly participants: readonly string[];
  readonly label: PlacedLabel;
}

export interface FragmentSectionLayout {
  readonly ast?: AstId;
  /** The y of the dashed divider above the section. */
  readonly y: number;
  readonly label?: PlacedLabel;
}

export interface FragmentLayout extends Rect {
  readonly ast: AstId;
  readonly kind: FragmentKind;
  /** Frames and rects open around this one. */
  readonly depth: number;
  /** The label tab in the top-left corner and its keyword. */
  readonly tab: PlacedLabel;
  /** `[label]` of the first section; undefined when empty. */
  readonly title?: PlacedLabel;
  /** Sections after the first. */
  readonly sections: readonly FragmentSectionLayout[];
}

export interface RectLayout extends Rect {
  readonly ast: AstId;
  readonly color: string;
  readonly depth: number;
}

export interface BoxLayout extends Rect {
  readonly ast: AstId;
  readonly color?: string;
  readonly participants: readonly string[];
  readonly label?: PlacedLabel;
}

export interface SequenceLayout {
  readonly units: 'px' | 'cell';
  /** Visible participants in column order. */
  readonly participants: readonly ParticipantLayout[];
  readonly boxes: readonly BoxLayout[];
  readonly messages: readonly MessageLayout[];
  readonly activations: readonly ActivationLayout[];
  readonly notes: readonly NoteLayout[];
  /** In source order of their start; inner frames come after outer ones. */
  readonly fragments: readonly FragmentLayout[];
  readonly rects: readonly RectLayout[];
  readonly title?: PlacedLabel;
  /** The drawing's box, margins included: the SVG `viewBox`. */
  readonly bounds: Rect;
}
