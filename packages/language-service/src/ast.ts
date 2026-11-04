/**
 * `astAt` / `rangeOf` (R-LANG-6, D97): between source offsets and semantic AST ids, so a host
 * with a live preview maps the cursor to `[data-ast]` elements and a clicked element back.
 */
import type { AstId, AstNode, Range } from '@mermaid-js/core/parser-kit';

/**
 * Ids of the AST nodes around `offset` (a node contains the offsets from its start to its end,
 * both included), innermost first: deeper nodes first, then shorter ones. The document root
 * is left out.
 */
export function astAt(root: AstNode | undefined, offset: number): AstId[] {
  if (!root) return [];
  const hits: { id: AstId; depth: number; size: number }[] = [];
  const walk = (node: AstNode, depth: number) => {
    for (const c of node.children ?? []) {
      if (c.range.start > offset || offset > c.range.end) continue;
      hits.push({ id: c.id, depth, size: c.range.end - c.range.start });
      walk(c, depth + 1);
    }
  };
  walk(root, 0);
  return hits.sort((a, b) => b.depth - a.depth || a.size - b.size).map((h) => h.id);
}

/** Every AST id → its source range. */
export function astRanges(root: AstNode | undefined): Map<AstId, Range> {
  const out = new Map<AstId, Range>();
  const walk = (node: AstNode) => {
    out.set(node.id, node.range);
    for (const c of node.children ?? []) walk(c);
  };
  if (root) walk(root);
  return out;
}
