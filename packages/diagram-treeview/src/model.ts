/**
 * The treeView model (spec #518): what the parser (#572) produces and the layout (#573) and the
 * renderers read. Plain, frozen data in source order (R-ARCH-7). Shared contract of the treeView
 * tickets: change it only additively, and say so in the run notes
 * (`v13/docs/agents/runs/518/GAPS.md`).
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

/** One node (a row of the tree), as v12's DB stored it, and where it sits. */
export interface TreeViewNode {
  /**
   * The name as v12 converted it: quotes stripped, a bare name's trailing blanks cut (inner
   * runs kept), then a trailing `/` cut (`/` alone gives `''`).
   */
  readonly name: string;
  /** Whether the name ended with `/` (v12's `nodeType: 'directory'`, else `'file'`). */
  readonly directory: boolean;
  /** 0 for a node at the top; v12 hangs those under its virtual root `/`. */
  readonly depth: number;
  /**
   * v12's level: the length of the blank run before the name (a tab counts 1; after the box
   * pass four per depth), else 0. A node goes under the nearest earlier node with a smaller
   * level.
   */
  readonly level: number;
  /**
   * The `icon(…)` written for it, as v12's DB held it: the icon name (`folder`, `logos:react`),
   * `'none'` for `icon(none)` and `icon()`; absent with no `icon(…)`. Resolving it (built-ins,
   * `defaultIconPack`, `showIcons`, the maps) is the renderer's (`resolveIcon`).
   */
  readonly icon?: string;
  /** The class of its `:::name` (the last one written wins); absent with none. */
  readonly cssClass?: string;
  /** The text of its `## …` (the last one written wins), trimmed; absent when empty. */
  readonly description?: string;
  /** The nodes under it, in source order. */
  readonly children: readonly TreeViewNode[];
  /** `node:<dir>/<dir>/<name>`, `@2`, … for a repeat in one directory (D487). */
  readonly astId: AstId;
  /** From the name (the blanks before it off) to the end of its last annotation. */
  readonly range: Range;
}

export interface TreeViewModel {
  /** The nodes at the top, in source order (v12's `getRoot().children`). */
  readonly roots: readonly TreeViewNode[];
  /** Every node in source order, which is the tree read depth first. */
  readonly nodes: readonly TreeViewNode[];
  /**
   * The in-text `title` if non-empty, else the front-matter `title`; absent when neither. Kept
   * and not drawn (D484, D218).
   */
  readonly title?: string;
  /** The AST id of the `title` statement the title comes from; absent for a front-matter title. */
  readonly titleAstId?: AstId;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
