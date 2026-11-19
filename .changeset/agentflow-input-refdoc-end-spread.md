---
'@mermaid-js/diagram-agentflow': patch
---

fix: edges that meet the same side of an `input` or `refdoc` node now end on different points, so their arrowheads and crosses no longer draw on top of each other, and edges leaving an `input` node fan out from separate points.
