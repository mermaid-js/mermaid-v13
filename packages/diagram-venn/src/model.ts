/**
 * The venn model (spec #429): what the parser (T2) produces and the layout (T3) reads. Plain,
 * serialisable data in source order (R-ARCH-7), holding what v12's DB (`vennDB.ts`) held:
 *
 * - ids, labels and text as v12's grammar handed them to its DB and its `normalizeText` left
 *   them: trimmed, then one pair of surrounding `"` removed; entities as written (`&amp;`, and
 *   v12's `#35;` form as `&#35;`), resolved when labels are laid out;
 * - member ids sorted with `Array.prototype.sort` (UTF-16 order), as v12 sorted them, but on
 *   the text above: v12 sorted its `encodeEntities` placeholders (`ﬂ°°35¶ß`), so ids holding an
 *   entity can come in another order than v12's (a listed divergence, `union-entity-sort`);
 * - a size as written (`parseFloat`), negative ones too (the layout reads them as 0, with
 *   `VENN_INVALID_SIZE`); with none, `10 / n²` for `n` ids as written (`union A,A` is 2.5);
 * - style values as v12 joined them: a quoted value without its quotes, other value tokens
 *   joined with one blank (`12px` is `12 px`); a later key replaces an earlier one in place.
 *
 * Nothing is checked against the declared sets but what v12 checked (a `union` names declared
 * sets): text nodes and styles may name anything (`VENN_UNKNOWN_TARGET`). Shared contract of
 * the venn tickets: change it only additively, and say so in `v13/docs/agents/runs/429/GAPS.md`.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** A `set` (one id) or a `union` (two or more), v12's `VennData`. */
export interface VennSubset {
  /** `set:<id>`, `union:<id>+<id>…`; `@2`, … for a repeat (D418). */
  readonly ast: AstId;
  /** The member ids, sorted; one for a `set`. */
  readonly sets: readonly string[];
  /** As written, or `10 / n²` for `n` ids written. */
  readonly size: number;
  /** The `[…]` label, when written and not empty. */
  readonly label?: string;
}

/** A `text` statement or an indented `text` line, v12's `VennTextData`. */
export interface VennTextNode {
  /** `text:<id>`; `@2`, … for a repeat (D418). */
  readonly ast: AstId;
  /**
   * The sets of the area it sits in, sorted: as written, or the last `set` or `union`'s for an
   * indented one (a `union` that failed v12's checks gives none, and its indented text lines
   * are not in the model).
   */
  readonly sets: readonly string[];
  readonly id: string;
  /** The `[…]` label, when written and not empty. */
  readonly label?: string;
}

/** A `style` statement, v12's `VennStyleData`. */
export interface VennStyle {
  /** `style:<n>`, 1-based (D418). */
  readonly ast: AstId;
  /** The target ids, sorted: one set or text node, or the sets of an overlap. */
  readonly targets: readonly string[];
  /** Keys in first-written order, each with its last value (v12's object). */
  readonly properties: Readonly<Record<string, string>>;
}

export interface VennModel {
  /** Sets and overlaps in source order (v12's `getSubsetData()`); repeats are kept. */
  readonly subsets: readonly VennSubset[];
  /** In source order (v12's `getTextData()`). */
  readonly textNodes: readonly VennTextNode[];
  /** In source order (v12's `getStyleData()`). */
  readonly styles: readonly VennStyle[];
  /**
   * The last in-text `title` if non-empty, else the front-matter `title` (D218); one pair of
   * surrounding quotes removed (D416). Absent when neither.
   */
  readonly title?: string;
  /** Warnings of the parse (also in `ParseResult.diagnostics`, D417). */
  readonly warnings: readonly Diagnostic[];
}
