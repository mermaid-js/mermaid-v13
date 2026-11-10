## Block diagram

- **Syntax** is v12's (the grammar is in [syntax/block.md](./syntax/block.md)): line breaks
  separate nothing, ids take `;`, `,`, `.`, `|`, `%`, `#` and Unicode, labels are quoted, and
  every error is reported, not only the first, with messages in words (R-PARSE-4). What v12
  rejected is still rejected, except `style` (below).
- **Edge chains** (D442): `a --> b --> c` declares `a`, `b` and `c` and draws both edges. v12
  dropped `a`, `b` and the first edge and drew a block `undefined`.
- **`class` before its block** (D442) gives the block the class, and the block is drawn. v12
  made a hidden block of the id, so the later declaration was never placed.
- **`class a, b`** (D442) gives `b` the class too: the ids are trimmed. v12 looked up ` b` and
  drew `b` without the class.
- **`root`** (D442) is an ordinary block id. v12 merged it into its own top level and drew
  nothing for it.
- **A leaf later opened as `block:a … end`** (D442) keeps its place and holds the children.
  v12 lost the children.
- **A composite opened a second time** keeps both bodies: the second adds to the first. v12 lost
  the second body's new blocks. Pending a D-id (D440).
- **A chain in a composite header**, `block:a --> b … end`: the composite is `a`, and the edge
  and `b` stand next to it. v12 drew a composite with no id and lost the edge. Pending a D-id
  (D440).
- **`style`** (D443) applies after every statement, so `style a …` before `a` and
  `style a,b …` work; ids that never appear get one `BLOCK_STYLE_UNKNOWN` warning. v12 threw a
  TypeError and rejected the diagram.
- **Degenerate sizes** (D445). `columns 0` lays out as `columns auto` and a span `:0` as `:1`,
  with one `BLOCK_SIZE_INVALID` warning (v12 threw or drew NaN). Spans are capped at 1,000
  columns and `space:n` at 100,000 cells, with one `BLOCK_TRUNCATED` warning; v12 kept larger
  ones, and rejected a spacer over 16,777,214 cells (`Map maximum size exceeded`), which v13
  now accepts. Block-arrow directions are trimmed, so `( right , left )` draws (v12 drew no
  arrow).
- **Generated ids** of spaces and anonymous composites are `id-1`, `id-2`, … in source order,
  where v12 drew random ones (R-ARCH-6).
