/**
 * PacketLayout: the plain-data result of the packet custom layout (`layoutKind: 'custom'`, spec
 * #421 §Layout). Every length is in px (D216), in the diagram's coordinates: the renderer draws
 * them as they are, with no transform of its own. Rectangles have their top-left corner at `x`,
 * `y`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { PacketConfig } from '../config.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/**
 * A measured label and the box it takes. Draw it with `SvgWriter.label()` at the box's centre,
 * in `font`.
 */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
  readonly font: FontKey;
}

/** One bit number, v12's `text.packetByte`: its baseline at `y`, anchored at `x`. */
export interface BitNumber {
  readonly text: string;
  /** The bit it numbers. */
  readonly bit: number;
  /** v12's classes `packetByte start` / `packetByte end`. */
  readonly role: 'start' | 'end';
  readonly x: number;
  /** The baseline (`dominant-baseline: auto`), `bitNumberGap` above the row. */
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  /** The measured box the number covers, for the bounds. */
  readonly box: Rect;
}

/** One piece of a field in one row: v12's `rect.packetBlock`, its label and bit numbers. */
export interface PacketPieceLayout {
  /** Index into `PacketModel.fields`. */
  readonly field: number;
  /** The field's AST id; `first` says whether this piece carries its `data-ast` (D345). */
  readonly ast: AstId;
  readonly first: boolean;
  /** First and last bit of the piece (absolute bit numbers). */
  readonly start: number;
  readonly end: number;
  /** `end - start + 1`. */
  readonly bits: number;
  /** The rectangle: `bits * bitWidth - paddingX` wide (never below 0, D342), `rowHeight` tall. */
  readonly box: Rect;
  /**
   * The field's label, centred on the box; its font shrinks when it is wider or taller than the box, down
   * to the bit-number size, then it overflows (D343).
   */
  readonly label: PlacedLabel;
  /** None without `showBits`; one, centred, for a one-bit piece; else leading and trailing. */
  readonly bitNumbers: readonly BitNumber[];
}

export interface PacketRowLayout {
  /** The row's top: `r * (rowHeight + pY) + pY`. */
  readonly y: number;
  /** In model order (bit order); `descending` mirrors their `x`, not their order. */
  readonly pieces: readonly PacketPieceLayout[];
}

export interface PacketLayout {
  /** v12's canvas: `bitWidth * bitsPerRow + 2` wide. */
  readonly width: number;
  /** `(rowHeight + pY) * (rows + 1) - (title ? 0 : rowHeight)`. */
  readonly height: number;
  /** The checked `packet` options the layout used (`packetConfig`), `bitsPerRow` the model's. */
  readonly options: PacketConfig;
  /** `pY`: `paddingY`, plus `bitsPadding` with `showBits` (v12 `db.ts:26-28`). */
  readonly paddingY: number;
  readonly rows: readonly PacketRowLayout[];
  /** The title, its first line centred on (`width / 2`, `height - (rowHeight + pY) / 2`). */
  readonly title?: PlacedLabel;
  /** The pieces' stroke width (`packetBlockStrokeWidth`). */
  readonly strokeWidth: number;
  /** The fonts measured in: labels start at `label` (and may shrink), bit numbers, title. */
  readonly fonts: {
    readonly label: FontKey;
    readonly byte: FontKey;
    readonly title: FontKey;
  };
  /** v12's viewBox, grown to cover everything drawn (D344). */
  readonly bounds: Rect;
}
