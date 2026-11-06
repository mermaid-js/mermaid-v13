/**
 * From the parsed fields to the model's rows (parser-method §4): v12's split loop
 * (`packet/parser.ts` `populate` and `getNextFittingBlock`), with its 10,000-row cap (D342).
 * The parser checks each field (D341) and hands the good ones here, in source order.
 */
import type { PacketField, PacketPiece } from './model.ts';

/** v12's `maxPacketSize`: rows past it are dropped (D342). */
export const MAX_PACKET_ROWS = 10_000;

/**
 * Whether `piece` is all of `field`, not one of the pieces a row end split it into (v12 gives
 * those `bits` one short; the model does not carry per-piece `bits`).
 */
export const isWholeField = (field: PacketField, piece: PacketPiece): boolean =>
  piece.start === field.start && piece.end === field.end;

/**
 * The rows of one parse. {@link add} splits each field at its row's end, as v12 did, until the
 * cap; {@link rows} closes the row being filled.
 */
export class RowSplitter {
  readonly fields: PacketField[] = [];
  private readonly done: (readonly PacketPiece[])[] = [];
  /** The row being filled (v12's `word`) and its 1-based number (v12's `row`). */
  private word: PacketPiece[] = [];
  private row = 1;
  private capped = false;

  constructor(private readonly bitsPerRow: number) {}

  /**
   * Add `field`'s pieces. A field none of whose pieces fit is left out of {@link fields}.
   * Returns the first bit the cap drops, the first time it drops one; else `undefined`.
   */
  add(field: PacketField): number | undefined {
    const index = this.fields.length;
    const bpr = this.bitsPerRow;
    let start = field.start;
    let placed = false;
    let dropped: number | undefined;
    for (;;) {
      if (this.done.length >= MAX_PACKET_ROWS) {
        if (!this.capped) dropped = start;
        this.capped = true;
        break;
      }
      const rowEnd = this.row * bpr - 1;
      const end = Math.min(field.end, rowEnd);
      this.word.push(Object.freeze({ field: index, start, end }));
      placed = true;
      if (end === rowEnd) {
        this.done.push(Object.freeze(this.word));
        this.word = [];
        this.row++;
      }
      if (end === field.end) break;
      start = end + 1;
    }
    if (placed) this.fields.push(Object.freeze(field));
    return dropped;
  }

  /** Every row, the one being filled included. Call once, after the last {@link add}. */
  rows(): (readonly PacketPiece[])[] {
    if (this.word.length > 0) this.done.push(Object.freeze(this.word));
    this.word = [];
    return this.done;
  }
}
