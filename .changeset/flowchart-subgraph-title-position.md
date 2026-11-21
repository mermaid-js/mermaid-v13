---
'@mermaid-js/core': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/layout-elk': patch
---

feat: a flowchart subgraph title can sit in any corner or in the middle of the top or bottom edge. Set `flowchart.subGraphTitlePosition` for every subgraph, or `id@{ titlePosition: bottom-left }` for one, to `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center` or `bottom-right`. Without it titles stay at the top in the middle.
