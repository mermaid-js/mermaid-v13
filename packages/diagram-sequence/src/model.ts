/**
 * SequenceModel: the plain-data result of a sequence parse (spec #125 §Parser), and the input of
 * the sequence layout. Source order is kept (R-ARCH-7): participants in first-mention order, and
 * one ordered statement list in which fragments and `rect` blocks nest their own statements.
 *
 * Shared contract (run notes GAPS.md): #141 lands the type, #139 adopts it and may extend it
 * additively. Text is kept as written (no sanitising); `<br>` and entity codes are resolved when
 * labels are measured and drawn.
 *
 * What the parser guarantees, as v12's DB did:
 * - every id a message, note or activation names is in `participants` (v12 adds a participant
 *   at its first mention). The layout leaves out a statement that breaks this, with a
 *   `SEQUENCE_UNKNOWN_PARTICIPANT` warning, and `sequenceLayoutViolations` reports it;
 * - `autonumber N` is `{ start: N, step: 1 }` (v12 restarts the step), `autonumber N M` is
 *   `{ start: N, step: M }`, a bare `autonumber` and `autonumber off` carry neither.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** v12's participant types (`PARTICIPANT_TYPE`). */
export type ParticipantKind =
  | 'participant'
  | 'actor'
  | 'boundary'
  | 'control'
  | 'entity'
  | 'database'
  | 'collections'
  | 'queue';

export interface SequenceParticipant {
  readonly id: string;
  /** `p:<id>`. */
  readonly ast: AstId;
  /** The description: the alias when one was given, else the id. */
  readonly label: string;
  /** The alias as written (`as …` or `@{ alias }`); undefined when none was. */
  readonly alias?: string;
  readonly kind: ParticipantKind;
  /** `wrap:`/`nowrap:` as written; undefined follows `sequence.wrap`. */
  readonly wrap?: boolean;
  /** Index into `SequenceModel.boxes`. */
  readonly box?: number;
  /** AST id of the `create participant …` statement. */
  readonly createAst?: AstId;
  /** AST id of the message that creates it: the next message after `create`. */
  readonly createdBy?: AstId;
  /** AST id of the `destroy …` statement. */
  readonly destroyAst?: AstId;
  /** AST id of the message that destroys it: the next message after `destroy`. */
  readonly destroyedBy?: AstId;
}

export interface SequenceBox {
  /** `box:<ordinal>`. */
  readonly ast: AstId;
  readonly label: string;
  /** The colour as written; undefined is transparent. */
  readonly color?: string;
  readonly wrap?: boolean;
  /** Member ids in declaration order. */
  readonly participants: readonly string[];
}

/**
 * v12's message line types (`LINETYPE`), lower-cased: `solid` is `->>`, `dotted` `-->>`,
 * `solid_open` `->`, `solid_cross` `-x`, `solid_point` `-)`, `bidirectional_solid` `<<->>`, and
 * the half-arrow families (`solid_top` `-|\`, `stick_arrow_bottom_reverse_dotted` `//--`, …).
 */
export type ArrowKind =
  | 'solid'
  | 'dotted'
  | 'solid_cross'
  | 'dotted_cross'
  | 'solid_open'
  | 'dotted_open'
  | 'solid_point'
  | 'dotted_point'
  | 'bidirectional_solid'
  | 'bidirectional_dotted'
  | 'solid_top'
  | 'solid_bottom'
  | 'stick_top'
  | 'stick_bottom'
  | 'solid_arrow_top_reverse'
  | 'solid_arrow_bottom_reverse'
  | 'stick_arrow_top_reverse'
  | 'stick_arrow_bottom_reverse'
  | 'solid_top_dotted'
  | 'solid_bottom_dotted'
  | 'stick_top_dotted'
  | 'stick_bottom_dotted'
  | 'solid_arrow_top_reverse_dotted'
  | 'solid_arrow_bottom_reverse_dotted'
  | 'stick_arrow_top_reverse_dotted'
  | 'stick_arrow_bottom_reverse_dotted';

export interface SequenceMessage {
  readonly kind: 'message';
  /** `m:<from>><to>#<k>`. */
  readonly ast: AstId;
  readonly from: string;
  readonly to: string;
  readonly text: string;
  readonly wrap?: boolean;
  readonly arrow: ArrowKind;
  /** The `+` (activates `to`) or `-` (deactivates `from`) shorthand. */
  readonly activation?: 'activate' | 'deactivate';
  /**
   * Central connection `()`: `to` for `A->>()B`, `from` for `A()->>B`, `both` for
   * `A()->>()B`. As in v12, each opens an activation on its participant.
   */
  readonly central?: 'to' | 'from' | 'both';
}

export interface SequenceNote {
  readonly kind: 'note';
  /** `note:<ordinal>`. */
  readonly ast: AstId;
  readonly placement: 'left' | 'right' | 'over';
  /** One participant, or two for `over A,B`. */
  readonly participants: readonly [string] | readonly [string, string];
  readonly text: string;
  readonly wrap?: boolean;
}

/** `activate A` / `deactivate A`. */
export interface SequenceActivation {
  readonly kind: 'activation';
  /** `st:<ordinal>`. */
  readonly ast: AstId;
  readonly participant: string;
  readonly active: boolean;
}

export type FragmentKind = 'loop' | 'alt' | 'opt' | 'par' | 'par_over' | 'critical' | 'break';

/**
 * One section of a fragment: the first holds the fragment's own label, the others follow an
 * `else`, `and` or `option` line.
 */
export interface FragmentSection {
  /** AST id of the `else`/`and`/`option` line; undefined for the first section. */
  readonly ast?: AstId;
  readonly label: string;
  /** `wrap:`/`nowrap:` as written; v12 wraps fragment titles to the fragment either way. */
  readonly wrap?: boolean;
  readonly statements: readonly SequenceStatement[];
}

export interface SequenceFragment {
  readonly kind: 'fragment';
  /** `f:<kind>#<ordinal>`. */
  readonly ast: AstId;
  readonly fragment: FragmentKind;
  readonly sections: readonly FragmentSection[];
}

/** `rect <colour> … end` background highlighting. */
export interface SequenceRect {
  readonly kind: 'rect';
  /** `st:<ordinal>`. */
  readonly ast: AstId;
  /** The colour as written; empty for the theme default. */
  readonly color: string;
  readonly statements: readonly SequenceStatement[];
}

/** `autonumber [start [step]]` or `autonumber off`. */
export interface SequenceAutonumber {
  readonly kind: 'autonumber';
  /** `st:<ordinal>`. */
  readonly ast: AstId;
  readonly start?: number;
  /** The parser writes 1 for `autonumber N`; the layout does the same when it is missing. */
  readonly step?: number;
  readonly visible: boolean;
}

export type SequenceStatement =
  | SequenceMessage
  | SequenceNote
  | SequenceActivation
  | SequenceFragment
  | SequenceRect
  | SequenceAutonumber;

export interface SequenceModel {
  /** First-mention order, which is the column order. */
  readonly participants: readonly SequenceParticipant[];
  readonly boxes: readonly SequenceBox[];
  readonly statements: readonly SequenceStatement[];
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
