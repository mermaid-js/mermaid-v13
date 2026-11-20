---
'@mermaid-js/core': patch
---

fix: a labelled edge from a subgraph to a node inside it (`Sub -->|text| In`) is no longer drawn on top of another edge into the top of that node. It ends beside the other edge, so both are visible.
