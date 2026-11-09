/**
 * The ishikawa model (spec #519): what the parser (T2) produces and the layout (T3) reads. Plain,
 * serialisable data in source order (R-ARCH-7), holding what v12's DB (`ishikawaDb.ts`) held:
 *
 * - the effect, the first line of text (on the header line or after it), kept apart from the
 *   front-matter title (D492): v12 made it the diagram title, overriding the front matter;
 * - the causes as a tree, in source order, nested as v12's DB nested them: the first cause's
 *   indent is the baseline, each cause's level is `max(1, indent − baseline + 1)` (the effect's
 *   indent is ignored), and a cause hangs under the last open cause of a lower level;
 * - text as v12's grammar handed it to its DB (`$2.trim()`): blanks around it dropped,
 *   entities as written (`&amp;`, and v12's `#35;` form as `&#35;`), `<br>` kept; v12 passed it
 *   through `sanitizeText`, v13 writes text escaped instead, so nothing is removed here.
 *
 * AST ids (D497): `effect`, and `cause:<i>.<j>.<k>` for a cause, its 1-based position in the
 * tree. Shared contract of the ishikawa tickets: change it only additively, and say so in
 * `v13/docs/agents/runs/519/GAPS.md`.
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

/** The effect: the head of the fish. */
export interface IshikawaEffect {
  /** `effect` (D497). */
  readonly ast: AstId;
  readonly text: string;
  /** The text in the source, without the blanks around it. */
  readonly range: Range;
}

/** A cause and the causes under it. */
export interface IshikawaCause {
  /** `cause:<i>.<j>…`: the 1-based position in the tree (D497). */
  readonly ast: AstId;
  readonly text: string;
  /**
   * v12's level: `max(1, indent − baseline + 1)`, the baseline being the first cause's indent.
   * Not the depth in the tree: a cause indented two steps under its parent is at level 3 and
   * depth 2.
   */
  readonly level: number;
  /** The text in the source, without the blanks around it. */
  readonly range: Range;
  /** In source order. */
  readonly causes: readonly IshikawaCause[];
}

export interface IshikawaModel {
  /** Absent for an empty body (`ISHIKAWA_EMPTY`, D496). */
  readonly effect?: IshikawaEffect;
  /** The top-level causes, in source order. */
  readonly causes: readonly IshikawaCause[];
  /** The front-matter `title`, when given (D492: never the effect). */
  readonly title?: string;
  /** Warnings of the parse (also in `ParseResult.diagnostics`, D417). */
  readonly warnings: readonly Diagnostic[];
}
