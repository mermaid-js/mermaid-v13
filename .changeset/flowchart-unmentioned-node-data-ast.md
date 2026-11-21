---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-flowchart': patch
---

fix: a flowchart node that only a `mermaid <id> { … }` block or a `style` line names now carries a `data-ast` that the parse's AST has, so an editor can map it back to its source. The block's AST id is `n:<id>`, like any first mention; a node only a `style` line names takes that line's id.
