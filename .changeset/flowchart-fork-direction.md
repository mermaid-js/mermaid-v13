---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-flowchart': patch
---

fix: a flowchart `fork` or `join` is a 70 × 10 bar that turns to 10 × 70 where the flow runs left to right or right to left, including inside a subgraph with its own `direction`, as in v12 (#402).
