/**
 * Packet AST (R-PARSE-8, DESIGN §4.2 adapted). Every node has a semantic id and a range into the
 * original source:
 *
 * | element                              | id                                  |
 * | ------------------------------------ | ----------------------------------- |
 * | `packet` or `packet-beta`            | `packet`                            |
 * | field `0-15: "…"`, `16: "…"`, `+8: "…"` | `field:0-15`, `field:16-16`, `field:17-24` |
 * | a later field with the same range    | `field:0-15@2`, `field:0-15@3`, …   |
 * | `title …`                            | `title`, then `title@2`, …          |
 * | `accTitle: …`                        | `accTitle`, then `accTitle@2`, …    |
 * | `accDescr …`                         | `accDescr`, then `accDescr@2`, …    |
 *
 * A field's id comes from its resolved range (D345), so it survives label edits; a `+N` field's
 * id moves when an earlier field changes width. Ranges repeat only in a field with a semantic
 * error (D341: such a field is not contiguous), which gets the `@n` suffix (pitfall 9).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** `packet` or `packet-beta`. */
export interface PacketHeaderNode extends AstNode<'Header'> {
  /** Whether the header is `packet-beta`. */
  beta: boolean;
}

/**
 * `start-end: "label"`, `start: "label"` or `+bits: "label"`. Every field has one, a field with a
 * semantic error too; `start` and `end` are then as written (`+0` has `end = start - 1`).
 */
export interface PacketFieldNode extends AstNode<'Field'> {
  start: number;
  end: number;
  /** The label as v12's DB kept it (see `PacketField.label`). */
  label: string;
  /** The quoted string, quotes included. */
  labelRange: Range;
  /** `0-15`, `16` or `+8`: the bits as written, before the `:`. */
  bitsRange: Range;
  /** Why the field is not drawn, when it is not; absent for a field in `PacketModel.fields`. */
  dropped?: PacketFieldDrop;
}

/**
 * Why a field is left out of the model: one of v12's checks failed on its bits (D341; the
 * error diagnostic's code and message), or it lies wholly past the 10,000-row cap (D342).
 */
export type PacketFieldDrop =
  | { readonly reason: 'error'; readonly code: string; readonly message: string }
  | { readonly reason: 'rowCap' };

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface PacketTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type PacketStatementNode = PacketHeaderNode | PacketFieldNode | PacketTextNode;

export interface PacketDocument extends AstNode<'Document'> {
  children: PacketStatementNode[];
}
