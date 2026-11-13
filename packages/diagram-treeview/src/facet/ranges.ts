/**
 * Ranges for the treeView facet (DESIGN §4.5): the statement at an offset, and making and testing
 * ranges.
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import type { TreeViewDocument, TreeViewStatementNode } from '../parser/ast.ts';

export { span } from '@mermaid-js/core/parser-kit/facet';

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

export const inside = (offset: number, r: Range): boolean => r.start <= offset && offset <= r.end;
