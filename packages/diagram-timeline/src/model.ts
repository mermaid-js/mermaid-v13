/**
 * TimelineModel: the plain-data result of a timeline parse (spec #291 §Parser, T2), and the
 * input of the timeline layout. Source order is kept (R-ARCH-7): sections in the order written,
 * periods in the order written, each period's events in the order written.
 *
 * Shared contract (run notes GAPS.md): #337 lands the type, #336 adopts it and may extend it
 * additively. It keeps v12's data, so model parity holds (D251): text is kept raw, as v12's DB
 * keeps it (`"2002 "` with its trailing space, `<br>` and entity codes as written); the layout
 * trims and resolves them when it measures labels (D225).
 *
 * AST ids (DESIGN §4.2, adapted; spec #291): section names repeat, so ordinals are the id.
 * Ordinals are 1-based, as core's `AstIds.statement` counts them:
 * - section `sec:<n>`, the n-th `section` statement;
 * - period `per:<n>`, the n-th period;
 * - event `ev:<p>.<k>`, the k-th event of period `per:<p>`;
 * - every other statement (`title`, `accTitle`, `accDescr`) `st:<n>`.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** `timeline LR`, `timeline TD`; a bare `timeline` is `LR`, as in v12. */
export type TimelineDirection = 'LR' | 'TD';

export interface TimelineSection {
  /** `sec:<n>`. */
  readonly ast: AstId;
  /** The name as written after `section ` (v12 `substr(8)`), untrimmed. */
  readonly text: string;
}

export interface TimelineEvent {
  /** `ev:<p>.<k>`. */
  readonly ast: AstId;
  /** The text after `: ` (v12 `substr(2)`), untrimmed. */
  readonly text: string;
}

export interface TimelinePeriod {
  /** `per:<n>`. */
  readonly ast: AstId;
  /** The period as written (v12 `task`), untrimmed. */
  readonly text: string;
  /**
   * Index into `TimelineModel.sections` of the section it follows; undefined for a period
   * before the first section (v12's section `''`).
   */
  readonly section?: number;
  /** In source order: on its own line and on the continuation lines (`: …`) after it. */
  readonly events: readonly TimelineEvent[];
}

export interface TimelineModel {
  readonly direction: TimelineDirection;
  /** In-text `title …` or front-matter `title` (D218); undefined when neither is set. */
  readonly title?: string;
  /**
   * `st:<n>` of the in-text `title` statement that {@link title} comes from (the last one, as
   * v12 kept it); undefined when the title is the front matter's or there is none.
   */
  readonly titleAst?: AstId;
  readonly accTitle: string;
  readonly accDescr: string;
  /** In source order; names may repeat, and each one is its own section (D251). */
  readonly sections: readonly TimelineSection[];
  /** In source order. */
  readonly periods: readonly TimelinePeriod[];
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
