/**
 * Ranges for the treeView facet (DESIGN §4.5): the statement at an offset, and making and testing
 * ranges.
 */
import type { TreeViewDocument, TreeViewStatementNode } from '../parser/ast.ts';
export { inside } from '@mermaid-js/shared/parser/facet';
export { span } from '@mermaid-js/shared/parser/facet';

/** The statement of `doc` whose range holds `offset` (its ends included), if any. */
export function statementAt(
  doc: TreeViewDocument,
  offset: number
): TreeViewStatementNode | undefined {
  const list = doc.children;
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid]?.range.start ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const n = list[found];
  return n && offset <= n.range.end ? n : undefined;
}
