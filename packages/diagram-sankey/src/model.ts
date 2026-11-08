/**
 * SankeyModel: the plain-data result of a sankey parse (spec #427 §Parser, T2), and the input
 * of the sankey layout. It keeps v12's data in source order (R-ARCH-7), so model parity holds
 * against `sankeyDB.ts` `getGraph()`:
 *
 * - nodes in first-appearance order (a row's source before its target), one per distinct
 *   name; a name is its field trimmed, with `""` read as `"` (v12's record action). v12 ran
 *   names through `sanitizeText`; v13 writes text escaped instead, so nothing is removed here;
 * - links in row order, repeats kept, each with v12's value: `parseFloat` of the trimmed value
 *   field, NaN, negative and infinite values included, and the {@link SankeyLink.flow} the
 *   layout draws (D394: such a value counts as 0);
 * - the front-matter `title` (D396: the SVG `<title>`'s fallback; never drawn).
 *
 * AST ids (D397): `node:<name>` for a node (its first occurrence), `link:<source>-><target>`
 * for a row, `@2`, `@3` for later rows between the same names (`parser/ids.ts`).
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

export interface SankeyNode {
  /** v12's `id`: the name. */
  readonly id: string;
  /** `node:<name>`. */
  readonly ast: AstId;
  /** The name's first occurrence: the trimmed field, or the quoted field with its quotes. */
  readonly range: Range;
}

export interface SankeyLink {
  /** The source node's name. */
  readonly source: string;
  /** The target node's name. */
  readonly target: string;
  /** v12's value: `parseFloat` of the trimmed value field (NaN when it reads no number). */
  readonly value: number;
  /**
   * The value the layout draws (D394): {@link value}, or 0 when that is NaN, negative or
   * infinite (with one `SANKEY_INVALID_VALUE` warning for all of them).
   */
  readonly flow: number;
  /** `link:<source>-><target>`, `@k` for the k-th row between the same names. */
  readonly ast: AstId;
  /** The row, from its first field to its last. */
  readonly range: Range;
}

/**
 * A warning of the parse. `SANKEY_INVALID_VALUE` lists its rows' link ids in `astIds` (D394):
 * core's render `Warning` keeps that field (and drops `related`), so the render warning made
 * from this diagnostic lists the rows too.
 */
export interface SankeyWarning extends Diagnostic {
  readonly astIds?: readonly AstId[];
}

export interface SankeyModel {
  /** In first-appearance order. Empty when no row was read. */
  readonly nodes: readonly SankeyNode[];
  /** In row order. */
  readonly links: readonly SankeyLink[];
  /** The front-matter `title` (D396), as v12 read it. */
  readonly title?: string;
  /** Warning diagnostics of the parse (the same objects as in `ParseResult.diagnostics`). */
  readonly warnings: readonly SankeyWarning[];
}
