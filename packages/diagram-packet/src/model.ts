/**
 * The packet model (spec #421): what the parser (#454) produces and the layout (#456) and the
 * ASCII renderer (#464) read. Plain, frozen data in source order (R-ARCH-7). Shared contract of
 * the packet tickets: change it only additively, and say so in the run notes
 * (`v13/docs/agents/runs/421/GAPS.md`).
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { TextModelFields } from '@mermaid-js/shared/parser/rule';

/** One `start-end: "label"`, `start: "label"` or `+bits: "label"` field, as written. */
export interface PacketField {
  /** First bit, resolved (`+N` fields start at the previous field's end + 1). */
  readonly start: number;
  /** Last bit, inclusive; `end === start` for a one-bit field. */
  readonly end: number;
  /** `end - start + 1`. */
  readonly bits: number;
  /** The label as v12's DB kept it: quotes removed, `\x` unescaped, not trimmed. */
  readonly label: string;
  /** `field:<start>-<end>` from the resolved range (D345). */
  readonly astId: AstId;
}

/** One piece of a field inside one row; a field longer than its row is split at each row end. */
export interface PacketPiece {
  /** Index into `PacketModel.fields`. */
  readonly field: number;
  /** First bit of this piece (absolute bit number, not the column). */
  readonly start: number;
  /** Last bit of this piece, inclusive. */
  readonly end: number;
}

/** The packet model; its `warnings` include `PACKET_TRUNCATED`. */
export interface PacketModel extends TextModelFields {
  /**
   * Fields in source order. A field with a semantic error (D341) is not in the list, nor one the
   * row cap dropped whole (D342), so every field has at least one piece; a field the cap cut
   * keeps its written `end` and `bits`, and its pieces stop at the last row.
   */
  readonly fields: readonly PacketField[];
  /** Rows top to bottom, each its pieces in bit order; at most 10,000 rows (D342). */
  readonly rows: readonly (readonly PacketPiece[])[];
  /** The `packet.bitsPerRow` the rows were split with (after D342's fallback). */
  readonly bitsPerRow: number;
}
