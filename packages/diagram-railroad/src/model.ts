/**
 * The railroad model (spec #526): what the four parsers (#610) produce and the layout (#612) and
 * renderer (#613) read. Plain, frozen data in source order (R-ARCH-7). One model for the four
 * notations (D511): each parser maps its notation onto v12's seven node kinds
 * (`railroadTypes.ts:7-55`) with v12's mappings, so what v12 dropped is dropped here too (an
 * ABNF repeat's `max` is kept but never drawn; an EBNF exception is a sequence with a `-`
 * terminal; a PEG predicate is a `special` with a label). Shared contract of the railroad
 * tickets: change it only additively, and say so in the run notes
 * (`v13/docs/agents/runs/526/GAPS.md`).
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';
import type { RailroadNotation } from './parser/tokens.ts';

export type { RailroadNotation } from './parser/tokens.ts';

/**
 * Every expression node has its AST id (D517): `<rule id>/<path>`, where the path is the child
 * indices from the rule down, the definition being child `0` (`rule:a/0`, its second element
 * `rule:a/0/1`). The renderer writes it as `data-ast` on the expression's `g`.
 */
interface NodeBase<K extends string> {
  readonly type: K;
  readonly astId: AstId;
}

/**
 * A literal: a quoted string (escapes decoded), an ABNF `%x…` value as written, or EBNF's `-`.
 * A terminal's value, a nonterminal's name and a rule's name are drawn as they are here (D710):
 * each `#name;` code is already its character, and an `&name;` the author typed stays as written.
 */
export interface RailroadTerminal extends NodeBase<'terminal'> {
  readonly value: string;
}

/** A reference to a rule, by name (the rule need not exist). */
export interface RailroadNonterminal extends NodeBase<'nonterminal'> {
  readonly name: string;
}

/** Two or more elements in a row (a one-element sequence is its element). */
export interface RailroadSequence extends NodeBase<'sequence'> {
  readonly elements: readonly RailroadNode[];
}

/** Two or more alternatives (a one-alternative choice is its alternative). */
export interface RailroadChoice extends NodeBase<'choice'> {
  readonly alternatives: readonly RailroadNode[];
}

/** An element that may be skipped. */
export interface RailroadOptional extends NodeBase<'optional'> {
  readonly element: RailroadNode;
}

/**
 * An element repeated `min` to `max` times: `{0, Infinity}` (`*`, `{ }`, `zeroOrMore`),
 * `{1, Infinity}` (`+`, `oneOrMore`), or an ABNF repeat as written (`3*5x` is `{3, 5}`, `2x`
 * is `{2, 2}`). As in v12, only `min === 0` changes the drawing; `max` is never drawn.
 */
export interface RailroadRepetition extends NodeBase<'repetition'> {
  readonly element: RailroadNode;
  readonly min: number;
  /** `Infinity` when unbounded (`null` in a JSON copy). */
  readonly max: number;
}

/**
 * Text drawn in a dashed box: an IR `special("…")`, an EBNF `? … ?` (trimmed), PEG's `.`, or a
 * PEG predicate `&X` / `!X` labelled with its operand (`"x"` for a string, the name, the
 * special's text, else `(...)`).
 */
export interface RailroadSpecial extends NodeBase<'special'> {
  readonly text: string;
  /**
   * Set on a special made from tokens (PEG's predicates and `.`): its text draws as written, as
   * a terminal's does. Any other special's text follows the label rule (D710).
   */
  readonly literal?: true;
}

export type RailroadNode =
  | RailroadTerminal
  | RailroadNonterminal
  | RailroadSequence
  | RailroadChoice
  | RailroadOptional
  | RailroadRepetition
  | RailroadSpecial;

export type RailroadNodeKind = RailroadNode['type'];

/** One rule, `name = definition ;` (or `::=`, `<-`), in source order. */
export interface RailroadRule {
  /** The rule's name as written. */
  readonly name: string;
  /** `rule:<name>`, `rule:<name>@2` for the second rule of that name (D517). */
  readonly astId: AstId;
  readonly definition: RailroadNode;
  /** From the name to the closing `;`. */
  readonly range: Range;
}

export interface RailroadModel {
  /** The notation the text is written in: v12's diagram type for it (D511). */
  readonly notation: RailroadNotation;
  /**
   * Rules in source order. A rule defined twice is here twice and drawn twice, as in v12, with
   * a `RAILROAD_DUPLICATE_RULE` warning (D517).
   */
  readonly rules: readonly RailroadRule[];
  /** The in-text `title` if non-empty, else the front-matter `title` (D218); never drawn. */
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
