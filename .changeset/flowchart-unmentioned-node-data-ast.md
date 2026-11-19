---
'@mermaid-js/diagram-flowchart': patch
---

fix: a flowchart `mermaid <id> { … }` block that no edge mentions now carries a `data-ast` that the parse's AST has, so an editor can map it back to its source. The block's AST id is `n:<id>`, like any first mention.
