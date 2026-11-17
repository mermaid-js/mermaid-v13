---
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/shared': patch
'@mermaid-js/core': patch
'mermaid': patch
---

fix(flowchart): an edge `animate` or `animation` now raises an `EDGE_ANIMATION_IGNORED` warning (flowchart and usecase), and `markdownAutoWrap: false` keeps markdown labels on their own line breaks (#357).
