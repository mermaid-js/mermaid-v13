/**
 * The pie model (spec #288): what the parser (#305) produces and the layout (#335) reads. Plain,
 * frozen data in source order (R-ARCH-7). Shared contract of the pie tickets: change it only
 * additively, and say so in the run notes (`v13/docs/agents/runs/288/GAPS.md`).
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** One `"label" : value` section: the first occurrence of its label (D226). */
export interface PieSection {
  /** The label as v12's DB kept it: quotes removed, `\x` unescaped, not trimmed. */
  readonly label: string;
  /**
   * Set when the label was written as a markdown string (`"`…`"`, #1368). `label` then holds the
   * backticks, as v12's did; the text between them is laid out as markdown. Without its quotes a
   * label in backticks is plain text, so the parser marks it.
   */
  readonly markdown?: true;
  /** The value, never negative (a negative one is a diagnostic and no section, R-PARSE-4). */
  readonly value: number;
  /** `slice:<label>` (DESIGN §4.2); a repeat of the label is `slice:<label>@2` on the dropped one. */
  readonly astId: AstId;
}

export interface PieModel {
  /** `pie showData`: the legend prints `label [value]`. */
  readonly showData: boolean;
  /** Sections in source order, one per label (the first occurrence, D226). */
  readonly sections: readonly PieSection[];
  /** The in-text `title` if non-empty, else the front-matter `title` (D218); absent when neither. */
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`), e.g. `PIE_DUPLICATE_SLICE`. */
  readonly warnings: readonly Diagnostic[];
}
