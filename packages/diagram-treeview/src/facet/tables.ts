/**
 * The treeView facet's shared helpers (DESIGN §4.5): finding the statement at an offset, Markdown
 * code spans, ranges.
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import type { TreeViewDocument, TreeViewStatementNode } from '../parser/ast.ts';

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

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

export const inside = (offset: number, r: Range): boolean => r.start <= offset && offset <= r.end;
