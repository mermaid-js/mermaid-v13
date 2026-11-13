/**
 * MindmapModel: the plain-data result of a mindmap parse (spec #294 §Parser, T2), and the input
 * of the mindmap layout. It keeps v12's data, so model parity holds against `mindmapDb.ts`:
 *
 * - nodes in source order, which is depth-first (a node's parent is always written before it,
 *   and each node hangs under the chain of nodes still open above it);
 * - ids and labels as v12's grammar handed them to its DB, entities decoded and line breaks
 *   kept (`root(\n  The root\n)` has the label `"\n  The root\n"`). v12 passed them through
 *   `sanitizeText`; v13 writes text escaped instead, so nothing is removed here. v12 set
 *   `labelType: 'markdown'` for all, so `**x**` is bold without backticks; a markdown string
 *   is marked (`markdown`), since v13 reads bullets and inline code there only (D564);
 * - `level` is v12's: the raw indent width less the first node's (tabs count 1), not the tree
 *   depth. v12's `edge-depth-<d>` class comes from it; `depth` is the depth in the tree.
 *
 * AST ids (D289, DESIGN §4.2): `n:<id>`, `n:<id>@k` for the k-th node with the same id (blanks
 * around the id dropped); an id-less node's id is its label. Edges are derived from `parent`
 * and have no AST id. Decorations (`:::`, `::icon()`) belong to their node.
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

/**
 * A node's shape, from its opener (v12 `getType`): `[` rect, `(` rounded when closed by `)` and
 * cloud otherwise, `((` circle, `)` cloud, `))` bang, `{{` hexagon; no shape, `-)` and `(-`
 * give the default.
 */
export type MindmapShape = 'default' | 'rect' | 'rounded' | 'circle' | 'cloud' | 'bang' | 'hexagon';

/** How nodes get their colour section (`mindmap.colorBy`). */
export type MindmapColorBy = 'branch' | 'depth';

/** The number of non-root sections; v12's `MAX_SECTIONS - 1`. */
export const MINDMAP_SECTIONS = 11;

/** A `::icon(…)` reference. */
export interface MindmapIcon {
  /** The text between the parentheses, as written (line breaks kept). */
  readonly text: string;
  /** The range of that text. */
  readonly range: Range;
}

export interface MindmapNode {
  /** `n:<id>` or `n:<id>@k`. */
  readonly ast: AstId;
  /** v12's `nodeId`: the id as written, or the label for a node written without one. */
  readonly id: string;
  /** v12's `descr`: the text in the shape (the inside of a string), or the id when shapeless. */
  readonly label: string;
  /**
   * The label was written as a markdown string (`"`…`"`), whose backticks are not in `label`.
   * v12 kept no trace of it; v13 reads bullets and inline code in such a label only (D564).
   */
  readonly markdown?: true;
  readonly shape: MindmapShape;
  /** v12's `level`: the indent width less the root's; 0 for the root. */
  readonly level: number;
  /** Depth in the tree; 0 for the root. */
  readonly depth: number;
  /** Index into `MindmapModel.nodes`; undefined for the root. */
  readonly parent?: number;
  /** Indexes into `MindmapModel.nodes`, in source order. */
  readonly children: readonly number[];
  /**
   * The words of the last `:::` line after the node (v12 kept that line's text whole and a
   * later line replaced it; `:::a b` gives two classes).
   */
  readonly classes: readonly string[];
  /** The last `::icon(…)` after the node; a later one replaces it, as in v12. */
  readonly icon?: MindmapIcon;
  /**
   * Colour section: undefined for the root; with `colorBy: 'branch'` the index of its top-level
   * branch modulo {@link MINDMAP_SECTIONS}, with `'depth'` `(depth - 1)` modulo it.
   */
  readonly section?: number;
}

export interface MindmapModel {
  /** In source order (depth-first); `nodes[0]` is the root. Empty when the text has no node. */
  readonly nodes: readonly MindmapNode[];
  /** The `colorBy` the sections were assigned with. */
  readonly colorBy: MindmapColorBy;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}

/**
 * Each node's section for `colorBy` (v12 `assignSections`), for nodes in source order: undefined
 * for the root; per top-level branch, the branch's index among the root's children modulo
 * {@link MINDMAP_SECTIONS}; per depth, `(depth - 1)` modulo it.
 */
export function mindmapSections(
  nodes: readonly Pick<MindmapNode, 'parent' | 'depth'>[],
  colorBy: MindmapColorBy
): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  let branch = -1;
  for (const node of nodes) {
    if (node.parent === undefined) out.push(undefined);
    else if (colorBy === 'depth') out.push((node.depth - 1) % MINDMAP_SECTIONS);
    else if (node.depth === 1) out.push(++branch % MINDMAP_SECTIONS);
    else out.push(out[node.parent]);
  }
  return out;
}
