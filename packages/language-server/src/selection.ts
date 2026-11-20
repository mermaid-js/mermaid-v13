/**
 * Selection ranges (`textDocument/selectionRange`, #810): what "expand selection" steps
 * through at an offset, innermost first, from the service's queries. The steps are the name
 * under the cursor (`references`), the AST nodes around it (`astAt` / `rangeOf`, R-LANG-6), the
 * statements that span lines (`foldingRanges`: a subgraph, the front matter) and the whole
 * text. Each step strictly contains the one before; a range that would not (a sibling that
 * ends where the cursor is, a duplicate) is left out.
 */
import type { DocumentSnapshot, Range } from '@mermaid-js/language-service';

/** Whether `outer` contains `inner` and is larger. */
const strictlyHolds = (outer: Range, inner: Range): boolean =>
  outer.start <= inner.start &&
  inner.end <= outer.end &&
  outer.end - outer.start > inner.end - inner.start;

/** The ranges to select at `offset`, innermost first, each strictly inside the next. */
export function selectionChain(doc: DocumentSnapshot, offset: number): Range[] {
  const candidates: Range[] = [];
  const add = (r: Range | undefined) => {
    if (r && r.start <= offset && offset <= r.end) candidates.push(r);
  };
  for (const r of doc.references(offset)) add(r);
  for (const id of doc.astAt(offset)) add(doc.rangeOf(id));
  for (const f of doc.foldingRanges()) add(f.range);
  add({ start: 0, end: doc.text.length });
  candidates.sort((a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start);
  const chain: Range[] = [];
  for (const r of candidates) {
    const last = chain[chain.length - 1];
    if (!last || strictlyHolds(r, last)) chain.push(r);
  }
  return chain;
}
