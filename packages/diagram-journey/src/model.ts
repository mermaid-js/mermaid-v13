/**
 * JourneyModel: the plain-data result of a journey parse (spec #290 §Parser, T2), and the input
 * of the journey layout. Source order is kept (R-ARCH-7).
 *
 * Shared contract (run notes GAPS.md): T3 #303 lands the type, T2 #302 produces it and owns any
 * change. Text is kept as written (no trimming, no sanitising); `<br>` and entity codes are
 * resolved when labels are measured and drawn.
 *
 * What the parser guarantees, as v12's DB did:
 * - `score` is `Number()` of the first `:`-piece of the task data (`' '` is 0, `'0x10'` is 16,
 *   `'2rem'` is `NaN`); the layout draws what is not a number from 0 to 5 (D226);
 * - `people` is the second piece split on `,` and trimmed, `''` kept (`Task: 5:` names the actor
 *   `''`, D244), later pieces ignored;
 * - every name in a task's `people` is in `actors`.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** A `section <name>` line. Every one is kept, empty and repeated ones included. */
export interface JourneySection {
  /** `s:<name>`; a repeat of a name is `s:<name>@2`, `@3`, … */
  readonly ast: AstId;
  /** v12 `substr(8)`: as written, untrimmed. */
  readonly name: string;
}

/** A `<name>: <score>[: <actor>, …]` line. */
export interface JourneyTask {
  /** `t:<n>`, n counting tasks from 1 (names repeat in the corpus). */
  readonly ast: AstId;
  /** As written, untrimmed. */
  readonly name: string;
  readonly score: number;
  readonly people: readonly string[];
  /**
   * The AST ids of the task's named actor mentions (`a:<name>`, a later mention of a name
   * `a:<name>@2`, … over the whole text), in `people` order with `''` left out: the `''` actor
   * has no node. The task's dots carry them as `data-ast`. Absent on hand-built models.
   */
  readonly mentions?: readonly AstId[];
  /** The name of the section the task is in; `''` before the first section line. */
  readonly section: string;
  /**
   * Index into `JourneyModel.sections` of the section line the task follows; undefined before
   * the first. With repeated names, `section` alone cannot tell which line opened the task's
   * section (the band's AST id).
   */
  readonly sectionIndex?: number;
}

export interface JourneyModel {
  /** Source order. */
  readonly sections: readonly JourneySection[];
  /** Source order. */
  readonly tasks: readonly JourneyTask[];
  /** Unique names over every task's `people`, sorted by code unit (v12 `getActors()`). */
  readonly actors: readonly string[];
  /** v12 `substr(6)` of the `title` line, or the front-matter title. */
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
