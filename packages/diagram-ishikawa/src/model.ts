/**
 * The ishikawa model (spec #519): what the parser (`parser/parser.ts`) produces and the layout
 * (`layout/layout.ts`) and the text output (`ascii.ts`) read. Plain, serialisable data in source
 * order (R-ARCH-7), holding what v12's DB (`ishikawaDb.ts`) held:
 *
 * - the effect, the first line of text (on the header line or after it), kept apart from the
 *   front-matter title (D492): v12 made it the diagram title, overriding the front matter;
 * - the causes as a tree, in source order, nested as v12's DB nested them: the first cause's
 *   indent is the baseline, each cause's level is `max(1, indent − baseline + 1)` (the effect's
 *   indent is ignored), and a cause hangs under the last open cause of a lower level;
 * - text as v12's grammar handed it to its DB (`$2.trim()`): blanks around it dropped,
 *   entities as written (`&amp;`, and v12's `#35;` form as `&#35;`), `<br>` kept. v12 passed it
 *   through `sanitizeText` (DOMPurify); v13 has no HTML sanitizer and writes text escaped
 *   (R-SEC-1), so nothing is removed here.
 *
 * AST ids (D497): `effect`, and `cause:<i>.<j>.<k>` for a cause, its 1-based position in the
 * tree (built and read in `parser/ast-ids.ts`). Shared contract of the ishikawa modules: change
 * it only additively, and say so in `v13/docs/agents/runs/519/GAPS.md`.
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

/** Above the spine or below it. */
export type IshikawaSide = 'upper' | 'lower';

/**
 * The side of the spine the top-level cause at 0-based `index` is drawn on, and its sub-causes
 * with it: v12's alternation, even indices (the 1st, 3rd, … cause) above, odd ones below.
 */
export const sideOf = (index: number): IshikawaSide => (index % 2 === 0 ? 'upper' : 'lower');

/** A cause, or anything with causes under it as a cause has. */
interface CauseTree<N> {
  readonly causes: readonly N[];
}

/**
 * Visits every cause under `causes`, at any depth, in source order (pre-order), with its depth
 * (1 for a top-level cause) and whether it is the last of its siblings. A loop, not recursion:
 * chains run thousands of causes deep.
 */
export function eachCause<N extends CauseTree<N>>(
  causes: readonly N[],
  visit: (cause: N, depth: number, last: boolean) => void
): void {
  const stack: [N, number, boolean][] = [];
  const push = (nodes: readonly N[], depth: number): void => {
    for (let i = nodes.length - 1; i >= 0; i--)
      stack.push([nodes[i]!, depth, i === nodes.length - 1]);
  };
  push(causes, 1);
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const [cause, depth, last] = top;
    visit(cause, depth, last);
    push(cause.causes, depth + 1);
  }
}

/** The number of causes under `causes`, at any depth. */
export function causeCount(causes: readonly IshikawaCause[]): number {
  let n = 0;
  eachCause(causes, () => n++);
  return n;
}
