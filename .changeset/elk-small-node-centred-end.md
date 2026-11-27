---
'@mermaid-js/layout-elk': patch
---

fix: under `layout: elk` a small node with one edge on a side, such as a state diagram's `[*]` start or end, sits centred on that edge instead of 4 px beside it.
